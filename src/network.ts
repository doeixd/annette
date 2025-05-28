import { Agent, AgentId, IAgent, isAgent } from "./agent";
import {
  Connection,
  IConnection,
  isConnection,
} from "./connection";
import {
  IBoundPort,
  isBoundPort,
  PortInstanceKey,
  PortName,
  getPortInstanceKey,
} from "./port";
import { AnyRule, IActionRule, IRewriteRule, IRule, RuleCommand, RuleAddCommand, RuleRemoveCommand } from "./rule";
import { v4 as uuidv4 } from 'uuid';

// Type registry to assign integer IDs to agent types for faster matching
export class TypeRegistry {
  private typeToId = new Map<string, number>();
  private idToType = new Map<number, string>();
  private nextId = 1; // Start from 1, 0 can be reserved for 'unknown'

  // Get or create type ID
  public getTypeId(type: string): number {
    if (!this.typeToId.has(type)) {
      const id = this.nextId++;
      this.typeToId.set(type, id);
      this.idToType.set(id, type);
    }
    return this.typeToId.get(type)!;
  }

  public getTypeName(id: number): string | undefined {
    return this.idToType.get(id);
  }
}

// Efficient graph structure for networks with many agents and connections
export class OptimizedGraph {
  private agentsByTypeId = new Map<number, Array<IAgent>>();
  private agentsByName = new Map<string, Array<IAgent>>();
  private agentsById = new Map<AgentId, IAgent>();
  private connectionsBySourceKey = new Map<PortInstanceKey, Set<PortInstanceKey>>();
  private connectionObjects = new Map<string, IConnection>();
  
  constructor() {}
  
  private getConnectionKey(sourceKey: PortInstanceKey, destKey: PortInstanceKey): string {
    return `${sourceKey}-${destKey}`;
  }
  
  public addAgent(agent: IAgent): void {
    // Store by ID
    this.agentsById.set(agent._agentId, agent);
    
    // Store by name
    if (!this.agentsByName.has(agent.name)) {
      this.agentsByName.set(agent.name, []);
    }
    this.agentsByName.get(agent.name)!.push(agent);
    
    // In a real implementation with integer IDs, we would use agent.typeId here
    // For now, we'll use a string-based approach for compatibility
    const typeId = this.getTypeIdForName(agent.name);
    if (!this.agentsByTypeId.has(typeId)) {
      this.agentsByTypeId.set(typeId, []);
    }
    this.agentsByTypeId.get(typeId)!.push(agent);
  }
  
  public removeAgent(agentId: AgentId): boolean {
    const agent = this.agentsById.get(agentId);
    if (!agent) return false;
    
    // Remove from maps
    this.agentsById.delete(agentId);
    
    // Remove from name map
    const agentsOfName = this.agentsByName.get(agent.name);
    if (agentsOfName) {
      const index = agentsOfName.findIndex(a => a._agentId === agentId);
      if (index >= 0) {
        agentsOfName.splice(index, 1);
      }
      if (agentsOfName.length === 0) {
        this.agentsByName.delete(agent.name);
      }
    }
    
    // Remove from type map
    const typeId = this.getTypeIdForName(agent.name);
    const agentsOfType = this.agentsByTypeId.get(typeId);
    if (agentsOfType) {
      const index = agentsOfType.findIndex(a => a._agentId === agentId);
      if (index >= 0) {
        agentsOfType.splice(index, 1);
      }
      if (agentsOfType.length === 0) {
        this.agentsByTypeId.delete(typeId);
      }
    }
    
    // Remove related connections
    for (const port of Object.values(agent.ports)) {
      const portKey = getPortInstanceKey(port);
      this.removeConnections(portKey);
    }
    
    return true;
  }
  
  private removeConnections(portKey: PortInstanceKey): void {
    // Remove connections where this port is the source
    const destKeys = this.connectionsBySourceKey.get(portKey);
    if (destKeys) {
      // Convert to array first to avoid iteration issues
      const destKeysArray = Array.from(destKeys);
      for (const destKey of destKeysArray) {
        const connectionKey = this.getConnectionKey(portKey, destKey);
        this.connectionObjects.delete(connectionKey);
        
        // Also delete the reverse connection
        const reverseKey = this.getConnectionKey(destKey, portKey);
        this.connectionObjects.delete(reverseKey);
      }
      this.connectionsBySourceKey.delete(portKey);
    }
    
    // Remove connections where this port is the destination
    // Convert entries to array first to avoid iteration issues
    const entries = Array.from(this.connectionsBySourceKey.entries());
    for (const [sourceKey, destSet] of entries) {
      if (destSet.has(portKey)) {
        destSet.delete(portKey);
        
        // Remove the connection object
        const connectionKey = this.getConnectionKey(sourceKey, portKey);
        this.connectionObjects.delete(connectionKey);
        
        if (destSet.size === 0) {
          this.connectionsBySourceKey.delete(sourceKey);
        }
      }
    }
  }
  
