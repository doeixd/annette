# Updater Agent Functionality

The Updater agent system provides a way to represent state changes as first-class citizens in an interaction net. This enables sophisticated state management patterns, including CRDT-like behavior, by treating updates as values that can be passed around, composed, and transformed within the network.

## Core Concepts

1. **Updater Agents**: Represent an intent to change a value. When connected to another agent, they apply their operation to that agent's value.

2. **Update Operations**: Different ways to modify values:
   - `set`: Replace the entire value
   - `merge`: Merge partial updates into an object
   - `delete`: Remove a property or set to undefined
   - `insert`: Insert a value at a specific index (for arrays)
   - `increment`: Add a numeric value to the current value
   - `custom`: Apply a custom function to transform the value

3. **Path-Based Updates**: Target specific nested properties using a path array (e.g., `["user", "settings", "theme"]`).

4. **Metadata & Timestamps**: Track the source, timestamp, and other metadata about updates for conflict resolution.

## Example Usage

### Basic Update

```javascript
// Create a Document agent
const doc = Agent("Document", {
  content: "Hello, world!",
  version: 1
});

// Create an Updater to change the content
const update = Updater(
  ["content"], 
  Updates.set("Updated content"),
  { source: "user1" }
);

// Connect and apply the update
network.connectPorts(update.ports.main, doc.ports.main);
network.reduce();

// Result: doc.value.content === "Updated content"
```

### Nested Property Updates

```javascript
// Create a shared state agent
const state = Agent("SharedState", {
  settings: { theme: "light", fontSize: 12 }
});

// Update a nested property
const update = Updater(
  ["settings"], 
  Updates.merge({ theme: "dark", animationsEnabled: true })
);

// Connect and apply the update
network.connectPorts(update.ports.main, state.ports.main);
network.reduce();

// Result: state.value.settings includes the merged changes
```

### Custom Transformations

```javascript
// Create a counter agent
const counter = Agent("Counter", { value: 0, history: [] });

// Create a custom update that increments and tracks history
const update = Updater(
  [], 
  Updates.custom(value => ({
    ...value,
    value: value.value + 5,
    history: [...value.history, `Incremented to ${value.value + 5}`]
  }))
);

// Connect and apply the update
network.connectPorts(update.ports.main, counter.ports.main);
network.reduce();

// Result: counter value is incremented and history is updated
```

## Update Rules

The Updater system adds rules to the network for handling the interaction between Updater agents and target agents:

1. **Updater-Value Rule**: Applies updates to any agent type specified in the registration.
2. **Updater-Duplicator Rule**: When an Updater connects to a Duplicator, the update is duplicated and passed to multiple targets.

## Advanced Features

### CRDT-Like Behavior

Updaters can implement CRDT (Conflict-Free Replicated Data Type) patterns by using timestamps and source IDs to determine the "winning" update in case of conflicts.

```javascript
// Create an update with a timestamp
const update1 = Updater(
  ["content"], 
  Updates.set("Content from earlier update"),
  { 
    source: "user1", 
    timestamp: Date.now() - 1000 // Earlier timestamp
  }
);

// Create a later update
const update2 = Updater(
  ["content"], 
  Updates.set("Content from later update"),
  { 
    source: "user2", 
    timestamp: Date.now() // Later timestamp
  }
);

// The later update wins when implemented with the right conflict resolution
```

### Broadcasting Updates

Updaters can be combined with Duplicator agents to broadcast updates to multiple targets:

```javascript
// Create a duplicator connected to multiple value agents
network.connectPorts(duplicator.ports.out1, value1.ports.main);
network.connectPorts(duplicator.ports.out2, value2.ports.main);

// Connect an updater to the duplicator
network.connectPorts(update.ports.main, duplicator.ports.main);
network.reduce();

// Both value1 and value2 will be updated
```

## Implementation Details

The Updater functionality is implemented through:

1. **`Updater`**: Factory function to create Updater agents
2. **`Updates`**: Helper object with factory functions for different update operations
3. **`applyUpdate`**: Function to apply an update operation to a value
4. **`registerUpdaterRules`**: Function to register interaction rules for Updater agents

The implementation handles deep cloning, path-based updates, and type-aware operations, providing a robust foundation for state management in interaction nets.