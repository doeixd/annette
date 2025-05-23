# Specialized Port Types in Annette

This document explains the specialized port types in Annette: wait/hold ports for asynchronous operations and sync/remote ports for network boundaries.

## Overview

Annette now supports four specialized port types in addition to the standard main/aux ports:

1. **Wait Ports**: Used by agents that need to suspend execution while waiting for an effect
2. **Hold Ports**: Used by effect handlers to indicate they're processing an effect
3. **Sync Ports**: Used by agents that need to synchronize state across network boundaries
4. **Remote Ports**: Used by agents that represent remote state

## Asynchronous Operations with Wait/Hold Ports

### Wait Ports

Wait ports allow agents to "suspend" while waiting for operations to complete. An agent with a wait port connected to an effect agent remains in a suspended state until the effect is processed and a result is delivered.

```javascript
// Create a component that uses wait ports
const component = Constructor({
  name: "UserProfile",
  data: null
});

// Connect to an effect using the wait port
network.connectPorts(component.ports.wait, fetchEffect.ports.wait);
```

### Hold Ports

Hold ports are used by handler agents to indicate they're processing an effect. When an effect agent's hold port connects to a handler's hold port, the handler executes the effect and eventually produces a result.

```javascript
// Create a handler with a hold port
const fetchHandler = HandlerAgent({
  'fetch': async (effect) => {
    // Async operation
    const response = await fetch(effect.url);
    return await response.json();
  }
});

// Connect an effect to the handler
network.connectPorts(fetchEffect.ports.hold, fetchHandler.ports.hold);
```

## Network Boundaries with Sync/Remote Ports

### Sync Ports

Sync ports are used by agents that need to share state across network boundaries. They expose a "synchronization surface" that can be serialized and transmitted.

```javascript
// Create an agent with a sync port
const sharedDocument = Agent("Document", {
  title: "Shared Document",
  content: "Initial content"
}, {
  main: { name: "main", type: "main" },
  sync: { name: "sync", type: "sync" }
});

// Connect to a sync agent
network.connectPorts(sharedDocument.ports.sync, syncAgent.ports.sync);
```

### Remote Ports

Remote ports are used by agents that represent state from another network. They act as proxies for remote agents.

```javascript
// Create a remote agent representing a document from another network
const remoteDocument = RemoteAgent(
  "network-123",  // Source network ID
  "doc-456",      // Source agent ID
  {
    title: "Remote Document",
    content: "Content from another network"
  }
);

// Connect to a sync agent
network.connectPorts(remoteDocument.ports.remote, syncAgent.ports.remote);
```

## Implementation Details

### Port Type Definition

Specialized port types are defined in the `port.ts` file:

```typescript
export type PortTypes = "main" | "aux" | "wait" | "hold" | "sync" | "remote";
```

### Type Guards

Each specialized port type has its own type guard:

```typescript
export type WaitPort<P extends IPort<string, PortTypes>> = P & { type: "wait" };
export type HoldPort<P extends IPort<string, PortTypes>> = P & { type: "hold" };
export type SyncPort<P extends IPort<string, PortTypes>> = P & { type: "sync" };
export type RemotePort<P extends IPort<string, PortTypes>> = P & { type: "remote" };

export type IsWaitPort<P extends IPort<string, PortTypes>> = P extends {
  type: "wait";
} ? WaitPort<P> : never;

// Similar for other port types
```

## Algebraic Effects System

The algebraic effects system uses wait/hold ports to implement asynchronous operations in a synchronous-looking way. The system consists of:

1. **EffectAgent**: Represents an intent to perform a side effect
2. **HandlerAgent**: Handles specific effect types
3. **ResultAgent**: Delivers results back to waiting agents
4. **ResultScanner**: Helps connect results to waiting agents

```typescript
// Creating an effect
const fetchEffect = EffectAgent({
  type: 'fetch',
  url: 'https://api.example.com/users/1'
});

// Creating a handler
const fetchHandler = HandlerAgent({
  'fetch': async (effect) => {
    const response = await fetch(effect.url);
    return await response.json();
  }
});

// Connecting a component to an effect
network.connectPorts(component.ports.wait, fetchEffect.ports.wait);

// Connecting an effect to a handler
network.connectPorts(fetchEffect.ports.hold, fetchHandler.ports.hold);
```

## Distributed Synchronization System

The distributed synchronization system uses sync/remote ports to synchronize state across network boundaries. The system consists of:

1. **SyncAgent**: Manages synchronization operations
2. **RemoteAgent**: Represents agents from another network
3. **SyncNetwork**: A network with built-in sync capabilities

```typescript
// Creating sync agents
const syncA = SyncAgent(networkA.id, "client-a");
const syncB = SyncAgent(networkB.id, "client-b");

// Collecting operations for sync
const operations = collectSyncOperations(networkA, "client-a", lastSyncTimestamp);

// Applying remote operations
applyRemoteOperations(networkB, operations);
```

## Use Cases

### Asynchronous Operations

- **API Calls**: Perform fetch operations without callbacks
- **File I/O**: Read/write files asynchronously
- **Timers**: Implement delays and timeouts
- **Database Operations**: Perform queries and wait for results

### Distributed Synchronization

- **Real-time Collaboration**: Synchronize document edits across clients
- **Multi-user Applications**: Keep shared state consistent
- **Client-Server Sync**: Synchronize between client and server
- **Offline-First Apps**: Queue changes while offline, sync when online

## Best Practices

1. **Connect Ports Correctly**: Always connect wait ports to wait ports and hold ports to hold ports
2. **Handle Errors**: Use ErrorResultAgent to handle failed effects
3. **Use ResultScanner**: When effects complete asynchronously, use ResultScanner to find waiting agents
4. **Minimize Sync Data**: Only sync necessary state changes
5. **Version Your Data**: Include version information in sync operations for conflict resolution