  public addConnection(connection: IConnection): void {
    const sourceKey = getPortInstanceKey(connection.sourcePort);
    const destKey = getPortInstanceKey(connection.destinationPort);
    
    // Store by source port
    if (!this.connectionsBySourceKey.has(sourceKey)) {
      this.connectionsBySourceKey.set(sourceKey, new Set());
    }
    this.connectionsBySourceKey.get(sourceKey)!.add(destKey);
    
    // Store the connection object
    const key = this.getConnectionKey(sourceKey, destKey);
    this.connectionObjects.set(key, connection);
  }
  
  public getConnection(sourceKey: PortInstanceKey, destKey: PortInstanceKey): IConnection | undefined {
    return this.connectionObjects.get(this.getConnectionKey(sourceKey, destKey));
  }
  
  public getConnectionsForPort(portKey: PortInstanceKey): IConnection[] {
    const connections: IConnection[] = [];
    
    // Get connections where this port is the source
    const destKeys = this.connectionsBySourceKey.get(portKey);
    if (destKeys) {
      // Convert to array first to avoid iteration issues
      const destKeysArray = Array.from(destKeys);
      for (const destKey of destKeysArray) {
        const connection = this.getConnection(portKey, destKey);
        if (connection) connections.push(connection);
      }
    }
    
    // Get connections where this port is the destination
    // Convert entries to array first to avoid iteration issues
    const entries = Array.from(this.connectionsBySourceKey.entries());
    for (const [sourceKey, destSet] of entries) {
      if (destSet.has(portKey)) {
        const connection = this.getConnection(sourceKey, portKey);
        if (connection) connections.push(connection);
      }
    }
    
    return connections;
  }
  
  public getConnectionsForAgent(agent: IAgent): IConnection[] {
    const connections: IConnection[] = [];
    
    // Check all ports of this agent
    for (const port of Object.values(agent.ports)) {
      const portKey = getPortInstanceKey(port);
      const portConnections = this.getConnectionsForPort(portKey);
      connections.push(...portConnections);
    }
    
    return connections;
  }
  
  public getAgentById(id: AgentId): IAgent | undefined {
    return this.agentsById.get(id);
  }
  
  public getAgentsByName(name: string): IAgent[] {
    return this.agentsByName.get(name) || [];
  }
  
  public getAgentsByType(typeId: number): IAgent[] {
    return this.agentsByTypeId.get(typeId) || [];
  }
  
  // Simple method to get type ID from name - in a real implementation this would be replaced by TypeRegistry
  private typeIdMap = new Map<string, number>();
  private nextTypeId = 1;
  
  private getTypeIdForName(name: string): number {
    if (!this.typeIdMap.has(name)) {
      this.typeIdMap.set(name, this.nextTypeId++);
    }
    return this.typeIdMap.get(name)!;
  }
}

// Network State Internal Representation
interface INetworkState {
  agents: Map<AgentId, IAgent>;
  portConnectivity: Map<PortInstanceKey, PortInstanceKey>;
  activePairs: Set<string>; // Format: `${port1Key}<->${port2Key}`
  rules: Map<string, AnyRule>; // Format: `${agentName1}:${portName1}<->${agentName2}:${portName2}`
  
  // Optional optimized graph structure
  optimizedGraph?: OptimizedGraph;
}

// Helper function to create rule lookup key
export function getRuleLookupKey(agentName1: string, portName1: string, agentName2: string, portName2: string): string {
  // Create canonical order for rule keys
  const names = [
    { agentName: agentName1, portName: portName1 },
    { agentName: agentName2, portName: portName2 }
  ].sort((a, b) => a.agentName.localeCompare(b.agentName) || a.portName.localeCompare(b.portName));
  
  return `${names[0].agentName}:${names[0].portName}<->${names[1].agentName}:${names[1].portName}`;
}

