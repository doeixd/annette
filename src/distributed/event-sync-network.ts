import { v4 as uuidv4 } from 'uuid';
import { IAgent, AgentName, Agent, IPort } from '../agent'; // Assuming Agent factory is also needed for createAgent
import { INetwork } from '../network';
import { IBoundPort, PortName } from '../port'; // IPort might be in agent.ts or port.ts
import { AnyRule } from '../rule';
import { IConnection } from '../connection';
import { VectorClock } from './vector-clock'; // Assuming this is the class, not IVectorClock
import {
    AgentId,
    AgentStateSnapshot,
    DistributedAgentState,
    Hash,
    InteractionEvent,
    IVectorClock,
    NetworkSyncPayload
} from './types';
import { serializeValue, deserializeValue } from '../serialization';
import { serializeAndHashValue, serializeAndHashStructure } from './utils';

/**
 * Represents a network of interacting agents that synchronizes its state
 * across multiple distributed nodes using an event-first approach.
 * It wraps a base INetwork instance and extends it with distributed
 * coordination logic, vector clocks, and state snapshotting to achieve
 * eventual consistency based on the "Annette Concord" model.
 */
export class DistributedEventSyncNetwork {
    public readonly baseNetwork: INetwork;
    public readonly localNodeId: string;
    private localNodeVC: IVectorClock;
    private agentDistributedState: WeakMap<IAgent, DistributedAgentState>;

    private eventLog: Map<string, InteractionEvent>; // eventId -> event (processed events)
    private pendingEvents: Map<string, InteractionEvent>; // eventId -> event (waiting for missing agents)
    private requestedAgents: Map<AgentId, { eventIdsWaiting: Set<string> }>; // For tracking agent requests
    private knownMissingAgents: Set<AgentId>; // Tracks agents known to be missing to avoid repeated requests

    private onOutgoingMessageCallback: (payload: NetworkSyncPayload) => void;

    /**
     * Creates an instance of DistributedEventSyncNetwork.
     * @param underlyingNetwork The base INetwork instance that holds local agent and rule definitions.
     * @param localNodeId A unique identifier for this node in the distributed system.
     */
    constructor(underlyingNetwork: INetwork, localNodeId: string) {
        this.baseNetwork = underlyingNetwork;
        this.localNodeId = localNodeId;
        
        this.localNodeVC = new VectorClock(); // Use the VectorClock class
        this.localNodeVC.increment(localNodeId);
        
        this.agentDistributedState = new WeakMap();
        this.eventLog = new Map();
        this.pendingEvents = new Map();
        this.requestedAgents = new Map();
        this.knownMissingAgents = new Set();

        // Default callback, can be overwritten
        this.onOutgoingMessageCallback = (payload) => {
            console.log(`[${this.localNodeId}] Dropped outgoing message (callback not set):`, payload.type, payload);
        };

        // Ensure all existing agents in baseNetwork get distributed properties
        // Fire and forget async operations for constructor
        this.baseNetwork.getAllAgents().forEach(a => {
            this._getOrInitDistributedState(a).catch(err => {
                console.error(`[${this.localNodeId}] Error initializing distributed state for agent ${a._agentId} in constructor:`, err);
            });
        });
    }

    /**
     * Sets the callback function to be invoked when the network needs to send a
     * NetworkSyncPayload to other nodes. This bridges the gap to the actual
     * network transport layer (e.g., WebSockets, WebRTC).
     * @param callback The function to call with the outgoing message payload.
     */
    public setOutgoingMessageCallback(callback: (payload: NetworkSyncPayload) => void): void {
        this.onOutgoingMessageCallback = callback;
    }

    private async _getOrInitDistributedState(agent: IAgent): Promise<DistributedAgentState> {
        if (!this.agentDistributedState.has(agent)) {
            const newState: DistributedAgentState = {
                vectorClock: new VectorClock(), // Agent's own state VC
                valueHash: "", 
                structureHash: "",
                portConnections: {} // Initialize with empty port connections
            };
            newState.vectorClock.increment(this.localNodeId); // Initial tick for this agent's state from this node
            this.agentDistributedState.set(agent, newState);
            // Calculate initial hashes. Pass false for forceVCIncrement as VC is already ticked.
            await this._refreshAgentStateHashes(agent, newState, false); 
        }
        return this.agentDistributedState.get(agent)!;
    }

    // Returns true if hashes changed OR if forced and VC was incremented.
    private async _refreshAgentStateHashes(agent: IAgent, distState: DistributedAgentState, forceVCIncrement: boolean): Promise<boolean> {
        const oldVH = distState.valueHash;
        const oldSH = distState.structureHash;

        // Methods calling _refreshAgentStateHashes (e.g., connectPorts wrapper, _applyAgentStateSnapshot)
        // are responsible for updating distState.portConnections before calling this.
        // The local distState.portConnections is now the source of truth for hashing.

        const { valueHash } = await serializeAndHashValue(agent.value);
        distState.valueHash = valueHash;
        
        const { structureHash } = await serializeAndHashStructure(agent.name, distState.portConnections);
        distState.structureHash = structureHash;

        let changed = false;
        if (oldVH !== distState.valueHash || oldSH !== distState.structureHash) {
            changed = true;
        }

        if (forceVCIncrement || changed) {
            distState.vectorClock.increment(this.localNodeId);
            return true; // VC was incremented (either forced or due to change)
        }
        return Promise.resolve(false); // Hashes didn't change and not forced, so VC wasn't incremented
    }

    private async _getAgentSnapshot(agent: IAgent): Promise<AgentStateSnapshot> {
        const distState = await this._getOrInitDistributedState(agent);
        
        // Ensure hashes are current, especially if direct mutation might have happened
        // outside this wrapper's controlled methods.
        // We pass `false` to forceVCIncrement because getting a snapshot shouldn't by itself change the agent's VC.
        // If a change IS detected, _refreshAgentStateHashes will increment the VC.
        const { valueHash: currentValueHash } = await serializeAndHashValue(agent.value);
        // For current structure hash, we need to re-evaluate connections as they might have changed in baseNetwork
        const currentPortConnectionsForSnapshot: Record<PortName, { connectedToAgentId: AgentId, connectedToPortName: PortName } | null> = {};
        for (const portName in agent.ports) {
            const port = agent.ports[portName];
            const connections = this.baseNetwork.findConnections({ agent: agent, portName: port.name });
            if (connections.length > 0) {
                const conn = connections[0];
                const connectedPort = conn.sourcePort.agent === agent && conn.sourcePort.name === port.name ? conn.destinationPort : conn.sourcePort;
                currentPortConnectionsForSnapshot[portName] = {
                    connectedToAgentId: connectedPort.agent._agentId,
                    connectedToPortName: connectedPort.name
                };
            } else {
                currentPortConnectionsForSnapshot[portName] = null;
            }
        }
        const { structureHash: currentStructureHash } = await serializeAndHashStructure(agent.name, currentPortConnectionsForSnapshot);

        if (currentValueHash !== distState.valueHash || currentStructureHash !== distState.structureHash) {
            // If hashes are different, it means the state has changed. 
            // _refreshAgentStateHashes will update distState.portConnections, hashes, and increment VC.
            await this._refreshAgentStateHashes(agent, distState, false); 
        }
        
        return Promise.resolve({
            id: agent._agentId,
            name: agent.name,
            serializedValue: serializeValue(agent.value), // Use existing serializeValue
            valueHash: distState.valueHash,
            portConnections: { ...distState.portConnections }, // Deep copy from the (potentially updated) distState
            structureHash: distState.structureHash,
            vectorClock: { ...distState.vectorClock.toObject() }, // Use toObject() and spread for plain object
        });
    }

