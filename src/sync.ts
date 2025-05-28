/**
 * Distributed Synchronization Implementation for Annette
 * 
 * This module provides:
 * 1. Sync-related agent types for cross-server/client synchronization
 * 2. Specialized ports (sync/remote) for network boundaries
 * 3. Serialization and deserialization of network state changes
 */
import { Agent, IAgent } from "./agent";
import { Network, INetwork, ChangeHistoryEntry } from "./network";
import { Port } from "./port";
import { ActionRule } from "./rule";
import { AgentState, NetworkSnapshot } from "./timetravel";

// Sync-related types
export type SyncOperation = {
  type: 'agent-update' | 'agent-create' | 'agent-delete' | 'connection-create' | 'connection-delete' | 'snapshot';
  data: any;
  source: string;
  timestamp: number;
  version: number;
  id: string;
};

export type SyncAgentValue = {
  networkId: string;
  sourceId: string;
  operations: SyncOperation[];
  lastSyncTimestamp: number;
  metadata?: Record<string, any>;
};

export type RemoteAgentValue = {
  sourceNetworkId: string;
  sourceAgentId: string;
  metadata?: Record<string, any>;
};

/**
 * Create a Sync Agent
 * 
 * Sync agents are responsible for sending and receiving changes
 * across network boundaries.
 * 
 * @param networkId The ID of the network this agent syncs
 * @param sourceId The ID of this sync source (e.g., client ID)
 * @param metadata Optional metadata
 * @returns A Sync agent with sync port
 */
export function SyncAgent(
  networkId: string,
  sourceId: string,
  metadata?: Record<string, any>
): IAgent<"Sync", SyncAgentValue> {
  return Agent("Sync", 
    {
      networkId,
      sourceId,
      operations: [],
      lastSyncTimestamp: Date.now(),
      metadata
    },
    {
      sync: Port("sync", "sync"),
      remote: Port("remote", "remote")
    }
  );
}

/**
 * Create a Remote Agent
 * 
 * Remote agents represent agents from another network/client/server.
 * They serve as proxies for remote state.
 * 
 * @param sourceNetworkId The ID of the network this agent belongs to
 * @param sourceAgentId The ID of the agent in its source network
 * @param value The agent's initial value
 * @param metadata Optional metadata
 * @returns A Remote agent with remote port
 */
export function RemoteAgent<T = any>(
  sourceNetworkId: string,
  sourceAgentId: string,
  value: T,
  metadata?: Record<string, any>
): IAgent<"Remote", T & RemoteAgentValue> {
  return Agent("Remote", 
    {
      ...value,
      sourceNetworkId,
      sourceAgentId,
      metadata
    },
    {
      remote: Port("remote", "remote")
    }
  );
}

/**
 * Create a sync operation
 * 
 * Helper function to create properly formatted sync operations
 * 
 * @param type The type of operation
 * @param data The operation data
 * @param sourceId The source ID
 * @returns A sync operation
 */
