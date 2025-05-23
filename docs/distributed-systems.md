# Distributed Systems in Annette

This document explains the distributed systems features in Annette, including vector clocks and conflict resolution strategies.

## Overview

Annette provides robust distributed systems capabilities:

1. **Vector Clocks**: For tracking causality in distributed environments
2. **Conflict Resolution**: Sophisticated strategies for resolving concurrent changes
3. **Versioned Data**: Combined data and versioning for distributed state
4. **Custom Strategies**: Extensible framework for application-specific conflict resolution

## Vector Clocks

Vector clocks provide a way to track causality between events in distributed systems:

```typescript
import { VectorClock } from 'annette';

// Create vector clocks for different nodes
const clockA = new VectorClock();
const clockB = new VectorClock();

// Node A makes a change
clockA.increment('A');
console.log('Clock A after A changes:', clockA.toString()); // {"A":1}

// Node B makes a change
clockB.increment('B');
console.log('Clock B after B changes:', clockB.toString()); // {"B":1}

// Node A receives B's changes and merges them
clockA.merge(clockB);
console.log('Clock A after merging B:', clockA.toString()); // {"A":1,"B":1}

// Node A makes another change
clockA.increment('A');
console.log('Clock A after another A change:', clockA.toString()); // {"A":2,"B":1}
```

### Key Vector Clock Operations

#### Creating Vector Clocks

```typescript
// Empty vector clock
const clock1 = new VectorClock();

// From an object
const clock2 = new VectorClock({ 'node1': 1, 'node2': 2 });

// From another clock
const clock3 = new VectorClock(clock2.toObject());

// From a string
const clock4 = VectorClock.fromString('{"node1":1,"node2":2}');
```

#### Updating Vector Clocks

```typescript
// Increment a node's counter
clock.increment('nodeA');

// Set a specific value
clock.set('nodeB', 5);

// Get a node's counter
const count = clock.get('nodeC'); // 0 if not set

// Merge with another clock
clock.merge(otherClock);
```

#### Comparing Vector Clocks

```typescript
// Check if this clock is causally before another
const isBefore = clockA.isBefore(clockB);

// Check if this clock is causally after another
const isAfter = clockA.isAfter(clockB);

// Check if this clock is concurrent with another
const isConcurrent = clockA.isConcurrentWith(clockB);

// Check if two clocks are equal
const isEqual = clockA.equals(clockB);
```

#### Serializing Vector Clocks

```typescript
// Convert to string
const str = clock.toString();

// Convert to object
const obj = clock.toObject();

// Create a deep copy
const copy = clock.clone();
```

## Versioned Data

Versioned data combines a value with a vector clock:

```typescript
import { VersionedData, VectorClock } from 'annette';

// Create versioned data
const data = new VersionedData(
  { title: 'Hello', content: 'World' },
  new VectorClock()
);

// Update the data
data.update({ title: 'Hello', content: 'Updated content' }, 'nodeA');

// Access the value and clock
console.log(data.value); // { title: 'Hello', content: 'Updated content' }
console.log(data.vectorClock.toString()); // {"nodeA":1}
```

## Conflict Resolution

Annette provides sophisticated conflict resolution strategies:

```typescript
import { 
  ConflictResolver, 
  conflictStrategies, 
  VectorClock, 
  VersionedData 
} from 'annette';

// Create versioned data on two nodes
const dataA = new VersionedData({ counter: 5 }, new VectorClock());
const dataB = new VersionedData({ counter: 5 }, new VectorClock());

// Update independently
dataA.update({ counter: 10 }, 'A');
dataB.update({ counter: 7 }, 'B');

// Create a conflict resolver
const resolver = new ConflictResolver();

// Resolve the conflict using a specific strategy
const resolved = resolver.resolve(
  dataA.value,
  dataB.value,
  {
    localTimestamp: Date.now() - 1000,
    remoteTimestamp: Date.now(),
    localNodeId: 'A',
    remoteNodeId: 'B',
    path: ['counter'],
    localClock: dataA.vectorClock,
    remoteClock: dataB.vectorClock
  },
  'lastWriteWins'
);

console.log('Resolved value:', resolved); // { counter: 7 }
```

### Built-in Conflict Resolution Strategies

Annette includes several built-in strategies:

