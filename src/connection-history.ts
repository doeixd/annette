/**
 * Connection History Implementation for Annette
 * 
 * This module provides:
 * 1. Connection history tracking with versions
 * 2. Reduction snapshots at specific versions
 * 3. Methods for retrieving and applying versioned changes
 */
import { Agent, IAgent, AgentId } from "./agent";
import { IConnection } from "./connection";
import { INetwork } from "./network";
import { getPortInstanceKey } from "./port";
import { AgentState, ConnectionState } from "./timetravel";

// Connection status types
export type ConnectionStatus = 'created' | 'reduced' | 'deleted';

/**
 * Connection history entry tracking detailed connection state
 */
export interface ConnectionHistoryEntry {
  id: string;
  version: number;
  timestamp: number;
  source: AgentId;
  target: AgentId;
  sourcePort: string;
  targetPort: string;
  active: boolean;
  status: ConnectionStatus;
  metadata?: Record<string, any>;
}

/**
 * Reduction snapshot capturing network state at a specific version
 */
export interface ReductionSnapshot {
  version: number;
  timestamp: number;
  description: string;
  agents: Map<AgentId, AgentState>;
  connections: Map<string, ConnectionState>;
  connectionHistory: ConnectionHistoryEntry[];
}

/**
 * Versioned change representing a delta to be applied
 */
export interface VersionedChange {
  type: 'agent-create' | 'agent-update' | 'agent-delete' | 'connection-create' | 'connection-update' | 'connection-delete';
  version: number;
  timestamp: number;
  data: any;
  metadata?: Record<string, any>;
}

/**
 * Connection history manager for tracking and synchronizing changes
 */
export class ConnectionHistoryManager {
  private connectionHistory: ConnectionHistoryEntry[] = [];
  private reductionSnapshots: ReductionSnapshot[] = [];
  private currentVersion: number = 0;
  private highestSyncedVersion: number = 0;
  
  /**
   * Create a connection history manager
   * @param network The network to track
   */
  constructor(private network: INetwork) {}
  
  /**
   * Record a new connection in the history
   * @param connection The connection to record
   */
  recordConnectionCreated(connection: IConnection): void {
    const entry: ConnectionHistoryEntry = {
      id: `${connection.source._agentId}-${connection.sourcePort.name}-${connection.destination._agentId}-${connection.destinationPort.name}`,
      version: ++this.currentVersion,
      timestamp: Date.now(),
      source: connection.source._agentId,
      target: connection.destination._agentId,
      sourcePort: connection.sourcePort.name,
      targetPort: connection.destinationPort.name,
      active: true,
      status: 'created'
    };
    
    this.connectionHistory.push(entry);
  }
  
  /**
   * Record a connection as reduced (consumed by a rule)
   * @param connection The connection that was reduced
   */
  recordConnectionReduced(connection: IConnection): void {
    const connectionId = `${connection.source._agentId}-${connection.sourcePort.name}-${connection.destination._agentId}-${connection.destinationPort.name}`;
    
    // Find the most recent entry for this connection
    const existingEntryIndex = this.findLastConnectionEntryIndex(connectionId);
    
    if (existingEntryIndex !== -1) {
      // Mark the existing entry as inactive
      this.connectionHistory[existingEntryIndex].active = false;
    }
    
    // Create a new entry for the reduced state
    const entry: ConnectionHistoryEntry = {
      id: connectionId,
      version: ++this.currentVersion,
      timestamp: Date.now(),
      source: connection.source._agentId,
      target: connection.destination._agentId,
      sourcePort: connection.sourcePort.name,
      targetPort: connection.destinationPort.name,
      active: false,
      status: 'reduced'
    };
    
    this.connectionHistory.push(entry);
  }
  
