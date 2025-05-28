/**
 * Distributed Networks for Annette
 * 
 * This module provides a complete system for cross-server interaction nets:
 * 1. Network serialization (including rules)
 * 2. Network distribution protocol
 * 3. Full network synchronization
 * 4. Client-server architecture
 */
import { 
  Agent, IAgent,
  Network, INetwork, 
  Port, IBoundPort, PortTypes,
  IConnection,
  IRule, ActionRule, RewriteRule, AnyRule,
  NetworkBoundary, NetworkMessage, NetworkNode
} from './index';
import { AutoNet, SerializedNet, SerializedNode, SerializedPort } from './auto-net';

// Types for distributed networks

/**
 * Serialized rule representation
 */
export interface SerializedRule {
  id: string;
  name: string;
  type: 'action' | 'rewrite';
  pattern: {
    agentName1: string;
    portName1: string;
    agentName2: string;
    portName2: string;
  };
  implementation: string; // Stringified function or rewrite pattern
  metadata?: Record<string, any>;
}

/**
 * Serialized network with full rule definitions
 */
export interface SerializedDistributedNet extends SerializedNet {
  rules: SerializedRule[];
  version: number;
  schema: string; // Schema version for compatibility
  role: 'server' | 'client' | 'peer';
  capabilities: string[]; // Features this network supports
}

/**
 * Distributed network synchronization message
 */
export interface DistributedNetworkMessage {
  type: 'sync' | 'join' | 'leave' | 'snapshot' | 'update' | 'query' | 'response';
  sourceId: string;
  targetId: string | 'broadcast';
  timestamp: number;
  messageId: string;
  correlationId?: string; // For responses
  payload: any;
}

/**
 * Network update message
 */
export interface NetworkUpdateMessage {
  networkId: string;
  updates: Array<{
    type: 'agent-create' | 'agent-update' | 'agent-delete' | 'connection-create' | 'connection-delete' | 'rule-create' | 'rule-update' | 'rule-delete';
    targetId: string;
    data: any;
    timestamp: number;
    version: number;
  }>;
  baseVersion: number;
  newVersion: number;
}

/**
 * Distributed network connection options
 */
export interface DistributedNetworkOptions {
  role?: 'server' | 'client' | 'peer';
  serverUrl?: string;
  networkId?: string;
  capabilities?: string[];
  syncInterval?: number;
  autoConnect?: boolean;
  authorization?: string;
  serializer?: (data: any) => string;
  deserializer?: (data: string) => any;
  transport?: 'websocket' | 'http' | 'postmessage' | 'custom';
  transportOptions?: Record<string, any>;
  logger?: (level: string, message: string, data?: any) => void;
}

// Default options
const defaultOptions: DistributedNetworkOptions = {
  role: 'client',
  serverUrl: 'ws://localhost:3000',
  capabilities: ['basic', 'sync', 'rules'],
  syncInterval: 1000,
  autoConnect: true,
  transport: 'websocket',
  serializer: JSON.stringify,
  deserializer: JSON.parse,
  logger: (level, message) => console.log(`[${level.toUpperCase()}] ${message}`)
};

/**
 * Connection status for distributed networks
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'synchronizing' | 'error';

/**
 * Distributed Network implementation
 */
export class DistributedNetwork {
  private network: INetwork;
  private autoNet?: AutoNet;
  private options: Required<DistributedNetworkOptions>;
  private status: ConnectionStatus = 'disconnected';
  private connections = new Map<string, any>();
  private pendingMessages: DistributedNetworkMessage[] = [];
  private messageHandlers = new Map<string, (message: DistributedNetworkMessage) => void>();
  private syncInterval?: NodeJS.Timeout;
  private currentVersion = 0;
  private lastSyncedVersion = 0;
  private networkId: string;
  private peerId: string;
  private connectionListeners: ((status: ConnectionStatus) => void)[] = [];
  private socket?: WebSocket;
  private connected = false;

