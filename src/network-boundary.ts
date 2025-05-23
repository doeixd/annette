/**
 * Network Boundary Implementation for Annette
 * 
 * This module provides:
 * 1. Network boundary for cross-network communication
 * 2. Message passing between networks
 * 3. Operation-based CRDT support
 */
import { Agent, IAgent, AgentId } from "./agent";
import { IConnection } from "./connection";
import { INetwork } from "./network";
import { Port } from "./port";
import { ActionRule } from "./rule";
import { UpdateOperation, Updates, Updater } from "./updater";
import { VersionedChange } from "./connection-history";

// Network message types
export type NetworkMessageType = 'interaction' | 'sync' | 'agent-create' | 'agent-update' | 'agent-delete';

/**
 * Network message for cross-network communication
 */
export interface NetworkMessage {
  id: string;
  type: NetworkMessageType;
  sourceNetworkId: string;
  targetNetworkId: string;
  sourceNodeId: string;
  targetNodeId?: string;
  timestamp: number;
  data: any;
  parentMessageId?: string;
}

/**
 * Network node for cross-network representation
 */
export interface NetworkNode {
  id: string;
  networkId: string;
  type: string;
  timestamp: number;
  origin: string;
  value: any;
}

/**
 * Network boundary for connecting networks
 */
export class NetworkBoundary {
  private sourceNetwork: INetwork;
  private targetNetwork: INetwork;
  private proxyNodes = new Map<string, IAgent>();
  private pendingMessages: NetworkMessage[] = [];
  private messageHandlers: Map<NetworkMessageType, (message: NetworkMessage) => void> = new Map();
  private localNodeIds = new Set<string>();
  private remoteMappings = new Map<string, string>(); // Map remote ID to local proxy ID
  
  /**
   * Create a network boundary
   * @param sourceNetwork The source network
   * @param targetNetwork The target network
   */
  constructor(sourceNetwork: INetwork, targetNetwork: INetwork) {
    this.sourceNetwork = sourceNetwork;
    this.targetNetwork = targetNetwork;
    
    // Set up default message handlers
    this.setupDefaultHandlers();
  }
  
  /**
   * Register a node with the boundary
   * @param node The node to register
   * @param isLocal Whether the node is in the source network
   */
  registerNode(node: IAgent, isLocal: boolean = true): void {
    if (isLocal) {
      this.localNodeIds.add(node._agentId);
    } else {
      // Create a proxy for the remote node
      const proxyNode = this.createProxyNode(node);
      this.proxyNodes.set(node._agentId, proxyNode);
      this.remoteMappings.set(node._agentId, proxyNode._agentId);
    }
  }
  
  /**
   * Send a message across the boundary
   * @param message The message to send
   */
  sendMessage(message: NetworkMessage): void {
    // Add to pending messages
    this.pendingMessages.push(message);
    
    // Process immediately
    this.processMessage(message);
  }
  
  /**
   * Process a message
   * @param message The message to process
   */
  private processMessage(message: NetworkMessage): void {
    // Check if we have a handler for this message type
    const handler = this.messageHandlers.get(message.type);
    
    if (handler) {
      handler(message);
    } else {
      console.warn(`No handler for message type: ${message.type}`);
    }
  }
  
  /**
   * Register a message handler
   * @param type The message type to handle
   * @param handler The handler function
   */
  registerHandler(type: NetworkMessageType, handler: (message: NetworkMessage) => void): void {
    this.messageHandlers.set(type, handler);
  }
  
  /**
   * Create a proxy node for a remote node
   * @param remoteNode The remote node to proxy
   * @returns A proxy agent
   */
  private createProxyNode(remoteNode: IAgent): IAgent {
    // Create a proxy agent with the same value
    const proxyAgent = Agent(
      `Proxy${remoteNode.name}`,
      JSON.parse(JSON.stringify(remoteNode.value)),
      {
        main: Port("main", "main"),
        remote: Port("remote", "remote")
      },
      "proxy"
    );
    
    // Add metadata
    proxyAgent.value.__remoteId = remoteNode._agentId;
    proxyAgent.value.__remoteNetwork = remoteNode.value.__networkId || "unknown";
    
    // Add to the target network
    this.targetNetwork.addAgent(proxyAgent);
    
    return proxyAgent;
  }
  