    // --- Public API (Wraps baseNetwork methods and adds distribution logic) ---

    /**
     * Creates a new agent in the network or registers an existing one (if existingId is provided).
     * Initializes its distributed state, adds it to the underlying base network,
     * and broadcasts its snapshot to other nodes if it's a locally new agent.
     * @param name The name of the agent.
     * @param initialValue The initial value of the agent.
     * @param portDefs Definitions for the agent's ports.
     * @param {AgentId} [existingId] - Optional ID if this agent is being created as a replica of an existing one.
     * @returns {Promise<IAgent>} A promise that resolves to the created or registered IAgent instance.
     */
    public async createAgent(name: AgentName, initialValue: any, portDefs: Record<PortName, IPort>, existingId?: AgentId): Promise<IAgent> {
        const generatedId = uuidv4();
        const agentId = existingId || generatedId;
        
        let baseAgent: IAgent;
        // Create agent using the factory from src/agent.ts
        baseAgent = Agent(name, initialValue, portDefs);

        // If an existingId is provided (e.g. for replication), or even if one is not (to be absolutely sure),
        // explicitly set the _agentId property to the determined agentId.
        // The Agent factory already assigns an ID, but we ensure the desired one is set.
        Object.defineProperty(baseAgent, '_agentId', { value: agentId, writable: false, configurable: true, enumerable: false });
        
        // Initialize distributed state. This also calculates initial hashes and increments the agent's VC.
        const distState = await this._getOrInitDistributedState(baseAgent); 
        
        this.baseNetwork.addAgent(baseAgent); // Add to underlying network

        if (!existingId) { // Only broadcast if newly created LOCALLY (not a replica from a snapshot)
            // _getOrInitDistributedState already increments the new agent's VC.
            // We call _refreshAgentStateHashes with forceVCIncrement=true to signify this creation event
            // is a distinct change, ensuring its VC is appropriately advanced beyond the initial tick
            // and to capture the state for broadcast.
            if (await this._refreshAgentStateHashes(baseAgent, distState, true)) {
                 // Using RespondAgentStates as a generic way to broadcast snapshots.
                 // "BROADCAST_ALL" is a placeholder for the actual broadcast mechanism.
                 this.onOutgoingMessageCallback({
                     type: "RespondAgentStates", 
                     snapshots: [await this._getAgentSnapshot(baseAgent)], 
                     toNodeId: "BROADCAST_ALL", 
                     forEventId: `agent-created-${agentId}` 
                 });
            }
        }
        this.knownMissingAgents.delete(agentId); // Remove from missing set if it was there
        return Promise.resolve(baseAgent);
    }
    
    /**
     * Adds a rule to the base network. Rule definitions are assumed to be static
     * and shared/known by all nodes, so no broadcast is performed.
     * @param rule The rule to add.
     */
    public addRule(rule: AnyRule): void {
        this.baseNetwork.addRule(rule);
        // Rule definitions are assumed to be shared and static. No broadcast needed.
    }

    /**
     * Retrieves an agent from the base network by its ID.
     * @param id The ID of the agent to retrieve.
     * @returns {IAgent | undefined} The agent instance if found, otherwise undefined.
     */
    public getAgent(id: AgentId): IAgent | undefined {
        return this.baseNetwork.getAgent(id);
    }

    /**
     * Connects two ports in the base network.
     * Updates the distributed state (portConnections and structure hash) for the involved agents,
     * increments their vector clocks, and broadcasts their updated snapshots.
     * @param p1 The first bound port.
     * @param p2 The second bound port.
     * @param {string} [name] - Optional name for the connection.
     * @returns {Promise<IConnection | undefined>} A promise that resolves to the created IConnection instance or undefined if connection failed.
     */
    public async connectPorts(p1: IBoundPort, p2: IBoundPort, name?: string): Promise<IConnection | undefined> {
        const agent1 = p1.agent;
        const agent2 = p2.agent;
        const distState1 = await this._getOrInitDistributedState(agent1);
        const distState2 = await this._getOrInitDistributedState(agent2);

        const conn = this.baseNetwork.connectPorts(p1, p2, name);

        if (conn) {
            let a1StructureChanged = false;
            let a2StructureChanged = false;

            // Update portConnections in DistributedAgentState for agent1
            const currentP1Conn = distState1.portConnections[p1.name];
            if (!currentP1Conn || 
                currentP1Conn.connectedToAgentId !== agent2._agentId ||
                currentP1Conn.connectedToPortName !== p2.name) {
                distState1.portConnections[p1.name] = { connectedToAgentId: agent2._agentId, connectedToPortName: p2.name };
                a1StructureChanged = true;
            }

            // Update portConnections in DistributedAgentState for agent2
            const currentP2Conn = distState2.portConnections[p2.name];
            if (!currentP2Conn ||
                currentP2Conn.connectedToAgentId !== agent1._agentId ||
                currentP2Conn.connectedToPortName !== p1.name) {
                distState2.portConnections[p2.name] = { connectedToAgentId: agent1._agentId, connectedToPortName: p1.name };
                a2StructureChanged = true;
            }

            // If agent1's structure changed, refresh its state. If VC incremented, broadcast.
            if (a1StructureChanged) {
                // Pass forceVCIncrement = true because a new connection is a significant state change.
                if (await this._refreshAgentStateHashes(agent1, distState1, true)) { 
                    this.onOutgoingMessageCallback({ 
                        type: "RespondAgentStates", 
                        snapshots: [await this._getAgentSnapshot(agent1)], 
                        toNodeId: "BROADCAST_ALL",
                        forEventId: `connect-${conn.name}-a1` 
                    });
                }
            }
            
            // If agent2's structure changed, refresh its state. If VC incremented, broadcast.
            if (a2StructureChanged) {
                if (await this._refreshAgentStateHashes(agent2, distState2, true)) {
                    this.onOutgoingMessageCallback({ 
                        type: "RespondAgentStates", 
                        snapshots: [await this._getAgentSnapshot(agent2)], 
                        toNodeId: "BROADCAST_ALL",
                        forEventId: `connect-${conn.name}-a2`
                    });
                }
            }
        }
        return Promise.resolve(conn);
    }