  /**
   * Create a distributed network
   * 
   * @param nameOrNetwork Network name or existing network
   * @param options Configuration options
   */
  constructor(
    nameOrNetwork: string | INetwork,
    options: Partial<DistributedNetworkOptions> = {}
  ) {
    // Merge options with defaults
    this.options = {
      ...defaultOptions,
      ...options
    } as Required<DistributedNetworkOptions>;

    // Initialize network
    if (typeof nameOrNetwork === 'string') {
      this.network = new (Network as any)(nameOrNetwork);
      this.networkId = nameOrNetwork;
    } else {
      this.network = nameOrNetwork;
      this.networkId = nameOrNetwork.name || 'distributed-network';
    }

    this.peerId = `peer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.setupMessageHandlers();

    if (this.options.autoConnect) {
      this.connect();
    }
  }
  
  /**
   * Connect to the distributed network
   */
  public connect(): void {
    if (this.status !== 'disconnected' && this.status !== 'error') {
      return;
    }
    
    this.setStatus('connecting');
    
    // Handle different transport types
    if (this.options.transport === 'websocket') {
      this.connectWebSocket();
    } else if (this.options.transport === 'postmessage') {
      this.connectPostMessage();
    } else if (this.options.transport === 'custom' && this.options.transportOptions?.connect) {
      this.connectCustom();
    } else {
      this.setStatus('error');
      this.log('error', `Unsupported transport: ${this.options.transport}`);
    }
  }
  
  /**
   * Disconnect from the distributed network
   */
  public disconnect(): void {
    if (this.status === 'disconnected') {
      return;
    }
    
    // Send leave message
    if (this.status === 'connected' || this.status === 'synchronizing') {
      this.sendMessage({
        type: 'leave',
        sourceId: this.peerId,
        targetId: 'broadcast',
        timestamp: Date.now(),
        messageId: `leave-${Date.now()}`,
        payload: {
          reason: 'user-initiated'
        }
      });
    }
    
    // Clear sync interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
    
    // Close connections
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
    
    this.connections.clear();
    this.connected = false;
    this.setStatus('disconnected');
  }
  
  /**
   * Add a rule to the network
   * 
   * @param rule The rule to add
   */
  public addRule(rule: AnyRule): void {
    this.network.addRule(rule);
    
    // If connected, share the rule
    if (this.connected) {
      this.sendNetworkUpdate([{
        type: 'rule-create',
        targetId: rule.name,
        data: this.serializeRule(rule as any),
        timestamp: Date.now(),
        version: ++this.currentVersion
      }]);
    }
  }
  
  /**
   * Add an agent to the network
   * 
   * @param agent The agent to add
   */
  public addAgent(agent: IAgent): void {
    this.network.addAgent(agent);
    
    // If connected, share the agent
    if (this.connected) {
      this.sendNetworkUpdate([{
        type: 'agent-create',
        targetId: agent._agentId,
        data: this.serializeAgent(agent),
        timestamp: Date.now(),
        version: ++this.currentVersion
      }]);
    }
  }
  
  /**
   * Connect ports in the network
   * 
   * @param port1 First port
   * @param port2 Second port
   * @returns The created connection
   */
  public connectPorts(port1: IBoundPort, port2: IBoundPort): any {
    const connection = this.network.connectPorts(port1, port2);
    
    // If connected and connection created, share it
    if (this.connected && connection) {
      this.sendNetworkUpdate([{
        type: 'connection-create',
        targetId: connection.name || 'unnamed-connection',
        data: this.serializeConnection(connection as any),
        timestamp: Date.now(),
        version: ++this.currentVersion
      }]);
    }
    
    return connection;
  }
  
  /**
   * Serialize the entire network, including rules
   * 
   * @returns Serialized network representation
   */
  public serialize(): SerializedDistributedNet {
    // First, get the basic network serialization
    const basicSerialization = this.autoNet 
      ? this.autoNet.serialize() 
      : this.serializeBasicNetwork();
    
    // Add rules
    const rules = this.serializeRules();
    
    return {
      ...basicSerialization,
      rules,
      version: this.currentVersion,
      schema: '1.0',
      role: this.options.role || 'client',
      capabilities: this.options.capabilities || []
    };
  }
  
  /**
   * Add a connection status listener
   * 
   * @param listener Function to call when connection status changes
   * @returns Unsubscribe function
   */
  public onConnectionChange(listener: (status: ConnectionStatus) => void): () => void {
    this.connectionListeners.push(listener);
    
    // Call immediately with current status
    listener(this.status);
    
    // Return unsubscribe function
    return () => {
      const index = this.connectionListeners.indexOf(listener);
      if (index !== -1) {
        this.connectionListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Get the underlying network
   * 
   * @returns The wrapped network
   */
  public getNetwork(): INetwork {
    return this.network;
  }
  
  /**
   * Get the current connection status
   * 
   * @returns Current connection status
   */
  public getStatus(): ConnectionStatus {
    return this.status;
  }
  
  /**
   * Apply updates from another network
   * 
   * @param updates The updates to apply
   * @returns Whether the updates were applied successfully
   */
  public applyUpdates(updates: NetworkUpdateMessage): boolean {
    try {
      // Ensure updates are in the correct order
      if (updates.baseVersion > this.lastSyncedVersion) {
        this.log('warn', `Received updates based on version ${updates.baseVersion} but our last synced version is ${this.lastSyncedVersion}`);
        
        // Request a full snapshot
        this.sendMessage({
          type: 'query',
          sourceId: this.peerId,
          targetId: updates.networkId,
          timestamp: Date.now(),
          messageId: `query-${Date.now()}`,
          payload: {
            type: 'snapshot',
            version: this.lastSyncedVersion
          }
        });
        
        return false;
      }
      
      // Apply each update
      for (const update of updates.updates) {
        this.applyUpdate(update);
      }
      
      // Update version
      this.lastSyncedVersion = updates.newVersion;
      
      return true;
    } catch (error) {
      this.log('error', 'Error applying updates', error);
      return false;
    }
  }
  
  /**
   * Send a custom message to a peer
   * 
   * @param targetId The target peer ID or 'broadcast'
   * @param type Custom message type
   * @param payload Message payload
   * @returns Generated message ID
   */
  public sendCustomMessage(targetId: string | 'broadcast', type: string, payload: any): string {
    const messageId = `custom-${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    this.sendMessage({
      type: 'sync', // Use sync type for custom messages
      sourceId: this.peerId,
      targetId,
      timestamp: Date.now(),
      messageId,
      payload: {
        customType: type,
        data: payload
      }
    });
    
    return messageId;
  }
  
  // Private methods
  
  /**
   * Set the connection status and notify listeners
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      
      // Notify listeners
      for (const listener of this.connectionListeners) {
        try {
          listener(status);
        } catch (error) {
          this.log('error', 'Error in connection listener', error);
        }
      }
      
      this.log('info', `Connection status changed to: ${status}`);
    }
  }
  
  /**
   * Log a message using the configured logger
   */
  private log(level: string, message: string, data?: any): void {
    if (this.options.logger) {
      this.options.logger(level, message, data);
    }
  }
  
  /**
   * Connect using WebSocket transport
   */
  private connectWebSocket(): void {
    try {
      const url = this.options.serverUrl;
      
      if (!url) {
        throw new Error('No server URL provided for WebSocket transport');
      }
      
      // Create WebSocket connection
      this.socket = new WebSocket(url);
      
      // Set up event handlers
      this.socket.onopen = () => {
        this.connected = true;
        this.setStatus('connected');
        
        // Send join message
        this.sendMessage({
          type: 'join',
          sourceId: this.peerId,
          targetId: 'broadcast',
          timestamp: Date.now(),
          messageId: `join-${Date.now()}`,
          payload: {
            networkId: this.networkId,
            peerId: this.peerId,
            capabilities: this.options.capabilities,
            version: this.currentVersion
          }
        });
        
        // Set up sync interval
        if (this.options.syncInterval && this.options.syncInterval > 0) {
          this.syncInterval = setInterval(() => {
            this.sync();
          }, this.options.syncInterval);
        }
      };
      
      this.socket.onmessage = (event) => {
        try {
          const message = this.options.deserializer!(event.data);
          this.handleMessage(message);
        } catch (error) {
          this.log('error', 'Error handling WebSocket message', error);
        }
      };
      
      this.socket.onclose = () => {
        this.connected = false;
        clearInterval(this.syncInterval);
        this.syncInterval = undefined;
        this.setStatus('disconnected');
      };
      
      this.socket.onerror = (error) => {
        this.log('error', 'WebSocket error', error);
        this.setStatus('error');
      };
    } catch (error) {
      this.log('error', 'Error connecting via WebSocket', error);
      this.setStatus('error');
    }
  }
  
  /**
   * Connect using PostMessage transport (for iframe/worker communication)
   */
  private connectPostMessage(): void {
    try {
      const target = this.options.transportOptions?.target;
      
      if (!target) {
        throw new Error('No target specified for PostMessage transport');
      }
      
      // Set up message listener
      (globalThis as any).addEventListener('message', (event: any) => {
        // Verify origin if specified
        if (this.options.transportOptions?.origin && 
            event.origin !== this.options.transportOptions.origin) {
          return;
        }
        
        try {
          const message = event.data;
          if (message && message.type && message.sourceId) {
            this.handleMessage(message);
          }
        } catch (error) {
          this.log('error', 'Error handling PostMessage', error);
        }
      });
      
      // Mark as connected
      this.connected = true;
      this.setStatus('connected');
      
      // Send join message
      this.sendMessage({
        type: 'join',
        sourceId: this.peerId,
        targetId: 'broadcast',
        timestamp: Date.now(),
        messageId: `join-${Date.now()}`,
        payload: {
          networkId: this.networkId,
          peerId: this.peerId,
          capabilities: this.options.capabilities,
          version: this.currentVersion
        }
      });
      
      // Set up sync interval
      if (this.options.syncInterval && this.options.syncInterval > 0) {
        this.syncInterval = setInterval(() => {
          this.sync();
        }, this.options.syncInterval);
      }
    } catch (error) {
      this.log('error', 'Error connecting via PostMessage', error);
      this.setStatus('error');
    }
  }
  
  /**
   * Connect using custom transport
   */
  private connectCustom(): void {
    try {
      const connect = this.options.transportOptions?.connect;
      
      if (!connect || typeof connect !== 'function') {
        throw new Error('Invalid custom transport connect function');
      }
      
      // Call custom connect function
      connect({
        peerId: this.peerId,
        networkId: this.networkId,
        
        // Callbacks
        onMessage: (message: DistributedNetworkMessage) => {
          this.handleMessage(message);
        },
        
        onConnect: () => {
          this.connected = true;
          this.setStatus('connected');
          
          // Send join message
          this.sendMessage({
            type: 'join',
            sourceId: this.peerId,
            targetId: 'broadcast',
            timestamp: Date.now(),
            messageId: `join-${Date.now()}`,
            payload: {
              networkId: this.networkId,
              peerId: this.peerId,
              capabilities: this.options.capabilities,
              version: this.currentVersion
            }
          });
          
          // Set up sync interval
          if (this.options.syncInterval && this.options.syncInterval > 0) {
            this.syncInterval = setInterval(() => {
              this.sync();
            }, this.options.syncInterval);
          }
        },
        
        onDisconnect: () => {
          this.connected = false;
          clearInterval(this.syncInterval);
          this.syncInterval = undefined;
          this.setStatus('disconnected');
        },
        
        onError: (error: any) => {
          this.log('error', 'Custom transport error', error);
          this.setStatus('error');
        }
      });
    } catch (error) {
      this.log('error', 'Error connecting via custom transport', error);
      this.setStatus('error');
    }
  }
  
  /**
   * Set up message handlers for different message types
   */
  private setupMessageHandlers(): void {
    // Handle join messages
    this.messageHandlers.set('join', (message: DistributedNetworkMessage) => {
      this.log('info', `Peer ${message.sourceId} joined the network`);
      
      // Store connection
      this.connections.set(message.sourceId, {
        peerId: message.sourceId,
        capabilities: message.payload.capabilities,
        version: message.payload.version,
        lastSeen: Date.now()
      });
      
      // If we're the server or peer, send a snapshot
      if (this.options.role === 'server' || this.options.role === 'peer') {
        this.sendSnapshot(message.sourceId);
      }
    });
    
    // Handle leave messages
    this.messageHandlers.set('leave', (message: DistributedNetworkMessage) => {
      this.log('info', `Peer ${message.sourceId} left the network`);
      
      // Remove connection
      this.connections.delete(message.sourceId);
    });
    
    // Handle snapshot messages
    this.messageHandlers.set('snapshot', (message: DistributedNetworkMessage) => {
      this.log('info', `Received network snapshot from ${message.sourceId}`);
      
      // Apply the snapshot
      this.applySnapshot(message.payload);
    });
    
    // Handle update messages
    this.messageHandlers.set('update', (message: DistributedNetworkMessage) => {
      this.log('info', `Received network updates from ${message.sourceId}`);
      
      // Apply the updates
      this.applyUpdates(message.payload);
    });
    
    // Handle query messages
    this.messageHandlers.set('query', (message: DistributedNetworkMessage) => {
      this.log('info', `Received query from ${message.sourceId}`);
      
      // Handle different query types
      if (message.payload.type === 'snapshot') {
        this.sendSnapshot(message.sourceId, message.messageId);
      } else if (message.payload.type === 'updates') {
        this.sendUpdates(message.sourceId, message.payload.fromVersion, message.messageId);
      }
    });
    
    // Handle response messages
    this.messageHandlers.set('response', (message: DistributedNetworkMessage) => {
      this.log('info', `Received response from ${message.sourceId}`);
      
      // Handle the response based on the correlationId
      // (Not implemented in this example)
    });
    
    // Handle sync messages
    this.messageHandlers.set('sync', (message: DistributedNetworkMessage) => {
      // Handle custom messages
      if (message.payload.customType) {
        this.log('info', `Received custom message ${message.payload.customType} from ${message.sourceId}`);
        
        // Handle the custom message type
        // (Not implemented in this example - would dispatch to application code)
      }
    });
  }
  
  /**
   * Send a message using the configured transport
   */
  private sendMessage(message: DistributedNetworkMessage): void {
    if (!this.connected) {
      // Queue the message for later
      this.pendingMessages.push(message);
      return;
    }
    
    const serializedMessage = this.options.serializer!(message);
    
    // Send based on transport type
    if (this.options.transport === 'websocket' && this.socket) {
      this.socket.send(serializedMessage);
    } else if (this.options.transport === 'postmessage') {
      const target = this.options.transportOptions?.target;
      const origin = this.options.transportOptions?.origin || '*';
      
      if (target && 'postMessage' in target) {
        (target as any).postMessage(message, origin);
      }
    } else if (this.options.transport === 'custom') {
      const send = this.options.transportOptions?.send;
      
      if (send && typeof send === 'function') {
        send(message);
      }
    }
  }
  
  /**
   * Handle an incoming message
   */
  private handleMessage(message: DistributedNetworkMessage): void {
    // Verify message format
    if (!message || !message.type || !message.sourceId) {
      this.log('warn', 'Received invalid message format');
      return;
    }
    
    // Check if the message is for us
    if (message.targetId !== 'broadcast' && message.targetId !== this.peerId) {
      return;
    }
    
    // Find handler for this message type
    const handler = this.messageHandlers.get(message.type);
    
    if (handler) {
      handler(message);
    } else {
      this.log('warn', `No handler for message type: ${message.type}`);
    }
  }
  
  /**
   * Synchronize with the network
   */
  private sync(): void {
    if (!this.connected) {
      return;
    }
    
    this.setStatus('synchronizing');
    
    // Send pending messages
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
    
    // Collect changes since last sync
    const changes = this.collectChanges();
    
    if (changes.length > 0) {
      // Send network updates
      this.sendNetworkUpdate(changes);
    }
    
    this.setStatus('connected');
  }
  
  /**
   * Collect changes since the last sync
   */
  private collectChanges(): any[] {
    // This would typically connect to a change tracking system
    // For simplicity, we're not implementing the full change collection here
    
    return [];
  }
  
  /**
   * Send network updates to peers
   */
  private sendNetworkUpdate(changes: any[]): void {
    if (!this.connected || changes.length === 0) {
      return;
    }
    
    const updateMessage: NetworkUpdateMessage = {
      networkId: this.networkId,
      updates: changes,
      baseVersion: this.lastSyncedVersion,
      newVersion: this.currentVersion
    };
    
    this.sendMessage({
      type: 'update',
      sourceId: this.peerId,
      targetId: 'broadcast',
      timestamp: Date.now(),
      messageId: `update-${Date.now()}`,
      payload: updateMessage
    });
  }
  
  /**
   * Send a full network snapshot to a peer
   */
  private sendSnapshot(peerId: string, correlationId?: string): void {
    if (!this.connected) {
      return;
    }
    
    const snapshot = this.serialize();
    
    this.sendMessage({
      type: 'snapshot',
      sourceId: this.peerId,
      targetId: peerId,
      timestamp: Date.now(),
      messageId: `snapshot-${Date.now()}`,
      correlationId,
      payload: snapshot
    });
  }
  
  /**
   * Send updates since a specific version to a peer
   */
  private sendUpdates(peerId: string, fromVersion: number, correlationId?: string): void {
    if (!this.connected) {
      return;
    }
    
    // Collect changes since the specified version
    // This would typically use a change history system
    // For simplicity, we'll send an empty update
    
    const updateMessage: NetworkUpdateMessage = {
      networkId: this.networkId,
      updates: [],
      baseVersion: fromVersion,
      newVersion: this.currentVersion
    };
    
    this.sendMessage({
      type: 'update',
      sourceId: this.peerId,
      targetId: peerId,
      timestamp: Date.now(),
      messageId: `update-${Date.now()}`,
      correlationId,
      payload: updateMessage
    });
  }
  
  /**
   * Apply a single update to the network
   */
  private applyUpdate(update: any): void {
    switch (update.type) {
      case 'agent-create':
        this.applyAgentCreate(update);
        break;
        
      case 'agent-update':
        this.applyAgentUpdate(update);
        break;
        
      case 'agent-delete':
        this.applyAgentDelete(update);
        break;
        
      case 'connection-create':
        this.applyConnectionCreate(update);
        break;
        
      case 'connection-delete':
        this.applyConnectionDelete(update);
        break;
        
      case 'rule-create':
        this.applyRuleCreate(update);
        break;
        
      case 'rule-update':
        this.applyRuleUpdate(update);
        break;
        
      case 'rule-delete':
        this.applyRuleDelete(update);
        break;
    }
  }
  
  /**
   * Apply a network snapshot
   */
  private applySnapshot(snapshot: SerializedDistributedNet): void {
    // Clear the current network
    this.clearNetwork();
    
    // Create agents
    for (const node of snapshot.nodes) {
      this.deserializeAgent(node);
    }
    
    // Create connections
    for (const node of snapshot.nodes) {
      for (const port of node.ports) {
        if (port.connection) {
          this.deserializeConnection(node.id, port.name, port.connection);
        }
      }
    }
    
    // Create rules
    for (const rule of snapshot.rules) {
      this.deserializeRule(rule);
    }
    
    // Update versions
    this.currentVersion = snapshot.version;
    this.lastSyncedVersion = snapshot.version;
    
    this.log('info', `Applied network snapshot at version ${snapshot.version}`);
  }
  
  /**
   * Clear the current network
   */
  private clearNetwork(): void {
    // Get all agents
    const agents = this.getAllAgents();
    
    // Remove all agents
    for (const agent of agents) {
      this.network.removeAgent(agent._agentId);
    }
    
    // Reset version tracking
    this.currentVersion = 0;
    this.lastSyncedVersion = 0;
  }
  
  /**
   * Apply agent creation update
   */
  private applyAgentCreate(update: any): void {
    const agentData = update.data;
    this.deserializeAgent(agentData);
  }
  
  /**
   * Apply agent update
   */
  private applyAgentUpdate(update: any): void {
    const { agentId, value } = update.data;
    
    // Find the agent
    const agent = this.network.getAgent(agentId);
    
    if (agent) {
      // Update the agent value
      agent.value = value;
    } else {
      this.log('warn', `Cannot update non-existent agent: ${agentId}`);
    }
  }
  
  /**
   * Apply agent deletion
   */
  private applyAgentDelete(update: any): void {
    const { agentId } = update.data;
    
    // Remove the agent
    this.network.removeAgent(agentId);
  }
  
  /**
   * Apply connection creation
   */
  private applyConnectionCreate(update: any): void {
    const { sourceAgentId, sourcePortName, targetAgentId, targetPortName } = update.data;
    
    // Find the agents
    const sourceAgent = this.network.getAgent(sourceAgentId);
    const targetAgent = this.network.getAgent(targetAgentId);
    
    if (sourceAgent && targetAgent) {
      // Get the ports
      const sourcePort = sourceAgent.ports[sourcePortName];
      const targetPort = targetAgent.ports[targetPortName];
      
      if (sourcePort && targetPort) {
        // Connect the ports
        this.network.connectPorts(sourcePort, targetPort);
      } else {
        this.log('warn', `Cannot connect ports: Port not found`);
      }
    } else {
      this.log('warn', `Cannot connect ports: Agent not found`);
    }
  }
  
  /**
   * Apply connection deletion
   */
  private applyConnectionDelete(update: any): void {
    const { sourceAgentId, sourcePortName, targetAgentId, targetPortName } = update.data;
    
    // Find the agents
    const sourceAgent = this.network.getAgent(sourceAgentId);
    const targetAgent = this.network.getAgent(targetAgentId);
    
    if (sourceAgent && targetAgent) {
      // Get the ports
      const sourcePort = sourceAgent.ports[sourcePortName];
      const targetPort = targetAgent.ports[targetPortName];
      
      if (sourcePort && targetPort) {
        // Disconnect the ports
        this.network.disconnectPorts(sourcePort, targetPort);
      }
    }
  }
  
  /**
   * Apply rule creation
   */
  private applyRuleCreate(update: any): void {
    const ruleData = update.data;
    this.deserializeRule(ruleData);
  }
  
  /**
   * Apply rule update
   */
  private applyRuleUpdate(update: any): void {
    // Remove old rule and add updated one
    this.applyRuleDelete(update);
    this.applyRuleCreate(update);
  }
  
  /**
   * Apply rule deletion
   */
  private applyRuleDelete(update: any): void {
    const { ruleName } = update.data;
    
    // Remove the rule (not a standard operation, would need custom implementation)
    // this.network.removeRule(ruleName);
    
    // For now, log a warning
    this.log('warn', `Rule deletion not implemented: ${ruleName}`);
  }
  
  /**
   * Get all agents from the network
   */
  private getAllAgents(): IAgent[] {
    // If network has a getAllAgents method, use it
    if (typeof (this.network as any).getAllAgents === 'function') {
      return (this.network as any).getAllAgents();
    }
    
    // Otherwise, find all agents
    return this.network.findAgents({});
  }
  
  /**
   * Serialize a basic network without AutoNet
   */
  private serializeBasicNetwork(): SerializedNet {
    const nodes: SerializedNode[] = [];
    const agents = this.getAllAgents();
    
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
        type: agent.type || 'unknown',
        value: JSON.parse(JSON.stringify(agent.value)),
        ports
      });
    }
    
    // Add connection information
    for (const agent of agents) {
      if ((agent as any).connections) {
        for (const connection of Object.values((agent as any).connections)) {
          const conn = connection as any;
          // Find source and target ports in the serialized nodes
          const sourceNode = nodes.find(node => node.id === conn.source._agentId);
          const targetNode = nodes.find(node => node.id === conn.destination._agentId);
          
          if (sourceNode && targetNode) {
            const sourcePort = sourceNode.ports.find(port => port.name === conn.sourcePort.name);
            const targetPort = targetNode.ports.find(port => port.name === conn.destinationPort.name);
            
            if (sourcePort && targetPort) {
              sourcePort.connection = targetPort.id;
              targetPort.connection = sourcePort.id;
            }
          }
        }
      }
    }
    
    return {
      id: this.network.id || this.networkId,
      name: this.network.name || this.networkId,
      timestamp: Date.now(),
      version: this.currentVersion,
      nodes
    };
  }
  
  /**
   * Serialize rules from the network
   */
  private serializeRules(): SerializedRule[] {
    const rules: SerializedRule[] = [];
    
    // Access the network's rules (this would need to be implemented in the Network class)
    const networkRules = (this.network as any).rules || [];
    
    for (const rule of networkRules) {
      rules.push(this.serializeRule(rule));
    }
    
    return rules;
  }
  
  /**
   * Serialize a single rule
   */
  private serializeRule(rule: any): SerializedRule {
    // For AnyRule (IActionRule or IRewriteRule), extract pattern from matchInfo
    let pattern: any = {};
    
    if (rule.matchInfo) {
      // Extract pattern from matchInfo
      pattern = {
        agentName1: rule.matchInfo.agentName1 || '',
        portName1: rule.matchInfo.portName1 || '',
        agentName2: rule.matchInfo.agentName2 || '',
        portName2: rule.matchInfo.portName2 || ''
      };
    }
    
    // Serialize implementation based on rule type
    let implementation = '';
    let ruleType: 'action' | 'rewrite' = 'action';
    
    if (rule.type === 'action') {
      // Serialize action function
      ruleType = 'action';
      implementation = rule.action?.toString() || '';
    } else if (rule.type === 'rewrite') {
      // Serialize rewrite pattern
      ruleType = 'rewrite';
      implementation = JSON.stringify(rule.rewrite || {});
    }
    
    return {
      id: rule.id || `rule-${rule.name}`,
      name: rule.name,
      type: ruleType,
      pattern,
      implementation,
      metadata: rule.metadata || {}
    };
  }
  
  /**
   * Serialize an agent
   */
  private serializeAgent(agent: IAgent): SerializedNode {
    return {
      id: agent._agentId,
      name: agent.name,
      type: agent.type || 'unknown',
      value: JSON.parse(JSON.stringify(agent.value)),
      ports: Object.entries(agent.ports).map(([name, port]) => ({
        id: `${agent._agentId}-${name}`,
        name,
        type: port.type
      }))
    };
  }
  
  /**
   * Serialize a connection
   */
  private serializeConnection(connection: IConnection): any {
    return {
      sourceAgentId: connection.source._agentId,
      sourcePortName: connection.sourcePort.name,
      targetAgentId: connection.destination._agentId,
      targetPortName: connection.destinationPort.name,
      name: connection.name
    };
  }
  
  /**
   * Deserialize an agent
   */
  private deserializeAgent(data: SerializedNode): IAgent | undefined {
    try {
      const agent = Agent(
        data.name,
        data.value,
        Object.fromEntries(
          data.ports.map(port => [
            port.name,
            Port(port.name, port.type as PortTypes)
          ])
        )
      );

      // Set agent ID
      Object.defineProperty(agent, '_agentId', {
        value: data.id,
        writable: false,
        configurable: false
      });

      this.network.addAgent(agent);
      return agent;
    } catch (error) {
      this.log('error', `Error deserializing agent: ${data.id}`, error);
      return undefined;
    }
  }
  
  /**
   * Deserialize a connection
   */
  private deserializeConnection(sourceId: string, sourcePortName: string, targetPortId: string): IConnection | undefined {
    try {
      // Parse the target port ID to get agent ID and port name
      const [targetAgentId, targetPortName] = targetPortId.split('-');
      
      // Find the agents
      const sourceAgent = this.network.getAgent(sourceId);
      const targetAgent = this.network.getAgent(targetAgentId);
      
      if (sourceAgent && targetAgent) {
        // Get the ports
        const sourcePort = sourceAgent.ports[sourcePortName];
        const targetPort = targetAgent.ports[targetPortName];
        
        if (sourcePort && targetPort) {
          // Connect the ports
          return this.network.connectPorts(sourcePort, targetPort);
        }
      }
      
      return undefined;
    } catch (error) {
      this.log('error', `Error deserializing connection`, error);
      return undefined;
    }
  }
  
  /**
   * Deserialize a rule
   */
  private deserializeRule(ruleData: SerializedRule): IRule | undefined {
    try {
      if (ruleData.type === 'action') {
        // Parse the action function
        let actionFn;
        try {
          // WARNING: This is a security risk if the source is untrusted
          // In a real implementation, use a safer approach
          actionFn = eval(`(${ruleData.implementation})`);
        } catch (error) {
          this.log('error', `Error parsing action function for rule ${ruleData.name}`, error);
          return undefined;
        }

        // Create or find the connection based on the pattern
        const sourceAgent = this.network.findAgents({ name: ruleData.pattern.agentName1 })[0];
        const targetAgent = this.network.findAgents({ name: ruleData.pattern.agentName2 })[0];
        
        let connection;
        if (sourceAgent && targetAgent) {
          const sourcePort = sourceAgent.ports[ruleData.pattern.portName1];
          const targetPort = targetAgent.ports[ruleData.pattern.portName2];
          if (sourcePort && targetPort) {
            connection = this.network.connectPorts(sourcePort, targetPort);
          }
        }

        // Create the rule with the connection
        const rule = {
          name: ruleData.name,
          type: 'action' as const,
          matchInfo: ruleData.pattern,
          action: actionFn,
          connection: connection!
        };
        
        if (connection) {
          this.network.addRule(rule);
          return rule;
        }
        return undefined;
      } 
      else if (ruleData.type === 'rewrite') {
        // Parse the rewrite pattern
        let rewritePattern;
        try {
          rewritePattern = JSON.parse(ruleData.implementation);
        } catch (error) {
          this.log('error', `Error parsing rewrite pattern for rule ${ruleData.name}`, error);
          return undefined;
        }

        // Create or find the connection for rewrite rule
        const sourceAgent = this.network.findAgents({ name: ruleData.pattern.agentName1 })[0];
        const targetAgent = this.network.findAgents({ name: ruleData.pattern.agentName2 })[0];
        
        let connection;
        if (sourceAgent && targetAgent) {
          const sourcePort = sourceAgent.ports[ruleData.pattern.portName1];
          const targetPort = targetAgent.ports[ruleData.pattern.portName2];
          if (sourcePort && targetPort) {
            connection = this.network.connectPorts(sourcePort, targetPort);
          }
        }

        if (!connection) {
          this.log('error', `Could not create connection for rewrite rule ${ruleData.name}`);
          return undefined;
        }

        // Create the rewrite rule using pattern
        const rule = {
          name: ruleData.name,
          type: 'rewrite' as const,
          matchInfo: ruleData.pattern,
          rewrite: rewritePattern,
          connection: connection,
          action: () => {} // Empty action for rewrite rules
        };
        
        this.network.addRule(rule);
        return rule;
      }
      
      this.log('error', `Unknown rule type: ${ruleData.type}`);
      return undefined;
    } catch (error) {
      this.log('error', `Error deserializing rule: ${ruleData.name}`, error);
      return undefined;
    }
  }
}

/**
 * Create a distributed network server
 */
export function createDistributedNetworkServer(
  options: Partial<DistributedNetworkOptions> = {}
): DistributedNetwork {
  // Create a network with server role
  return new DistributedNetwork('server-network', {
    ...options,
    role: 'server'
  });
}

/**
 * Create a distributed network client
 */
export function createDistributedNetworkClient(
  serverUrl: string,
  options: Partial<DistributedNetworkOptions> = {}
): DistributedNetwork {
  // Create a network with client role
  return new DistributedNetwork('client-network', {
    ...options,
    role: 'client',
    serverUrl
  });
}

/**
 * Create a peer-to-peer distributed network
 */
export function createDistributedNetworkPeer(
  options: Partial<DistributedNetworkOptions> = {}
): DistributedNetwork {
  // Create a network with peer role
  return new DistributedNetwork('peer-network', {
    ...options,
    role: 'peer'
  });
}

// Export types and functions
export {
  SerializedNet, SerializedNode, SerializedPort,
  NetworkMessage, NetworkNode, NetworkBoundary
};