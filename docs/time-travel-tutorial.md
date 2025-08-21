# Time Travel Tutorial

One of Annette's most powerful features is **built-in time travel** - the ability to go back in time and see exactly how your application's state changed. This tutorial will show you how to use time travel for debugging, undo functionality, and understanding state changes.

## What You'll Learn

- How to enable time travel in your networks
- How to take snapshots of your application state
- How to rollback to previous states
- How to compare different snapshots
- Real-world use cases for time travel

## Prerequisites

- Basic understanding of Annette agents and networks
- Completed the [Getting Started Tutorial](getting-started-tutorial.md)

## Step 1: Creating a Time Travel Network

Instead of using the regular `Network` function, use `TimeTravelNetwork`:

```typescript
import { Agent, TimeTravelNetwork, ActionRule } from 'annette';

// Create a time travel network
const net = TimeTravelNetwork('time-travel-counter');

const counter = Agent('Counter', { count: 0 });
const incrementer = Agent('Incrementer', { amount: 1 });

net.addAgent(counter);
net.addAgent(incrementer);

// Create a simple increment rule
const incrementRule = ActionRule(
  counter.ports.main,
  incrementer.ports.main,
  (counter, incrementer) => {
    counter.value.count += incrementer.value.amount;
    return [counter, incrementer];
  }
);

net.addRule(incrementRule);
```

**What you learned:**
- `TimeTravelNetwork` is a drop-in replacement for `Network`
- All the same methods work (addAgent, addRule, connectPorts, etc.)
- Time travel functionality is automatically enabled

## Step 2: Taking Snapshots

Snapshots capture the entire state of your network at a specific moment:

```typescript
import { Agent, TimeTravelNetwork, ActionRule } from 'annette';

const net = TimeTravelNetwork('time-travel-counter');
const counter = Agent('Counter', { count: 0 });
const incrementer = Agent('Incrementer', { amount: 1 });

net.addAgent(counter);
net.addAgent(incrementer);

const incrementRule = ActionRule(
  counter.ports.main,
  incrementer.ports.main,
  (counter, incrementer) => {
    counter.value.count += incrementer.value.amount;
    return [counter, incrementer];
  }
);

net.addRule(incrementRule);

// Take initial snapshot
const initialSnapshot = net.takeSnapshot('Initial state');
console.log('Initial count:', counter.value.count); // 0

// Make some changes
net.connectPorts(counter.ports.main, incrementer.ports.main);
net.step();
console.log('After increment 1:', counter.value.count); // 1

net.step();
console.log('After increment 2:', counter.value.count); // 2

// Take another snapshot
const afterTwoIncrements = net.takeSnapshot('After two increments');
```

**What you learned:**
- `takeSnapshot(description)` captures the current state
- Snapshots include a description for easy identification
- You can take snapshots at any time during execution

## Step 3: Rolling Back in Time

The most powerful feature - going back to previous states:

```typescript
// Continue from the previous example
console.log('Current count:', counter.value.count); // 2

// Go back to the initial state
net.rollbackTo(initialSnapshot.id);
console.log('After rollback:', counter.value.count); // 0

// The network is now in the exact same state as when the snapshot was taken
// We can continue from there
net.step();
console.log('After increment from rolled back state:', counter.value.count); // 1
```

**What you learned:**
- `rollbackTo(snapshotId)` restores the network to that exact state
- All agents, connections, and rules are restored
- You can continue execution from the rolled-back state
- This is perfect for implementing undo functionality

## Step 4: Working with Multiple Snapshots

You can manage multiple snapshots and compare them:

```typescript
const net = TimeTravelNetwork('multi-snapshot-example');
const counter = Agent('Counter', { count: 0 });
const incrementer = Agent('Incrementer', { amount: 1 });

net.addAgent(counter);
net.addAgent(incrementer);

const incrementRule = ActionRule(
  counter.ports.main,
  incrementer.ports.main,
  (counter, incrementer) => {
    counter.value.count += incrementer.value.amount;
    return [counter, incrementer];
  }
);

net.addRule(incrementRule);

// Take multiple snapshots
const snapshot1 = net.takeSnapshot('Start');
console.log('Count:', counter.value.count); // 0

net.connectPorts(counter.ports.main, incrementer.ports.main);
net.step();
const snapshot2 = net.takeSnapshot('After +1');
console.log('Count:', counter.value.count); // 1

net.step();
const snapshot3 = net.takeSnapshot('After +2');
console.log('Count:', counter.value.count); // 2

// Get all snapshots
const allSnapshots = net.getSnapshots();
console.log('Total snapshots:', allSnapshots.length); // 3

// Compare snapshots
const comparison = net.compareSnapshots(snapshot1.id, snapshot3.id);
console.log('Changes between start and end:', comparison);
```