// Interface for change history entries
export interface ChangeHistoryEntry {
  timestamp: number;
  ruleName: string;
  targetId: string;
  targetName: string;
  updaterId: string;
  updaterName: string;
  previousState: any;
  newState: any;
  description: string;
}

export interface INetwork<Name extends string = string, A extends IAgent = IAgent> {
  readonly name: Name;
  readonly id: string;

  // Agent Management
  addAgent: <T extends A | IAgent>(agent: T) => T;
  removeAgent: (agentOrId: A | string) => boolean;
  getAgent: <T extends A | IAgent>(agentId: string) => T | undefined;
  findAgents: (query: { name?: string }) => IAgent[];
  getAllAgents: () => IAgent[]; // New method to get all agents

  // Connection Management  
  connectPorts: <
    P1 extends IBoundPort = IBoundPort,
    P2 extends IBoundPort = IBoundPort
  >(port1: P1, port2: P2, connectionName?: string) => IConnection<string, P1["agent"], P2["agent"], any, any> | undefined;
  disconnectPorts: <
    P1 extends IBoundPort = IBoundPort,
    P2 extends IBoundPort = IBoundPort
  >(port1: P1, port2: P2) => boolean;
  isPortConnected: <P extends IBoundPort = IBoundPort>(port: P) => boolean; // New method to check if port is connected
  getAllConnections: () => IConnection[]; // New method to get all connections
  findConnections: (query?: { from?: IBoundPort, to?: IBoundPort }) => IConnection[]; // New method to find connections

  // Rule Management
  addRule: (rule: AnyRule) => void;
  removeRule: (rule: AnyRule | string) => boolean; // Remove rule by object or name
  getAllRules: () => AnyRule[]; // Get all rules
  findRules: (query?: { name?: string; type?: string; agentName?: string; portName?: string }) => AnyRule[]; // Find rules by criteria
  clearRules: () => void; // Clear all rules

  // Execution
  step: () => boolean;
  reduce: (maxSteps?: number) => number;
  
  // Change History
  getChangeHistory?: () => ChangeHistoryEntry[];
}

export function Network<
  Name extends string,
  A extends IAgent = IAgent,