    // TODO: Implement disconnectPorts wrapper
    // public disconnectPorts(p1: IBoundPort, p2: IBoundPort): boolean { ... }

    // TODO: Implement removeAgent wrapper
    // public removeAgent(agentId: AgentId): boolean { ... }

    private _findRuleDefinition(name1: AgentName, pName1: PortName, name2: AgentName, pName2: PortName): AnyRule | undefined {
        // Assumes baseNetwork has a way to get rules (e.g., an internal map or findRules method)
        // Using the getRuleLookupKey pattern from INetwork (network.ts)
        // Create canonical order for rule keys
        const keyParts = [
            { agentName: name1, portName: pName1 },
            { agentName: name2, portName: pName2 }
        ].sort((a, b) => a.agentName.localeCompare(b.agentName) || a.portName.localeCompare(b.portName));
        const ruleKey = `${keyParts[0].agentName}:${keyParts[0].portName}<->${keyParts[1].agentName}:${keyParts[1].portName}`;

        // Accessing rules: INetwork likely has a rules map or a method getAllRules()
        // The issue hints at: (this.baseNetwork as any).rules?.get(ruleKey)
        // A safer approach if getAllRules exists:
        const rules = this.baseNetwork.getAllRules(); // Assuming INetwork has getAllRules()
        const foundRule = rules.find(r => {
            if (r.type === 'action' || r.type === 'rewrite' || r.type === 'deterministic_action') {
                const mi = r.matchInfo;
                const matchKeyParts = [
                    { agentName: mi.agentName1, portName: mi.portName1 },
                    { agentName: mi.agentName2, portName: mi.portName2 }
                ].sort((a, b) => a.agentName.localeCompare(b.agentName) || a.portName.localeCompare(b.portName));
                const currentRuleKey = `${matchKeyParts[0].agentName}:${matchKeyParts[0].portName}<->${matchKeyParts[1].agentName}:${matchKeyParts[1].portName}`;
                return currentRuleKey === ruleKey;
            }
            return false; // Should not happen with AnyRule type
        });
        return foundRule;
    }

    private async _findInteractablePair(): Promise<{ agent1: IAgent, port1: IBoundPort, agent2: IAgent, port2: IBoundPort, rule: AnyRule } | null> {
        // Standard Annette logic to find a pair of connected main ports with a matching rule.
        // This function needs to iterate through agents and their portConnections (from DistributedAgentState).
        for (const agent1 of this.baseNetwork.getAllAgents()) {
            const distState1 = await this._getOrInitDistributedState(agent1); // Ensures we have distributed state

            for (const port1Name in agent1.ports) {
                const port1 = agent1.ports[port1Name] as IBoundPort; // Cast to IBoundPort
                if (port1.type !== 'main') continue; // Only main ports interact in this basic model

                const connInfo1 = distState1.portConnections[port1Name];
                if (connInfo1) {
                    const agent2 = this.baseNetwork.getAgent(connInfo1.connectedToAgentId);
                    if (!agent2) {
                        // console.warn(`[${this.localNodeId}] Agent ${connInfo1.connectedToAgentId} referenced by ${agent1._agentId}.${port1Name} not found locally.`);
                        continue; // Partner not found locally yet
                    }

                    const distState2 = await this._getOrInitDistributedState(agent2);
                    const port2 = agent2.ports[connInfo1.connectedToPortName] as IBoundPort; // Cast to IBoundPort

                    // Verify the connection is reciprocal and port2 exists
                    if (port2 && port2.type === 'main') {
                        const connInfo2 = distState2.portConnections[connInfo1.connectedToPortName];
                        if (connInfo2 && connInfo2.connectedToAgentId === agent1._agentId && connInfo2.connectedToPortName === port1Name) {
                            // Connection is valid and reciprocal, now find a rule
                            const rule = this._findRuleDefinition(agent1.name, port1.name, agent2.name, port2.name);
                            if (rule) {
                                return { agent1, port1, agent2, port2, rule };
                            }
                        }
                    }
                }
            }
        }
        return Promise.resolve(null);
    }

    /**
     * Performs a series of local interaction steps (reductions) in the network.
     * For each step, it finds an interactable pair of agents, generates an InteractionEvent,
     * applies the event locally, and then broadcasts the event to other nodes.
     * The local node's vector clock is incremented for each generated event.
     * @param {number} [maxSteps=1000] - The maximum number of reduction steps to perform.
     * @returns {Promise<number>} A promise that resolves to the total number of reduction steps successfully performed.
     */
    public async reduce(maxSteps: number = 1000): Promise<number> {
        let totalSteps = 0;
        for (let i = 0; i < maxSteps; i++) {
            const interactablePair = await this._findInteractablePair();
            if (!interactablePair) break;

            const { agent1, port1, agent2, port2, rule } = interactablePair;
            // const distState1 = await this._getOrInitDistributedState(agent1); // Already fetched in _findInteractablePair
            // const distState2 = await this._getOrInitDistributedState(agent2); // Already fetched in _findInteractablePair

            this.localNodeVC.increment(this.localNodeId);
            let ruleArgsForEvent: any;

            if (rule.type === 'deterministic_action' && rule.getEventArgs) {
                 ruleArgsForEvent = rule.getEventArgs(agent1, agent2);
            }

            const event: InteractionEvent = {
                eventId: uuidv4(),
                ruleName: rule.name,
                ruleType: rule.type as 'action' | 'deterministic_action' | 'rewrite', // Cast as AnyRule includes more possibilities
                agent1Id: agent1._agentId,
                port1Name: port1.name,
                agent2Id: agent2._agentId,
                port2Name: port2.name,
                ruleArgs: ruleArgsForEvent,
                eventVC: { ...this.localNodeVC.toObject() }, // Use toObject() for plain object copy
                originNodeId: this.localNodeId,
                timestamp: Date.now(),
                createdAgentSnapshots: [] // Will be populated by _applyAndLogEvent if needed
            };

            // _applyAndLogEvent will handle VC updates for agents, logging, etc.
            // This method is not yet defined, so this will cause a type error until it's added.
            // For now, we'll assume it exists and will be implemented in a later step.
            await (this as any)._applyAndLogEvent(event, true); // Apply locally first (isLocalOrigin = true)
            
            this.onOutgoingMessageCallback({ type: "BroadcastEvent", event }); // Then broadcast
            
            totalSteps++;
        }
        if (totalSteps === maxSteps && maxSteps > 0) {
            console.warn(`[${this.localNodeId}] Max reduction steps reached (${maxSteps}).`);
        }
        return Promise.resolve(totalSteps);
    }

