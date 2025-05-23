import { 
  Core, StdLib, Network, VectorClock, VersionedData, 
  ConflictResolver, ConflictResolutionStrategy, strategies,
  Simple
} from "../src";

/**
 * This example demonstrates the distributed systems features of Annette,
 * including Vector Clocks for robust versioning and Conflict Resolution
 * for handling concurrent changes.
 */

// Create a simple distributed document system
console.log("======= Vector Clocks and Conflict Resolution Example =======");

// 1. Basic Vector Clock operations
console.log("\n--- Vector Clock Basics ---");

// Create vector clocks for three nodes
const clockA = new VectorClock();
const clockB = new VectorClock();
const clockC = new VectorClock();

// Update the clocks to simulate operations on each node
clockA.increment("nodeA"); // A: {nodeA: 1}
console.log("Clock A after first increment:", clockA.toString());

clockB.increment("nodeB"); // B: {nodeB: 1}
clockB.merge(clockA);     // B: {nodeA: 1, nodeB: 1}
console.log("Clock B after merge with A:", clockB.toString());

clockC.increment("nodeC"); // C: {nodeC: 1}
console.log("Clock C initial state:", clockC.toString());

// Compare clocks
console.log("A before B?", clockA.isBefore(clockB)); // true
console.log("B before A?", clockB.isBefore(clockA)); // false
console.log("A concurrent with C?", clockA.isConcurrentWith(clockC)); // true

// 2. Versioned data with Vector Clocks
console.log("\n--- Versioned Data ---");

// Create a shared document with versioning
const documentA = new VersionedData<{text: string; edits: number}>(
  {text: "Initial content", edits: 0},
  clockA.clone()
);

const documentB = new VersionedData<{text: string; edits: number}>(
  {text: "Initial content", edits: 0},
  clockA.clone()  // Same initial version
);

// Node A makes a change
documentA.update({text: "Content edited by A", edits: 1}, "nodeA");
console.log("Document A after update:", documentA.value);
console.log("Document A version:", documentA.vectorClock.toString());

// Node B makes a concurrent change without seeing A's change
documentB.update({text: "Content modified by B", edits: 1}, "nodeB");
console.log("Document B after update:", documentB.value);
console.log("Document B version:", documentB.vectorClock.toString());

// 3. Conflict resolution
console.log("\n--- Conflict Resolution ---");

// Create a conflict resolver with multiple strategies
const resolver = new ConflictResolver();

// Define conflict metadata
const conflictMeta = {
  localTimestamp: Date.now(),
  remoteTimestamp: Date.now() + 100, // Remote is newer
  localNodeId: "nodeA",
  remoteNodeId: "nodeB",
  path: ["text"],
  localClock: documentA.vectorClock,
  remoteClock: documentB.vectorClock
};

// Try different resolution strategies
console.log("Original values - A:", documentA.value.text, "B:", documentB.value.text);

// Last write wins strategy
const lastWriteResult = resolver.resolve(
  documentA.value.text, 
  documentB.value.text, 
  conflictMeta,
  "lastWriteWins"
);
console.log("Last write wins result:", lastWriteResult);

// Keep local strategy
const keepLocalResult = resolver.resolve(
  documentA.value.text, 
  documentB.value.text, 
  conflictMeta,
  "keepLocal"
);
console.log("Keep local result:", keepLocalResult);

// Custom strategy for text
const customStrategy = strategies.customStrategy(
  "textMerge",
  (local, remote, metadata) => {
    if (typeof local === 'string' && typeof remote === 'string') {
      return `MERGED: ${local} + ${remote}`;
    }
    return remote;
  }
);

// Register the custom strategy
resolver.registerStrategy(customStrategy);

// Use the custom strategy
const customResult = resolver.resolve(
  documentA.value.text, 
  documentB.value.text, 
  conflictMeta,
  "textMerge"
);
console.log("Custom merge result:", customResult);

// 4. Using Conflict Resolution with Agents in a Network
console.log("\n--- Integration with Annette Network ---");

// Create a network for distributed document collaboration
const documentNetwork = Network("distributed-document-network");

// Create agents for each document replica
const docAgentA = Core.createAgent(
  "DocumentReplica", 
  { 
    id: "docA",
    content: documentA.value,
    vectorClock: documentA.vectorClock.toObject()
  }
);

const docAgentB = Core.createAgent(
  "DocumentReplica", 
  { 
    id: "docB",
    content: documentB.value,
    vectorClock: documentB.vectorClock.toObject()
  }
);

// Create a sync agent to resolve conflicts
const syncAgent = Core.createAgent(
  "DocumentSync",
  {
    resolverStrategies: ["textMerge", "lastWriteWins"],
    conflictCount: 0,
    lastResolution: null
  }
);

// Add agents to the network
documentNetwork.addAgent(docAgentA);
documentNetwork.addAgent(docAgentB);
documentNetwork.addAgent(syncAgent);

// Define a rule for synchronizing documents
const syncRule = Core.createRule(
  "sync-documents",
  docAgentA.ports.main,
  docAgentB.ports.main,
  (agentA, agentB, network) => {
    console.log("Synchronizing documents...");
    
    // Create vector clocks from the stored objects
    const clockA = VectorClock.fromObject(agentA.value.vectorClock);
    const clockB = VectorClock.fromObject(agentB.value.vectorClock);
    
    // Check if there's a conflict
    if (clockA.isConcurrentWith(clockB)) {
      console.log("Detected concurrent modifications - resolving conflict");
      
      // Resolve conflict using our resolver
      const resolvedText = resolver.resolve(
        agentA.value.content.text,
        agentB.value.content.text,
        {
          localTimestamp: Date.now() - 1000,
          remoteTimestamp: Date.now(),
          localNodeId: agentA.value.id,
          remoteNodeId: agentB.value.id,
          path: ["text"],
          localClock: clockA,
          remoteClock: clockB
        },
        "textMerge"
      );
      
      // Create a merged clock
      const mergedClock = clockA.clone();
      mergedClock.merge(clockB);
      
      // Update both agents with the resolved content
      agentA.value.content.text = resolvedText;
      agentB.value.content.text = resolvedText;
      
      // Update vector clocks
      agentA.value.vectorClock = mergedClock.toObject();
      agentB.value.vectorClock = mergedClock.toObject();
      
      console.log("Conflict resolved with merged content:", resolvedText);
    } else if (clockA.isBefore(clockB)) {
      // A is behind B, update A
      console.log("Document A is behind, updating from B");
      agentA.value.content = { ...agentB.value.content };
      agentA.value.vectorClock = agentB.value.vectorClock;
    } else {
      // B is behind A, update B
      console.log("Document B is behind, updating from A");
      agentB.value.content = { ...agentA.value.content };
      agentB.value.vectorClock = agentA.value.vectorClock;
    }
    
    return [agentA, agentB];
  }
);

// Add the sync rule to the network
documentNetwork.addRule(syncRule);

// Connect the document agents to trigger synchronization
documentNetwork.connectPorts(docAgentA.ports.main, docAgentB.ports.main);

// Perform one step of reduction
documentNetwork.step();

// Show the final state of both documents
console.log("\n--- Final Document States ---");
console.log("Document A:", docAgentA.value.content);
console.log("Document B:", docAgentB.value.content);
console.log("Vector Clock:", VectorClock.fromObject(docAgentA.value.vectorClock).toString());