  /**
   * Record a connection as deleted
   * @param connection The connection that was deleted
   */
  recordConnectionDeleted(connection: IConnection): void {
    const connectionId = `${connection.source._agentId}-${connection.sourcePort.name}-${connection.destination._agentId}-${connection.destinationPort.name}`;
    
    // Find the most recent entry for this connection
    const existingEntryIndex = this.findLastConnectionEntryIndex(connectionId);
    
    if (existingEntryIndex !== -1) {
      // Mark the existing entry as inactive
      this.connectionHistory[existingEntryIndex].active = false;
    }
    
    // Create a new entry for the deleted state
    const entry: ConnectionHistoryEntry = {
      id: connectionId,
      version: ++this.currentVersion,
      timestamp: Date.now(),
      source: connection.source._agentId,
      target: connection.destination._agentId,
      sourcePort: connection.sourcePort.name,
      targetPort: connection.destinationPort.name,
      active: false,
      status: 'deleted'
    };
    
    this.connectionHistory.push(entry);
  }
  
  /**
   * Take a reduction snapshot at the current version
   * @param description Optional description for the snapshot
   * @returns The created snapshot
   */
  takeReductionSnapshot(description: string = "Reduction snapshot"): ReductionSnapshot {
    // Get all agents from the network
    const agents = this.getAllAgents();
    
    // Create agent states map
    const agentStates = new Map<AgentId, AgentState>();
    for (const agent of agents) {
      agentStates.set(agent._agentId, this.serializeAgent(agent));
    }
    
    // Get all connections from the network
    const connections = this.getAllConnections();
    
    // Create connection states map
    const connectionStates = new Map<string, ConnectionState>();
    for (const connection of connections) {
      const connectionKey = this.getConnectionKey(connection);
      connectionStates.set(connectionKey, {
        sourceAgentId: connection.source._agentId,
        sourcePortName: connection.sourcePort.name,
        destinationAgentId: connection.destination._agentId,
        destinationPortName: connection.destinationPort.name,
        name: connection.name
      });
    }
    
    // Create the snapshot
    const snapshot: ReductionSnapshot = {
      version: this.currentVersion,
      timestamp: Date.now(),
      description,
      agents: agentStates,
      connections: connectionStates,
      connectionHistory: [...this.connectionHistory]
    };
    
    this.reductionSnapshots.push(snapshot);
    
    return snapshot;
  }
  
  /**
   * Get changes since a specific version
   * @param version The version to get changes since
   * @returns Array of versioned changes
   */
  getChangesSince(version: number): VersionedChange[] {
    const changes: VersionedChange[] = [];
    
    // Get all agent changes
    const agentChanges = this.getAgentChangesSince(version);
    changes.push(...agentChanges);
    
    // Get all connection changes
    const connectionChanges = this.getConnectionChangesSince(version);
    changes.push(...connectionChanges);
    
    // Sort changes by version
    changes.sort((a, b) => a.version - b.version);
    
    return changes;
  }
  
  /**
   * Apply changes from another network
   * @param changes The changes to apply
   * @returns Whether the changes were applied successfully
   */
  applyChanges(changes: VersionedChange[]): boolean {
    try {
      // Sort changes by version to ensure proper application order
      const sortedChanges = [...changes].sort((a, b) => a.version - b.version);
      
      for (const change of sortedChanges) {
        // Skip changes that have already been applied
        if (change.version <= this.highestSyncedVersion) {
          continue;
        }
        
        switch (change.type) {
          case 'agent-create':
            this.applyAgentCreate(change);
            break;
            
          case 'agent-update':
            this.applyAgentUpdate(change);
            break;
            
          case 'agent-delete':
            this.applyAgentDelete(change);
            break;
            
          case 'connection-create':
            this.applyConnectionCreate(change);
            break;
            
          case 'connection-update':
            this.applyConnectionUpdate(change);
            break;
            
          case 'connection-delete':
            this.applyConnectionDelete(change);
            break;
        }
        
        // Update highest synced version
        this.highestSyncedVersion = Math.max(this.highestSyncedVersion, change.version);
      }
      
      return true;
    } catch (error) {
      console.error("Error applying changes:", error);
      return false;
    }
  }
  