    private async _applyAndLogEvent(event: InteractionEvent, isLocalOrigin: boolean): Promise<void> {
        // Deduplication for remote events
        if (!isLocalOrigin && this.eventLog.has(event.eventId)) {
            console.log(`[${this.localNodeId}] Event ${event.eventId} already processed.`);
            return;
        }

        const agent1 = this.getAgent(event.agent1Id);
        const agent2 = this.getAgent(event.agent2Id);

        // Check if participant agents are present
        if (!agent1 || !agent2) {
            const missingIds: AgentId[] = [];
            if (!agent1 && !this.knownMissingAgents.has(event.agent1Id)) {
                missingIds.push(event.agent1Id);
                this.knownMissingAgents.add(event.agent1Id); // Mark as known missing
            }
            if (!agent2 && !this.knownMissingAgents.has(event.agent2Id)) {
                missingIds.push(event.agent2Id);
                this.knownMissingAgents.add(event.agent2Id); // Mark as known missing
            }

            if (missingIds.length > 0) {
                console.log(`[${this.localNodeId}] Event ${event.eventId} requires missing agents:`, missingIds);
                this.onOutgoingMessageCallback({
                    type: "RequestAgentStates",
                    agentIds: missingIds,
                    fromNodeId: this.localNodeId,
                    replyToEventId: event.eventId
                });
            }
            // Add to pending events if not already there, or if agents were just requested for it
            if (!this.pendingEvents.has(event.eventId) || missingIds.length > 0) {
                 this.pendingEvents.set(event.eventId, event);
                 // Update tracking for requested agents
                 missingIds.forEach(id => {
                    if (!this.requestedAgents.has(id)) {
                        this.requestedAgents.set(id, { eventIdsWaiting: new Set() });
                    }
                    this.requestedAgents.get(id)!.eventIdsWaiting.add(event.eventId);
                 });
            }
            return;
        }
        
        // If we reached here, agents are present. Remove from knownMissingAgents if they were there.
        this.knownMissingAgents.delete(event.agent1Id);
        this.knownMissingAgents.delete(event.agent2Id);

        const ruleDefinition = this._findRuleDefinition(agent1.name, event.port1Name, agent2.name, event.port2Name);
        if (!ruleDefinition) {
            console.error(`[${this.localNodeId}] Rule definition not found for event ${event.eventId}: ${event.ruleName} between ${agent1.name}:${event.port1Name} and ${agent2.name}:${event.port2Name}. Ignoring event.`);
            // Optionally, still log it as processed to prevent retries if it's truly unprocessable
            // this.eventLog.set(event.eventId, event);
            return;
        }

        // For remote events, merge their VC into local node's VC and increment local node's VC
        if (!isLocalOrigin) {
            this.localNodeVC.merge(new VectorClock(event.eventVC)); // event.eventVC is a plain object
            this.localNodeVC.increment(this.localNodeId);
        }

        this.eventLog.set(event.eventId, event);
        this.pendingEvents.delete(event.eventId); // Remove from pending if it was there

        const distState1 = await this._getOrInitDistributedState(agent1);
        const distState2 = await this._getOrInitDistributedState(agent2);
        
        // It's important to take snapshots *before* the rule action modifies the agents.
        // However, the issue description's _applyAndLogEvent has preSnaps defined but not directly used for comparison later.
        // Instead, it relies on _refreshAgentStateHashes and its return value.

        let returnedEntities: (IAgentDefinition | IConnectionDefinition)[] = [];

        if (ruleDefinition.type === 'action' || ruleDefinition.type === 'deterministic_action') {
            const result = ruleDefinition.action(agent1, agent2, this.baseNetwork, event.ruleArgs);
            if (Array.isArray(result)) {
                // Ensure result only contains IAgentDefinition or IConnectionDefinition as per IDeterministicActionRule
                // IActionRule might return IAgent or IConnection instances, which are not handled here directly.
                // This implementation will focus on IAgentDefinition and IConnectionDefinition for new items.
                returnedEntities = result.filter(
                    (e: any): e is IAgentDefinition | IConnectionDefinition => 
                        e && (e._isAgentDef === true || e._isConnectionDef === true)
                ) as (IAgentDefinition | IConnectionDefinition)[];
            }
        } else if (ruleDefinition.type === 'rewrite') {
            // _executeRewrite handles its own agent creation, VC updates, and snapshot broadcasts within its scope if needed.
            // It will use this.createAgent() which populates event.createdAgentSnapshots if isLocalOrigin.
            await (this as any)._executeRewrite(ruleDefinition, agent1.ports[event.port1Name], agent2.ports[event.port2Name], event);
             // For rewrites, the state changes are complex. We assume _executeRewrite handles agent VCs.
             // The interacting agents agent1 and agent2 are removed by the rewrite.
             // We still need to refresh and broadcast snapshots of *newly created* agents from the rewrite if this node is the origin.
             // This is handled by createAgent called within _executeRewrite if isLocalOrigin is true.
             // No further processing for agent1 & agent2 needed here as they are gone.
        } else {
            console.warn(`[${this.localNodeId}] Unknown rule type: ${(ruleDefinition as AnyRule).type} for rule ${ruleDefinition.name}`);
            return; // Unknown rule type
        }

        const newlyCreatedAgentsFromRule: IAgent[] = [];
        if (ruleDefinition.type === 'action' || ruleDefinition.type === 'deterministic_action') {
            for (const entity of returnedEntities) {
                if (entity._isAgentDef) {
                    let newAgentId = entity.idSuggestion;
                    // For local origin and deterministic rules that *don't* create undeterministic new agents,
                    // ID generation might need to be deterministic based on event/rule args IF not provided.
                    // However, the issue states: "origin node MUST include snapshots ... if createsUndeterministicNewAgents is true"
                    // or if IDs cannot be deterministically derived. This implies origin always suggests/creates IDs.
                    if (isLocalOrigin && !newAgentId) {
                        newAgentId = uuidv4();
                    }
                    // If !isLocalOrigin, newAgentId *must* be present (either from idSuggestion or derived by origin and put in ruleArgs/snapshot)
                    // This simplified version relies on createdAgentSnapshots for remote nodes or requires idSuggestion.
                    if (!newAgentId && !isLocalOrigin) {
                        console.error(`[${this.localNodeId}] Event ${event.eventId} (remote) resulted in IAgentDefinition without idSuggestion. Cannot create agent.`);
                        continue;
                    }
                    const newAgent = await this.createAgent(entity.name, entity.value, entity.ports, newAgentId);
                    newlyCreatedAgentsFromRule.push(newAgent);
                } else if (entity._isConnectionDef) {
                    const a1 = this.getAgent(entity.agent1Id);
                    const a2 = this.getAgent(entity.agent2Id);
                    if (a1 && a2 && a1.ports[entity.port1Name] && a2.ports[entity.port2Name]) {
                        await this.connectPorts(a1.ports[entity.port1Name] as IBoundPort, a2.ports[entity.port2Name] as IBoundPort, entity.name);
                    } else {
                        console.warn(`[${this.localNodeId}] Could not create connection defined by event ${event.eventId}: Agents/ports not found.`);
                    }
                }
            }
        }
        
        // Refresh states of interacting agents (if not a rewrite that removed them)
        // and newly created agents (if any from action/deterministic_action)
        let agentsToRefresh = ruleDefinition.type !== 'rewrite' ? [agent1, agent2] : [];
        agentsToRefresh.push(...newlyCreatedAgentsFromRule);

        for (const agent of agentsToRefresh) {
            const distState = await this._getOrInitDistributedState(agent);
            // For locally originating events, force VC increment on interacting/newly created agents
            // as this event is the cause of their state change.
            // For remote events, don't force VC increment here; their state change is dictated by the event's VC and subsequent merges.
            // _refreshAgentStateHashes will still increment VC if hashes change.
            const refreshed = await this._refreshAgentStateHashes(agent, distState, isLocalOrigin);

            if (isLocalOrigin) {
                // If agent is newly created by THIS rule application (action/deterministic_action)
                if (newlyCreatedAgentsFromRule.includes(agent)) {
                    // If rule is deterministic and *doesn't* create undeterministic new agents, its snapshot might not be needed
                    // *unless* it's the agent created by this event.
                    // The logic in the issue is a bit complex here. Simplified: if local origin and new agent, add its snapshot to the event.
                    if (event.createdAgentSnapshots) { // Ensure array exists
                        event.createdAgentSnapshots.push(await this._getAgentSnapshot(agent));
                    }
                } else if (refreshed) { // Existing agent that changed due to local event
                    // For deterministic_action rules that are pure (no args, no undeterministic new agents),
                    // the event itself might be enough. Others require a snapshot.
                    if (ruleDefinition.type === 'deterministic_action' && 
                        !ruleDefinition.createsUndeterministicNewAgents && 
                        event.ruleArgs === undefined) {
                        // Potentially skip snapshot if only VC changed but not hashes (though refreshAgentStateHashes returns true if VC increments)
                        // The issue says: "Potentially send snapshot if VC alone changed significantly"
                        // For simplicity: if refreshed (meaning VC incremented), and it's not a new agent, send snapshot.
                         this.onOutgoingMessageCallback({ type: "RespondAgentStates", snapshots: [await this._getAgentSnapshot(agent)], toNodeId: "BROADCAST_ALL", forEventId: `event-${event.eventId}-agent-${agent._agentId}` });
                    } else {
                        this.onOutgoingMessageCallback({ type: "RespondAgentStates", snapshots: [await this._getAgentSnapshot(agent)], toNodeId: "BROADCAST_ALL", forEventId: `event-${event.eventId}-agent-${agent._agentId}` });
                    }
                }
            } // For remote events, snapshots are not broadcast from here; they are handled by _applyAgentStateSnapshot or if the event itself leads to conflicts.
        }

        // If a remote event caused changes (new agents created, or existing agents changed significantly)
        // it might trigger further local reductions.
        if (!isLocalOrigin) {
            let changedByRemoteEvent = false;
            if (newlyCreatedAgentsFromRule.length > 0) changedByRemoteEvent = true;
            // Check if agent1 or agent2's hashes changed due to the remote event's application (if not rewrite)
            if (ruleDefinition.type !== 'rewrite') {
                // Re-fetch distState as it might have been updated by _refreshAgentStateHashes
                const currentDistState1 = await this._getOrInitDistributedState(agent1);
                const currentDistState2 = await this._getOrInitDistributedState(agent2);
                const agent1ValueAndHash = await serializeAndHashValue(agent1.value);
                const agent1StructureAndHash = await serializeAndHashStructure(agent1.name, currentDistState1.portConnections);
                const agent2ValueAndHash = await serializeAndHashValue(agent2.value);
                const agent2StructureAndHash = await serializeAndHashStructure(agent2.name, currentDistState2.portConnections);

                const agent1HashChanged = agent1ValueAndHash.valueHash !== currentDistState1.valueHash || agent1StructureAndHash.structureHash !== currentDistState1.structureHash;
                const agent2HashChanged = agent2ValueAndHash.valueHash !== currentDistState2.valueHash || agent2StructureAndHash.structureHash !== currentDistState2.structureHash;

                if(agent1HashChanged || agent2HashChanged) changedByRemoteEvent = true;
            }
            if (changedByRemoteEvent) {
                this.baseNetwork.reduce(); 
            }
        }

        await (this as any)._retryPendingEvents(); // Assuming _retryPendingEvents will be added later
    }

