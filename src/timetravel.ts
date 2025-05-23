import { Agent, AgentId, IAgent } from "./agent";
import { IConnection, ConnectFn } from "./connection";
import { INetwork, ChangeHistoryEntry } from "./network";
import { IBoundPort, PortInstanceKey, getPortInstanceKey } from "./port";
import { v4 as uuidv4 } from 'uuid';

/**
 * Network snapshot representing the state at a specific point in time
 */
export interface NetworkSnapshot {
  id: string;
  timestamp: number;
  description: string;
  agentStates: Map<AgentId, AgentState>;
  connections: Map<string, ConnectionState>;
}

/**
 * Serialized state of an agent
 */
export interface AgentState {
  id: AgentId;
  name: string;
  type: string;
  value: any;
  ports: {
    [portName: string]: {
      name: string;
      type: string;
    }
  };
}

/**
 * Serialized state of a connection
 */
export interface ConnectionState {
  sourceAgentId: AgentId;
  sourcePortName: string;
  destinationAgentId: AgentId;
  destinationPortName: string;
  name: string;
}

/**
 * Time Travel Manager that extends an existing network with
 * snapshot, rollback, and time travel capabilities
 */
export class TimeTravelManager<Name extends string = string, A extends IAgent = IAgent> {
  private snapshots: NetworkSnapshot[] = [];
  private currentSnapshotIndex: number = -1;
  private autoSnapshotEnabled: boolean = false;
  private autoSnapshotInterval: number = 0;
  private autoSnapshotTimer: NodeJS.Timeout | null = null;
  
  /**
   * Create a time travel manager for a network
   * @param network The network to manage
   */
  constructor(private network: INetwork<Name, A>) {}

  /**
   * Take a snapshot of the current network state
   * @param description Optional description of the snapshot
   * @returns The created snapshot
   */
  takeSnapshot(description: string = "Manual snapshot"): NetworkSnapshot {
    const snapshot: NetworkSnapshot = {
      id: uuidv4(),
      timestamp: Date.now(),
      description,
      agentStates: new Map(),
      connections: new Map()
    };
    
    // Snapshot all agents
    const agents = this.getAllAgents();
    for (const agent of agents) {
      snapshot.agentStates.set(agent._agentId, this.serializeAgent(agent));
    }
    
    // Snapshot all connections
    const connections = this.getAllConnections();
    for (const connection of connections) {
      const connectionKey = this.getConnectionKey(
        connection.sourcePortKey,
        connection.destinationPortKey
      );
      
      snapshot.connections.set(connectionKey, {
        sourceAgentId: connection.source._agentId,
        sourcePortName: connection.sourcePort.name,
        destinationAgentId: connection.destination._agentId,
        destinationPortName: connection.destinationPort.name,
        name: connection.name
      });
    }
    
    // Add to snapshots array and update index
    this.snapshots.push(snapshot);
    this.currentSnapshotIndex = this.snapshots.length - 1;
    
    return snapshot;
  }
  
  /**
   * Roll back the network to a specific snapshot
   * @param snapshotOrId The snapshot or snapshot ID to roll back to
   * @returns Whether the rollback was successful
   */
  rollbackTo(snapshotOrId: NetworkSnapshot | string): boolean {
    const snapshot = typeof snapshotOrId === 'string'
      ? this.getSnapshotById(snapshotOrId)
      : snapshotOrId;
      
    if (!snapshot) {
      console.error("Snapshot not found");
      return false;
    }
    
    // Disconnect all ports and remove all agents
    this.clearNetwork();
    
    // Recreate all agents from the snapshot
    const agentMap = new Map<AgentId, IAgent>();
    
    for (const [agentId, agentState] of snapshot.agentStates.entries()) {
      const agent = Agent(agentState.name, JSON.parse(JSON.stringify(agentState.value)));
      
      // Override the agent ID to match the snapshot
      Object.defineProperty(agent, '_agentId', {
        value: agentId,
        writable: false,
        configurable: false,
      });
      
      // Add to the network
      this.network.addAgent(agent);
      
      // Track for connections
      agentMap.set(agentId, agent);
    }
    
    // Recreate all connections from the snapshot
    for (const connectionState of snapshot.connections.values()) {
      const sourceAgent = agentMap.get(connectionState.sourceAgentId);
      const destAgent = agentMap.get(connectionState.destinationAgentId);
      
      if (sourceAgent && destAgent) {
        const sourcePort = sourceAgent.ports[connectionState.sourcePortName];
        const destPort = destAgent.ports[connectionState.destinationPortName];
        
        if (sourcePort && destPort) {
          this.network.connectPorts(sourcePort, destPort, connectionState.name);
        }
      }
    }
    
    // Update current snapshot index
    this.currentSnapshotIndex = this.snapshots.indexOf(snapshot);
    
    return true;
  }
  
