# Annette Unified Architecture

This document explains the unified architecture of the Annette library, which harmonizes different programming paradigms and provides a consistent component integration strategy.

## Overview

The Annette library has been restructured to provide:

1. **Clear Abstraction Layers**: A well-defined separation between core engine, standard library, and application-specific code.
2. **Unified Programming Model**: A harmonized approach that reconciles interaction nets with reactive programming.
3. **Plugin-Based Architecture**: A flexible extension system where features are implemented as plugins.
4. **Consistent Event System**: A uniform mechanism for observing and reacting to changes.
5. **Unified Effect System**: A general approach to handling all types of side effects.

## Abstraction Layers

The architecture is organized into three main layers:

### 1. Core Engine Layer

The core layer provides the fundamental interaction net primitives without any higher-level abstractions or extensions:

- Agent system (`Agent`, `IAgent`, etc.)
- Port system (`Port`, `BoundPort`, etc.)
- Connection system (`Connection`, `IConnection`, etc.)
- Rule system (`Rule`, `ActionRule`, `RewriteRule`, etc.)
- Network system (`Network`, `INetwork`, etc.)

This layer is minimalist and focused solely on the interaction net fundamentals.

### 2. Standard Library Layer

The standard library builds upon the core layer to provide common patterns and utilities:

- Time Travel system (`TimeTravelNetwork`, `enableTimeTravel`, etc.)
- Updater system (`Updater`, `applyUpdate`, etc.)
- Effect system (`EffectAgent`, `HandlerAgent`, etc.)
- Sync system (`SyncAgent`, `RemoteAgent`, etc.)
- Connection History system (`ConnectionHistoryManager`, etc.)
- Specialized Updaters (`MapUpdater`, `ListUpdater`, etc.)
- Reactive system (`ReactiveAgent`, `createReactive`, etc.)
- Plugin system (`createPluginNetwork`, `TimeTravelPlugin`, etc.)

This layer provides standardized, reusable components that follow consistent patterns.

### 3. Application Layer

The application layer includes domain-specific components and high-level APIs:

- SolidJS-like Reactive Library (`createSignal`, `createMemo`, etc.)
- Distributed Networks (`DistributedNetwork`, etc.)
- Application-specific agents and rules

This layer is focused on solving specific use cases and providing developer-friendly APIs.

## Unified Programming Model

The unified programming model harmonizes interaction nets with reactive programming:

### Reactive Agents

Agents are now inherently reactive, with values that automatically propagate changes through connections:

```typescript
// Create a reactive agent
const counter = createReactive(0);

// Create a derived value
const doubled = createComputed(() => counter() * 2);

// Create an effect
createEffect(() => {
  console.log(`Counter: ${counter()}, doubled: ${doubled()}`);
});

// Update the value
counter(5); // Automatically logs: "Counter: 5, doubled: 10"
```

### Consistent API Between Local and Distributed Networks

Local networks are now treated as a special case of distributed networks, with a consistent API:

```typescript
// Local network
const localNetwork = Core.createNetwork('local');

// Plugin-based network with distributed capabilities
const pluginNetwork = createPluginNetwork('distributed');
pluginNetwork.registerPlugin(new SynchronizationPlugin());

// Both networks expose the same core API
localNetwork.addAgent(agent);
pluginNetwork.addAgent(agent);
```

## Plugin-Based Architecture

The plugin system provides a flexible way to extend Annette's functionality:

```typescript
// Create a plugin network
const network = createPluginNetwork('example');

// Register standard plugins
network.registerPlugin(new TimeTravelPlugin());
network.registerPlugin(new ReactivityPlugin());
network.registerPlugin(new SynchronizationPlugin());
network.registerPlugin(new EffectPlugin());

// Create and register a custom plugin
class CustomPlugin extends BasePlugin {
  initialize(network) {
    // Plugin initialization logic
  }
  
  shutdown() {
    // Plugin cleanup logic
  }
}

network.registerPlugin(new CustomPlugin({
  id: 'custom',
  name: 'Custom Plugin',
  description: 'A custom plugin for demonstration'
}));
```

## Consistent Event System

The event system provides a uniform way to observe and react to changes:

```typescript
// Listen for network events
network.addEventListener(EventType.AGENT_ADDED, (event) => {
  console.log(`Agent added: ${event.data.agent.name}`);
});

network.addEventListener(EventType.CONNECTION_CREATED, (event) => {
  console.log(`Connection created between ${event.data.from} and ${event.data.to}`);
});

// Custom events
network.addEventListener('my-custom-event', (event) => {
  console.log(`Custom event: ${event.data.message}`);
});

// Emit events
network.emit('my-custom-event', { message: 'Hello, world!' });
```