    // Placeholder for disconnectPorts - will be fully implemented later
    private disconnectPorts(p1: IBoundPort, p2: IBoundPort): boolean {
        console.warn(`[${this.localNodeId}] disconnectPorts (wrapper) called but not fully implemented. Forwarding to baseNetwork.`);
        const success = this.baseNetwork.disconnectPorts(p1, p2);
        if (success) {
            // Basic update to distributed state - full version would refresh/broadcast
            const distState1 = this.agentDistributedState.get(p1.agent);
            if (distState1) distState1.portConnections[p1.name] = null;
            const distState2 = this.agentDistributedState.get(p2.agent);
            if (distState2) distState2.portConnections[p2.name] = null;
            // TODO: In full implementation, call _refreshAgentStateHashes and broadcast for p1.agent and p2.agent
        }
        return success;
    }

    // Placeholder for removeAgent - will be fully implemented later
    private removeAgent(agentId: AgentId): boolean {
        console.warn(`[${this.localNodeId}] removeAgent (wrapper) called for ${agentId} but not fully implemented. Forwarding to baseNetwork.`);
        const agent = this.baseNetwork.getAgent(agentId);
        if (agent && this.agentDistributedState.has(agent)) {
            this.agentDistributedState.delete(agent);
        }
        // TODO: Broadcast tombstone or agent removal event
        return this.baseNetwork.removeAgent(agentId);
    }