  /**
   * Enable automatic snapshots at a specified interval
   * @param intervalMs Interval in milliseconds between snapshots
   * @param description Prefix for auto-snapshot descriptions
   */
  enableAutoSnapshot(intervalMs: number, description: string = "Auto"): void {
    this.disableAutoSnapshot(); // Clear any existing timer
    
    this.autoSnapshotEnabled = true;
    this.autoSnapshotInterval = intervalMs;
    
    this.autoSnapshotTimer = setInterval(() => {
      this.takeSnapshot(`${description} snapshot at ${new Date().toISOString()}`);
    }, intervalMs);
  }
  
  /**
   * Disable automatic snapshots
   */
  disableAutoSnapshot(): void {
    if (this.autoSnapshotTimer) {
      clearInterval(this.autoSnapshotTimer);
      this.autoSnapshotTimer = null;
    }
    this.autoSnapshotEnabled = false;
  }
  
  /**
   * Move to a specific snapshot
   * @param index The index of the snapshot to move to
   * @returns Whether the time travel was successful
   */
  travelToIndex(index: number): boolean {
    if (index < 0 || index >= this.snapshots.length) {
      console.error("Invalid snapshot index");
      return false;
    }
    
    return this.rollbackTo(this.snapshots[index]);
  }
  
  /**
   * Travel to the next snapshot in history (if any)
   * @returns Whether the time travel was successful
   */
  travelForward(): boolean {
    if (this.currentSnapshotIndex < this.snapshots.length - 1) {
      return this.travelToIndex(this.currentSnapshotIndex + 1);
    }
    return false;
  }
  
  /**
   * Travel to the previous snapshot in history (if any)
   * @returns Whether the time travel was successful
   */
  travelBackward(): boolean {
    if (this.currentSnapshotIndex > 0) {
      return this.travelToIndex(this.currentSnapshotIndex - 1);
    }
    return false;
  }
  
  /**
   * Get a list of all available snapshots
   * @returns Array of snapshots
   */
  getSnapshots(): NetworkSnapshot[] {
    return [...this.snapshots];
  }
  
  /**
   * Get a snapshot by its ID
   * @param id The ID of the snapshot
   * @returns The snapshot or undefined if not found
   */
  getSnapshotById(id: string): NetworkSnapshot | undefined {
    return this.snapshots.find(snapshot => snapshot.id === id);
  }
  
  /**
   * Create a snapshot from existing change history
   * @param description Optional description for the snapshot
   * @returns The created snapshot based on change history
   */
  snapshotFromChangeHistory(description: string = "Change history snapshot"): NetworkSnapshot | undefined {
    // Check if network has change history capability
    if (!this.network.getChangeHistory) {
      console.error("Network does not support change history");
      return undefined;
    }
    
    // Get change history
    const history = this.network.getChangeHistory();
    if (!history || history.length === 0) {
      console.error("No change history available");
      return undefined;
    }
    
    // Take a snapshot
    return this.takeSnapshot(description);
  }
  
  /**
   * Generate a timeline visualization from snapshots
   * @returns Array of snapshot summaries for visualization
   */
  getTimeline(): Array<{id: string, timestamp: number, description: string, agentCount: number}> {
    return this.snapshots.map(snapshot => ({
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      description: snapshot.description,
      agentCount: snapshot.agentStates.size
    }));
  }
  
  /**
   * Export all snapshots to JSON
   * @returns JSON string of all snapshots
   */
  exportSnapshots(): string {
    // Convert Maps to objects for JSON serialization
    const serialized = this.snapshots.map(snapshot => ({
      id: snapshot.id,
      timestamp: snapshot.timestamp,
      description: snapshot.description,
      agentStates: Array.from(snapshot.agentStates.entries())
        .reduce((obj, [key, value]) => ({...obj, [key]: value}), {}),
      connections: Array.from(snapshot.connections.entries())
        .reduce((obj, [key, value]) => ({...obj, [key]: value}), {})
    }));
    
    return JSON.stringify(serialized);
  }
  