## Unified Effect System

The effect system provides a general approach to handling all types of side effects:

```typescript
// Get the effect plugin
const effectPlugin = network.getPlugin('effect') as EffectPlugin;

// Register a custom effect handler
effectPlugin.registerEffectHandler('database', async (effect) => {
  // Handle database operations
  const { operation, collection, document } = effect.data;
  
  switch (operation) {
    case 'find':
      return await db.collection(collection).findOne(document);
    case 'insert':
      return await db.collection(collection).insertOne(document);
    // More operations...
  }
});

// Create and perform an effect
const dbEffect = effectPlugin.createEffect({
  type: 'database',
  data: {
    operation: 'find',
    collection: 'users',
    document: { username: 'john' }
  }
});

// Wait for the effect to complete
setTimeout(() => {
  if (dbEffect.value.status === 'completed') {
    console.log(`User found:`, dbEffect.value.result);
  } else if (dbEffect.value.status === 'error') {
    console.error(`Error:`, dbEffect.value.error);
  }
}, 100);

// Perform an effect and await the result
try {
  const result = await effectPlugin.performEffect({
    type: 'database',
    data: {
      operation: 'insert',
      collection: 'logs',
      document: { message: 'Example log', timestamp: Date.now() }
    }
  });
  console.log(`Log inserted:`, result);
} catch (error) {
  console.error(`Error inserting log:`, error);
}
```

## Migration Guide

To migrate from the previous architecture to the unified architecture:

1. **Import from new abstraction layers**:
   ```typescript
   // Before
   import { Agent, Network } from 'annette';
   
   // After
   import { Core, StdLib } from 'annette';
   // Or directly:
   import { Core } from 'annette/core';
   import { StdLib } from 'annette/stdlib';
   ```

2. **Use the plugin system for extensions**:
   ```typescript
   // Before
   import { TimeTravelNetwork } from 'annette';
   const network = TimeTravelNetwork('example');
   
   // After
   import { createPluginNetwork, TimeTravelPlugin } from 'annette';
   const network = createPluginNetwork('example');
   network.registerPlugin(new TimeTravelPlugin());
   ```

3. **Use the reactive agent model**:
   ```typescript
   // Before
   const agent = Agent('Counter', { value: 0 });
   agent.value.value = 5;
   
   // After
   const counter = createReactive(0);
   counter(5);
   ```

4. **Use the consistent event system**:
   ```typescript
   // Before
   // No standardized event system
   
   // After
   network.addEventListener(EventType.AGENT_ADDED, (event) => {
     console.log(`Agent added: ${event.data.agent.name}`);
   });
   ```

5. **Use the unified effect system**:
   ```typescript
   // Before
   const effectAgent = EffectAgent({ type: 'fetch', url: 'https://example.com/api' });
   network.addAgent(effectAgent);
   
   // After
   const effectPlugin = network.getPlugin('effect');
   const effect = effectPlugin.createEffect({
     type: 'fetch',
     data: { url: 'https://example.com/api' }
   });
   ```

## Benefits of the Unified Architecture

1. **Improved Developer Experience**: More intuitive APIs with clear abstractions.
2. **Reduced Boilerplate**: The reactive agent model eliminates manual connection management.
3. **Better Extensibility**: The plugin system makes it easy to add new features.
4. **Consistent Patterns**: Standardized approaches to common problems.
5. **Clearer Separation of Concerns**: Well-defined abstraction layers.
6. **Simplified Distributed Networks**: Consistent API between local and distributed networks.
7. **Unified Effect Handling**: Standardized approach to all side effects.

## Examples

Check out the examples directory for demonstrations of the unified architecture:

- `examples/unified-architecture.ts`: Showcases the core concepts of the unified architecture.
- `examples/plugin-example.ts`: Demonstrates the plugin system.
- `examples/reactive-agents.ts`: Shows the reactive agent model in action.
- `examples/distributed-example.ts`: Illustrates distributed networks.

## Further Reading

- [Core Engine Documentation](./core.md)
- [Standard Library Documentation](./stdlib.md)
- [Plugin System Documentation](./plugin-system.md)
- [Reactive Agent Model Documentation](./reactive-agents.md)
- [Effect System Documentation](./effect-system.md)