#### keepLocal

Always uses the local value:

```typescript
const result = resolver.resolve(local, remote, metadata, 'keepLocal');
// result === local
```

#### keepRemote

Always uses the remote value:

```typescript
const result = resolver.resolve(local, remote, metadata, 'keepRemote');
// result === remote
```

#### lastWriteWins

Uses the value with the later timestamp:

```typescript
const result = resolver.resolve(local, remote, metadata, 'lastWriteWins');
// result === (metadata.remoteTimestamp > metadata.localTimestamp ? remote : local)
```

#### causalityBased

Uses vector clocks to determine causality:

```typescript
const result = resolver.resolve(local, remote, metadata, 'causalityBased');
// If local is causally before remote: result === remote
// If remote is causally before local: result === local
// If concurrent: falls back to lastWriteWins
```

#### mergeObjects

Merges object properties:

```typescript
const local = { a: 1, b: 2 };
const remote = { b: 3, c: 4 };
const result = resolver.resolve(local, remote, metadata, 'mergeObjects');
// result === { a: 1, b: 3, c: 4 }
```

### Custom Conflict Resolution Strategies

You can create custom strategies for application-specific conflict resolution:

```typescript
import { conflictStrategies } from 'annette';

// Create a custom strategy
const counterMergeStrategy = conflictStrategies.customStrategy(
  'counterMerge',
  (local, remote, metadata) => {
    // Take the maximum counter value
    return { counter: Math.max(local.counter, remote.counter) };
  }
);

// Register the strategy
resolver.registerStrategy(counterMergeStrategy);

// Use the strategy
const result = resolver.resolve(dataA.value, dataB.value, metadata, 'counterMerge');
// result === { counter: 10 }
```

### Composite Strategies

You can combine multiple strategies:

```typescript
// Create a composite strategy
const compositeStrategy = resolver.createCompositeStrategy(
  'mergeObjects',
  'lastWriteWins'
);

// Use the composite strategy
const result = resolver.resolve(local, remote, metadata, compositeStrategy.name);
```

### Type-Based and Path-Based Strategies

Different strategies can be applied based on data type or property path:

```typescript
// Type-based strategy
const typeStrategy = conflictStrategies.typeBasedStrategy({
  'counter': conflictStrategies.customStrategy(
    'maxCounter',
    (local, remote) => ({ value: Math.max(local.value, remote.value) })
  ),
  'text': conflictStrategies.lastWriteWins
}, conflictStrategies.mergeObjects);

// Path-based strategy
const pathStrategy = conflictStrategies.pathBasedStrategy({
  'user\\.name': conflictStrategies.lastWriteWins,
  'document\\.content': conflictStrategies.mergeObjects,
  'counters\\..*': conflictStrategies.customStrategy(
    'maxCounter',
    (local, remote) => Math.max(local, remote)
  )
}, conflictStrategies.keepLocal);
```

## Practical Example: Collaborative Document

Here's how to implement a collaborative document system:

```typescript
import {
  VectorClock,
  VersionedData,
  ConflictResolver,
  conflictStrategies
} from 'annette';

class CollaborativeDocument {
  private data: VersionedData<any>;
  private nodeId: string;
  private resolver: ConflictResolver;
  
  constructor(initialData: any, nodeId: string) {
    this.data = new VersionedData(initialData, new VectorClock());
    this.nodeId = nodeId;
    this.resolver = new ConflictResolver();
    
    // Register custom strategy for documents
    this.resolver.registerStrategy(conflictStrategies.customStrategy(
      'documentMerge',
      (local, remote, metadata) => {
        const result = { ...local };
        
        // Title uses LWW
        result.title = metadata.remoteTimestamp > metadata.localTimestamp
          ? remote.title
          : local.title;
        
        // For content, keep both versions if they conflict
        if (remote.content !== local.content && 
            metadata.localClock.isConcurrentWith(metadata.remoteClock)) {
          result.content = `${local.content}\n\n---\n\nCONFLICT: ${remote.content}`;
          result.hasConflicts = true;
        }
        
        // For revision, use the max value
        result.revision = Math.max(local.revision || 0, remote.revision || 0) + 1;
        
        // Comments are concatenated
        result.comments = [...(local.comments || []), ...(remote.comments || [])];
        
        return result;
      }
    ));
  }
  
  // Get the current document
  getData(): any {
    return this.data.value;
  }
  
  // Update the document
  update(newData: any): void {
    this.data.update(newData, this.nodeId);
  }
  
  // Receive an update from another node
  receive(remoteData: VersionedData<any>): void {
    // Check if remote is strictly newer
    if (remoteData.vectorClock.isAfter(this.data.vectorClock)) {
      this.data = remoteData.clone();
      return;
    }
    
    // Check if remote is strictly older
    if (remoteData.vectorClock.isBefore(this.data.vectorClock)) {
      return; // Ignore older version
    }
    
    // Handle concurrent changes
    const merged = this.resolver.resolve(
      this.data.value,
      remoteData.value,
      {
        localTimestamp: Date.now() - 1000,
        remoteTimestamp: Date.now(),
        localNodeId: this.nodeId,
        remoteNodeId: 'remote',
        path: [],
        localClock: this.data.vectorClock,
        remoteClock: remoteData.vectorClock
      },
      'documentMerge'
    );
    
    // Update the data with merged value
    const mergedClock = this.data.vectorClock.clone();
    mergedClock.merge(remoteData.vectorClock);
    
    this.data = new VersionedData(merged, mergedClock);
  }
}
```

## Advanced Topics

### Comparing with Other Versioning Approaches

| Approach | Pros | Cons |
|----------|------|------|
| Lamport Timestamps | Simple, lightweight | Cannot detect concurrent changes |
| Matrix Clocks | Complete history | High space complexity |
| Version Vectors | Efficient causality tracking | Requires node IDs |
| Vector Clocks | Detects causality violations | Can grow large with many nodes |

### Performance Considerations

1. **Storage Optimization**: Only store non-zero entries in vector clocks
2. **Compression**: Use techniques like run-length encoding for large clocks
3. **Node ID Management**: Use short, stable IDs for nodes
4. **Clock Pruning**: Periodically remove entries for inactive nodes

### Distributed Network Scenarios

#### Peer-to-Peer

In peer-to-peer networks, each node maintains its own vector clock and directly exchanges updates with peers:

```typescript
// Node A
const nodeA = {
  data: new VersionedData(initialValue, new VectorClock()),
  nodeId: 'A',
  
  update(newValue) {
    this.data.update(newValue, this.nodeId);
    this.broadcast(this.data);
  },
  
  receive(remoteData) {
    // Resolve conflicts and update local data
  },
  
  broadcast(data) {
    // Send data to all peers
  }
};
```

#### Client-Server

In client-server architectures, the server coordinates updates and maintains a master vector clock:

```typescript
// Server
const server = {
  data: new VersionedData(initialValue, new VectorClock()),
  clients: new Map(),
  
  handleClientUpdate(clientId, clientData) {
    // Resolve conflicts with master data
    // Update master data
    // Broadcast to all clients
  }
};

// Client
const client = {
  data: new VersionedData(initialValue, new VectorClock()),
  clientId: 'client1',
  
  update(newValue) {
    this.data.update(newValue, this.clientId);
    this.sendToServer(this.data);
  },
  
  receiveFromServer(serverData) {
    // Update local data with server's version
  }
};
```

#### Hybrid

Hybrid approaches combine aspects of peer-to-peer and client-server:

```typescript
// Node
const node = {
  localData: new VersionedData(initialValue, new VectorClock()),
  nodeId: 'node1',
  peers: new Map(),
  
  update(newValue) {
    this.localData.update(newValue, this.nodeId);
    this.syncWithPeers();
  },
  
  syncWithPeers() {
    // Sync with directly connected peers
  },
  
  syncWithServer() {
    // Periodically sync with server
  }
};
```

## Conclusion

Annette's distributed systems features provide a robust foundation for building collaborative and distributed applications:

1. **Vector Clocks** provide precise causality tracking
2. **Conflict Resolution Strategies** enable sophisticated handling of concurrent changes
3. **Versioned Data** combines values with versioning for distributed state
4. **Custom Strategies** allow application-specific conflict resolution logic

By leveraging these features, you can build distributed systems that correctly handle concurrent updates, maintain causal consistency, and provide intuitive conflict resolution.