  /**
   * Import snapshots from JSON
   * @param json JSON string of snapshots
   * @returns Whether the import was successful
   */
  importSnapshots(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      
      if (!Array.isArray(parsed)) {
        throw new Error("Invalid snapshot data format");
      }
      
      // Convert objects back to Maps
      this.snapshots = parsed.map(item => ({
        id: item.id,
        timestamp: item.timestamp,
        description: item.description,
        agentStates: new Map(Object.entries(item.agentStates)),
        connections: new Map(Object.entries(item.connections))
      }));
      
      this.currentSnapshotIndex = this.snapshots.length - 1;
      return true;
    } catch (error) {
      console.error("Failed to import snapshots:", error);
      return false;
    }
  }
  
  /**
   * Find the differences between two snapshots
   * @param snapshotId1 ID of the first snapshot
   * @param snapshotId2 ID of the second snapshot
   * @returns Object describing the differences
   */
  compareSnapshots(snapshotId1: string, snapshotId2: string): {
    agentsAdded: AgentId[],
    agentsRemoved: AgentId[],
    agentsChanged: Array<{id: AgentId, before: any, after: any}>,
    connectionsAdded: string[],
    connectionsRemoved: string[]
  } {
    const snapshot1 = this.getSnapshotById(snapshotId1);
    const snapshot2 = this.getSnapshotById(snapshotId2);
    
    if (!snapshot1 || !snapshot2) {
      throw new Error("One or both snapshots not found");
    }
    
    // Compare agents
    const agentsAdded: AgentId[] = [];
    const agentsRemoved: AgentId[] = [];
    const agentsChanged: Array<{id: AgentId, before: any, after: any}> = [];
    
    // Find added and changed agents
    for (const [agentId, agentState2] of snapshot2.agentStates.entries()) {
      if (!snapshot1.agentStates.has(agentId)) {
        agentsAdded.push(agentId);
      } else {
        const agentState1 = snapshot1.agentStates.get(agentId)!;
        
        // Check if agent state changed
        if (JSON.stringify(agentState1.value) !== JSON.stringify(agentState2.value)) {
          agentsChanged.push({
            id: agentId,
            before: agentState1.value,
            after: agentState2.value
          });
        }
      }
    }
    
    // Find removed agents
    for (const agentId of snapshot1.agentStates.keys()) {
      if (!snapshot2.agentStates.has(agentId)) {
        agentsRemoved.push(agentId);
      }
    }
    
    // Compare connections
    const connectionsAdded: string[] = [];
    const connectionsRemoved: string[] = [];
    
    // Find added connections
    for (const connectionKey of snapshot2.connections.keys()) {
      if (!snapshot1.connections.has(connectionKey)) {
        connectionsAdded.push(connectionKey);
      }
    }
    
    // Find removed connections
    for (const connectionKey of snapshot1.connections.keys()) {
      if (!snapshot2.connections.has(connectionKey)) {
        connectionsRemoved.push(connectionKey);
      }
    }
    
    return {
      agentsAdded,
      agentsRemoved,
      agentsChanged,
      connectionsAdded,
      connectionsRemoved
    };
  }
  
  // Private helper methods
  
  /**
   * Get all agents from the network
   */
  private getAllAgents(): IAgent[] {
    const agents: IAgent[] = [];
    // Note: This is a simplistic approach. In a real implementation,
    // the network would ideally provide a method to get all agents.
    for (let i = 0; i < 10000; i++) { // Arbitrary limit to prevent infinite loops
      const agent = this.network.getAgent(String(i));
      if (!agent) break;
      agents.push(agent);
    }
    return agents;
  }
  
  /**
   * Get all connections from the network
   */
  private getAllConnections(): IConnection[] {
    const connections: IConnection[] = [];
    const agents = this.getAllAgents();
    
    // Collect connections from all agents
    for (const agent of agents) {
      for (const port of Object.values(agent.ports)) {
        if (port.agent && port.agent.connections) {
          for (const connection of Object.values(port.agent.connections)) {
            if (!connections.includes(connection)) {
              connections.push(connection);
            }
          }
        }
      }
    }
    
    return connections;
  }
  
  /**
   * Clear the network by removing all agents
   */
  private clearNetwork(): void {
    const agents = this.getAllAgents();
    
    // First disconnect all ports to avoid errors
    for (const agent of agents) {
      for (const portName in agent.ports) {
        try {
          const port = agent.ports[portName];
          const connections = Object.values(agent.connections || {});
          
          for (const connection of connections) {
            try {
              if (connection.source === agent && connection.sourcePort === port) {
                this.network.disconnectPorts(port, connection.destinationPort);
              } else if (connection.destination === agent && connection.destinationPort === port) {
                this.network.disconnectPorts(connection.sourcePort, port);
              }
            } catch (e) {
              // Ignore errors during disconnection
            }
          }
        } catch (e) {
          // Ignore errors during port discovery
        }
      }
    }
    
    // Then remove all agents
    for (const agent of agents) {
      try {
        this.network.removeAgent(agent._agentId);
      } catch (e) {
        // Ignore errors during agent removal
      }
    }
  }
  
  /**
   * Serialize an agent to a plain object
   * @param agent The agent to serialize
   */
  private serializeAgent(agent: IAgent): AgentState {
    const ports: {[portName: string]: {name: string, type: string}} = {};
    
    for (const [portName, port] of Object.entries(agent.ports)) {
      ports[portName] = {
        name: port.name,
        type: port.type
      };
    }
    
    return {
      id: agent._agentId,
      name: agent.name,
      type: agent.type || "",
      value: JSON.parse(JSON.stringify(agent.value)),
      ports
    };
  }
  
  /**
   * Generate a unique key for a connection
   */
  private getConnectionKey(sourceKey: PortInstanceKey, destKey: PortInstanceKey): string {
    return `${sourceKey}-${destKey}`;
  }
}