    private async _executeRewrite(rule: AnyRule, p1: IBoundPort, p2: IBoundPort, originatingEvent: InteractionEvent): Promise<void> {
        // Ensure rule is IRewriteRule
        if (rule.type !== 'rewrite') {
            console.error(`[${this.localNodeId}] _executeRewrite called with non-rewrite rule: ${rule.name}`);
            return;
        }
        const template = rule.rewrite;
        const agent1 = p1.agent;
        const agent2 = p2.agent;
        const distState1 = await this._getOrInitDistributedState(agent1);
        const distState2 = await this._getOrInitDistributedState(agent2);
    
        const newAgentInstances: IAgent[] = [];
        const templateIdToActualId: Map<string, AgentId> = new Map();

        // 1. Create new agents based on template
        // this.createAgent handles VC, hashes, and adding to event.createdAgentSnapshots if isLocalOrigin
        template.newAgents.forEach(def => {
            let newAgentId = def.idSuggestion; // Use suggestion if provided
            if (originatingEvent.originNodeId === this.localNodeId && !newAgentId) {
                // If local origin and no ID suggested, generate one.
                newAgentId = uuidv4();
            }
            // For remote events, createdAgentSnapshots should provide the agent and its ID.
            // createAgent with existingId will fetch or use the snapshot if already processed.
            const existingAgentFromSnapshot = originatingEvent.createdAgentSnapshots?.find(s => s.name === def.name && s.idSuggestion === def.idSuggestion);
            if (!newAgentId && existingAgentFromSnapshot) {
                newAgentId = existingAgentFromSnapshot.id;
            }
            
            const newAgent = await this.createAgent(def.name, def.initialValue, def.ports || {}, newAgentId); 
            newAgentInstances.push(newAgent);
            if (def._templateId) { 
                 templateIdToActualId.set(def._templateId, newAgent._agentId);
            }
            // If this node is the origin, add snapshot to the event for broadcasting
            if (originatingEvent.originNodeId === this.localNodeId && originatingEvent.createdAgentSnapshots) {
                if (!originatingEvent.createdAgentSnapshots.find(s => s.id === newAgent._agentId)) {
                    originatingEvent.createdAgentSnapshots.push(await this._getAgentSnapshot(newAgent));
                }
            }
        });
    
        // 2. Prepare connections to break and make
        const connectionsToBreak: Array<{ portA: IBoundPort, portB: IBoundPort }> = [];
        connectionsToBreak.push({ portA: p1, portB: p2 });

        const connectionsToMake: Array<{ portA: IBoundPort, portB: IBoundPort, name?: string }> = [];
        
        Object.entries(template.portMapAgent1).forEach(([origPortName, mapping]) => {
            if (origPortName === p1.name) return; 
            const oldPort = agent1.ports[origPortName] as IBoundPort;
            if (!oldPort) return;

            const connInfo = distState1.portConnections[origPortName];
            if (connInfo) {
                const partnerAgent = this.getAgent(connInfo.connectedToAgentId);
                if (partnerAgent) {
                    const partnerPort = partnerAgent.ports[connInfo.connectedToPortName] as IBoundPort;
                    if (partnerPort) {
                        connectionsToBreak.push({ portA: oldPort, portB: partnerPort });
                        if (mapping) { 
                            const newAgentId = templateIdToActualId.get(mapping.newAgentTemplateId);
                            const newAgentInstance = newAgentId ? this.getAgent(newAgentId) : undefined;
                            if (newAgentInstance && newAgentInstance.ports[mapping.newPortName]) {
                                connectionsToMake.push({ portA: newAgentInstance.ports[mapping.newPortName] as IBoundPort, portB: partnerPort });
                            }
                        }
                    }
                }
            }
        });

        Object.entries(template.portMapAgent2).forEach(([origPortName, mapping]) => {
            if (origPortName === p2.name) return;
            const oldPort = agent2.ports[origPortName] as IBoundPort;
            if (!oldPort) return;

            const connInfo = distState2.portConnections[origPortName];
            if (connInfo) {
                const partnerAgent = this.getAgent(connInfo.connectedToAgentId);
                if (partnerAgent) {
                    const partnerPort = partnerAgent.ports[connInfo.connectedToPortName] as IBoundPort;
                    if (partnerPort) {
                        connectionsToBreak.push({ portA: oldPort, portB: partnerPort });
                        if (mapping) { 
                            const newAgentId = templateIdToActualId.get(mapping.newAgentTemplateId);
                            const newAgentInstance = newAgentId ? this.getAgent(newAgentId) : undefined;
                            if (newAgentInstance && newAgentInstance.ports[mapping.newPortName]) {
                                connectionsToMake.push({ portA: newAgentInstance.ports[mapping.newPortName] as IBoundPort, portB: partnerPort });
                            }
                        }
                    }
                }
            }
        });

        // 3. Perform disconnections
        const uniqueConnectionsToBreakKeys = new Set<string>();
        const uniqueConnectionsToBreakPairs: Array<{ portA: IBoundPort, portB: IBoundPort }> = [];
        connectionsToBreak.forEach(cb => {
            const key1 = `${cb.portA.agent._agentId}#${cb.portA.name}`;
            const key2 = `${cb.portB.agent._agentId}#${cb.portB.name}`;
            const pairKey = key1 < key2 ? `${key1}<->${key2}` : `${key2}<->${key1}`;
            if (!uniqueConnectionsToBreakKeys.has(pairKey)) {
                uniqueConnectionsToBreakKeys.add(pairKey);
                uniqueConnectionsToBreakPairs.push(cb);
            }
        });
        uniqueConnectionsToBreakPairs.forEach(cb => {
            this.disconnectPorts(cb.portA, cb.portB);
        });

        // 4. Establish internal connections among new agents
        template.internalConnections.forEach(connDef => {
            const newA1Id = templateIdToActualId.get(connDef.agent1TemplateId);
            const newA2Id = templateIdToActualId.get(connDef.agent2TemplateId);
            const newA1 = newA1Id ? this.getAgent(newA1Id) : undefined;
            const newA2 = newA2Id ? this.getAgent(newA2Id) : undefined;
            if (newA1 && newA2 && newA1.ports[connDef.port1Name] && newA2.ports[connDef.port2Name]) {
                await this.connectPorts(newA1.ports[connDef.port1Name] as IBoundPort, newA2.ports[connDef.port2Name] as IBoundPort, connDef.connectionName);
            }
        });
        
        // 5. Establish remapped external connections
        for (const cm of connectionsToMake) { // Use for...of for async/await
            await this.connectPorts(cm.portA, cm.portB, cm.name);
        }

        // 6. Remove original interacting agents
        this.removeAgent(agent1._agentId); // Stays sync as per current definition
        this.removeAgent(agent2._agentId); // Stays sync
    }