  /**
   * Roll back the network to a specific version
   * @param version The version to roll back to
   * @returns Whether the rollback was successful
   */
  rollbackToVersion(version: number): boolean {
    // Find the nearest snapshot before or at the requested version
    const snapshot = this.findNearestSnapshotBeforeVersion(version);
    
    if (!snapshot) {
      console.error("No snapshot found before version", version);
      return false;
    }
    
    // Clear the network
    this.clearNetwork();
    
    // Recreate agents from the snapshot
    const agentMap = new Map<AgentId, IAgent>();
    
    for (const [agentId, agentState] of snapshot.agents.entries()) {
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
    
    // Recreate connections from the snapshot
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
    
    // Apply additional connection changes up to the requested version
    const additionalChanges = this.getConnectionChangesSince(snapshot.version)
      .filter(change => change.version <= version);
      
    this.applyChanges(additionalChanges);
    
    // Update current version
    this.currentVersion = version;
    
    return true;
  }
  
  /**
   * Get all connection history entries
   * @returns The complete connection history
   */
  getConnectionHistory(): ConnectionHistoryEntry[] {
    return [...this.connectionHistory];
  }
  
  /**
   * Get all reduction snapshots
   * @returns The reduction snapshots
   */
  getReductionSnapshots(): ReductionSnapshot[] {
    return [...this.reductionSnapshots];
  }
  
  /**
   * Get the current version
   * @returns The current version number
   */
  getCurrentVersion(): number {
    return this.currentVersion;
  }
  
  // Private helper methods
  
  /**
   * Find the index of the last entry for a connection
   * @param connectionId The connection ID to search for
   * @returns The index of the last entry, or -1 if not found
   */
  private findLastConnectionEntryIndex(connectionId: string): number {
    for (let i = this.connectionHistory.length - 1; i >= 0; i--) {
      if (this.connectionHistory[i].id === connectionId) {
        return i;
      }
    }
    return -1;
  }
  
  /**
   * Get agent changes since a specific version
   * @param version The version to get changes since
   * @returns Array of agent changes
   */
  private getAgentChangesSince(version: number): VersionedChange[] {
    const changes: VersionedChange[] = [];
    
    // If network has change history capability, use it
    if ((this.network as any).getChangeHistory) {
      const history = (this.network as any).getChangeHistory();
      
      for (const entry of history) {
        // Skip entries that don't have a version or are before the requested version
        if (!(entry as any).version || (entry as any).version <= version) {
          continue;
        }
        
        // Create a versioned change
        const change: VersionedChange = {
          type: 'agent-update',
          version: (entry as any).version,
          timestamp: (entry as any).timestamp,
          data: {
            agentId: (entry as any).targetId,
            previousState: (entry as any).previousState,
            newState: (entry as any).newState
          }
        };
        
        changes.push(change);
      }
    }
    
    return changes;
  }
  
  /**
   * Get connection changes since a specific version
   * @param version The version to get changes since
   * @returns Array of connection changes
   */
  private getConnectionChangesSince(version: number): VersionedChange[] {
    const changes: VersionedChange[] = [];
    
    for (const entry of this.connectionHistory) {
      // Skip entries that are before the requested version
      if (entry.version <= version) {
        continue;
      }
      
      // Create a versioned change
      const change: VersionedChange = {
        type: entry.status === 'created' ? 'connection-create' : 
              entry.status === 'reduced' ? 'connection-update' : 'connection-delete',
        version: entry.version,
        timestamp: entry.timestamp,
        data: {
          id: entry.id,
          source: entry.source,
          target: entry.target,
          sourcePort: entry.sourcePort,
          targetPort: entry.targetPort,
          active: entry.active,
          status: entry.status
        }
      };
      
      changes.push(change);
    }
    
    return changes;
  }
  
  /**
   * Apply an agent create change
   * @param change The change to apply
   */
  private applyAgentCreate(change: VersionedChange): void {
    const { name, value, ports } = change.data;
    
    // Create the agent
    const agent = Agent(name, value, ports);
    
    // If the change specifies an agent ID, try to set it
    if (change.data.agentId) {
      try {
        Object.defineProperty(agent, '_agentId', {
          value: change.data.agentId,
          writable: false,
          configurable: false,
        });
      } catch (error) {
        // If we can't set the ID, just use the generated one
        console.warn("Could not set agent ID, using generated ID");
      }
    }
    
    // Add to the network
    this.network.addAgent(agent);
  }
  
  /**
   * Apply an agent update change
   * @param change The change to apply
   */
  private applyAgentUpdate(change: VersionedChange): void {
    const { agentId, newState } = change.data;
    
    // Find the agent
    const agent = this.network.getAgent(agentId);
    
    // If found, update its value
    if (agent) {
      agent.value = JSON.parse(JSON.stringify(newState));
    }
  }
  
  /**
   * Apply an agent delete change
   * @param change The change to apply
   */
  private applyAgentDelete(change: VersionedChange): void {
    const { agentId } = change.data;
    
    // Remove the agent
    this.network.removeAgent(agentId);
  }
  
  /**
   * Apply a connection create change
   * @param change The change to apply
   */
  private applyConnectionCreate(change: VersionedChange): void {
    const { source, target, sourcePort, targetPort } = change.data;
    
    // Find the agents
    const sourceAgent = this.network.getAgent(source);
    const targetAgent = this.network.getAgent(target);
    
    // If found, connect their ports
    if (sourceAgent && targetAgent) {
      const sourceBoundPort = sourceAgent.ports[sourcePort];
      const targetBoundPort = targetAgent.ports[targetPort];
      
      if (sourceBoundPort && targetBoundPort) {
        this.network.connectPorts(sourceBoundPort, targetBoundPort);
      }
    }
  }
  
  /**
   * Apply a connection update change
   * @param change The change to apply
   */
  private applyConnectionUpdate(change: VersionedChange): void {
    // Connection updates are typically handled by rules
    // For now, just log that we received this type of change
    console.log("Received connection update change:", change);
  }
  
  /**
   * Apply a connection delete change
   * @param change The change to apply
   */
  private applyConnectionDelete(change: VersionedChange): void {
    const { source, target, sourcePort, targetPort } = change.data;
    
    // Find the agents
    const sourceAgent = this.network.getAgent(source);
    const targetAgent = this.network.getAgent(target);
    
    // If found, disconnect their ports
    if (sourceAgent && targetAgent) {
      const sourceBoundPort = sourceAgent.ports[sourcePort];
      const targetBoundPort = targetAgent.ports[targetPort];
      
      if (sourceBoundPort && targetBoundPort) {
        this.network.disconnectPorts(sourceBoundPort, targetBoundPort);
      }
    }
  }
  
  /**
   * Find the nearest snapshot before or at a specific version
   * @param version The version to find a snapshot for
   * @returns The nearest snapshot, or undefined if none found
   */
  private findNearestSnapshotBeforeVersion(version: number): ReductionSnapshot | undefined {
    let nearestSnapshot: ReductionSnapshot | undefined;
    let nearestVersion = -1;
    
    for (const snapshot of this.reductionSnapshots) {
      if (snapshot.version <= version && snapshot.version > nearestVersion) {
        nearestSnapshot = snapshot;
        nearestVersion = snapshot.version;
      }
    }
    
    return nearestSnapshot;
  }
  
  /**
   * Get all agents from the network
   * @returns Array of all agents
   */
  private getAllAgents(): IAgent[] {
    // If network has a getAllAgents method, use it
    if (typeof this.network.getAllAgents === 'function') {
      return this.network.getAllAgents();
    }
    
    // Otherwise, use a simple approach
    const agents: IAgent[] = [];
    const seen = new Set<AgentId>();
    
    // First try to find agents by querying the network
    const queryAgents = this.network.findAgents({});
    for (const agent of queryAgents) {
      if (!seen.has(agent._agentId)) {
        agents.push(agent);
        seen.add(agent._agentId);
      }
    }
    
    return agents;
  }
  
  /**
   * Get all connections from the network
   * @returns Array of all connections
   */
  private getAllConnections(): IConnection[] {
    const connections: IConnection[] = [];
    const agents = this.getAllAgents();
    
    // Collect connections from all agents
    for (const agent of agents) {
      if (agent.connections) {
        for (const connection of Object.values(agent.connections) as IConnection[]) {
          connections.push(connection);
        }
      }
    }
    
    // Remove duplicates (same connection might be referenced by both agents)
    return Array.from(new Set(connections));
  }
  
  /**
   * Serialize an agent to an AgentState
   * @param agent The agent to serialize
   * @returns The serialized agent state
   */
  private serializeAgent(agent: IAgent): AgentState {
    // Convert ports to a simplified format
    const ports: Record<string, { name: string, type: string }> = {};
    
    for (const [name, port] of Object.entries(agent.ports)) {
      ports[name] = {
        name: port.name,
        type: port.type
      };
    }
    
    return {
      id: agent._agentId,
      name: agent.name,
      type: agent.type,
      value: JSON.parse(JSON.stringify(agent.value)),
      ports
    };
  }
  
  /**
   * Get a unique key for a connection
   * @param connection The connection
   * @returns A unique key
   */
  private getConnectionKey(connection: IConnection): string {
    const sourceKey = getPortInstanceKey(connection.sourcePort);
    const destKey = getPortInstanceKey(connection.destinationPort);
    return `${sourceKey}-${destKey}`;
  }
  
  /**
   * Clear the network by removing all agents
   */
  private clearNetwork(): void {
    const agents = this.getAllAgents();
    
    // Remove all agents
    for (const agent of agents) {
      this.network.removeAgent(agent._agentId);
    }
  }
}

/**
 * Enhance a network with connection history tracking
 * @param network The network to enhance
 * @returns The enhanced network with connection history capabilities
 */
export function enableConnectionHistory<T extends INetwork>(
  network: T
): T & { 
  connectionHistory: ConnectionHistoryManager,
  getChangesSince: (version: number) => VersionedChange[],
  applyChanges: (changes: VersionedChange[]) => boolean,
  rollbackToVersion: (version: number) => boolean,
  takeReductionSnapshot: (description?: string) => ReductionSnapshot
} {
  // Create a connection history manager
  const connectionHistory = new ConnectionHistoryManager(network);
  
  // Wrap the original connectPorts method to record connections
  const originalConnectPorts = network.connectPorts;
  (network as any).connectPorts = function(...args: any[]) {
    const result = originalConnectPorts.apply(network, args as any);
    
    if (result) {
      // Record the connection creation
      connectionHistory.recordConnectionCreated(result as any);
    }
    
    return result;
  };
  
  // Wrap the original disconnectPorts method to record disconnections
  const originalDisconnectPorts = network.disconnectPorts;
  (network as any).disconnectPorts = function(...args: any[]) {
    // Try to find the connection before it's removed
    const port1 = args[0];
    const port2 = args[1];
    
    if (port1 && port2) {
      // Check if port1 has connections
      if (port1.agent && port1.agent.connections) {
        // Try to find a connection between port1 and port2
        for (const connection of Object.values(port1.agent.connections) as any[]) {
          if ((connection.sourcePort === port1 && connection.destinationPort === port2) ||
              (connection.sourcePort === port2 && connection.destinationPort === port1)) {
            // Record the connection deletion
            connectionHistory.recordConnectionDeleted(connection);
            break;
          }
        }
      }
    }
    
    return originalDisconnectPorts.apply(network, args as any);
  };
  
  // Wrap the original step method to record reductions
  const originalStep = network.step;
  (network as any).step = function() {
    // Create a list of active connections before the step
    const beforeConnections = connectionHistory.getConnectionHistory()
      .filter(entry => entry.active);
      
    // Execute the step
    const result = originalStep.apply(network);
    
    // If a reduction happened
    if (result) {
      // Create a list of active connections after the step
      const afterConnections = connectionHistory.getConnectionHistory()
        .filter(entry => entry.active);
        
      // Find connections that were active before but not after
      for (const beforeEntry of beforeConnections) {
        const stillActive = afterConnections.some(
          afterEntry => afterEntry.id === beforeEntry.id
        );
        
        if (!stillActive) {
          // This connection was reduced
          const connection = {
            source: { _agentId: beforeEntry.source },
            destination: { _agentId: beforeEntry.target },
            sourcePort: { name: beforeEntry.sourcePort },
            destinationPort: { name: beforeEntry.targetPort }
          } as IConnection;
          
          connectionHistory.recordConnectionReduced(connection);
        }
      }
    }
    
    return result;
  };
  
  // Add connection history capabilities to the network
  return Object.assign(network, {
    connectionHistory,
    getChangesSince: (version: number) => connectionHistory.getChangesSince(version),
    applyChanges: (changes: VersionedChange[]) => connectionHistory.applyChanges(changes),
    rollbackToVersion: (version: number) => connectionHistory.rollbackToVersion(version),
    takeReductionSnapshot: (description?: string) => connectionHistory.takeReductionSnapshot(description)
  });
}