  /**
   * Set up default message handlers
   */
  private setupDefaultHandlers(): void {
    // Handler for interaction messages
    this.registerHandler('interaction', (message) => {
      // Find the local proxy for the remote node
      const localProxyId = this.remoteMappings.get(message.sourceNodeId);
      
      if (!localProxyId) {
        console.warn(`No local proxy for remote node: ${message.sourceNodeId}`);
        return;
      }
      
      // Find the local target node
      const localTargetAgent = this.targetNetwork.getAgent(message.targetNodeId!);
      
      if (!localTargetAgent) {
        console.warn(`No local target node: ${message.targetNodeId}`);
        return;
      }
      
      // Find the local proxy
      const localProxyAgent = this.targetNetwork.getAgent(localProxyId);
      
      if (!localProxyAgent) {
        console.warn(`No local proxy node: ${localProxyId}`);
        return;
      }
      
      // Connect the proxy to the target
      this.targetNetwork.connectPorts(
        localProxyAgent.ports.main,
        localTargetAgent.ports.main
      );
      
      // Reduce the network to apply the interaction
      this.targetNetwork.reduce();
    });
    
    // Handler for sync messages
    this.registerHandler('sync', (message) => {
      // Check if the target network supports applying changes
      if (typeof this.targetNetwork.applyChanges === 'function') {
        // Apply the changes
        this.targetNetwork.applyChanges(message.data.changes);
      } else {
        console.warn("Target network does not support applying changes");
      }
    });
    
    // Handler for agent creation
    this.registerHandler('agent-create', (message) => {
      // Create a new agent
      const agent = Agent(
        message.data.name,
        message.data.value,
        message.data.ports
      );
      
      // Register the agent
      this.registerNode(agent, false);
      
      // Add to the target network
      this.targetNetwork.addAgent(agent);
    });
    
    // Handler for agent updates
    this.registerHandler('agent-update', (message) => {
      // Find the local proxy
      const localProxyId = this.remoteMappings.get(message.sourceNodeId);
      
      if (!localProxyId) {
        console.warn(`No local proxy for remote node: ${message.sourceNodeId}`);
        return;
      }
      
      // Find the local proxy agent
      const localProxyAgent = this.targetNetwork.getAgent(localProxyId);
      
      if (!localProxyAgent) {
        console.warn(`No local proxy node: ${localProxyId}`);
        return;
      }
      
      // Update the proxy agent's value
      localProxyAgent.value = {
        ...localProxyAgent.value,
        ...message.data.value,
        __remoteId: message.sourceNodeId,
        __remoteNetwork: message.sourceNetworkId
      };
    });
    
    // Handler for agent deletion
    this.registerHandler('agent-delete', (message) => {
      // Find the local proxy
      const localProxyId = this.remoteMappings.get(message.sourceNodeId);
      
      if (!localProxyId) {
        console.warn(`No local proxy for remote node: ${message.sourceNodeId}`);
        return;
      }
      
      // Remove the proxy from the target network
      this.targetNetwork.removeAgent(localProxyId);
      
      // Remove from mappings
      this.remoteMappings.delete(message.sourceNodeId);
      this.proxyNodes.delete(message.sourceNodeId);
    });
  }
  
  /**
   * Synchronize changes between networks
   * @param changes Versioned changes to apply
   */
  synchronizeChanges(changes: VersionedChange[]): void {
    // Create a sync message
    const message: NetworkMessage = {
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: 'sync',
      sourceNetworkId: this.sourceNetwork.id,
      targetNetworkId: this.targetNetwork.id,
      sourceNodeId: 'network-boundary',
      timestamp: Date.now(),
      data: {
        changes
      }
    };
    
    // Send the message
    this.sendMessage(message);
  }
  
  /**
   * Create a network boundary between two networks
   * @param network1 First network
   * @param network2 Second network
   * @returns A pair of network boundaries
   */
  static createBidirectional(
    network1: INetwork,
    network2: INetwork
  ): [NetworkBoundary, NetworkBoundary] {
    const boundary1to2 = new NetworkBoundary(network1, network2);
    const boundary2to1 = new NetworkBoundary(network2, network1);
    
    return [boundary1to2, boundary2to1];
  }
}

/**
 * Create a network boundary agent
 * @param networkId The network ID
 * @param metadata Optional metadata
 * @returns A network boundary agent
 */
export function createNetworkBoundaryAgent(
  networkId: string,
  metadata?: Record<string, any>
): IAgent<"NetworkBoundary", { networkId: string, messages: NetworkMessage[], metadata?: Record<string, any> }> {
  return Agent("NetworkBoundary", {
    networkId,
    messages: [],
    metadata
  }, {
    main: Port("main", "main"),
    send: Port("send", "aux"),
    receive: Port("receive", "aux")
  });
}

/**
 * Register network boundary rules
 * @param network The network to register rules with
 */
export function registerNetworkBoundaryRules(network: INetwork): void {
  // Rule for sending messages
  network.addRule(ActionRule(
    { name: "NetworkBoundary-Send", type: "action" },
    { 
      agentName1: "NetworkBoundary", 
      portName1: "send", 
      agentName2: "MessageSender", 
      portName2: "main" 
    },
    (boundary, sender, network) => {
      // Get the message from the sender
      const message = sender.value.message;
      
      // Add to boundary's messages
      boundary.value.messages.push(message);
      
      // Create a message receipt
      const receipt = Agent("MessageReceipt", {
        messageId: message.id,
        timestamp: Date.now(),
        status: 'sent'
      });
      
      // Add the receipt to the network
      network.addAgent(receipt);
      
      return [boundary, sender, receipt];
    }
  ));
  
  // Rule for receiving messages
  network.addRule(ActionRule(
    { name: "NetworkBoundary-Receive", type: "action" },
    { 
      agentName1: "NetworkBoundary", 
      portName1: "receive", 
      agentName2: "MessageReceiver", 
      portName2: "main" 
    },
    (boundary, receiver, network) => {
      // Check if there are any messages to deliver
      if (boundary.value.messages.length > 0) {
        // Get the oldest message
        const message = boundary.value.messages[0];
        
        // Remove from the boundary's messages
        boundary.value.messages = boundary.value.messages.slice(1);
        
        // Set the message on the receiver
        receiver.value.message = message;
        
        // Create a message receipt
        const receipt = Agent("MessageReceipt", {
          messageId: message.id,
          timestamp: Date.now(),
          status: 'received'
        });
        
        // Add the receipt to the network
        network.addAgent(receipt);
        
        return [boundary, receiver, receipt];
      }
      
      return [boundary, receiver];
    }
  ));
}

/**
 * Create a message sender agent
 * @param message The message to send
 * @returns A message sender agent
 */
export function createMessageSender(
  message: NetworkMessage
): IAgent<"MessageSender", { message: NetworkMessage }> {
  return Agent("MessageSender", {
    message
  }, {
    main: Port("main", "main")
  });
}

/**
 * Create a message receiver agent
 * @returns A message receiver agent
 */
export function createMessageReceiver(): IAgent<"MessageReceiver", { message?: NetworkMessage }> {
  return Agent("MessageReceiver", {
    message: undefined
  }, {
    main: Port("main", "main"),
    process: Port("process", "aux")
  });
}