    /**
     * Processes an incoming NetworkSyncPayload message from another node.
     * This is the main entry point for external messages to interact with the distributed network.
     * The local node's vector clock is incremented upon receiving any message.
     * @param message The NetworkSyncPayload message to process.
     *                - "BroadcastEvent": Applies a remote event, handling new agent snapshots if included.
     *                - "RequestAgentStates": Responds with snapshots of requested agents.
     *                - "RespondAgentStates": Applies received agent snapshots and retries pending events.
     * @returns {Promise<void>} A promise that resolves when the message processing is complete.
     */
    public async receiveMessage(message: NetworkSyncPayload): Promise<void> {
        // Increment local node's VC for processing any incoming message
        this.localNodeVC.increment(this.localNodeId);

        switch (message.type) {
            case "BroadcastEvent":
                const event = message.event;
                if (!this.eventLog.has(event.eventId)) {
                    // Merge event's origin VC *before* applying or logging locally
                    this.localNodeVC.merge(new VectorClock(event.eventVC)); 
                    // Local clock already ticked once for receiving the message.
                    // No need to tick again here unless specific processing of BroadcastEvent demands it.

                    // If the event came with snapshots of newly created agents (e.g., from a rewrite on another node),
                    // apply them first. This ensures agents exist before the event rule might try to use them.
                    if (event.createdAgentSnapshots) {
                        for (const snap of event.createdAgentSnapshots) { // Use for...of for async/await
                            // Treat these as bootstrap snapshots for new agents from a remote event context
                            await this._applyAgentStateSnapshot(snap, true); 
                        }
                    }
                    await this._applyAndLogEvent(event, false); // Apply remote event (isLocalOrigin = false)
                } else {
                    console.log(`[${this.localNodeId}] Received duplicate event ${event.eventId}`);
                }
                break;

            case "RequestAgentStates":
                const responseSnapshots: AgentStateSnapshot[] = [];
                for (const id of message.agentIds) { // Use for...of for async/await
                    const agent = this.getAgent(id);
                    if (agent) {
                        responseSnapshots.push(await this._getAgentSnapshot(agent));
                    }
                }
                if (responseSnapshots.length > 0) {
                    this.onOutgoingMessageCallback({
                        type: "RespondAgentStates",
                        snapshots: responseSnapshots,
                        toNodeId: message.fromNodeId,
                        forEventId: message.replyToEventId
                    });
                }
                break;

            case "RespondAgentStates":
                for (const snap of message.snapshots) { // Use for...of for async/await
                    // Treat these as bootstrap/resolution snapshots as they are direct state updates
                    await this._applyAgentStateSnapshot(snap, true); 
                }

                // If this response was for a specific event, try to re-process that event.
                if (message.forEventId && this.pendingEvents.has(message.forEventId)) {
                    const eventToRetry = this.pendingEvents.get(message.forEventId)!;
                    // Check if all agents for this specific event are now available
                    const agent1 = this.getAgent(eventToRetry.agent1Id);
                    const agent2 = this.getAgent(eventToRetry.agent2Id);
                    if (agent1 && agent2) {
                        this.pendingEvents.delete(message.forEventId);
                        console.log(`[${this.localNodeId}] Retrying event ${message.forEventId} after receiving requested states.`);
                        await this._applyAndLogEvent(eventToRetry, false); // isLocalOrigin is false for pending events from remote
                    } else {
                        console.log(`[${this.localNodeId}] Still missing agents for event ${message.forEventId} after response.`);
                    }
                } else {
                    // If not for a specific event, or event no longer pending, retry all generally pending events.
                    await this._retryPendingEvents();
                }
                break;
            default:
                console.warn(`[${this.localNodeId}] Received message with unknown type:`, (message as any).type);
        }
    }

