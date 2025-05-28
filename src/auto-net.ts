/**
 * Automated and Synced Networks for Annette
 * 
 * This module provides:
 * 1. AutoNet with automatic dependency tracking via Proxies
 * 2. Optimized connection graphs
 * 3. SyncedNet for automatic server synchronization
 * 4. Serialization/deserialization for network state
 */
import { IAgent } from "./agent";
import { ConnectionHistoryManager, VersionedChange } from "./connection-history";
import { Network, INetwork } from "./network";
import { Port } from "./port";
import { Agent as NativeAgent } from "./agent";
import { Updates, Updater } from "./updater";

// Track the current computation for dependency tracking
let currentComputation: IAgent | null = null;

/**
 * Serialized node representation
 */
export interface SerializedNode {
  id: string;
  name: string;
  type: string;
  value: any;
  ports: SerializedPort[];
}

/**
 * Serialized port representation
 */
export interface SerializedPort {
  id: string;
  name: string;
  type: string;
  connection?: string; // ID of connected port
}

/**
 * Serialized network representation
 */
export interface SerializedNet {
  id: string;
  name: string;
  timestamp: number;
  version: number;
  nodes: SerializedNode[];
}

/**
 * Connection graph for optimizing connections
 */
export class ConnectionGraph {
  private connections = new Map<string, Set<string>>();
  
  /**
   * Add a connection to the graph
   * @param sourceId Source node ID
   * @param targetId Target node ID
   */
  addConnection(sourceId: string, targetId: string): void {
    if (!this.connections.has(sourceId)) {
      this.connections.set(sourceId, new Set());
    }
    this.connections.get(sourceId)!.add(targetId);
    
    // Add reverse connection for bidirectional traversal
    if (!this.connections.has(targetId)) {
      this.connections.set(targetId, new Set());
    }
    this.connections.get(targetId)!.add(sourceId);
  }
  
  /**
   * Remove a connection from the graph
   * @param sourceId Source node ID
   * @param targetId Target node ID
   */
  removeConnection(sourceId: string, targetId: string): void {
    if (this.connections.has(sourceId)) {
      this.connections.get(sourceId)!.delete(targetId);
    }
    
    if (this.connections.has(targetId)) {
      this.connections.get(targetId)!.delete(sourceId);
    }
  }
  
  /**
   * Get all connected nodes
   * @param nodeId The node ID to get connections for
   * @returns Set of connected node IDs
   */
  getConnections(nodeId: string): Set<string> {
    return this.connections.get(nodeId) || new Set();
  }
  
  /**
   * Find the shortest path between two nodes
   * @param sourceId Source node ID
   * @param targetId Target node ID
   * @returns Array of node IDs representing the path, or null if no path exists
   */
  findPath(sourceId: string, targetId: string): string[] | null {
    // Use breadth-first search to find the shortest path
    const visited = new Set<string>();
    const queue: Array<{ id: string, path: string[] }> = [{ id: sourceId, path: [sourceId] }];
    
    while (queue.length > 0) {
      const { id, path } = queue.shift()!;
      
      if (id === targetId) {
        return path;
      }
      
      if (!visited.has(id)) {
        visited.add(id);
        
        const connections = this.getConnections(id);
        for (const connectedId of connections) {
          if (!visited.has(connectedId)) {
            queue.push({ id: connectedId, path: [...path, connectedId] });
          }
        }
      }
    }
    
    return null;
  }
}

/**
 * Auto Network with dependency tracking
 */
export class AutoNet {
  private network: INetwork;
  private connectionGraph = new ConnectionGraph();
  private trackedValues = new Map<string, any>();
  private dependencyMap = new Map<string, Set<string>>();
  protected valueToAgentMap = new Map<any, IAgent>();
  
  /**
   * Create an automated network
   * @param name Network name
   */
  constructor(name: string) {
    this.network = Network(name);
  }
  