/**
 * Create a time travel manager for a network
 * @param network The network to enable time travel for
 * @returns A time travel manager instance
 */
export function enableTimeTravel<Name extends string, A extends IAgent>(
  network: INetwork<Name, A>
): TimeTravelManager<Name, A> {
  return new TimeTravelManager(network);
}

/**
 * Enhanced network with time travel capabilities
 */
export interface ITimeTravelNetwork<Name extends string = string, A extends IAgent = IAgent> extends INetwork<Name, A> {
  // Time travel methods
  takeSnapshot(description?: string): NetworkSnapshot;
  rollbackTo(snapshotOrId: NetworkSnapshot | string): boolean;
  enableAutoSnapshot(intervalMs: number, description?: string): void;
  disableAutoSnapshot(): void;
  travelToIndex(index: number): boolean;
  travelForward(): boolean;
  travelBackward(): boolean;
  getSnapshots(): NetworkSnapshot[];
  getTimeline(): Array<{id: string, timestamp: number, description: string, agentCount: number}>;
  exportSnapshots(): string;
  importSnapshots(json: string): boolean;
}

/**
 * Create a network with time travel capabilities
 * @param name Network name
 * @param agents Optional initial agents
 * @param rules Optional initial rules
 * @returns An enhanced network with time travel functionality
 */
export function TimeTravelNetwork<
  Name extends string,
  A extends IAgent = IAgent,
>(name: Name, agents?: A[], rules?: any[]): ITimeTravelNetwork<Name, A> {
  // Import the Network function dynamically to avoid circular dependencies
  const { Network } = require('./network');
  
  // Create the base network
  const baseNetwork = Network<Name, A>(name, agents, rules);
  
  // Create the time travel manager
  const timeTravelManager = new TimeTravelManager(baseNetwork);
  
  // Create the enhanced network
  const enhancedNetwork = {
    ...baseNetwork,
    
    // Add time travel methods
    takeSnapshot: (description?: string) => 
      timeTravelManager.takeSnapshot(description),
      
    rollbackTo: (snapshotOrId: NetworkSnapshot | string) => 
      timeTravelManager.rollbackTo(snapshotOrId),
      
    enableAutoSnapshot: (intervalMs: number, description?: string) => 
      timeTravelManager.enableAutoSnapshot(intervalMs, description),
      
    disableAutoSnapshot: () => 
      timeTravelManager.disableAutoSnapshot(),
      
    travelToIndex: (index: number) => 
      timeTravelManager.travelToIndex(index),
      
    travelForward: () => 
      timeTravelManager.travelForward(),
      
    travelBackward: () => 
      timeTravelManager.travelBackward(),
      
    getSnapshots: () => 
      timeTravelManager.getSnapshots(),
      
    getTimeline: () => 
      timeTravelManager.getTimeline(),
      
    exportSnapshots: () => 
      timeTravelManager.exportSnapshots(),
      
    importSnapshots: (json: string) => 
      timeTravelManager.importSnapshots(json)
  };
  
  // Take initial snapshot
  enhancedNetwork.takeSnapshot("Initial state");
  
  return enhancedNetwork as ITimeTravelNetwork<Name, A>;
}