>(name: Name, agents?: A[], rules?: AnyRule[]) {
  const networkId = uuidv4();
  
  // Create type registry for fast type-based matching
  const typeRegistry = new TypeRegistry();
  
  // Initialize network state
  const state: INetworkState = {
    agents: new Map(),
    portConnectivity: new Map(),
    activePairs: new Set(),
    rules: new Map(),
    optimizedGraph: new OptimizedGraph(), // Initialize the optimized graph structure
  };

  // Add initial agents if provided
  if (Array.isArray(agents)) {
    agents.forEach(agent => {
      state.agents.set(agent._agentId, agent);
    });
  }

  // Add initial rules if provided
  if (Array.isArray(rules)) {
    rules.forEach(rule => {
      addRuleInternal(rule);
    });
  }

  // Helper function to get a port instance from its key
  function getPortInstance(portKey: PortInstanceKey): IBoundPort | undefined {
    const [agentId, portName] = portKey.split('#') as [AgentId, PortName];
    const agent = state.agents.get(agentId);
    if (agent && portName in agent.ports) {
      return agent.ports[portName];
    }
    return undefined;
  }

  // Add a rule to the network with optimization
  function addRuleInternal(rule: AnyRule): void {
    if (rule.type === 'action' || rule.type === 'rewrite') {
      const { agentName1, portName1, agentName2, portName2 } = rule.matchInfo;
      
      // Get type IDs for faster rule matching
      const typeId1 = typeRegistry.getTypeId(agentName1);
      const typeId2 = typeRegistry.getTypeId(agentName2);
      
      // Store the type IDs in the rule for faster access (non-breaking addition)
      (rule as any)._typeId1 = typeId1;
      (rule as any)._typeId2 = typeId2;
      
      // Traditional string-based key for backward compatibility
      const ruleKey = getRuleLookupKey(agentName1, portName1, agentName2, portName2);
      state.rules.set(ruleKey, rule);
      
      // Clear rule resolution cache when adding new rules
      ruleResolutionCache.clear();
    } else {
      // Legacy rule format
      const legacyRule = rule as IRule;
      const source = legacyRule.connection.source;
      const destination = legacyRule.connection.destination;
      const sourcePort = legacyRule.connection.sourcePort;
      const destPort = legacyRule.connection.destinationPort;

      // Convert to new rule format
      const actionRule: IActionRule = {
        type: 'action',
        name: legacyRule.name,
        matchInfo: {
          agentName1: source.name,
          portName1: sourcePort.name,
          agentName2: destination.name,
          portName2: destPort.name
        },
        action: (agent1, agent2, network) => legacyRule.action(agent1, agent2, network as any)
      };
      
      // Get type IDs for faster rule matching
      const typeId1 = typeRegistry.getTypeId(source.name);
      const typeId2 = typeRegistry.getTypeId(destination.name);
      
      // Store the type IDs in the rule for faster access
      (actionRule as any)._typeId1 = typeId1;
      (actionRule as any)._typeId2 = typeId2;

      const ruleKey = getRuleLookupKey(
        actionRule.matchInfo.agentName1,
        actionRule.matchInfo.portName1,
        actionRule.matchInfo.agentName2,
        actionRule.matchInfo.portName2
      );
      state.rules.set(ruleKey, actionRule);
      
      // Clear rule resolution cache when adding new rules
      ruleResolutionCache.clear();
    }
  }

  // Execute a RewriteRule
  function executeRewriteRule(rule: IRewriteRule, port1: IBoundPort, port2: IBoundPort): void {
    const agent1 = port1.agent;
    const agent2 = port2.agent;
    
    // Get the rewrite plan with optimizations
    let rewrite = rule.rewrite;
    const ruleRewrite = rewrite as any;
    
    // Apply optimizations based on rule type
    if (ruleRewrite._staticRewrite && ruleRewrite._optimized) {
      // For static rules, we can use the pre-defined rewrite plan directly
      // These are already optimized at definition time
      console.log("Using pre-optimized static rewrite plan");
    }
    else if (ruleRewrite._isDeferredFn) {
      // For function-based rules, check if we have a cached plan for these agents
      // Create a cache key based on agent values (for value-based optimization)
      // This allows rules to reuse plans for different agent instances with same values
      const agent1Value = JSON.stringify(agent1.value);
      const agent2Value = JSON.stringify(agent2.value);
      const cacheKey = `${agent1.name}:${agent1Value}:${agent2.name}:${agent2Value}`;
      
      // Initialize the cached plans Map if it doesn't exist
      if (!ruleRewrite._cachedPlans) {
        ruleRewrite._cachedPlans = new Map();
      }
      
      if (ruleRewrite._cachedPlans.has(cacheKey)) {
        // Use cached plan for these specific values
        console.log("Using cached rewrite plan");
        rewrite = ruleRewrite._cachedPlans.get(cacheKey);
      } else {
        // Generate plan by executing the function
        console.log("Generating rewrite plan");
        rewrite = ruleRewrite._fn(agent1, agent2);
        
        // Cache the plan for future use with same agent values
        ruleRewrite._cachedPlans.set(cacheKey, rewrite);
        
        // Mark this rule as now having some optimization
        if (!ruleRewrite._optimized) {
          ruleRewrite._optimized = true;
        }
      }
    }
    
    // Map to store the newly created agents by template ID
    const newAgents = new Map<string, IAgent>();
    
    // Step 1: Create new agents based on template definitions
    for (const agentDef of rewrite.newAgents) {
      // Create a proper agent instead of a plain object
      console.log("Creating new agent with initialValue:", agentDef.initialValue);
      const newAgent = Agent(
        agentDef.name,
        agentDef.initialValue !== undefined ? agentDef.initialValue : null
      );
      
      // Log the new agent's value
      console.log("New agent created with value:", newAgent.value);
      
      // Add the new agent to the network
      addAgent(newAgent);
      
      // Store it for use in connections
      newAgents.set(agentDef._templateId, newAgent);
    }
    
    // Step 2: Establish internal connections between new agents
    for (const connDef of rewrite.internalConnections) {
      const agent1 = newAgents.get(connDef.agent1TemplateId);
      const agent2 = newAgents.get(connDef.agent2TemplateId);
      
      if (agent1 && agent2) {
        const port1 = agent1.ports[connDef.port1Name];
        const port2 = agent2.ports[connDef.port2Name];
        
        if (port1 && port2) {
          connectPorts(port1, port2, connDef.connectionName);
        }
      }
    }
    
    // Step 3: Map external connections from original agents to new agents
    // Handle agent1's external ports
    for (const [portName, mapping] of Object.entries(rewrite.portMapAgent1)) {
      if (portName === port1.name) continue; // Skip the interacting port
      
      const originalPort = agent1.ports[portName];
      if (!originalPort) continue;
      
      // Get the connected port (if any)
      const originalPortKey = getPortInstanceKey(originalPort);
      const connectedPortKey = state.portConnectivity.get(originalPortKey);
      
      if (connectedPortKey && mapping) {
        const connectedPort = getPortInstance(connectedPortKey);
        const newAgent = newAgents.get(mapping.newAgentTemplateId);
        
        if (connectedPort && newAgent) {
          const newPort = newAgent.ports[mapping.newPortName];
          if (newPort) {
            disconnectPorts(originalPort, connectedPort);
            connectPorts(newPort, connectedPort);
          }
        }
      }
    }
    
    // Handle agent2's external ports
    for (const [portName, mapping] of Object.entries(rewrite.portMapAgent2)) {
      if (portName === port2.name) continue; // Skip the interacting port
      
      const originalPort = agent2.ports[portName];
      if (!originalPort) continue;
      
      // Get the connected port (if any)
      const originalPortKey = getPortInstanceKey(originalPort);
      const connectedPortKey = state.portConnectivity.get(originalPortKey);
      
      if (connectedPortKey && mapping) {
        const connectedPort = getPortInstance(connectedPortKey);
        const newAgent = newAgents.get(mapping.newAgentTemplateId);
        
        if (connectedPort && newAgent) {
          const newPort = newAgent.ports[mapping.newPortName];
          if (newPort) {
            disconnectPorts(originalPort, connectedPort);
            connectPorts(newPort, connectedPort);
          }
        }
      }
    }
    
    // Step 4: Remove the original interacting agents
    removeAgent(agent1._agentId);
    removeAgent(agent2._agentId);
  }

  // Execute an ActionRule
  function executeActionRule(rule: IActionRule, port1: IBoundPort, port2: IBoundPort): void {
    const agent1 = port1.agent;
    const agent2 = port2.agent;
    
    // Execute the action function
    const result = rule.action(agent1, agent2, network);
    
    if (result) {
      // Process the returned entities
      for (const entity of result) {
        // Handle different types of entities and commands
        if (isAgent(entity)) {
          // Legacy behavior: Add new agent to the network
          addAgent(entity);
        } else if (isConnection(entity)) {
          // Legacy behavior: Establish new connection
          connectPorts(entity.sourcePort, entity.destinationPort, entity.name);
        } else if (typeof entity === 'object' && entity !== null && 'type' in entity) {
          // Handle rule commands
          const command = entity as RuleCommand;
          
          if (command.type === 'add') {
            const addCmd = command as RuleAddCommand;
            
            if (isAgent(addCmd.entity)) {
              // Check if agent with this ID already exists
              const existingAgent = getAgent(addCmd.entity._agentId);
              
              if (existingAgent) {
                if (addCmd.throwIfExists) {
                  throw new Error(`Agent with ID ${addCmd.entity._agentId} already exists in the network`);
                }
                // Skip adding if it exists and throwIfExists is false
              } else {
                // Add the agent to the network
                addAgent(addCmd.entity);
              }
            } else if (isConnection(addCmd.entity)) {
              const conn = addCmd.entity;
              try {
                // Attempt to connect the ports
                connectPorts(conn.sourcePort, conn.destinationPort, conn.name);
              } catch (error) {
                // If connection fails and throwIfExists is true, re-throw the error
                if (addCmd.throwIfExists) {
                  throw error;
                }
                // Otherwise silently fail (ports might already be connected)
              }
            }
          } else if (command.type === 'remove') {
            const removeCmd = command as RuleRemoveCommand;
            
            // Remove the agent from the network
            // This works even for agents not involved in the rule
            if (isAgent(removeCmd.entity)) {
              removeAgent(removeCmd.entity._agentId);
            } else if (typeof removeCmd.entity === 'string') {
              removeAgent(removeCmd.entity);
            }
          }
        }
      }
    }
  }

  // Add an agent to the network
  function addAgent<T extends A | IAgent>(agent: T): T {
    if (!isAgent(agent)) {
      throw new Error("Invalid agent provided");
    }
    
    // Add to both traditional and optimized structures
    state.agents.set(agent._agentId, agent);
    state.optimizedGraph?.addAgent(agent);
    
    return agent;
  }

  // Remove an agent from the network
  function removeAgent(agentOrId: A | string): boolean {
    const agentId = typeof agentOrId === 'string' ? agentOrId : agentOrId._agentId;
    const agent = state.agents.get(agentId);
    if (!agent) return false;
    
    // Disconnect all ports
    for (const port of Object.values(agent.ports)) {
      const portKey = getPortInstanceKey(port);
      const connectedPortKey = state.portConnectivity.get(portKey);
      
      if (connectedPortKey) {
        const connectedPort = getPortInstance(connectedPortKey);
        if (connectedPort) {
          disconnectPorts(port, connectedPort);
        }
      }
    }
    
    // Remove from optimized graph
    state.optimizedGraph?.removeAgent(agentId);
    
    // Remove the agent from traditional structure
    return state.agents.delete(agentId);
  }

  // Get an agent by ID - using optimized structure when possible
  function getAgent<T extends A | IAgent>(agentId: string): T | undefined {
    // Try optimized graph first for better performance
    const agent = state.optimizedGraph?.getAgentById(agentId);
    if (agent) return agent as T;
    
    // Fall back to traditional structure
    return state.agents.get(agentId) as T | undefined;
  }

  // Find agents by query - using optimized structure when possible
  function findAgents(query: { name?: string }): IAgent[] {
    // For name-based queries, use the optimized structure
    if (query.name && state.optimizedGraph) {
      return state.optimizedGraph.getAgentsByName(query.name);
    }
    
    // Fall back to traditional filtering
    const result: IAgent[] = [];
    // Convert to array first to avoid iteration issues
    const agents = Array.from(state.agents.values());
    for (const agent of agents) {
      if (query.name && agent.name !== query.name) continue;
      result.push(agent);
    }
    
    return result;
  }

  // Connect two ports with optimized handling
  function connectPorts(port1: IBoundPort, port2: IBoundPort, connectionName?: string): IConnection | undefined {
    if (!isBoundPort(port1) || !isBoundPort(port2)) {
      throw new Error("Invalid ports provided");
    }
    
    const port1Key = getPortInstanceKey(port1);
    const port2Key = getPortInstanceKey(port2);
    
    // Check if either port is already connected
    if (state.portConnectivity.has(port1Key) || state.portConnectivity.has(port2Key)) {
      throw new Error("One or both ports are already connected");
    }
    
    // Establish bidirectional connection in traditional structure
    state.portConnectivity.set(port1Key, port2Key);
    state.portConnectivity.set(port2Key, port1Key);
    
    // Add to active pairs for potential rule application
    const agent1Name = port1.agent.name;
    const agent2Name = port2.agent.name;
    const port1Name = port1.name;
    const port2Name = port2.name;
    
    // Create a rule lookup key to check if this connection might trigger a rule
    const ruleKey = getRuleLookupKey(agent1Name, port1Name, agent2Name, port2Name);
    
    if (state.rules.has(ruleKey)) {
      // Format: `${port1Key}<->${port2Key}`
      state.activePairs.add(`${port1Key}<->${port2Key}`);
    }
    
    // Create a connection object
    const name = connectionName || `${port1.agent.name}.${port1.name}-${port2.agent.name}.${port2.name}`;
    const connection = Connection(port1, port2, name);
    
    // Add to optimized graph structure
    state.optimizedGraph?.addConnection(connection);
    
    return connection as any;
  }

  // Disconnect two ports with optimized handling
  function disconnectPorts(port1: IBoundPort, port2: IBoundPort): boolean {
    if (!isBoundPort(port1) || !isBoundPort(port2)) {
      throw new Error("Invalid ports provided");
    }
    
    const port1Key = getPortInstanceKey(port1);
    const port2Key = getPortInstanceKey(port2);
    
    // Remove from active pairs
    state.activePairs.delete(`${port1Key}<->${port2Key}`);
    state.activePairs.delete(`${port2Key}<->${port1Key}`);
    
    // For optimized graph, we would remove the connection directly
    // This is handled indirectly by the optimizedGraph when removing agents
    
    // Remove connectivity from traditional structure
    return state.portConnectivity.delete(port1Key) && state.portConnectivity.delete(port2Key);
  }

  // Optimization: Rule resolution cache
  const ruleResolutionCache = new Map<string, AnyRule | null>();
  
  // Initialize change history storage
  let changeHistory: ChangeHistoryEntry[] = [];

  // Execute a single step of reduction with batch processing
  function step(): boolean {
    if (state.activePairs.size === 0) return false;
    
    // Find all applicable reductions
    const reductions: Array<{
      port1: IBoundPort,
      port2: IBoundPort,
      rule: AnyRule
    }> = [];
    
    // Create a copy of active pairs to iterate over
    const currentActivePairs = Array.from(state.activePairs);
    
    // First phase: Find all applicable reductions
    for (const pairKey of currentActivePairs) {
      const [key1, key2] = pairKey.split('<->') as [PortInstanceKey, PortInstanceKey];
      const port1 = getPortInstance(key1);
      const port2 = getPortInstance(key2);
      
      if (!port1 || !port2) {
        state.activePairs.delete(pairKey);
        continue;
      }
      
      // Optimization: Cache rule resolution
      let rule: AnyRule | undefined | null;
      
      // Get type IDs for faster rule matching
      const typeId1 = typeRegistry.getTypeId(port1.agent.name);
      const typeId2 = typeRegistry.getTypeId(port2.agent.name);
      
      // Check if we've previously resolved a rule for these types and ports
      const ruleResolutionKey = `${typeId1}:${port1.name}:${typeId2}:${port2.name}`;
      
      if (ruleResolutionCache.has(ruleResolutionKey)) {
        // Use cached rule resolution result (faster lookup)
        rule = ruleResolutionCache.get(ruleResolutionKey) || undefined;
      } else {
        // Perform traditional rule lookup
        const ruleKey = getRuleLookupKey(
          port1.agent.name, port1.name,
          port2.agent.name, port2.name
        );
        
        rule = state.rules.get(ruleKey);
        
        // Cache the resolution result using type IDs (even if null)
        ruleResolutionCache.set(ruleResolutionKey, rule || null);
      }
      
      if (rule) {
        reductions.push({ port1, port2, rule });
        state.activePairs.delete(pairKey);
      }
    }
    
    if (reductions.length === 0) return false;
    
    // Second phase: Process reductions
    // Note: We're still processing one interaction per step for consistency
    // But this structure allows for future batch processing if needed
    const { port1, port2, rule } = reductions[0];
    
    if (rule.type === 'rewrite') {
      executeRewriteRule(rule as IRewriteRule, port1, port2);
    } else if (rule.type === 'action') {
      executeActionRule(rule as IActionRule, port1, port2);
    }
    
    return true;
  }

  // Optimized reduce function with batch processing and safety limits
  function reduce(maxSteps?: number): number {
    // Default to a high but safe limit if no maxSteps provided
    const MAX_ITERATIONS = maxSteps ?? 10000;
    let steps = 0;
    
    // Continue reducing until no more reductions are possible or we hit the limit
    let madeProgress = true;
    
    while (madeProgress && steps < MAX_ITERATIONS) {
      madeProgress = step();
      if (madeProgress) steps++;
    }
    
    // Warn if we've hit the iteration limit
    if (steps >= MAX_ITERATIONS) {
      console.warn(`Reached maximum iterations (${MAX_ITERATIONS}) in reduce(). Possible infinite loop?`);
    }
    
    return steps;
  }

  // Get change history
  function getChangeHistory(): ChangeHistoryEntry[] {
    return changeHistory;
  }

  // Get all agents in the network
  function getAllAgents(): IAgent[] {
    return Array.from(state.agents.values());
  }
  
  // Check if a port is connected
  function isPortConnected<P extends IBoundPort>(port: P): boolean {
    const portKey = getPortInstanceKey(port);
    return state.portConnectivity.has(portKey);
  }

  // Get all connections in the network
  function getAllConnections(): IConnection[] {
    const connections: IConnection[] = [];
    const processedPairs = new Set<string>();

    // Iterate through port connectivity to recreate connections
    // Convert entries to array first to avoid iteration issues
    const entries = Array.from(state.portConnectivity.entries());
    for (const [port1Key, port2Key] of entries) {
      // Create a canonical pair key to avoid duplicates
      const pairKey = port1Key < port2Key ? `${port1Key}-${port2Key}` : `${port2Key}-${port1Key}`;
      
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const port1 = getPortInstance(port1Key);
      const port2 = getPortInstance(port2Key);

      if (port1 && port2) {
        const connection = Connection(port1, port2);
        connections.push(connection);
      }
    }

    return connections;
  }

  // Find connections matching the query
  function findConnections(query?: { from?: IBoundPort, to?: IBoundPort }): IConnection[] {
    if (!query) {
      return getAllConnections();
    }

    const connections: IConnection[] = [];
    const processedPairs = new Set<string>();

    // Convert entries to array first to avoid iteration issues
    const entries = Array.from(state.portConnectivity.entries());
    for (const [port1Key, port2Key] of entries) {
      const pairKey = port1Key < port2Key ? `${port1Key}-${port2Key}` : `${port2Key}-${port1Key}`;
      
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const port1 = getPortInstance(port1Key);
      const port2 = getPortInstance(port2Key);

      if (!port1 || !port2) continue;

      // Check if this connection matches the query
      let matches = true;

      if (query.from) {
        const fromKey = getPortInstanceKey(query.from);
        if (port1Key !== fromKey && port2Key !== fromKey) {
          matches = false;
        }
      }

      if (query.to && matches) {
        const toKey = getPortInstanceKey(query.to);
        if (port1Key !== toKey && port2Key !== toKey) {
          matches = false;
        }
      }

      if (matches) {
        const connection = Connection(port1, port2);
        connections.push(connection);
      }
    }

    return connections;
  }

  // Remove a rule from the network
  function removeRuleInternal(ruleOrName: AnyRule | string): boolean {
    if (typeof ruleOrName === 'string') {
      // Remove by name - search through all rules
      // Convert entries to array first to avoid iteration issues
      const entries = Array.from(state.rules.entries());
      for (const [key, rule] of entries) {
        if (rule.name === ruleOrName) {
          state.rules.delete(key);
          ruleResolutionCache.clear();
          return true;
        }
      }
      return false;
    } else {
      // Remove by rule object
      const rule = ruleOrName;
      if (rule.type === 'action' || rule.type === 'rewrite') {
        const { agentName1, portName1, agentName2, portName2 } = rule.matchInfo;
        const ruleKey = getRuleLookupKey(agentName1, portName1, agentName2, portName2);
        
        if (state.rules.has(ruleKey) && state.rules.get(ruleKey) === rule) {
          state.rules.delete(ruleKey);
          ruleResolutionCache.clear();
          return true;
        }
      }
      return false;
    }
  }

  // Get all rules
  function getAllRulesInternal(): AnyRule[] {
    return Array.from(state.rules.values());
  }

  // Find rules by criteria
  function findRulesInternal(query: { name?: string; type?: string; agentName?: string; portName?: string } = {}): AnyRule[] {
    const results: AnyRule[] = [];
    
    // Convert values to array first to avoid iteration issues
    const rules = Array.from(state.rules.values());
    for (const rule of rules) {
      // Check name match
      if (query.name && rule.name !== query.name) {
        continue;
      }
      
      // Check type match
      if (query.type && rule.type !== query.type) {
        continue;
      }
      
      // Check agent/port matches for action and rewrite rules
      if (rule.type === 'action' || rule.type === 'rewrite') {
        const { agentName1, portName1, agentName2, portName2 } = rule.matchInfo;
        
        if (query.agentName) {
          if (agentName1 !== query.agentName && agentName2 !== query.agentName) {
            continue;
          }
        }
        
        if (query.portName) {
          if (portName1 !== query.portName && portName2 !== query.portName) {
            continue;
          }
        }
      }
      
      results.push(rule);
    }
    
    return results;
  }

  // Clear all rules
  function clearRulesInternal(): void {
    state.rules.clear();
    ruleResolutionCache.clear();
  }

  // Create the network object
  const network = {
    name,
    id: networkId,
    addAgent,
    removeAgent,
    getAgent,
    findAgents,
    getAllAgents,
    connectPorts,
    disconnectPorts,
    isPortConnected,
    getAllConnections,
    findConnections,
    addRule: addRuleInternal,
    removeRule: removeRuleInternal,
    getAllRules: getAllRulesInternal,
    findRules: findRulesInternal,
    clearRules: clearRulesInternal,
    step,
    reduce,
    getChangeHistory
  } as INetwork<Name, A>;

  return network;
}