**What you learned:**
- You can take as many snapshots as needed
- `getSnapshots()` returns all snapshots in chronological order
- `compareSnapshots()` shows what changed between two points in time
- Snapshots are identified by unique IDs

## Step 5: Building an Undo/Redo System

Let's build a complete undo/redo system using time travel:

```typescript
import { Agent, TimeTravelNetwork, ActionRule } from 'annette';

class UndoRedoManager {
  private net: ReturnType<typeof TimeTravelNetwork>;
  private snapshots: Array<{ id: string; description: string }> = [];
  private currentIndex = -1;

  // Store agent references for direct access
  private counterAgent = Agent('Counter', { count: 0 });
  private incrementerAgent = Agent('Incrementer', { amount: 1 });
  private decrementerAgent = Agent('Decrementer', { amount: -1 });

  constructor() {
    this.net = TimeTravelNetwork('undo-redo-app');
    this.setupApp();
  }

  private setupApp() {
    this.net.addAgent(this.counterAgent);
    this.net.addAgent(this.incrementerAgent);
    this.net.addAgent(this.decrementerAgent);

    const incrementRule = ActionRule(
      this.counterAgent.ports.main,
      this.incrementerAgent.ports.main,
      (counter, incrementer) => {
        counter.value.count += incrementer.value.amount;
        return [counter, incrementer];
      }
    );

    const decrementRule = ActionRule(
      this.counterAgent.ports.main,
      this.decrementerAgent.ports.main,
      (counter, decrementer) => {
        counter.value.count += decrementer.value.amount;
        return [counter, decrementer];
      }
    );

    this.net.addRule(incrementRule);
    this.net.addRule(decrementRule);

    // Take initial snapshot
    this.takeSnapshot('Initial state');
  }

  private takeSnapshot(description: string) {
    const snapshot = this.net.takeSnapshot(description);
    this.snapshots.push({ id: snapshot.id, description });
    this.currentIndex = this.snapshots.length - 1;
    return snapshot;
  }

  increment() {
    // Use stored agent references directly
    this.net.connectPorts(this.counterAgent.ports.main, this.incrementerAgent.ports.main);
    this.net.step();
    this.takeSnapshot(`Increment to ${this.counterAgent.value.count}`);
  }

  decrement() {
    // Use stored agent references directly
    this.net.connectPorts(this.counterAgent.ports.main, this.decrementerAgent.ports.main);
    this.net.step();
    this.takeSnapshot(`Decrement to ${this.counterAgent.value.count}`);
  }

  undo() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      const snapshot = this.snapshots[this.currentIndex];
      this.net.rollbackTo(snapshot.id);
      return true;
    }
    return false;
  }

  redo() {
    if (this.currentIndex < this.snapshots.length - 1) {
      this.currentIndex++;
      const snapshot = this.snapshots[this.currentIndex];
      this.net.rollbackTo(snapshot.id);
      return true;
    }
    return false;
  }

  getCurrentValue() {
    const counter = this.net.getAgent('Counter');
    return counter?.value.count || 0;
  }

  getHistory() {
    return this.snapshots.map((snapshot, index) => ({
      ...snapshot,
      isCurrent: index === this.currentIndex
    }));
  }
}

// Usage example
const manager = new UndoRedoManager();

console.log('Initial:', manager.getCurrentValue()); // 0

manager.increment();
console.log('After +1:', manager.getCurrentValue()); // 1

manager.increment();
console.log('After +2:', manager.getCurrentValue()); // 2

manager.decrement();
console.log('After -1:', manager.getCurrentValue()); // 1

console.log('History:');
console.table(manager.getHistory());

manager.undo();
console.log('After undo:', manager.getCurrentValue()); // 2

manager.undo();
console.log('After undo:', manager.getCurrentValue()); // 1

manager.redo();
console.log('After redo:', manager.getCurrentValue()); // 2
```

**What you learned:**
- Time travel can power sophisticated undo/redo systems
- You can build higher-level abstractions on top of snapshots
- Snapshots can include metadata like descriptions
- The system maintains a history that users can navigate

## Step 6: Debugging with Time Travel

Time travel is incredibly useful for debugging:

```typescript
function debugWithTimeTravel() {
  const net = TimeTravelNetwork('debug-example');

  // Set up a complex system
  const user = Agent('User', { name: 'Alice', balance: 100 });
  const shop = Agent('Shop', { items: ['apple', 'banana'] });
  const cart = Agent('Cart', { items: [], total: 0 });

  net.addAgent(user);
  net.addAgent(shop);
  net.addAgent(cart);

  // Add complex rules for purchasing
  const purchaseRule = ActionRule(
    user.ports.main,
    shop.ports.main,
    (user, shop) => {
      if (user.value.balance >= 10) {
        user.value.balance -= 10;
        cart.value.items.push('apple');
        cart.value.total += 10;
        return [user, shop];
      }
      throw new Error('Insufficient funds');
    }
  );

  net.addRule(purchaseRule);

  // Take snapshot before operations
  const beforePurchase = net.takeSnapshot('Before purchase');

  try {
    // Attempt purchase
    net.connectPorts(user.ports.main, shop.ports.main);
    net.step();

    const afterPurchase = net.takeSnapshot('After successful purchase');
    console.log('Purchase successful!');

  } catch (error) {
    console.log('Purchase failed:', error.message);

    // Go back to before the purchase
    net.rollbackTo(beforePurchase.id);
    console.log('Rolled back to safe state');

    // Now we can try a different approach or fix the issue
    const userAfterRollback = net.getAgent('User');
    console.log('User balance after rollback:', userAfterRollback?.value.balance);
  }
}

debugWithTimeTravel();
```

**What you learned:**
- Time travel helps with debugging by letting you isolate problematic states
- You can rollback to safe states when errors occur
- Snapshots help you understand what went wrong and when
- This is much more powerful than traditional logging

## Step 7: Performance Considerations

Time travel has some performance implications:

```typescript
// For high-performance scenarios, you might want to limit snapshots
const net = TimeTravelNetwork('performance-example');

// Take snapshots strategically, not on every change
function performBulkOperation() {
  const beforeOperation = net.takeSnapshot('Before bulk operation');

  try {
    // Perform many operations without taking snapshots
    for (let i = 0; i < 1000; i++) {
      // ... perform operations
    }

    // Take snapshot after all operations complete
    net.takeSnapshot('After bulk operation');

  } catch (error) {
    // Rollback to before the bulk operation
    net.rollbackTo(beforeOperation.id);
    console.log('Bulk operation failed, rolled back');
  }
}

// Clean up old snapshots if you don't need them
function cleanupOldSnapshots() {
  const snapshots = net.getSnapshots();

  // Keep only the last 10 snapshots
  if (snapshots.length > 10) {
    // In practice, you'd implement a more sophisticated cleanup strategy
    console.log('Consider cleaning up old snapshots');
  }
}
```

**What you learned:**
- Time travel has memory and performance costs
- Take snapshots strategically rather than on every change
- Consider cleanup strategies for long-running applications
- Balance debugging power with performance needs

## Advanced Patterns

### Pattern 1: Branching Histories

```typescript
// Create multiple "what-if" scenarios
const net = TimeTravelNetwork('branching-example');
const baseSnapshot = net.takeSnapshot('Base state');

// Branch 1: What if we increment?
net.rollbackTo(baseSnapshot.id);
net.step(); // Increment
const branch1Snapshot = net.takeSnapshot('Branch 1: Incremented');

// Branch 2: What if we decrement?
net.rollbackTo(baseSnapshot.id);
net.step(); // Decrement
const branch2Snapshot = net.takeSnapshot('Branch 2: Decremented');

// Compare the branches
const comparison = net.compareSnapshots(branch1Snapshot.id, branch2Snapshot.id);
console.log('Difference between branches:', comparison);
```

### Pattern 2: Time-Based Testing

```typescript
// Test how your system behaves over time
function testTimeBasedBehavior() {
  const net = TimeTravelNetwork('time-test');

  // Set up initial state
  const initialSnapshot = net.takeSnapshot('Initial');

  // Simulate time passing
  for (let hour = 0; hour < 24; hour++) {
    // ... perform hourly operations
    net.takeSnapshot(`Hour ${hour}`);
  }

  // Test: What was the state at hour 12?
  const hour12Snapshot = net.getSnapshots().find(s => s.description === 'Hour 12');
  if (hour12Snapshot) {
    net.rollbackTo(hour12Snapshot.id);
    // ... test the state at hour 12
  }
}
```

### Pattern 3: Collaborative Debugging

```typescript
// Share snapshots between team members for debugging
function exportSnapshotForTeam(snapshotId: string) {
  const snapshot = net.getSnapshots().find(s => s.id === snapshotId);
  if (snapshot) {
    // In a real app, you'd serialize this and send it to team members
    return {
      id: snapshot.id,
      description: snapshot.description,
      timestamp: snapshot.timestamp,
      // Include relevant state data
    };
  }
}

// Team member can import and debug
function importAndDebugSnapshot(snapshotData: any) {
  // Recreate the state and debug
  console.log('Debugging snapshot:', snapshotData.description);
  // ... debug the specific state
}
```