export function createSyncOperation(
  type: SyncOperation['type'],
  data: any,
  sourceId: string
): SyncOperation {
  return {
    type,
    data,
    source: sourceId,
    timestamp: Date.now(),
    version: 1,
    id: `${sourceId}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
  };
}

/**
 * Serialize an agent for transmission
 * 
 * @param agent The agent to serialize
 * @returns A serializable representation of the agent
 */
export function serializeAgent(agent: IAgent): AgentState {
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
    type: agent.type,
    value: JSON.parse(JSON.stringify(agent.value)), // Deep clone to ensure serializability
    // ports: (agent.ports)
    ports,
  };
}

/**
 * Serialize a network change
 * 
 * @param change The change history entry
 * @returns A serializable representation of the change
 */
export function serializeChange(change: ChangeHistoryEntry): any {
  return {
    ...change,
    previousState: JSON.parse(JSON.stringify(change.previousState)),
    newState: JSON.parse(JSON.stringify(change.newState))
  };
}

/**
 * Register sync rules for distributed networks
 * 
 * @param network The network to register rules with
 */
export function registerSyncRules(network: INetwork): void {
  // Note: ActionRules need actual port references, so they should be added 
  // when specific agents are available. These rules serve as templates.
  
  // Helper function to add rule when Remote and target agents are connected
  const addRemoteUpdateRule = (remoteAgent: IAgent, targetAgent: IAgent) => {
    if (remoteAgent.type === "Remote" && remoteAgent.ports.remote && targetAgent.ports.sync) {
      network.addRule(ActionRule(
        remoteAgent.ports.remote,
        targetAgent.ports.sync,
        (remote: IAgent, local: IAgent) => {
          // Apply the remote update to the local agent
          local.value = {
            ...local.value,
            ...remote.value
          };
          
          // Return both agents
          return [remote, local];
        },
        "Remote-Local"
      ));
    }
  };

  // Helper function to add rule when Sync and target agents are connected  
  const addSyncCollectorRule = (syncAgent: IAgent, targetAgent: IAgent) => {
    if (syncAgent.type === "Sync" && syncAgent.ports.sync && targetAgent.ports.sync) {
      network.addRule(ActionRule(
        syncAgent.ports.sync,
        targetAgent.ports.sync,
        (sync: IAgent, local: IAgent) => {
          // Create an update operation for the local agent
          const operation = createSyncOperation(
            'agent-update',
            {
              agentId: local._agentId,
              value: JSON.parse(JSON.stringify(local.value))
            },
            sync.value.sourceId
          );
          
          // Add to sync operations
          sync.value.operations.push(operation);
          sync.value.lastSyncTimestamp = Date.now();
          
          // Return both agents
          return [sync, local];
        },
        "Sync-Collector"
      ));
    }
  };

  // Store these helper functions on the network for later use
  (network as any)._addRemoteUpdateRule = addRemoteUpdateRule;
  (network as any)._addSyncCollectorRule = addSyncCollectorRule;
}

/**
 * Apply remote operations to a local network
 * 
 * @param network The network to apply operations to
 * @param operations The sync operations to apply
 */
export function applyRemoteOperations(network: INetwork, operations: SyncOperation[]): void {
  // Sort operations by timestamp to ensure proper order
  const sortedOps = [...operations].sort((a, b) => a.timestamp - b.timestamp);
  
  for (const op of sortedOps) {
    switch (op.type) {
      case 'agent-create':
        const { name, value, ports } = op.data;
        const newAgent = Agent(name, value, ports);
        network.addAgent(newAgent);
        break;
        
      case 'agent-update':
        const { agentId, value: newValue } = op.data;
        const agent = network.getAgent(agentId);
        if (agent) {
          agent.value = newValue;
        } else {
          // Create a remote agent if it doesn't exist locally
          const remoteAgent = RemoteAgent(
            op.source,
            agentId,
            newValue
          );
          network.addAgent(remoteAgent);
        }
        break;
        
      case 'agent-delete':
        network.removeAgent(op.data.agentId);
        break;
        
      case 'connection-create':
        const { sourceAgentId, sourcePortName, destAgentId, destPortName } = op.data;
        const sourceAgent = network.getAgent(sourceAgentId);
        const destAgent = network.getAgent(destAgentId);
        
        if (sourceAgent && destAgent) {
          const sourcePort = sourceAgent.ports[sourcePortName];
          const destPort = destAgent.ports[destPortName];
          
          if (sourcePort && destPort) {
            network.connectPorts(sourcePort, destPort);
          }
        }
        break;
        
      case 'connection-delete':
        // Connection deletion is handled automatically by agent deletion
        // or by new connections, so no explicit action needed
        break;
        
      case 'snapshot':
        // Apply a full snapshot (usually only done for initial sync)
        applyNetworkSnapshot(network, op.data);
        break;
    }
  }
}

/**
 * Apply a network snapshot to a local network
 * 
 * @param network The network to apply the snapshot to
 * @param snapshot The snapshot to apply
 */
function applyNetworkSnapshot(network: INetwork, snapshot: NetworkSnapshot): void {
  // Clear existing network state
  for (const agent of network.getAllAgents()) {
    network.removeAgent(agent._agentId);
  }
  
  // Recreate agents
  const agentsById = new Map<string, IAgent>();
  
  for (const [, agentState] of snapshot.agentStates) {
    const agent = Agent(agentState.name, agentState.value);
    Object.defineProperty(agent, '_agentId', { value: agentState.id });
    network.addAgent(agent);
    agentsById.set(agentState.id, agent);
  }
  
  // Recreate connections
  for (const [, connectionState] of snapshot.connections) {
    const sourceAgent = agentsById.get(connectionState.sourceAgentId);
    const destAgent = agentsById.get(connectionState.destinationAgentId);
    
    if (sourceAgent && destAgent) {
      const sourcePort = sourceAgent.ports[connectionState.sourcePortName];
      const destPort = destAgent.ports[connectionState.destinationPortName];
      
      if (sourcePort && destPort) {
        network.connectPorts(sourcePort, destPort);
      }
    }
  }
}

/**
 * Create sync operations from network changes
 * 
 * @param changes The change history entries
 * @param sourceId The source ID
 * @returns Sync operations representing the changes
 */
export function createSyncOperationsFromChanges(
  changes: ChangeHistoryEntry[],
  sourceId: string
): SyncOperation[] {
  return changes.map(change => {
    return createSyncOperation(
      'agent-update',
      {
        agentId: change.targetId,
        value: change.newState
      },
      sourceId
    );
  });
}

/**
 * Collect sync operations from a network
 * 
 * @param network The network to collect operations from
 * @param sourceId The source ID
 * @param lastSyncTimestamp The timestamp of the last sync
 * @returns Sync operations representing changes since the last sync
 */
export function collectSyncOperations(
  network: INetwork,
  sourceId: string,
  lastSyncTimestamp: number
): SyncOperation[] {
  const operations: SyncOperation[] = [];
  
  // If the network has change history, use it
  if (network.getChangeHistory) {
    const changes = network.getChangeHistory().filter(
      change => change.timestamp > lastSyncTimestamp
    );
    
    operations.push(...createSyncOperationsFromChanges(changes, sourceId));
  }
  
  return operations;
}

/**
 * Create a SyncNetwork that extends a regular network with sync capabilities
 * 
 * @param name Network name
 * @param sourceId Source identifier for this network instance
 * @returns A network with sync capabilities
 */
export function SyncNetwork<Name extends string>(
  name: Name,
  sourceId: string
): INetwork<Name> & { 
  sync: (targetNetwork: INetwork) => void;
  applyRemoteOperations: (operations: SyncOperation[]) => void;
} {
  // Create a base network
  const network = Network(name);
  
  // Create a sync agent
  const syncAgent = SyncAgent(network.id, sourceId);
  network.addAgent(syncAgent);
  
  // Register sync rules
  registerSyncRules(network);
  
  // Add sync method
  const sync = (targetNetwork: INetwork) => {
    const operations = collectSyncOperations(
      network,
      sourceId,
      syncAgent.value.lastSyncTimestamp
    );
    
    // Apply our operations to the target network
    applyRemoteOperations(targetNetwork, operations);
    
    // Update last sync timestamp
    syncAgent.value.lastSyncTimestamp = Date.now();
  };
  
  // Return enhanced network
  return {
    ...network,
    sync,
    applyRemoteOperations: (operations: SyncOperation[]) => {
      applyRemoteOperations(network, operations);
    }
  };
}