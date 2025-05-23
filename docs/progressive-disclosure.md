# Progressive Disclosure in Annette

This document explains the progressive disclosure features in Annette, which make the library more accessible to new users while still providing powerful capabilities for advanced users.

## Overview

Progressive disclosure is a design pattern that presents only the most important features to new users, gradually revealing more complex functionality as they become more proficient. Annette implements progressive disclosure through:

1. **Tiered APIs**: Simple, Advanced, and Expert level APIs
2. **Sensible Defaults**: Minimizing required configuration
3. **Clear Abstraction Layers**: Core, Standard Library, and Application layers

## Tiered APIs

### Simple API

The Simple API is designed for beginners and simple use cases. It hides complexity and provides intuitive functions with sensible defaults:

```typescript
import { Simple } from 'annette';

// Create a simple network
const network = Simple.createNetwork('simple-example');

// Create agents
const counter = Simple.createAgent('Counter', { value: 0 });
const incrementer = Simple.createAgent('Incrementer', { by: 5 });

// Add agents to network
network.addAgent(counter);
network.addAgent(incrementer);

// Add a simple rule
Simple.addRule(network, 'Counter', 'Incrementer', (counter, incrementer) => {
  counter.value.value += incrementer.value.by;
});

// Connect agents
Simple.connect(network, counter, incrementer);

// Run the network
Simple.run(network);

// Find all Counter agents
const counters = Simple.findAgents(network, 'Counter');
console.log('Counter value after increment:', counters[0].value.value);
```

### Advanced API

The Advanced API is for users who need more control but don't want to deal with all the low-level details:

```typescript
import { Advanced, Core } from 'annette';

// Create a time travel network
const network = Advanced.createTimeTravelNetwork('timetravel-example');

// Create agents
const counter = Core.createAgent('Counter', { value: 0 });
const incrementer = Core.createAgent('Incrementer', { by: 10 });

// Add agents to network
network.addAgent(counter);
network.addAgent(incrementer);

// Add a rule
network.addRule(Core.createActionRule(
  { name: 'increment', type: 'action' },
  { agentName1: 'Counter', portName1: 'main', agentName2: 'Incrementer', portName2: 'main' },
  (counter, incrementer) => {
    counter.value.value += incrementer.value.by;
    return [counter, incrementer];
  }
));

// Connect agents
network.connectPorts(counter.ports.main, incrementer.ports.main);

// Take a snapshot before
const snapshot = Advanced.takeSnapshot(network, 'Before increment');

// Run the network
network.reduce();

// Roll back to the previous snapshot
Advanced.rollbackTo(network, snapshot.id);
```

### Expert API (Core API)

The Expert API provides access to all the low-level functionality for maximum control:

```typescript
import { Core, createOptimizedNetwork } from 'annette';

// Create a network
const baseNetwork = Core.createNetwork('expert-example');

// Apply optimizations
const network = createOptimizedNetwork(baseNetwork, {
  enableRuleIndexing: true,
  enableLazyEvaluation: true,
  enableStructuralSharing: true,
  enableMemoryManagement: true
});

// Create custom agents with specific port configurations
const counter = Core.createAgent('Counter', { value: 0 }, {
  main: Core.createPort('main', 'main'),
  increment: Core.createPort('increment', 'aux'),
  reset: Core.createPort('reset', 'aux')
});

// Add to network
network.addAgent(counter);

// Create and add complex rules
network.addRule(Core.createActionRule(
  { name: 'complex-rule', type: 'action' },
  { agentName1: 'Counter', portName1: 'increment', agentName2: 'Incrementer', portName2: 'main' },
  (counter, incrementer, network) => {
    // Complex logic with network access
    counter.value.value += incrementer.value.by;
    
    // Return commands instead of agents
    return [
      counter,
      incrementer,
      { type: 'add', entity: Core.createAgent('Log', { message: 'Incremented' }) }
    ];
  }
));
```

## Sensible Defaults

Annette provides sensible defaults to reduce the amount of configuration needed:

```typescript
// Using sensible defaults
import { Simple, createEnhancedNetwork } from 'annette';

// Simple network with all defaults
const network1 = Simple.createNetwork('default-example');

// Enhanced network with custom configuration
const network2 = createEnhancedNetwork('enhanced-example', {
  // Override only what you need
  debugLevel: DebugLevel.INFO,
  enableRuleIndexing: true
  // All other options use sensible defaults
});
```

## Abstraction Layers

Annette is organized into three main abstraction layers:

### 1. Core Layer

The Core layer provides the fundamental interaction net primitives:

```typescript
import { Core } from 'annette';

const network = Core.createNetwork('core-example');
const agent = Core.createAgent('Agent', { value: 'data' });
const port = Core.createPort('port', 'aux');
const rule = Core.createActionRule(/* ... */);
const connection = Core.createConnection(/* ... */);
```

### 2. Standard Library Layer

The Standard Library builds upon the core to provide common patterns and utilities:

```typescript
import { StdLib } from 'annette';

// Time Travel
const ttNetwork = StdLib.TimeTravel.enableTimeTravel(network);

// Effect System
const effectAgent = StdLib.Effect.EffectAgent(/* ... */);

// Sync System
const syncAgent = StdLib.Sync.SyncAgent(/* ... */);

// Data Structures
const map = StdLib.DataStructures.createSharedMap(/* ... */);

// Reactive System
const [count, setCount] = StdLib.Reactive.createReactive(0);

// Enhanced Network with all features
const enhanced = StdLib.createEnhancedNetwork('all-features');
```

### 3. Application Layer

The Application layer includes domain-specific components and high-level APIs:

```typescript
import { 
  createSignal, createMemo, createEffect,
  DistributedNetwork, createEnhancedNetwork
} from 'annette';

// SolidJS-like Reactive API
const [count, setCount] = createSignal(0);
const doubled = createMemo(() => count() * 2);
createEffect(() => console.log(`Count: ${count()}, doubled: ${doubled()}`));

// Distributed Network
const distributed = new DistributedNetwork(/* ... */);

// Enhanced Developer Experience
const enhanced = createEnhancedNetwork('app');
```

## Configurable Options

Many functions in Annette accept option objects with sensible defaults, allowing you to specify only what you need:

```typescript
// Default options with only necessary overrides
createEnhancedNetwork('example', {
  // Only override what you need
  debugLevel: DebugLevel.INFO,
  
  // Nested options also use sensible defaults
  memoryConfig: {
    maxHistorySize: 500  // Override just one setting
    // Other memory settings use defaults
  }
});
```

## Recommended Approach for Different User Types

### For Beginners

Start with the Simple API for basic interaction nets:

```typescript
import { Simple } from 'annette';

const network = Simple.createNetwork('beginner-example');
const agent1 = Simple.createAgent('Type1', { data: 'value' });
const agent2 = Simple.createAgent('Type2', { data: 'value' });

network.addAgent(agent1);
network.addAgent(agent2);

Simple.addRule(network, 'Type1', 'Type2', (a1, a2) => {
  // Simple action
  a1.value.data = a2.value.data + '!';
});

Simple.connect(network, agent1, agent2);
Simple.run(network);
```

### For Intermediate Users

Use the Advanced API for more control with time travel and other features:

```typescript
import { Advanced, Core } from 'annette';

const network = Advanced.createTimeTravelNetwork('intermediate-example');
const agent1 = Core.createAgent('Type1', { data: 'value' });
const agent2 = Core.createAgent('Type2', { data: 'value' });

network.addAgent(agent1);
network.addAgent(agent2);

network.addRule(Core.createActionRule(
  { name: 'rule', type: 'action' },
  { agentName1: 'Type1', portName1: 'main', agentName2: 'Type2', portName2: 'main' },
  (a1, a2) => {
    a1.value.data = a2.value.data + '!';
    return [a1, a2];
  }
));

network.connectPorts(agent1.ports.main, agent2.ports.main);
const snapshot = Advanced.takeSnapshot(network, 'Before');
network.reduce();
// Can roll back if needed
```

### For Advanced Users

Use the Core API directly with optimizations and customizations:

```typescript
import { Core, createOptimizedNetwork, StructuralSharing } from 'annette';

const baseNetwork = Core.createNetwork('advanced-example');
const network = createOptimizedNetwork(baseNetwork, {
  enableRuleIndexing: true,
  enableLazyEvaluation: true,
  enableStructuralSharing: true
});

// Custom agent with specific ports
const agent = Core.createAgent('CustomAgent', { state: { nested: { value: 42 } } }, {
  main: Core.createPort('main', 'main'),
  custom1: Core.createPort('custom1', 'aux'),
  custom2: Core.createPort('custom2', 'aux')
});

// Use structural sharing for immutable updates
agent.value = StructuralSharing.update(agent.value, draft => {
  draft.state.nested.value = 100;
});

// Complex rule with commands
network.addRule(Core.createActionRule(
  { name: 'complex-rule', type: 'action' },
  { agentName1: 'CustomAgent', portName1: 'custom1', agentName2: 'OtherAgent', portName2: 'main' },
  (a1, a2, network) => {
    // Complex transformation
    return [
      a1, a2,
      { type: 'add', entity: Core.createAgent('NewAgent', { derived: a1.value.state.nested.value }) },
      { type: 'add', entity: Core.createConnection(a1.ports.custom2, a2.ports.aux) }
    ];
  }
));
```

## Conclusion

Annette's progressive disclosure approach allows users of all skill levels to be productive:

- **Beginners** can use the Simple API to quickly build basic interaction net systems
- **Intermediate users** can leverage the Advanced API for more powerful features
- **Advanced users** can access the Core API for maximum control and customization

This tiered approach ensures that users can grow with the library, starting simple and gradually accessing more advanced features as their needs evolve.