## Best Practices

### 1. **Snapshot Naming**
```typescript
// Good snapshot names are descriptive
net.takeSnapshot('User login successful');
net.takeSnapshot('Cart updated with 3 items');
net.takeSnapshot('Payment processed for order #123');

// Bad snapshot names are vague
net.takeSnapshot('Step 1');
net.takeSnapshot('After change');
net.takeSnapshot('Updated');
```

### 2. **Strategic Snapshot Timing**
```typescript
// Take snapshots at meaningful points
net.takeSnapshot('Before user action');
performUserAction();
net.takeSnapshot('After user action');

// Don't take snapshots in loops
for (let i = 0; i < 1000; i++) {
  // Don't: net.takeSnapshot(`Iteration ${i}`);
  performIteration(i);
}
net.takeSnapshot('After all iterations');
```

### 3. **Memory Management**
```typescript
// Clean up old snapshots in long-running apps
function cleanupSnapshots(maxAge: number) {
  const snapshots = net.getSnapshots();
  const cutoff = Date.now() - maxAge;

  snapshots.forEach(snapshot => {
    if (snapshot.timestamp < cutoff) {
      // In practice, you'd have a method to delete old snapshots
      console.log('Would delete old snapshot:', snapshot.description);
    }
  });
}
```

### 4. **Error Recovery**
```typescript
// Always have a safe fallback
const safeSnapshot = net.takeSnapshot('Safe state');

try {
  performRiskyOperation();
  net.takeSnapshot('After risky operation');
} catch (error) {
  console.error('Operation failed:', error);
  net.rollbackTo(safeSnapshot.id);
  console.log('Recovered to safe state');
}
```

## Common Use Cases

### 1. **Undo/Redo in Applications**
```typescript
// Perfect for text editors, drawing apps, etc.
class DocumentEditor {
  private net = TimeTravelNetwork('document-editor');

  undo() {
    const snapshots = this.net.getSnapshots();
    if (snapshots.length > 1) {
      this.net.rollbackTo(snapshots[snapshots.length - 2].id);
    }
  }

  redo() {
    // Implement redo by tracking undone operations
  }
}
```

### 2. **Game Development**
```typescript
// Save game states, implement save/load
class Game {
  private net = TimeTravelNetwork('game');

  saveGame(slot: number) {
    const snapshot = this.net.takeSnapshot(`Save slot ${slot}`);
    localStorage.setItem(`save-${slot}`, snapshot.id);
  }

  loadGame(slot: number) {
    const snapshotId = localStorage.getItem(`save-${slot}`);
    if (snapshotId) {
      this.net.rollbackTo(snapshotId);
    }
  }
}
```

### 3. **Testing and Debugging**
```typescript
// Reproduce bugs by going back to specific states
function reproduceBug(bugReport: BugReport) {
  // Load the exact state where the bug occurred
  net.rollbackTo(bugReport.snapshotId);

  // Now you can debug the exact state
  console.log('Reproducing bug in state:', bugReport.description);

  // Test the fix
  applyBugFix();
  const fixedSnapshot = net.takeSnapshot('After bug fix');

  // Verify the fix
  runTests();
}
```

## Troubleshooting

### Common Issues:

1. **"Snapshot not found"**
   - Make sure the snapshot ID is correct
   - Check that the snapshot hasn't been deleted
   - Verify you're using the right network instance

2. **"Cannot rollback"**
   - Ensure the network is a TimeTravelNetwork, not a regular Network
   - Check that the snapshot exists
   - Make sure you haven't corrupted the network state

3. **Performance Issues**
   - Too many snapshots can slow down your application
   - Consider cleanup strategies for long-running apps
   - Use strategic snapshot timing

4. **Memory Leaks**
   - Snapshots hold references to old states
   - Implement cleanup for unused snapshots
   - Consider using weak references for large objects

## Next Steps

Now that you understand time travel, explore:

- [Distributed Systems Tutorial](distributed-tutorial.md) - Share state across multiple clients
- [Reactive Programming Tutorial](reactive-tutorial.md) - Build reactive user interfaces
- [Advanced Patterns](../examples/) - See real-world examples

Time travel is one of Annette's most powerful features. Use it to build more reliable, debuggable, and user-friendly applications!

## Further Reading

- [Time Travel Network API Reference](../README.md#time-travel-system)
- [Advanced Examples](../examples/time-travel.ts)
- [Performance Optimization](performance-optimizations.md)
- [Distributed Systems](distributed-systems.md)