  /**
   * Create a tracked value
   * @param initialValue The initial value
   * @param name Optional name for the value
   * @returns A proxied value with automatic dependency tracking
   */
  createValue<T = any>(initialValue: T, name?: string): T {
    // Create an agent to hold the value
    const agent = NativeAgent(
      name || "Value", 
      initialValue,
      {
        main: Port("main", "main"),
        get: Port("get", "aux"),
        set: Port("set", "aux")
      }
    );
    
    // Add the agent to the network
    this.network.addAgent(agent);
    
    // Create a proxy to track dependencies
    const proxy = new Proxy(initialValue as any, {
      get: (target, prop) => {
        // Track dependency if there's a current computation
        if (currentComputation) {
          this.trackDependency(agent._agentId, currentComputation._agentId);
        }
        
        // If the property is an object, return a proxied version
        if (typeof target[prop] === 'object' && target[prop] !== null) {
          return this.createValue(target[prop], `${name || "Value"}.${String(prop)}`);
        }
        
        return target[prop];
      },
      
      set: (target, prop, value) => {
        // Create an updater agent
        const updater = Updater(
          [String(prop)],
          Updates.set(value)
        );
        
        // Add the updater to the network
        this.network.addAgent(updater);
        
        // Connect the updater to the value agent
        this.network.connectPorts(updater.ports.main, agent.ports.set);
        
        // Reduce the network to apply the update
        this.network.reduce();
        
        // Update the target directly
        target[prop] = value;
        return true;
      }
    });
    
    // Store the proxy
    this.trackedValues.set(agent._agentId, proxy);
    this.valueToAgentMap.set(proxy, agent);
    
    return proxy as T;
  }
  
  /**
   * Track a dependency between two agents
   * @param dependencyId ID of the dependency agent
   * @param dependentId ID of the dependent agent
   */
  private trackDependency(dependencyId: string, dependentId: string): void {
    if (!this.dependencyMap.has(dependencyId)) {
      this.dependencyMap.set(dependencyId, new Set());
    }
    
    this.dependencyMap.get(dependencyId)!.add(dependentId);
    
    // Add to connection graph
    this.connectionGraph.addConnection(dependencyId, dependentId);
  }
  
  /**
   * Execute a computation with dependency tracking
   * @param fn The function to execute
   * @returns The result of the function
   */
  withTracking<T>(fn: () => T): T {
    const prevComputation = currentComputation;
    
    // Create a computation agent
    const computationAgent = NativeAgent(
      "Computation",
      { status: 'running' }
    );
    
    // Add the computation agent to the network
    this.network.addAgent(computationAgent);
    
    // Set as current computation
    currentComputation = computationAgent;
    
    try {
      // Execute the function
      return fn();
    } finally {
      // Restore previous computation
      currentComputation = prevComputation;
    }
  }
  
  /**
   * Get the underlying network
   * @returns The network
   */
  getNetwork(): INetwork {
    return this.network;
  }
  
  /**
   * Serialize the network to a JSON-compatible object
   * @returns Serialized representation of the network
   */
  serialize(): SerializedNet {
    const nodes: SerializedNode[] = [];
    
    // Get all agents
    const agents = this.network.getAllAgents ? 
      this.network.getAllAgents() : 
      this.network.findAgents({});
    
    // Serialize each agent
    for (const agent of agents) {
      const ports: SerializedPort[] = [];
      
      // Serialize ports
      for (const [name, port] of Object.entries(agent.ports)) {
        ports.push({
          id: `${agent._agentId}-${name}`,
          name,
          type: port.type
        });
      }
      
      // Add the serialized agent
      nodes.push({
        id: agent._agentId,
        name: agent.name,
        type: agent.type,
        value: JSON.parse(JSON.stringify(agent.value)),
        ports
      });
    }
    
    // Add connection information
    for (const agent of agents) {
      if (agent.connections) {
        for (const connection of Object.values(agent.connections) as any[]) {
          // Find source and target ports in the serialized nodes
          const sourceNode = nodes.find(node => node.id === connection.source?._agentId);
          const targetNode = nodes.find(node => node.id === connection.destination?._agentId);
          
          if (sourceNode && targetNode) {
            const sourcePort = sourceNode.ports.find(port => port.name === connection.sourcePort?.name);
            const targetPort = targetNode.ports.find(port => port.name === connection.destinationPort?.name);
            
            if (sourcePort && targetPort) {
              sourcePort.connection = targetPort.id;
              targetPort.connection = sourcePort.id;
            }
          }
        }
      }
    }
    
    return {
      id: this.network.id,
      name: this.network.name,
      timestamp: Date.now(),
      version: 1, // Version 1 for now, would be updated in a versioned system
      nodes
    };
  }
  
