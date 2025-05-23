# Rule Commands in Annette

This document explains the enhanced rule command system in Annette, which allows rules to return explicit commands for adding and removing agents/connections, with options for handling existing entities.

## Overview

The rule command system extends the existing rule return mechanism, allowing rules to:

1. Add agents or connections with an option to throw if they already exist
2. Remove agents that aren't part of the rule interaction
3. Continue supporting the legacy behavior of returning agents/connections directly

## Rule Command Types

### Add Command

The `add` command adds an agent or connection to the network:

```typescript
{
  type: 'add',
  entity: IAgent | IConnection,
  throwIfExists?: boolean
}
```

- `type`: Must be 'add'
- `entity`: The agent or connection to add
- `throwIfExists`: When true, throws an error if the entity already exists; when false, silently skips adding the entity if it already exists (defaults to false)

### Remove Command

The `remove` command removes an agent from the network:

```typescript
{
  type: 'remove',
  entity: IAgent | string  // Can be agent object or agent ID
}
```

- `type`: Must be 'remove'
- `entity`: The agent to remove (can be an agent object or agent ID string)

## Example Usage

### Adding Agents With Conflict Handling

```typescript
const rule = ActionRule(
  sourcePort,
  targetPort,
  (source, target, network) => {
    // Create a new agent
    const logger = Agent("Logger", { logs: ["Operation performed"] });
    
    // Return with rule commands
    return [
      source,
      target,
      // Add the logger, skipping if it already exists
      { type: 'add', entity: logger, throwIfExists: false }
    ];
  }
);
```

### Removing Agents Not Part of the Rule

```typescript
const cleanupRule = ActionRule(
  cleaner.ports.main,
  target.ports.main,
  (cleaner, target, network) => {
    // Find all logger agents
    const loggers = network.findAgents({ name: "Logger" });
    
    // Build return array
    const result = [cleaner, target];
    
    // Add remove commands for each logger
    for (const logger of loggers) {
      result.push({ type: 'remove', entity: logger });
    }
    
    return result;
  }
);
```

### Mixed Command Types

```typescript
const complexRule = ActionRule(
  source.ports.main,
  target.ports.main,
  (source, target, network) => {
    // Create a new agent
    const tracker = Agent("Tracker", { timestamp: Date.now() });
    
    // Build the result with various commands
    return [
      source,
      target,
      // Add the tracker, throwing if it exists
      { type: 'add', entity: tracker, throwIfExists: true },
      // Remove a specific agent by ID
      { type: 'remove', entity: "some-agent-id" }
    ];
  }
);
```

## Legacy Support

The system continues to support the legacy behavior of returning agents and connections directly:

```typescript
const legacyRule = ActionRule(
  source.ports.main,
  target.ports.main,
  (source, target, network) => {
    // Create a new agent
    const newAgent = Agent("NewAgent", { data: "value" });
    
    // Legacy return style - still works
    return [source, target, newAgent];
  }
);
```

## Usage Guidelines

1. **Returning Interacting Agents**: Always return the interacting agents first, unless you explicitly want them removed from the network.

2. **Command Ordering**: There's no guaranteed processing order for commands. If you need specific ordering, consider using multiple rules.

3. **Conflict Handling**: Use `throwIfExists: false` when you want to safely add agents that might already exist (idempotent operations).

4. **Logging Removal**: Consider logging when removing agents not part of the rule, as this can be harder to track in complex networks.

5. **Performance**: When removing many agents, use agent IDs rather than agent objects for better performance.

## Practical Use Cases

### Cleanup Operations

Remove agents of a certain type when they're no longer needed:

```typescript
// Cleanup rule that removes all agents of a certain type
const cleanupRule = ActionRule(
  cleaner.ports.main,
  target.ports.main,
  (cleaner, target, network) => {
    const agentsToRemove = network.findAgents({ name: "Temporary" });
    
    const commands = [cleaner, target];
    for (const agent of agentsToRemove) {
      commands.push({ type: 'remove', entity: agent._agentId });
    }
    
    return commands;
  }
);
```

### Idempotent Operations

Ensure a specific agent exists without errors on retries:

```typescript
// Rule that ensures a registry agent exists
const ensureRegistryRule = ActionRule(
  initializer.ports.main,
  target.ports.main,
  (initializer, target, network) => {
    // Create a registry if it doesn't exist
    const registry = Agent("Registry", { entries: {} });
    
    return [
      initializer,
      target,
      { type: 'add', entity: registry, throwIfExists: false }
    ];
  }
);
```

### Complex State Transitions

Manage multiple agents in a state machine:

```typescript
const transitionRule = ActionRule(
  state.ports.main,
  event.ports.main,
  (state, event, network) => {
    const result = [state, event];
    
    if (event.value === "transition") {
      // Create new state agents
      const newState = Agent("State", { phase: "next" });
      result.push({ type: 'add', entity: newState, throwIfExists: true });
      
      // Remove old artifacts
      const oldArtifacts = network.findAgents({ name: "Artifact" });
      for (const artifact of oldArtifacts) {
        result.push({ type: 'remove', entity: artifact });
      }
    }
    
    return result;
  }
);
```