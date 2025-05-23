# Distributed Networks in Annette

This guide explains Annette's comprehensive system for creating distributed interaction nets that can span across servers, clients, and different execution environments.

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture](#architecture)
3. [Network Serialization](#network-serialization)
4. [Client-Server Model](#client-server-model)
5. [Peer-to-Peer Model](#peer-to-peer-model)
6. [Synchronization Protocol](#synchronization-protocol)
7. [Transport Mechanisms](#transport-mechanisms)
8. [Security Considerations](#security-considerations)
9. [API Reference](#api-reference)
10. [Usage Examples](#usage-examples)

## Introduction

Distributed Networks in Annette allow interaction nets to be spread across different execution environments. This enables building applications such as:

- Real-time collaborative tools with shared state
- Multi-user games with distributed computation
- Edge computing systems with logic at both client and server
- Resilient applications that can operate offline and sync later
- Federated systems where multiple servers communicate

## Architecture

The distributed networks system consists of the following components:

1. **DistributedNetwork**: The main class representing a node in a distributed network
2. **Serialization Layer**: For converting networks (including rules) to a transportable format
3. **Transport Layer**: For sending network updates between nodes
4. **Synchronization Protocol**: For keeping networks in sync across nodes
5. **Change Tracking**: For efficiently transmitting only what has changed

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Server      │     │     Client 1    │     │     Client 2    │
│                 │     │                 │     │                 │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
│  │ Annette   │  │     │  │ Annette   │  │     │  │ Annette   │  │
│  │ Network   │◄─┼─────┼──┤ Network   │◄─┼─────┼──┤ Network   │  │
│  └───────────┘  │     │  └───────────┘  │     │  └───────────┘  │
│        ▲        │     │        ▲        │     │        ▲        │
│        │        │     │        │        │     │        │        │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
│  │ Distributed│◄─┼─────┼─►│ Distributed│◄─┼─────┼─►│ Distributed│  │
│  │ Network    │  │     │  │ Network    │  │     │  │ Network    │  │
│  └───────────┘  │     │  └───────────┘  │     │  └───────────┘  │
│        ▲        │     │        ▲        │     │        ▲        │
└────────┼────────┘     └────────┼────────┘     └────────┼────────┘
         │                       │                       │
         │       Transport       │                       │
         └───────────────────────┴───────────────────────┘
                    (WebSocket, HTTP, etc.)
```

## Network Serialization

### Serializing the Entire Network

Annette's distributed network system can serialize the complete state of a network, including:

1. **Agents**: All agents with their types, values, and ports
2. **Connections**: All connections between agents
3. **Rules**: All interaction rules, including action rules and rewrite rules
4. **Metadata**: Version information, schema, and network capabilities

```typescript
// Serialize a network
const distributedNetwork = new DistributedNetwork(network);
const serialized = distributedNetwork.serialize();

// The serialized format looks like:
{
  id: "network-123",
  name: "counter-network",
  timestamp: 1623456789,
  version: 42,
  schema: "1.0",
  role: "server",
  capabilities: ["basic", "sync", "rules"],
  nodes: [
    {
      id: "agent-1",
      name: "Counter",
      type: "Counter",
      value: { count: 5 },
      ports: [
        {
          id: "agent-1-main",
          name: "main",
          type: "main",
          connection: "agent-2-main"
        },
        {
          id: "agent-1-increment",
          name: "increment",
          type: "aux"
        }
      ]
    },
    // More agents...
  ],
  rules: [
    {
      id: "rule-1",
      name: "IncrementRule",
      type: "action",
      pattern: {
        agentName1: "Counter",
        portName1: "increment",
        agentName2: "Incrementer",
        portName2: "main"
      },
      implementation: "function(counter, incrementer) { ... }"
    },
    // More rules...
  ]
}
```

### Rule Serialization

Rules deserve special attention because they contain executable code:

```typescript
// Action rule serialization
const actionRule = {
  id: "rule-1",
  name: "IncrementRule",
  type: "action",
  pattern: {
    agentName1: "Counter",
    portName1: "increment",
    agentName2: "Incrementer",
    portName2: "main"
  },
  implementation: "function(counter, incrementer) { counter.value.count += incrementer.value.amount; return [counter, incrementer]; }"
};

// Rewrite rule serialization
const rewriteRule = {
  id: "rule-2",
  name: "DuplicateRule",
  type: "rewrite",
  pattern: {
    agentName1: "Value",
    portName1: "main",
    agentName2: "Duplicator",
    portName2: "main"
  },
  implementation: JSON.stringify({
    newAgents: [
      { name: "Value", initialValue: 0, _templateId: "value1" },
      { name: "Value", initialValue: 0, _templateId: "value2" }
    ],
    internalConnections: [],
    portMapAgent1: { /* ... */ },
    portMapAgent2: { /* ... */ }
  })
};
```

## Client-Server Model

The distributed networks system supports a traditional client-server architecture:

### Server Setup

```typescript
import { 
  Network, createDistributedNetworkServer 
} from 'annette';

// Create base network
const network = Network("app-server");

// Add agents and rules
// ...

// Create a distributed network server
const server = createDistributedNetworkServer({
  serverUrl: 'ws://localhost:3000',
  // Configure transport
  transportOptions: {
    // Set up a WebSocket server
    // ...
  }
});

// Listen for connections
server.onConnectionChange((status) => {
  console.log(`Server connection status: ${status}`);
});

// Add more agents/rules after initialization
server.addAgent(newAgent);
server.addRule(newRule);
```

### Client Setup

```typescript
import { 
  Network, createDistributedNetworkClient 
} from 'annette';

// Create base network
const network = Network("app-client");

// Add client-specific agents
// ...

// Create a distributed network client
const client = createDistributedNetworkClient('ws://your-server.com', {
  // Configure sync interval
  syncInterval: 1000,
  
  // Configure transport
  transport: 'websocket',
  transportOptions: {
    // Additional WebSocket options
    // ...
  }
});

// Listen for connection changes
client.onConnectionChange((status) => {
  console.log(`Client connection status: ${status}`);
  
  if (status === 'connected') {
    // Do something when connected
  }
});

// Access the underlying network
const clientNetwork = client.getNetwork();
```

## Peer-to-Peer Model

For applications that don't need a central server, the distributed networks system supports a peer-to-peer model:

```typescript
import { createDistributedNetworkPeer } from 'annette';

// Create a peer node
const peer = createDistributedNetworkPeer({
  // Peer discovery options
  transportOptions: {
    // Signaling server or other discovery mechanism
    discoveryUrl: 'wss://signaling.example.com',
    
    // Custom transport for peer connections
    connect: ({ peerId, onMessage, onConnect, onDisconnect }) => {
      // Set up peer connections
      // ...
      
      return {
        send: (message) => {
          // Send message to other peers
        },
        
        close: () => {
          // Close connections
        }
      };
    }
  }
});

// Connect to other peers
peer.connect();

// Send custom messages to peers
peer.sendCustomMessage('peer-123', 'chat-message', {
  text: 'Hello, peer!',
  timestamp: Date.now()
});
```

## Synchronization Protocol

The distributed networks system uses a sophisticated protocol for synchronizing networks:

### Message Types

1. **Join**: Sent when a client joins the network
   ```typescript
   {
     type: 'join',
     sourceId: 'client-123',
     targetId: 'broadcast',
     timestamp: 1623456789,
     messageId: 'join-123',
     payload: {
       networkId: 'counter-network',
       peerId: 'client-123',
       capabilities: ['basic', 'sync'],
       version: 0
     }
   }
   ```

2. **Snapshot**: Sends a complete network state
   ```typescript
   {
     type: 'snapshot',
     sourceId: 'server',
     targetId: 'client-123',
     timestamp: 1623456789,
     messageId: 'snapshot-123',
     payload: {
       // Full serialized network
     }
   }
   ```

3. **Update**: Sends incremental changes
   ```typescript
   {
     type: 'update',
     sourceId: 'client-123',
     targetId: 'broadcast',
     timestamp: 1623456789,
     messageId: 'update-123',
     payload: {
       networkId: 'counter-network',
       updates: [
         {
           type: 'agent-update',
           targetId: 'agent-1',
           data: { /* updated agent data */ },
           timestamp: 1623456789,
           version: 43
         }
       ],
       baseVersion: 42,
       newVersion: 43
     }
   }
   ```

4. **Query**: Requests information from other nodes
   ```typescript
   {
     type: 'query',
     sourceId: 'client-123',
     targetId: 'server',
     timestamp: 1623456789,
     messageId: 'query-123',
     payload: {
       type: 'snapshot',
       version: 42
     }
   }
   ```

### Synchronization Process

1. **Initial Connection**:
   - Client sends a 'join' message
   - Server responds with a 'snapshot' message
   - Client applies the snapshot

2. **Ongoing Synchronization**:
   - Each node tracks its own version number
   - When changes occur, the version number is incremented
   - Nodes periodically send 'update' messages with changes since the last sync
   - Recipients apply changes if they're based on the correct version
   - If versions don't match, a new snapshot is requested

3. **Conflict Resolution**:
   - Last-write-wins by default
   - For specialized data structures, CRDT principles are applied

## Transport Mechanisms

The distributed networks system supports multiple transport mechanisms:

### WebSocket

```typescript
const network = createDistributedNetworkClient('ws://example.com', {
  transport: 'websocket'
});
```

### PostMessage (for iframes/workers)

```typescript
const network = createDistributedNetworkClient('', {
  transport: 'postmessage',
  transportOptions: {
    target: window.parent,
    origin: 'https://example.com'
  }
});
```

### Custom Transport

```typescript
const network = createDistributedNetworkClient('', {
  transport: 'custom',
  transportOptions: {
    connect: ({ peerId, onMessage, onConnect, onDisconnect }) => {
      // Custom connection logic
      
      return {
        send: (message) => {
          // Custom send logic
        },
        
        close: () => {
          // Custom close logic
        }
      };
    }
  }
});
```

## Security Considerations

When using distributed networks, especially with serialized rules, there are important security considerations:

### Rule Execution

Rule serialization involves converting functions to strings and then back to functions, which carries security risks:

```typescript
// WARNING: This is a security risk if the source is untrusted
actionFn = eval(`(${ruleData.implementation})`);
```

To mitigate this risk:

1. **Trusted Sources**: Only accept rules from trusted sources
2. **Sandboxing**: Run untrusted rules in a sandbox environment
3. **Rule Verification**: Implement a verification system for rules
4. **Capability Restrictions**: Limit what rules can do based on their source

### Authentication and Authorization

The distributed networks system supports authentication:

```typescript
const client = createDistributedNetworkClient('ws://example.com', {
  authorization: 'Bearer your-auth-token'
});
```

## API Reference

### DistributedNetwork

```typescript
class DistributedNetwork {
  // Constructor
  constructor(nameOrNetwork: string | INetwork, options?: DistributedNetworkOptions);
  
  // Connection methods
  connect(): void;
  disconnect(): void;
  
  // Network manipulation
  addRule(rule: IRule): void;
  addAgent(agent: IAgent): void;
  connectPorts(port1: IBoundPort, port2: IBoundPort): IConnection | undefined;
  
  // Serialization
  serialize(): SerializedDistributedNet;
  
  // Event listeners
  onConnectionChange(listener: (status: ConnectionStatus) => void): () => void;
  
  // Access methods
  getNetwork(): INetwork;
  getStatus(): ConnectionStatus;
  
  // Synchronization
  applyUpdates(updates: NetworkUpdateMessage): boolean;
  
  // Messaging
  sendCustomMessage(targetId: string | 'broadcast', type: string, payload: any): string;
}
```

### Factory Functions

```typescript
// Create a server
function createDistributedNetworkServer(
  options?: DistributedNetworkOptions
): DistributedNetwork;

// Create a client
function createDistributedNetworkClient(
  serverUrl: string,
  options?: DistributedNetworkOptions
): DistributedNetwork;

// Create a peer
function createDistributedNetworkPeer(
  options?: DistributedNetworkOptions
): DistributedNetwork;
```

### Configuration Options

```typescript
interface DistributedNetworkOptions {
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
```

## Usage Examples

### Real-time Collaborative Counter

```typescript
// Server
const serverNetwork = Network("counter-server");

// Create a counter
const counter = Agent("Counter", { value: 0 });
serverNetwork.addAgent(counter);

// Create a rule to increment the counter
serverNetwork.addRule(ActionRule(
  { name: "Increment", type: "action" },
  { 
    agentName1: "Counter", 
    portName1: "increment", 
    agentName2: "Incrementer", 
    portName2: "main" 
  },
  (counter, incrementer) => {
    counter.value.value += incrementer.value.amount;
    return [counter, incrementer];
  }
));

// Create a distributed server
const server = createDistributedNetworkServer({
  serverUrl: 'ws://localhost:3000'
});

// Client
const clientNetwork = Network("counter-client");

// Create a counter view
const counterView = Agent("CounterView", { value: 0 });
clientNetwork.addAgent(counterView);

// Create a button agent
const incrementButton = Agent("IncrementButton", { pressed: false });
clientNetwork.addAgent(incrementButton);

// Create a distributed client
const client = createDistributedNetworkClient('ws://localhost:3000');

// When the button is pressed
function onButtonClick() {
  // Create an incrementer
  const incrementer = Agent("Incrementer", { amount: 1 });
  
  // Add to network
  const network = client.getNetwork();
  network.addAgent(incrementer);
  
  // Find the counter
  const counters = network.findAgents({ name: "Counter" });
  
  if (counters.length > 0) {
    // Connect to increment port
    network.connectPorts(counters[0].ports.increment, incrementer.ports.main);
    
    // Reduce to apply the rule
    network.reduce();
  }
}
```

### Collaborative Document Editor

```typescript
// Create a shared document network
const docNetwork = Network("document-editor");

// Create the document agent
const document = Agent("Document", {
  text: "",
  cursor: { position: 0, user: "" }
});
docNetwork.addAgent(document);

// Create distributed network
const distributedNetwork = new DistributedNetwork(docNetwork, {
  networkId: "doc-123",
  syncInterval: 100 // Sync every 100ms for low latency
});

// Create an edit rule
docNetwork.addRule(ActionRule(
  { name: "Edit", type: "action" },
  { 
    agentName1: "Document", 
    portName1: "edit", 
    agentName2: "TextEdit", 
    portName2: "main" 
  },
  (document, edit) => {
    // Apply the edit operation
    if (edit.value.type === 'insert') {
      document.value.text = 
        document.value.text.substring(0, edit.value.position) +
        edit.value.text +
        document.value.text.substring(edit.value.position);
    } else if (edit.value.type === 'delete') {
      document.value.text = 
        document.value.text.substring(0, edit.value.position) +
        document.value.text.substring(edit.value.position + edit.value.length);
    }
    
    return [document, edit];
  }
));

// UI function to handle text input
function onTextInput(text, position) {
  // Create an edit operation
  const edit = Agent("TextEdit", {
    type: 'insert',
    position,
    text,
    user: 'current-user'
  });
  
  // Get the network
  const network = distributedNetwork.getNetwork();
  
  // Add the edit agent
  network.addAgent(edit);
  
  // Find the document
  const documents = network.findAgents({ name: "Document" });
  
  if (documents.length > 0) {
    // Connect edit to document
    network.connectPorts(documents[0].ports.edit, edit.ports.main);
    
    // Reduce to apply the edit
    network.reduce();
  }
}

// Connect to other users
distributedNetwork.connect();
```

## Conclusion

Annette's distributed networks system provides a powerful foundation for building collaborative, distributed applications using interaction nets. By combining the unique properties of interaction nets with modern distributed systems principles, it enables a new class of applications that can seamlessly span multiple devices and execution environments.

The system supports:

- Complete network serialization, including rules
- Multiple transport mechanisms
- Flexible synchronization protocol
- Both client-server and peer-to-peer architectures
- Real-time collaboration with minimal latency

This creates opportunities for applications that were previously difficult to implement, from collaborative tools to distributed computing systems, all while maintaining the deterministic, composable nature of interaction nets.