  /**
   * Deserialize a network from a serialized representation
   * @param serialized The serialized network
   * @returns A new AutoNet instance
   */
  static deserialize(serialized: SerializedNet): AutoNet {
    const autoNet = new AutoNet(serialized.name);
    const network = autoNet.getNetwork();
    
    // Map of serialized node ID to created agent
    const nodeMap = new Map<string, IAgent>();
    
    // Create all nodes first
    for (const node of serialized.nodes) {
      const agent = NativeAgent(node.name, node.value);
      
      // Try to set the agent ID
      try {
        Object.defineProperty(agent, '_agentId', {
          value: node.id,
          writable: false,
          configurable: false,
        });
      } catch (error) {
        // If we can't set the ID, just use the generated one
        console.warn("Could not set agent ID, using generated ID");
      }
      
      // Add to the network
      network.addAgent(agent);
      
      // Store in the map
      nodeMap.set(node.id, agent);
    }
    
    // Create all connections
    for (const node of serialized.nodes) {
      const agent = nodeMap.get(node.id);
      
      if (agent) {
        for (const port of node.ports) {
          if (port.connection) {
            // Find the target port
            for (const targetNode of serialized.nodes) {
              const targetPort = targetNode.ports.find(p => p.id === port.connection);
              
              if (targetPort) {
                const targetAgent = nodeMap.get(targetNode.id);
                
                if (targetAgent) {
                  // Connect the ports
                  network.connectPorts(
                    agent.ports[port.name],
                    targetAgent.ports[targetPort.name]
                  );
                  
                  // Add to connection graph
                  autoNet.connectionGraph.addConnection(agent._agentId, targetAgent._agentId);
                  
                  break;
                }
              }
            }
          }
        }
      }
    }
    
    return autoNet;
  }
}

/**
 * Synced Network with automatic server synchronization
 */
export class SyncedNet extends AutoNet {
  private syncQueue: VersionedChange[] = [];
  private syncUrl: string;
  private clientId: string;
  private eventSource: EventSource | null = null;
  private lastSyncTimestamp: number = 0;
  private connectionHistory: ConnectionHistoryManager | null = null;
  
  /**
   * Create a synced network
   * @param name Network name
   * @param syncUrl URL for server synchronization
   * @param clientId Client identifier
   */
  constructor(name: string, syncUrl: string, clientId: string) {
    super(name);
    this.syncUrl = syncUrl;
    this.clientId = clientId;
    
    // Enable connection history if the network supports it
    const network = this.getNetwork();
    if (typeof (network as any).enableConnectionHistory === 'function') {
      this.connectionHistory = (network as any).enableConnectionHistory().connectionHistory;
    }
    
    // Set up server sync
    this.setupServerSync();
  }
  
  /**
   * Create a synced value that automatically synchronizes with the server
   * @param initialValue The initial value
   * @param name Optional name for the value
   * @param syncToServer Whether to sync changes to the server
   * @returns A proxied value with automatic synchronization
   */
  createSyncedValue<T = any>(
    initialValue: T, 
    name?: string,
    syncToServer: boolean = true
  ): T {
    // Create a normal tracked value
    const value = super.createValue(initialValue, name);
    
    // Mark this value for synchronization
    if (syncToServer) {
      const agent = this.valueToAgentMap.get(value);
      
      if (agent) {
        // Add a sync port to the agent
        if (!agent.ports.sync) {
          agent.ports = {
            ...agent.ports,
            sync: Port("sync", "sync") as any
          };
        }
        
        // Add metadata
        (agent.value as any).__syncToServer = true;
      }
    }
    
    return value;
  }
  
  /**
   * Set up server synchronization
   */
  private setupServerSync(): void {
    // Set up event source for receiving updates
    this.setupEventSource();
    
    // Schedule periodic sync to server
    setInterval(() => {
      this.syncToServer();
    }, 5000); // Sync every 5 seconds
  }
  