    private async _applyAgentStateSnapshot(snapshot: AgentStateSnapshot, isBootstrapOrResolution: boolean): Promise<void> {
        let agent = this.getAgent(snapshot.id);
        const remoteVC = new VectorClock(snapshot.vectorClock); // snapshot.vectorClock is plain object
        let existingAgentDistState = agent ? await this._getOrInitDistributedState(agent) : undefined;

        if (!agent) {
            console.log(`[${this.localNodeId}] Applying snapshot for new agent ${snapshot.id}`);
            // Agent doesn't exist locally, create it using the snapshot data.
            // Determine port definitions from snapshot.portConnections keys
            const portDefs: Record<PortName, IPort> = {};
            Object.keys(snapshot.portConnections).forEach(pName => {
                // We don't know the 'type' (main/aux) from snapshot alone, default to 'aux' or 'main'
                // This might need refinement if port types are crucial for agent creation via snapshot
                portDefs[pName] = { name: pName, type: 'aux' } as IPort; // Assuming IPort structure
            });
            if (Object.keys(portDefs).length === 0 && this.baseNetwork.getAllAgents().find(a=>a.name === snapshot.name)?.ports['main']) {
                 portDefs["main"] = { name: "main", type: "main" } as IPort; // Ensure default port if none from snapshot
            }

            // Create agent using existingId to ensure ID matches snapshot.
            // The createAgent method will initialize its distState.
            agent = await this.createAgent(snapshot.name, deserializeValue(snapshot.serializedValue), portDefs, snapshot.id);
            existingAgentDistState = await this._getOrInitDistributedState(agent);
            
            // Adopt snapshot's state fully for new agent
            agent.value = deserializeValue(snapshot.serializedValue); // Set value again after createAgent's initial
            existingAgentDistState.vectorClock = remoteVC.clone();
            existingAgentDistState.portConnections = { ...snapshot.portConnections };
            // Refresh hashes based on snapshot data, but don't force VC increment beyond what createAgent/remoteVC implies
            await this._refreshAgentStateHashes(agent, existingAgentDistState, false); 

            this.knownMissingAgents.delete(snapshot.id);
        } else {
            // Agent exists, perform merge/conflict resolution
            const localVC = existingAgentDistState!.vectorClock;
            if (remoteVC.isConcurrentWith(localVC)) {
                console.log(`[${this.localNodeId}] Concurrent state for agent ${snapshot.id}. Applying LWW.`);
                // Last-Writer-Wins: Compare VCs sum, then node ID as tie-breaker.
                // The issue's LWW logic seems to be: sum of VC values, then originNodeIdIfConflictResolution (if provided) or localNodeId.
                // A simpler LWW: higher sum of VC values wins. If equal, higher nodeId wins.
                const sumRemote = Object.values(remoteVC.toObject()).reduce((s, c) => s + c, 0);
                const sumLocal = Object.values(localVC.toObject()).reduce((s, c) => s + c, 0);
                
                let remoteWins = false;
                if (sumRemote > sumLocal) {
                    remoteWins = true;
                } else if (sumRemote === sumLocal) {
                    // Tie-break with originNodeId from snapshot if available, otherwise use localNodeId comparison.
                    // Assuming snapshot.originNodeIdIfConflictResolution is the ID of the node that sent the snapshot in a conflict scenario.
                    const tieBreakerNodeId = snapshot.originNodeIdIfConflictResolution || this.localNodeId; // Needs careful thought for originNodeIdIfConflictResolution source
                    if (tieBreakerNodeId > this.localNodeId) { // Example: higher node ID wins tie
                         remoteWins = true;
                    }
                }

                if (remoteWins) {
                    console.log(`[${this.localNodeId}] Remote wins LWW for ${snapshot.id}`);
                    agent.value = deserializeValue(snapshot.serializedValue);
                    existingAgentDistState!.portConnections = { ...snapshot.portConnections };
                    existingAgentDistState!.vectorClock.merge(remoteVC); // Merge VCs
                    // localNodeVC already ticked for receiving the message. Agent's VC just merged.
                    // Refresh hashes. Force VC increment because state changed due to conflict resolution.
                    if(await this._refreshAgentStateHashes(agent, existingAgentDistState!, true)) {
                        // If this node resolved the conflict and changed state based on remote, it might rebroadcast.
                        // The issue says: "Only broadcast if we are the 'resolver' of the conflict explicitly."
                        // This logic can be complex. For now, if remote wins and state changed, broadcast.
                        if (isBootstrapOrResolution) { // From RespondAgentStates or explicit bootstrap
                           this.onOutgoingMessageCallback({ type: "RespondAgentStates", snapshots: [await this._getAgentSnapshot(agent)], toNodeId: "BROADCAST_ALL", forEventId: `conflict-resolved-${snapshot.id}`});
                        }
                    }
                } else {
                    console.log(`[${this.localNodeId}] Local wins LWW for ${snapshot.id}`);
                    existingAgentDistState!.vectorClock.merge(remoteVC); // Still merge VCs to reflect knowledge
                    // If local state is kept, but VC changed due to merge, refresh and potentially broadcast.
                    // Don't force VC increment here as the actual state value/structure didn't change from remote.
                    if(await this._refreshAgentStateHashes(agent, existingAgentDistState!, false)){
                        if (isBootstrapOrResolution) { // If local won but VC changed significantly
                             this.onOutgoingMessageCallback({ type: "RespondAgentStates", snapshots: [await this._getAgentSnapshot(agent)], toNodeId: "BROADCAST_ALL", forEventId: `conflict-kept-${snapshot.id}`});
                        }
                    }
                }
            } else if (remoteVC.isAfter(localVC)) {
                console.log(`[${this.localNodeId}] Remote state is causally after local for ${snapshot.id}. Applying remote state.`);
                agent.value = deserializeValue(snapshot.serializedValue);
                existingAgentDistState!.portConnections = { ...snapshot.portConnections };
                existingAgentDistState!.vectorClock = remoteVC.clone(); // Adopt remote VC entirely
                await this._refreshAgentStateHashes(agent, existingAgentDistState!, false); // Refresh hashes, don't force VC (already adopted)
            } else { // Remote is older or same (localVC.isAfter(remoteVC) || localVC.equals(remoteVC))
                console.log(`[${this.localNodeId}] Remote state is older or same for ${snapshot.id}. Merging VCs if different.`);
                const oldVcString = existingAgentDistState!.vectorClock.toString();
                existingAgentDistState!.vectorClock.merge(remoteVC);
                if (existingAgentDistState!.vectorClock.toString() !== oldVcString) { // VC changed due to merge
                    // Hashes unlikely to change here, but refresh for consistency. Don't force VC.
                    if(await this._refreshAgentStateHashes(agent, existingAgentDistState!, false)) {
                        // If somehow hashes changed and local is dominant, might rebroadcast
                        // This scenario is less common if local state truly dominates.
                         this.onOutgoingMessageCallback({ type: "RespondAgentStates", snapshots: [await this._getAgentSnapshot(agent)], toNodeId: "BROADCAST_ALL", forEventId: `vc-merged-${snapshot.id}`});
                    }
                }
            }
        }

        // After applying snapshot (value, VC), ensure local connections match the snapshot's portConnections.
        // This is crucial for structural consistency.
        let structurePotentiallyChangedBySnapshot = false;
        for (const portName in snapshot.portConnections) {
            const remoteConnDetails = snapshot.portConnections[portName];
            const localPort = agent!.ports[portName]; // agent is guaranteed to exist here
            if (!localPort) continue; // Should not happen if agent created with snapshot's ports

            const currentLocalConn = existingAgentDistState!.portConnections[portName];

            if (JSON.stringify(remoteConnDetails) !== JSON.stringify(currentLocalConn)) { // Naive change check
                structurePotentiallyChangedBySnapshot = true;
                if (remoteConnDetails) { // Snapshot says there should be a connection
                    const targetAgent = this.getAgent(remoteConnDetails.connectedToAgentId);
                    if (targetAgent && targetAgent.ports[remoteConnDetails.connectedToPortName]) {
                        // Check if already connected correctly to avoid redundant connectPorts calls
                        if(!currentLocalConn || currentLocalConn.connectedToAgentId !== remoteConnDetails.connectedToAgentId || currentLocalConn.connectedToPortName !== remoteConnDetails.connectedToPortName) {
                            await this.connectPorts(localPort as IBoundPort, targetAgent.ports[remoteConnDetails.connectedToPortName] as IBoundPort);
                        }
                    } else if (!this.knownMissingAgents.has(remoteConnDetails.connectedToAgentId)) {
                        this.knownMissingAgents.add(remoteConnDetails.connectedToAgentId);
                        this.onOutgoingMessageCallback({
                            type: "RequestAgentStates", 
                            agentIds: [remoteConnDetails.connectedToAgentId], 
                            fromNodeId: this.localNodeId
                        });
                    }
                } else if (currentLocalConn) { // Snapshot says null (no connection), but local has one -> disconnect
                    const targetAgent = this.getAgent(currentLocalConn.connectedToAgentId);
                    if (targetAgent && targetAgent.ports[currentLocalConn.connectedToPortName]) {
                        this.disconnectPorts(localPort as IBoundPort, targetAgent.ports[currentLocalConn.connectedToPortName] as IBoundPort); // Remains sync
                    }
                }
            }
        }
        // After connection changes, distState.portConnections might be stale for agent.
        // Refresh hashes and VC for the agent whose connections were just updated.
        if (structurePotentiallyChangedBySnapshot) {
            // Force VC increment as structure was actively changed to match snapshot
            await this._refreshAgentStateHashes(agent!, existingAgentDistState!, true);
            this.baseNetwork.reduce(); // Structural changes might trigger new interactions
        }
    }
    
    private async _retryPendingEvents(): Promise<void> {
        console.log(`[${this.localNodeId}] Retrying ${this.pendingEvents.size} pending events.`);
        const eventsToRetry = Array.from(this.pendingEvents.values());
        // Clear pending before trying, to avoid loops if an event immediately becomes pending again.
        // Only add back if still pending after retry attempt.
        this.pendingEvents.clear(); 

        for (const event of eventsToRetry) { // Use for...of for async/await
            console.log(`[${this.localNodeId}] Attempting to retry event ${event.eventId}`);
            // _applyAndLogEvent will check agent availability and re-add to pendingEvents if necessary.
            await this._applyAndLogEvent(event, false); // isLocalOrigin is false for events that were pending (assumed remote)
        }
    }
}