  /**
   * Set up event source for receiving updates
   */
  private setupEventSource(): void {
    try {
      // Close existing event source
      if (this.eventSource) {
        this.eventSource.close();
      }
      
      // Create new event source
      this.eventSource = new EventSource(`${this.syncUrl}/events?clientId=${this.clientId}`);
      
      // Handle incoming updates
      this.eventSource.addEventListener('message', (event) => {
        try {
          const messageEvent = event as MessageEvent;
          const update = JSON.parse(messageEvent.data);
          this.applyServerUpdate(update);
        } catch (error) {
          console.error("Error parsing update:", error);
        }
      });
      
      // Handle errors
      this.eventSource.addEventListener('error', (error) => {
        console.error("EventSource error:", error);
        
        // Reconnect after a delay
        setTimeout(() => {
          this.setupEventSource();
        }, 5000);
      });
    } catch (error) {
      console.error("Error setting up EventSource:", error);
    }
  }
  
  /**
   * Apply an update from the server
   * @param update The update to apply
   */
  private applyServerUpdate(update: any): void {
    // Check if we have connection history
    if (this.connectionHistory && update.changes) {
      // Apply the changes
      this.connectionHistory.applyChanges(update.changes);
    } else {
      // Apply the update directly
      const network = this.getNetwork();
      
      if (update.agentId && update.value) {
        const agent = network.getAgent(update.agentId);
        
        if (agent) {
          agent.value = update.value;
        }
      }
    }
    
    // Update last sync timestamp
    if (update.timestamp) {
      this.lastSyncTimestamp = Math.max(this.lastSyncTimestamp, update.timestamp);
    }
  }
  
  /**
   * Sync changes to the server
   */
  private syncToServer(): void {
    // Get changes since last sync
    const changes = this.getChangesSinceLastSync();
    
    if (changes.length === 0) {
      return; // No changes to sync
    }
    
    // Send changes to server
    this.sendChangesToServer(changes);
  }
  
  /**
   * Get changes since the last sync
   * @returns Array of changes
   */
  private getChangesSinceLastSync(): VersionedChange[] {
    // Check if we have connection history
    if (this.connectionHistory) {
      // Get changes from connection history
      return this.connectionHistory.getChangesSince(this.lastSyncTimestamp);
    }
    
    // Otherwise, check the sync queue
    return this.syncQueue;
  }
  
  /**
   * Send changes to the server
   * @param changes The changes to send
   */
  private sendChangesToServer(changes: VersionedChange[]): void {
    // Prepare the payload
    const payload = {
      clientId: this.clientId,
      networkId: this.getNetwork().id,
      timestamp: Date.now(),
      changes
    };
    
    // Send via fetch API
    fetch(`${this.syncUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      return response.json();
    })
    .then((data: any) => {
      // Update last sync timestamp
      this.lastSyncTimestamp = data.timestamp || Date.now();
      
      // Clear sync queue
      this.syncQueue = [];
      
      console.log("Sync successful:", data);
    })
    .catch(error => {
      console.error("Error syncing to server:", error);
      
      // Keep changes in the queue for next sync attempt
    });
  }
}

/**
 * Create a network server for handling synchronization
 * @param port Server port
 * @returns A network server instance
 */
export function createNetworkServer(port: number = 3000) {
  // This would normally be implemented using a framework like Express
  // For demonstration purposes, we'll just return a simple object
  return {
    port,
    start: () => {
      console.log(`Network server started on port ${port}`);
      return {
        stop: () => {
          console.log(`Network server stopped on port ${port}`);
        }
      };
    },
    // Other server methods would go here
  };
}

/**
 * Create an auto network
 * @param name Network name
 * @returns An AutoNet instance
 */
export function createAutoNet(name: string): AutoNet {
  return new AutoNet(name);
}

/**
 * Create a synced network
 * @param name Network name
 * @param syncUrl URL for server synchronization
 * @param clientId Client identifier
 * @returns A SyncedNet instance
 */
export function createSyncedNet(
  name: string, 
  syncUrl: string, 
  clientId: string
): SyncedNet {
  return new SyncedNet(name, syncUrl, clientId);
}