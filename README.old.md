<img src="assets/logo.png" width="165"  />

# Annette

Annette is a TypeScript library based on [interaction nets](https://en.wikipedia.org/wiki/Interaction_nets). It provides a unified programming model for graph-based computation with powerful abstractions for reactive programming, state management, distributed systems, and more.

📖 [API Documentation](./api-documentation.md) | 📚 [Examples](./examples/) | 📦 [npm package](https://www.npmjs.com/package/annette)

## Core Philosophy

- **Unified Architecture** - Clear abstraction layers, plugin system, and harmonized paradigms
- **Progressive Disclosure** - Simple, intuitive API surface with advanced features when needed
- **Agent-Based Modeling** - Everything is modeled as agents with named ports that can connect
- **Rule-Based Interaction** - Rules define what happens when different agents connect
- **Type-Safe Operations** - Strong TypeScript typing with agent names as types
- **Dual Rule System** - Fast, declarative rewrites and dynamic imperative actions
- **Explicit Connections** - 1-to-1 port connectivity with unique identifiers
- **Reactivity and Effects** - First-class effects and algebraic effect handlers
- **State Management** - Powerful state tracking, time travel, and structured updates
- **Distributed Systems** - Cross-network synchronization with vector clocks
- **Serialization** - Full support for client-server communication

## Installation

```bash
npm install annette
```

## Usage Examples

### Simple Counter

```typescript
import { Agent, Network, ActionRule } from 'annette';

// Create a network and typed agents
const net = Network("counter-example");
const counter = Agent<"Counter", number>("Counter", 0);
const increment = Agent<"Increment", number>("Increment", 1);

// Add agents to the network
net.addAgent(counter);
net.addAgent(increment);

// Define an action rule (names are optional)
const incrementRule = ActionRule(
  counter.ports.main,
  increment.ports.main,
  (counter, increment) => {
    // Type-safe operation (TypeScript knows counter.value is a number)
    counter.value += increment.value;
    
    // Return the agents to keep in the network
    return [counter, increment];
  }
);

// Add rule to the network
net.addRule(incrementRule);

// Connect counter to increment
net.connectPorts(counter.ports.main, increment.ports.main);

// Execute the reduction
console.log("Before reduction:", counter.value); // Output: 0
net.step();
console.log("After reduction:", counter.value);  // Output: 1
```

### Type-Safe State Machine

```typescript
import { Agent, Network, ActionRule } from 'annette';

const net = Network('stateMachine');

// Create state machine agents with typed values
const state = Agent<'State', string>('State', 'idle');
const event = Agent<'Event', string>('Event', 'start');

// Add agents to the network
net.addAgent(state);
net.addAgent(event);

// Define rules for state transitions
const transitionRule = ActionRule(
  state.ports.main,
  event.ports.main,
  (state, event) => {
    if (state.value === 'idle' && event.value === 'start') {
      state.value = 'running';
    } else if (state.value === 'running' && event.value === 'stop') {
      state.value = 'idle';
    }
    
    return [state, event];
  }
);

// Add rule to the network
net.addRule(transitionRule);

// Connect state to event
net.connectPorts(state.ports.main, event.ports.main);

// Start the state machine
console.log("Initial state:", state.value); // Output: 'idle'
net.step();
console.log("After 'start' event:", state.value); // Output: 'running'

// Change the event and trigger another transition
event.value = 'stop';
net.step();
console.log("After 'stop' event:", state.value); // Output: 'idle'
```

### Declarative Rewrite Rules

```typescript
import { Agent, Network, Port, RewriteRule } from 'annette';

const net = Network("adder-network");

// Create typed agents
type NumberValue = { value: number, label: string };
type ResultValue = { sum: number, inputs: string[] };

const num1 = Agent<"Number", NumberValue>(
  "Number", 
  { value: 5, label: "A" }, 
  { main: Port("main", "main"), result: Port("result", "aux") }
);

const num2 = Agent<"Number", NumberValue>(
  "Number", 
  { value: 7, label: "B" }, 
  { main: Port("main", "main"), result: Port("result", "aux") }
);

const result = Agent<"Result", ResultValue>(
  "Result", 
  { sum: 0, inputs: [] }
);

// Add agents to the network
net.addAgent(num1);
net.addAgent(num2);
net.addAgent(result);

// Define a rewrite rule with dynamic values (name is optional)
const addRule = RewriteRule(
  num1.ports.main,
  num2.ports.main,
  (n1, n2) => {
    // Full access to typed values at rule definition time
    const sum = n1.value.value + n2.value.value;
    const inputs = [n1.value.label, n2.value.label];
    
    return {
      // Create a single new Result agent with computed values
      newAgents: [
        { 
          name: "Result", 
          initialValue: { sum, inputs }, 
          _templateId: "sumResult" 
        }
      ],
      internalConnections: [],
      // Map n1's result port to the new Result agent
      portMapAgent1: {
        result: { newAgentTemplateId: "sumResult", newPortName: "main" },
        main: null // Main port connection is consumed
      },
      // Map n2's result port to nothing (consumed)
      portMapAgent2: {
        result: null, // Result port connection is consumed
        main: null // Main port connection is consumed
      }
    };
  }
);

// Add rule to the network
net.addRule(addRule);

// Connect the main ports of the two numbers
net.connectPorts(num1.ports.main, num2.ports.main);

// Connect result ports to the result agent
net.connectPorts(num1.ports.result, result.ports.main);

// Execute the reduction
net.reduce();

// Find the result agent
const resultAgents = net.findAgents({ name: "Result" });
console.log("Result of addition:", resultAgents[0].value.sum); // Output: 12
console.log("Input labels:", resultAgents[0].value.inputs); // Output: ["A", "B"]
```

### Time Travel and Change Tracking

```typescript
import { TimeTravelNetwork, Agent, ActionRule } from 'annette';

// Create a network with time travel built-in
const net = TimeTravelNetwork("counter-with-time-travel");

// Create counter and incrementer agents
const counter = Agent("Counter", { count: 0 });
const incrementer = Agent("Incrementer", { by: 1 });

// Add agents to the network
net.addAgent(counter);
net.addAgent(incrementer);

// Define an action rule (name is auto-generated)
net.addRule(ActionRule(
  counter.ports.main,
  incrementer.ports.main,
  (counter, incrementer) => {
    counter.value.count += incrementer.value.by;
    return [counter, incrementer];
  }
));

// Take a snapshot before any reductions
net.takeSnapshot("Before first increment");

// Connect agents and apply the rule
net.connectPorts(counter.ports.main, incrementer.ports.main);
net.reduce();
console.log("Counter after first increment:", counter.value.count); // 1

// Take another snapshot
net.takeSnapshot("After first increment");

// Change the incrementer value and apply the rule again
incrementer.value.by = 5;
net.connectPorts(counter.ports.main, incrementer.ports.main);
net.reduce();
console.log("Counter after second increment:", counter.value.count); // 6

// Roll back to the first snapshot
const firstSnapshot = net.getSnapshots()[1]; // Skip initial state
net.rollbackTo(firstSnapshot.id);
console.log("Counter value after rollback:", counter.value.count); // 1
```

### Reactive Programming

Annette provides a comprehensive reactive programming system inspired by SolidJS, with fine-grained reactivity and automatic dependency tracking.

#### Basic Reactivity

```typescript
import { createReactive, createComputed, createEffect } from 'annette';

// Create reactive values with automatic dependency tracking
const count = createReactive(0);
const multiplier = createReactive(2);

// Create a computed value that depends on other reactive values
const doubled = createComputed(() => count() * multiplier());

// Create an effect that runs when dependencies change
createEffect(() => {
  console.log(`Count: ${count()}, Doubled: ${doubled()}`);
});

// Update reactive values - effects run automatically
count(1); // Logs: "Count: 1, Doubled: 2"
multiplier(3); // Logs: "Count: 1, Doubled: 3"
count(2); // Logs: "Count: 2, Doubled: 6"
```

#### SolidJS-like API

```typescript
import { 
  createSignal, createMemo, createEffect,
  createStore, batch, createRoot
} from 'annette';

// Create a reactive scope
createRoot(() => {
  // Create signals (reactive values)
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("John");
  
  // Create derived values with automatic dependency tracking
  const greeting = createMemo(() => `Hello, ${name()}!`);
  const doubled = createMemo(() => count() * 2);
  
  // Create side effects that run when dependencies change
  createEffect(() => {
    console.log(`${greeting()} Your count is ${count()}.`);
    document.title = `Count: ${count()}`;
  });
  
  // Create a reactive store for nested reactivity
  const [state, setState] = createStore({
    user: {
      profile: {
        name: "John",
        age: 30
      },
      preferences: {
        theme: "light",
        notifications: true
      }
    },
    posts: [
      { id: 1, title: "First post" },
      { id: 2, title: "Second post" }
    ]
  });
  
  // Effects track deep paths automatically
  createEffect(() => {
    console.log(`Theme: ${state.user.preferences.theme}`);
    console.log(`Posts: ${state.posts.length}`);
  });
  
  // Update the store (with nested path tracking)
  setState("user", "preferences", "theme", "dark");
  setState("posts", posts => [...posts, { id: 3, title: "New post" }]);
  
  // Batch updates to prevent multiple re-renders
  batch(() => {
    setCount(c => c + 1);
    setName("Jane");
    setState("user", "profile", "age", 31);
  });
  // Effects run only once after all changes in the batch
});
```

#### Fine-Grained Reactivity

```typescript
import { 
  ReactiveProxy, createReactiveStore, computed
} from 'annette';

// Create a reactive proxy for property-level reactivity
const proxy = new ReactiveProxy();

// Create a reactive object
const user = proxy.createProxy({
  firstName: "John",
  lastName: "Doe",
  age: 30,
  address: {
    city: "Anytown",
    country: "USA"
  }
});

// Subscribe to specific properties
const nameSubscription = proxy.subscribe("firstName", (newValue, oldValue) => {
  console.log(`First name changed from ${oldValue} to ${newValue}`);
});

// Subscribe to nested properties
const citySubscription = proxy.subscribe("address.city", (newValue, oldValue) => {
  console.log(`City changed from ${oldValue} to ${newValue}`);
});

// Update properties to trigger reactivity
user.firstName = "Jane"; // Logs: "First name changed from John to Jane"
user.address.city = "New City"; // Logs: "City changed from Anytown to New City"

// Create a reactive store with clean API
const store = createReactiveStore();

// Create a reactive object
const todos = store.createReactive({
  items: [
    { id: 1, text: "Learn Annette", completed: true },
    { id: 2, text: "Build an app", completed: false }
  ],
  filter: "all"
});

// Create a computed property
const filteredTodos = store.createComputed(() => {
  console.log("Computing filtered todos...");
  
  if (todos.filter === "all") {
    return todos.items;
  } else if (todos.filter === "active") {
    return todos.items.filter(todo => !todo.completed);
  } else if (todos.filter === "completed") {
    return todos.items.filter(todo => todo.completed);
  }
  
  return todos.items;
});

// Create an effect
store.createEffect(() => {
  console.log("Filtered todos:", 
    filteredTodos().map(t => t.text).join(", ")
  );
});

// Update the filter - effect automatically reruns
todos.filter = "active";
// Logs: "Computing filtered todos..."
// Logs: "Filtered todos: Build an app"

// Add a new todo - effect automatically reruns
todos.items.push({ id: 3, text: "Improve skills", completed: false });
// Logs: "Computing filtered todos..."
// Logs: "Filtered todos: Build an app, Improve skills"
```

#### Component Model

```typescript
import { 
  createComponent, defineComponent, 
  createElement, render
} from 'annette';

// Define component props and state interfaces
interface CounterProps {
  initialCount: number;
  step?: number;
  onIncrement?: (newValue: number) => void;
}

interface CounterState {
  count: number;
  increment: () => void;
  reset: () => void;
}

// Create a component with lifecycle hooks
const Counter = createComponent<CounterProps, CounterState>({
  name: "Counter",
  props: {
    initialCount: 0,
    step: 1
  },
  setup(context) {
    // Access props and context
    const { props, emit, onCleanup, onEffect } = context;
    let count = props.initialCount;
    
    // Set up effects
    onEffect(() => {
      console.log(`Counter value: ${count}`);
    });
    
    // Clean up when component is unmounted
    onCleanup(() => {
      console.log("Counter component cleanup");
    });
    
    // Return component state
    return {
      count,
      increment: () => {
        count += props.step || 1;
        emit("increment", count);
      },
      reset: () => {
        count = props.initialCount;
      }
    };
  },
  hooks: {
    onMounted: () => console.log("Counter mounted"),
    onUpdated: () => console.log("Counter updated"),
    onError: (error) => console.error("Error:", error.message)
  }
});

// Create a reusable component with JSX-like syntax
const TodoItem = defineComponent({
  name: "TodoItem",
  props: {
    id: Number,
    text: String,
    completed: Boolean,
    onToggle: Function
  },
  setup(context) {
    return {
      toggle: () => {
        context.props.onToggle(context.props.id);
      }
    };
  },
  render(state, props) {
    return createElement(
      "li",
      { 
        className: props.completed ? "completed" : "",
        onClick: state.toggle
      },
      props.text
    );
  }
});

// Example usage
render(
  createElement(Counter, { 
    initialCount: 5,
    step: 2,
    onIncrement: (value) => console.log(`Incremented to ${value}`)
  }),
  document.getElementById("app")
);
```

### Algebraic Effects

Annette provides a comprehensive algebraic effects system for handling asynchronous operations, side effects, and more.

#### Basic Effect Handling

```typescript
import { Network, EffectAgent, HandlerAgent, registerEffectRules } from 'annette';

// Create a network and register effect rules
const network = Network("effect-demo");
registerEffectRules(network);

// Create a handler for fetch effects
const fetchHandler = HandlerAgent({
  'fetch': async (effect) => {
    // Perform async fetch
    const response = await fetch(effect.url);
    return await response.json();
  }
});

// Create a fetch effect
const fetchEffect = EffectAgent({
  type: 'fetch',
  url: 'https://api.example.com/users/1'
});

// Add agents to the network
network.addAgent(fetchHandler);
network.addAgent(fetchEffect);

// Connect the effect to the handler
network.connectPorts(fetchEffect.ports.hold, fetchHandler.ports.hold);

// Start the effect processing
network.reduce();

// When the async operation completes, a Result agent will be created
```

#### Multiple Effect Types

```typescript
import { 
  Network, Constructor, EffectAgent, HandlerAgent, 
  ResultScanner, registerEffectRules 
} from 'annette';

// Create a network with effect rules
const network = Network("multi-effect-demo");
registerEffectRules(network);

// Create component that will use effects
const userProfile = Constructor({
  name: "UserProfile",
  userId: "user123",
  data: null,
  preferences: null
});

// Create multiple effect types
const fetchUserEffect = EffectAgent({
  type: 'fetch',
  url: 'https://api.example.com/users/user123'
});

const getPreferencesEffect = EffectAgent({
  type: 'storage',
  operation: 'get',
  key: 'user_preferences_user123'
});

const logEffect = EffectAgent({
  type: 'log',
  level: 'info',
  message: 'Loading user profile'
});

// Create a multi-purpose handler with different effect handlers
const effectHandler = HandlerAgent({
  // Fetch handler
  'fetch': async (effect) => {
    console.log(`Fetching data from ${effect.url}`);
    const response = await fetch(effect.url);
    return await response.json();
  },
  
  // Storage handler
  'storage': async (effect) => {
    if (effect.operation === 'get') {
      console.log(`Getting ${effect.key} from storage`);
      const data = localStorage.getItem(effect.key);
      return data ? JSON.parse(data) : null;
    } else if (effect.operation === 'set') {
      console.log(`Setting ${effect.key} in storage`);
      localStorage.setItem(effect.key, JSON.stringify(effect.value));
      return true;
    }
    return null;
  },
  
  // Logging handler
  'log': (effect) => {
    const { level, message } = effect;
    console[level](message);
    return true;
  }
});

// Create a result scanner to handle completed effects
const scanner = ResultScanner();

// Add agents to the network
network.addAgent(userProfile);
network.addAgent(fetchUserEffect);
network.addAgent(getPreferencesEffect);
network.addAgent(logEffect);
network.addAgent(effectHandler);
network.addAgent(scanner);

// Connect component to effects via wait ports
network.connectPorts(userProfile.ports.wait, fetchUserEffect.ports.wait);
network.connectPorts(userProfile.ports.wait, getPreferencesEffect.ports.wait);
network.connectPorts(userProfile.ports.wait, logEffect.ports.wait);

// Connect effects to handler via hold ports
network.connectPorts(fetchUserEffect.ports.hold, effectHandler.ports.hold);
network.connectPorts(getPreferencesEffect.ports.hold, effectHandler.ports.hold);
network.connectPorts(logEffect.ports.hold, effectHandler.ports.hold);

// Start processing effects
network.reduce();

// When effects complete, Result agents will be created and connected to the waiting component
```

#### Composing Effects and Custom Effect Types

```typescript
import { 
  Network, Agent, Port, EffectAgent, HandlerAgent, 
  registerEffectRules, ResultScanner 
} from 'annette';

// Create a network and register effect rules
const network = Network("composed-effects");
registerEffectRules(network);

// Create a component with custom ports
const documentEditor = Agent("DocumentEditor", 
  { 
    docId: "doc-123", 
    content: "", 
    collaborators: [],
    isSaving: false,
    isLoading: true,
    error: null
  },
  {
    main: Port("main", "main"),
    load: Port("load", "wait"),   // Wait port for loading
    save: Port("save", "wait"),   // Wait port for saving
    log: Port("log", "wait")      // Wait port for logging
  }
);

// Create custom effect types
const loadDocEffect = EffectAgent({
  type: 'database',
  operation: 'get',
  collection: 'documents',
  id: documentEditor.value.docId
});

const saveDocEffect = EffectAgent({
  type: 'database',
  operation: 'update',
  collection: 'documents',
  id: documentEditor.value.docId,
  data: { content: documentEditor.value.content }
});

const logActivity = EffectAgent({
  type: 'analytics',
  event: 'doc_edit',
  data: {
    documentId: documentEditor.value.docId,
    timestamp: Date.now()
  }
});

// Create handlers for different effect types
const databaseHandler = HandlerAgent({
  'database': async (effect) => {
    console.log(`Database operation: ${effect.operation} on ${effect.collection}`);
    
    // Simulate async database operations
    if (effect.operation === 'get') {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mock document data
      return {
        id: effect.id,
        content: "This is the document content",
        collaborators: ["user1", "user2"]
      };
    } 
    else if (effect.operation === 'update') {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 700));
      
      // Mock update response
      return {
        success: true,
        updatedAt: new Date().toISOString()
      };
    }
    
    return { error: "Unsupported operation" };
  }
});

const analyticsHandler = HandlerAgent({
  'analytics': (effect) => {
    console.log(`Analytics event: ${effect.event}`, effect.data);
    
    // In a real implementation, send to analytics service
    return { success: true, tracked: true };
  }
});

// Create a result scanner to process completed effects
const scanner = ResultScanner();

// Add all agents to the network
network.addAgent(documentEditor);
network.addAgent(loadDocEffect);
network.addAgent(saveDocEffect);
network.addAgent(logActivity);
network.addAgent(databaseHandler);
network.addAgent(analyticsHandler);
network.addAgent(scanner);

// Connect the document editor to effects
network.connectPorts(documentEditor.ports.load, loadDocEffect.ports.wait);
network.connectPorts(documentEditor.ports.save, saveDocEffect.ports.wait);
network.connectPorts(documentEditor.ports.log, logActivity.ports.wait);

// Connect effects to handlers
network.connectPorts(loadDocEffect.ports.hold, databaseHandler.ports.hold);
network.connectPorts(saveDocEffect.ports.hold, databaseHandler.ports.hold);
network.connectPorts(logActivity.ports.hold, analyticsHandler.ports.hold);

// Add rule to handle load document result
network.addRule(ActionRule(
  documentEditor.ports.load,
  // This port will be connected to the result agent created by the effect system
  documentEditor.ports.load,
  (editor, result) => {
    if (result.value.error) {
      editor.value.error = result.value.error;
    } else {
      editor.value.content = result.value.content;
      editor.value.collaborators = result.value.collaborators;
      editor.value.isLoading = false;
    }
    return [editor];
  }
));

// Execute the network to start processing effects
network.reduce();
```

### Serialization with Isomorphic References

Annette provides advanced serialization capabilities for handling complex data structures, preserving references across contexts, and supporting client-server communication.

#### Basic Serialization and Deserialization

```typescript
import {
  serializeValue, deserializeValue,
  registerIsomorphicReference, deepClone,
  Feature
} from 'annette';

// 1. Basic serialization of complex values (including cyclic references)
const user = { 
  name: "Alice",
  createdAt: new Date(),
  preferences: {
    theme: "dark",
    notifications: {
      email: true,
      push: false
    }
  }
};
user.self = user; // Cyclic reference

const serialized = serializeValue(user);
console.log(serialized); // Serialized string with special encoding for circular refs

const deserialized = deserializeValue(serialized);
console.log(deserialized.self === deserialized); // true
console.log(deserialized.createdAt instanceof Date); // true
```

#### Deep Cloning and Structured Cloning

```typescript
import { deepClone } from 'annette';

// Complex object with circular references
const complexObj = {
  name: "Complex Object",
  created: new Date(),
  nested: {
    data: new Uint8Array([1, 2, 3, 4]),
    regex: /test-pattern/i
  }
};
complexObj.circular = complexObj;

// Deep clone using the most efficient method
// Uses structuredClone when available, falls back to serialization
const cloned = deepClone(complexObj);

// Verify the clone worked properly
console.log(cloned.circular === cloned); // true
console.log(cloned !== complexObj); // true
console.log(cloned.nested.data instanceof Uint8Array); // true
console.log(cloned.nested.regex instanceof RegExp); // true
```

#### Isomorphic References for Functions and Objects

```typescript
import {
  serializeValue, deserializeValue,
  registerIsomorphicReference
} from 'annette';

// Register a function as an isomorphic reference
const calculateTotal = registerIsomorphicReference(
  'calculate-total',
  (items) => items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
);

// Register a shared utility object
const formatter = registerIsomorphicReference(
  'price-formatter',
  {
    format: (price) => `$${price.toFixed(2)}`,
    parse: (str) => parseFloat(str.replace('$', ''))
  }
);

// Create a shopping cart with the function and shared utility
const shoppingCart = {
  items: [
    { name: 'Product A', price: 10, quantity: 2 },
    { name: 'Product B', price: 25, quantity: 1 }
  ],
  calculateTotal,
  formatter
};

// Serialize the cart with its references
const serializedCart = serializeValue(shoppingCart);

// In another context (or after storage/transmission)
const deserializedCart = deserializeValue(serializedCart);

// Functions and objects work correctly
console.log(deserializedCart.calculateTotal(deserializedCart.items)); // 45
console.log(deserializedCart.formatter.format(45)); // "$45.00"
```

#### Cross-Reference Serialization for Multiple Objects

```typescript
import {
  serializeForTransport, deserializeFromTransport
} from 'annette';

// Create shared objects that should maintain their identity
const sharedState = { counter: 0 };

// Create multiple objects that reference the shared state
const component1 = { 
  name: "Component 1", 
  state: sharedState,
  increment() { this.state.counter++; }
};

const component2 = { 
  name: "Component 2", 
  state: sharedState,
  display() { return `Count: ${this.state.counter}`; }
};

// Create a reference-tracking map
const refs = new Map();
const scopeId = "app-123";

// Serialize both components with cross-references
const serial1 = serializeForTransport(component1, { refs, scopeId });
const serial2 = serializeForTransport(component2, { refs, scopeId });

// In another context (or after storage/transmission)
const deserialized1 = deserializeFromTransport(serial1);
const deserialized2 = deserializeFromTransport(serial2);

// Verify shared references were preserved
console.log(deserialized1.state === deserialized2.state); // true

// Modify through one component
deserialized1.increment();
console.log(deserialized2.display()); // "Count: 1"
```

#### Advanced Serialization Options for Compatibility

```typescript
import { 
  serializeValue, deserializeValue, 
  Feature, serializeNetwork, serializeAgent
} from 'annette';

// Define specific browser compatibility options
const compatibilityOptions = {
  // Disable features that might not be available in older browsers
  disabledFeatures: Feature.BigIntTypedArray | Feature.ObjectAssign,
  // Use JSON-safe serialization for transport
  jsonSafe: true
};

// Create a complex object
const complexData = {
  appState: {
    user: {
      id: 123,
      name: "User Name",
      sessions: [
        { date: new Date(), duration: 120 },
        { date: new Date(Date.now() - 86400000), duration: 45 }
      ]
    },
    settings: {
      theme: "light",
      language: "en"
    }
  }
};

// Serialize with compatibility options
const compatibleSerialized = serializeValue(complexData, compatibilityOptions);

// This serialized string can be safely transmitted or stored
// and will work in environments with the specified limitations

// Deserialize in another context
const deserializedData = deserializeValue(compatibleSerialized);

// Annette-specific serialization
const myNetwork = Network("my-network");
// ... add agents and connections ...

// Serialize the entire network
const serializedNetwork = serializeNetwork(myNetwork, compatibilityOptions);

// Serialize a specific agent
const myAgent = Agent("MyAgent", { data: "value" });
const serializedAgent = serializeAgent(myAgent, compatibilityOptions);
```

## Core Concepts

For more detailed API documentation, see the [API Documentation](./api-documentation.md).

### Agents

Agents are the fundamental units in Annette. Each agent has:
- A name (acts as its "type")
- A mutable value
- Named ports for connections
- A unique ID (internal)

```typescript
const counter = Agent("Counter", 0);
const displayAgent = Agent("Display", { text: "Count: 0" });
```

### Ports

Ports are the interface points of agents. They have:
- A name
- A type (main/aux)
- Connection to exactly one other port

```typescript
// Agent with custom ports
const agent = Agent("CustomAgent", { data: "value" }, {
  main: Port("main", "main"),
  input: Port("input", "aux"),
  output: Port("output", "aux")
});
```

### Networks

Networks manage agents, connections, and rules:
- Add/remove agents
- Establish connections between ports
- Register interaction rules
- Execute reduction steps

```typescript
const net = Network("myNetwork");
net.addAgent(agent1);
net.addAgent(agent2);
net.connectPorts(agent1.ports.main, agent2.ports.input);
net.step(); // Execute one reduction step
net.reduce(); // Reduce until no more rules apply
```

### Rules

Annette supports two types of rules:

#### ActionRule

Imperative rules that can perform arbitrary logic:

```typescript
const incrementRule = ActionRule(
  counter.ports.main,
  increment.ports.main,
  (counter, increment) => {
    counter.value += increment.value;
    return [counter, increment];
  }
  // Name is optional - auto-generated if omitted
);
```

#### RewriteRule

Declarative rules that specify a replacement pattern:

```typescript
const doubleRule = RewriteRule(
  number.ports.main,
  doubler.ports.main,
  {
    newAgents: [
      { name: "Number", initialValue: 0, _templateId: "newNumber" }
    ],
    internalConnections: [],
    portMapAgent1: {
      aux: { newAgentTemplateId: "newNumber", newPortName: "aux" }
    },
    portMapAgent2: {
      // No port mappings needed
    }
  }
  // Name is optional - auto-generated if omitted
);
```

### Optional Names and Connection Passing

Annette supports optional names for rules, connections, and other entities. Names are auto-generated with descriptive defaults if not provided:

```typescript
import { Agent, Network, ActionRule, RewriteRule, Connection } from 'annette';

// Create a network and agents
const net = Network("connection-example");
const counter = Agent("Counter", { count: 0 });
const increment = Agent("Increment", { amount: 5 });

// Create a connection without specifying a name (auto-generated)
const conn = Connection(counter.ports.main, increment.ports.main);
console.log(`Generated connection name: ${conn.name}`);
// Output: "Generated connection name: Counter.main(main)-to-Increment.main(main)"

// Create an ActionRule with optional name at the end
const rule1 = ActionRule(
  counter.ports.main,
  increment.ports.main,
  (counter, increment) => {
    counter.value.count += increment.value.amount;
    return [counter, increment];
  },
  "increment-rule" // Optional name at the end
);

// Create an ActionRule without a name (auto-generated)
const rule2 = ActionRule(
  counter.ports.main,
  increment.ports.main,
  (counter, increment) => {
    counter.value.count += increment.value.amount;
    return [counter, increment];
  }
  // No name provided - auto-generated with format: [agent1].[port1]-to-[agent2].[port2]
);
console.log(`Auto-generated rule name: ${rule2.name}`);
// Output: "Auto-generated rule name: Counter.main-to-Increment.main"

// Create an ActionRule using a connection directly
const rule3 = ActionRule(
  conn, // Pass the connection object directly
  (counter, increment) => {
    counter.value.count += increment.value.amount;
    return [counter, increment];
  },
  "connection-based-rule" // Optional name at the end
);

// RewriteRule can also be created with connection objects and optional names
const rewriteRule = RewriteRule(
  conn, // Pass connection directly
  (counter, increment) => {
    // Rewrite definition...
    return {
      newAgents: [
        { name: "Result", initialValue: counter.value.count, _templateId: "result" }
      ],
      internalConnections: [],
      portMapAgent1: {},
      portMapAgent2: {}
    };
  }
  // No name provided - auto-generated with format: rewrite-[agent1].[port1]-to-[agent2].[port2]
);
```

#### Auto-Generated Naming Conventions

When names are not provided, Annette uses the following conventions:

1. **Connection names**: `${agent1.name}.${port1.name}(${port1.type})-to-${agent2.name}.${port2.name}(${port2.type})`
2. **ActionRule names**: `${agent1.name}.${port1.name}-to-${agent2.name}.${port2.name}`
3. **RewriteRule names**: `rewrite-${agent1.name}.${port1.name}-to-${agent2.name}.${port2.name}`

This allows for descriptive debugging while keeping the API concise.

## Advanced Features

See the [API Documentation](./api-documentation.md#advanced-features) for detailed explanations of these features.

### Unified Architecture

Annette uses a plugin-based architecture with clear abstraction layers:

```typescript
import { createPluginNetwork, ReactivityPlugin, EffectPlugin } from 'annette';

// Create a plugin-based network
const network = createPluginNetwork('app');

// Register standard plugins
network.registerPlugin(new ReactivityPlugin());
network.registerPlugin(new EffectPlugin());

// Listen for events
network.addEventListener('agent-added', (event) => {
  console.log(`Agent added: ${event.data.agent.name}`);
});
```

#### Creating Custom Plugins

You can extend Annette with custom plugins for application-specific functionality:

```typescript
import { BasePlugin, IPluginNetwork, IAgent } from 'annette';

// Create a custom analytics plugin
class AnalyticsPlugin extends BasePlugin {
  constructor() {
    super({
      id: 'analytics',
      name: 'Analytics Plugin',
      description: 'Tracks agent interactions for analytics'
    });
    
    this.interactions = [];
  }
  
  initialize(network: IPluginNetwork) {
    super.initialize(network);
    
    // Subscribe to network events
    this.network.addEventListener('rule-applied', this.onRuleApplied.bind(this));
    this.network.addEventListener('agent-added', this.onAgentAdded.bind(this));
    
    console.log('Analytics plugin initialized');
  }
  
  onRuleApplied(event) {
    this.interactions.push({
      timestamp: Date.now(),
      ruleName: event.data.rule.name,
      agents: [event.data.agent1.name, event.data.agent2.name]
    });
  }
  
  onAgentAdded(event) {
    console.log(`New agent added: ${event.data.agent.name}`);
  }
  
  getInteractionStats() {
    // Compute analytics based on interactions
    const stats = {
      totalInteractions: this.interactions.length,
      agentCounts: this.interactions.reduce((counts, int) => {
        int.agents.forEach(agent => {
          counts[agent] = (counts[agent] || 0) + 1;
        });
        return counts;
      }, {})
    };
    
    return stats;
  }
  
  shutdown() {
    // Clean up any resources
    this.interactions = [];
    console.log('Analytics plugin shut down');
  }
}

// Usage
const network = createPluginNetwork('analytics-demo');
const analyticsPlugin = new AnalyticsPlugin();
network.registerPlugin(analyticsPlugin);

// Later, get analytics data
const stats = analyticsPlugin.getInteractionStats();
console.log(`Total interactions: ${stats.totalInteractions}`);
```

### State Management

Annette provides powerful state management with change tracking, time travel, and specialized updaters.

#### Tracked Actions with Change History

```typescript
import { Agent, Network, TrackedAction } from 'annette';

// Create a counter with tracked state
const counter = Agent('Counter', { count: 0 });
const incrementer = Agent('Incrementer', { by: 5 });

// Create a network
const network = Network('TrackedExample', [counter, incrementer]);

// Add a tracked action rule
network.addRule(TrackedAction(
  counter.ports.main,
  incrementer.ports.main,
  (counter, incrementer) => {
    counter.value.count += incrementer.value.by;
    return [counter, incrementer];
  }
));

// Connect and apply
network.connectPorts(counter.ports.main, incrementer.ports.main);
network.step();

// View the complete change history
const history = network.getChangeHistory();
console.log(history);
/* Output:
[
  {
    timestamp: 1621478562789,
    ruleName: "Counter.main-to-Incrementer.main",
    targetId: "counter-123",
    targetName: "Counter",
    updaterId: "incrementer-456",
    updaterName: "Incrementer",
    previousState: { count: 0 },
    newState: { count: 5 },
    description: "Updated Counter from Incrementer"
  }
]
*/
```

#### Detailed Time Travel with Snapshots

```typescript
import { TimeTravelNetwork, Agent, ActionRule } from 'annette';

// Create a network with time travel
const network = TimeTravelNetwork("todo-app");

// Create task list and action agents
const taskList = Agent("TaskList", { tasks: [] });
const addTask = Agent("AddTask", { text: "Buy groceries" });
const removeTask = Agent("RemoveTask", { index: 0 });

// Add agents to network
network.addAgent(taskList);
network.addAgent(addTask);
network.addAgent(removeTask);

// Add rules
network.addRule(ActionRule(
  taskList.ports.main,
  addTask.ports.main,
  (list, action) => {
    list.value.tasks.push(action.value.text);
    return [list, action];
  }
));

network.addRule(ActionRule(
  taskList.ports.main,
  removeTask.ports.main,
  (list, action) => {
    if (action.value.index >= 0 && action.value.index < list.value.tasks.length) {
      list.value.tasks.splice(action.value.index, 1);
    }
    return [list, action];
  }
));

// Take initial snapshot
const initialSnapshot = network.takeSnapshot("Initial state");

// Add a task
network.connectPorts(taskList.ports.main, addTask.ports.main);
network.step();
console.log("After adding:", taskList.value.tasks); // ["Buy groceries"]

// Take snapshot after adding
const addSnapshot = network.takeSnapshot("After adding task");

// Change remove task index and connect
removeTask.value.index = 0;
network.connectPorts(taskList.ports.main, removeTask.ports.main);
network.step();
console.log("After removing:", taskList.value.tasks); // []

// Take snapshot after removing
const removeSnapshot = network.takeSnapshot("After removing task");

// Roll back to the state after adding
network.rollbackTo(addSnapshot.id);
console.log("After rollback:", taskList.value.tasks); // ["Buy groceries"]

// Get all snapshots
const snapshots = network.getSnapshots();
console.log("Number of snapshots:", snapshots.length); // 3

// Compare snapshots
const comparison = network.compareSnapshots(
  initialSnapshot.id,
  addSnapshot.id
);
console.log("Changes between snapshots:", comparison);
/* Output might look like:
{
  agentsAdded: [],
  agentsRemoved: [],
  agentsChanged: [
    {
      id: "tasklist-123",
      name: "TaskList",
      changes: {
        "value.tasks": {
          before: [],
          after: ["Buy groceries"]
        }
      }
    }
  ],
  connectionsAdded: [...],
  connectionsRemoved: [...]
}
*/
```

#### Structured Updates with Specialized Updaters

```typescript
import { 
  Network, 
  createSharedMap, createSharedList, createSharedText, 
  MapUpdater, ListUpdater, TextUpdater,
  registerSpecializedUpdaterRules
} from 'annette';

// Create a network with specialized updater rules
const network = Network("structured-data");
registerSpecializedUpdaterRules(network);

// Create structured data agents
const userProfile = createSharedMap({
  name: "John Doe",
  email: "john@example.com",
  settings: {
    darkMode: false,
    notifications: true
  }
});

const todoList = createSharedList([
  "Finish report",
  "Call client"
]);

const document = createSharedText("This is a collaborative document.");

// Add agents to network
network.addAgent(userProfile);
network.addAgent(todoList);
network.addAgent(document);

// Create specialized updaters
const updateSettings = MapUpdater(
  { 
    type: 'merge', 
    key: 'settings', 
    value: { darkMode: true } 
  }
);

const addTodoItem = ListUpdater(
  { 
    type: 'insert', 
    index: 1, 
    value: "Buy anniversary gift" 
  }
);

const editDocument = TextUpdater(
  { 
    type: 'splice', 
    position: 10, 
    deleteCount: 1, 
    value: "collaborative real-time" 
  }
);

// Add updaters to network
network.addAgent(updateSettings);
network.addAgent(addTodoItem);
network.addAgent(editDocument);

// Connect updaters to their targets
network.connectPorts(updateSettings.ports.main, userProfile.ports.main);
network.connectPorts(addTodoItem.ports.main, todoList.ports.main);
network.connectPorts(editDocument.ports.main, document.ports.main);

// Execute all updates
network.reduce();

// Check updated values
console.log(userProfile.value.settings); // { darkMode: true, notifications: true }
console.log(todoList.value); // ["Finish report", "Buy anniversary gift", "Call client"]
console.log(document.value); // "This is a collaborative real-time document."
```

### Distributed Systems

Annette provides powerful tools for building distributed systems with coordination, synchronization, and conflict resolution.

#### Vector Clocks for Causality Tracking

```typescript
import { VectorClock, VersionedData } from 'annette';

// Create vector clocks for tracking causality
const clockA = new VectorClock();
const clockB = new VectorClock();

// Update clocks to represent operations on different nodes
clockA.increment("nodeA");
clockB.increment("nodeB");

// Create versioned data with vector clocks
const docA = new VersionedData(
  { text: "Hello from Node A" },
  clockA.clone()
);

const docB = new VersionedData(
  { text: "Hello from Node B" },
  clockB.clone()
);

// Check causality relationships
console.log("A before B?", clockA.isBefore(clockB)); // false
console.log("B before A?", clockB.isBefore(clockA)); // false
console.log("A concurrent with B?", clockA.isConcurrentWith(clockB)); // true

// Merge clocks (e.g., after receiving updates from other nodes)
clockB.merge(clockA);
console.log("After merge - A before B?", clockA.isBefore(clockB)); // true

// Update node A and increment its clock
docA.value.text = "Updated on Node A";
clockA.increment("nodeA");
docA.vectorClock = clockA.clone();

// Now we have a causality conflict
console.log("A concurrent with B?", clockA.isConcurrentWith(clockB)); // false
console.log("A before B?", clockA.isBefore(clockB)); // false
console.log("B before A?", clockB.isBefore(clockA)); // false
```

#### Conflict Resolution Strategies

```typescript
import { 
  VectorClock, ConflictResolver, 
  conflictStrategies, ConflictMetadata 
} from 'annette';

// Create a conflict resolver
const resolver = new ConflictResolver();

// Create test data
const localData = { count: 5, text: "Local value" };
const remoteData = { count: 10, text: "Remote value" };

// Create conflict metadata
const metadata: ConflictMetadata = {
  localTimestamp: Date.now() - 1000,
  remoteTimestamp: Date.now(),
  localNodeId: "node1",
  remoteNodeId: "node2",
  path: ["count"],
  localClock: new VectorClock().increment("node1"),
  remoteClock: new VectorClock().increment("node2")
};

// Apply different resolution strategies
const lastWriteWinsResult = resolver.resolve(
  localData.count,
  remoteData.count,
  metadata,
  "lastWriteWins"
);
console.log("Last write wins:", lastWriteWinsResult); // 10 (remote value)

// Use higher value strategy
const higherValueResult = resolver.resolve(
  localData.count,
  remoteData.count,
  metadata,
  "highestValue"
);
console.log("Higher value:", higherValueResult); // 10

// Custom merge strategy for text values
const customStrategy = conflictStrategies.customStrategy(
  "textConcat",
  (local, remote, meta) => {
    if (typeof local === 'string' && typeof remote === 'string') {
      return `${local} + ${remote}`;
    }
    // Fallback to remote value
    return remote;
  }
);

// Register the custom strategy
resolver.registerStrategy(customStrategy);

// Use the custom strategy
const textMergeResult = resolver.resolve(
  localData.text,
  remoteData.text,
  {
    ...metadata,
    path: ["text"]
  },
  "textConcat"
);
console.log("Text merge:", textMergeResult); // "Local value + Remote value"
```

#### Cross-Network Synchronization

```typescript
import { 
  Network, SyncAgent, RemoteAgent, SyncNetwork,
  registerSyncRules, applyRemoteOperations 
} from 'annette';

// Create two networks (e.g., client and server)
const clientNetwork = SyncNetwork("client-network", "client-1");
const serverNetwork = SyncNetwork("server-network", "server-1");

// Register sync rules on both networks
registerSyncRules(clientNetwork);
registerSyncRules(serverNetwork);

// Create a shared document on the client
const clientDoc = Agent("Document", {
  id: "doc-123",
  title: "Shared Document",
  content: "Initial content from client",
  lastEdited: Date.now()
}, {
  main: Port("main", "main"),
  sync: Port("sync", "sync") // Special port for synchronization
});

// Create a remote proxy on the server
const serverDoc = RemoteAgent(
  "client-network", // Source network
  clientDoc._agentId, // Source agent ID
  {
    id: "doc-123",
    title: "",
    content: "",
    lastEdited: 0
  }
);

// Add agents to their networks
clientNetwork.addAgent(clientDoc);
serverNetwork.addAgent(serverDoc);

// Make changes on the client
clientDoc.value.title = "Updated Title";
clientDoc.value.content = "Updated content with important changes";
clientDoc.value.lastEdited = Date.now();

// Collect operations from client
const clientOps = clientNetwork.collectOperations(0); // Get all ops since beginning

// Apply client operations to server
serverNetwork.applyOperations(clientOps);

// Verify server doc has the updates
console.log(serverDoc.value);
/* Output:
{
  id: "doc-123",
  title: "Updated Title",
  content: "Updated content with important changes",
  lastEdited: 1625097645123
}
*/

// Make changes on server
serverDoc.value.content += " with server additions";
serverDoc.value.lastEdited = Date.now();

// Collect operations from server
const serverOps = serverNetwork.collectOperations(0);

// Apply server operations to client
clientNetwork.applyOperations(serverOps);

// Verify bidirectional sync
console.log(clientDoc.value.content); 
// "Updated content with important changes with server additions"
```

### Specialized Data Structures and Custom Updaters

Annette includes optimized updaters for different data types and allows you to create custom updaters for domain-specific operations.

#### Built-in Specialized Data Structures

```typescript
import { 
  createSharedMap, createSharedList, createSharedText, createSharedCounter,
  MapUpdater, ListUpdater, TextUpdater, CounterUpdater,
  registerSpecializedUpdaterRules
} from 'annette';

// Create a network with updater rules
const network = Network("data-structures");
registerSpecializedUpdaterRules(network);

// Create shared data structures
const userMap = createSharedMap({
  name: "John",
  preferences: { theme: "light", fontSize: 12 },
  metadata: { lastLogin: new Date() }
});

const todoList = createSharedList([
  "Buy groceries",
  "Walk the dog"
]);

const document = createSharedText("This is a collaborative document");

const viewCounter = createSharedCounter(0);

// Add structures to the network
network.addAgent(userMap);
network.addAgent(todoList);
network.addAgent(document);
network.addAgent(viewCounter);

// Create specialized updaters
const updatePreferences = MapUpdater(
  { type: 'merge', key: 'preferences', value: { theme: "dark", notifications: true } },
  []
);

const addTodoItem = ListUpdater(
  { type: 'insert', index: 1, value: "Call mom" },
  []
);

const editText = TextUpdater(
  { type: 'splice', position: 10, deleteCount: 0, value: " real-time" },
  []
);

const incrementCounter = CounterUpdater(
  { type: 'increment', value: 1 },
  []
);

// Add updaters to network
network.addAgent(updatePreferences);
network.addAgent(addTodoItem);
network.addAgent(editText);
network.addAgent(incrementCounter);

// Connect updaters to their targets
network.connectPorts(updatePreferences.ports.main, userMap.ports.main);
network.connectPorts(addTodoItem.ports.main, todoList.ports.main);
network.connectPorts(editText.ports.main, document.ports.main);
network.connectPorts(incrementCounter.ports.main, viewCounter.ports.main);

// Execute all updates
network.reduce();

// Check the results
console.log(userMap.value.preferences); 
// { theme: "dark", fontSize: 12, notifications: true }

console.log(todoList.value); 
// ["Buy groceries", "Call mom", "Walk the dog"]

console.log(document.value); 
// "This is a real-time collaborative document"

console.log(viewCounter.value); 
// 1
```

#### Creating Custom Updaters

```typescript
import {
  defineUpdater, composeUpdaters, applyUpdate,
  SetUpdater, MergeUpdater, IncrementUpdater
} from 'annette';

// Define a custom updater for toggling boolean values
const toggleDefinition = {
  type: "toggle",
  
  // Apply function implements the update logic
  apply: (value, operation) => {
    // Simply invert the boolean value
    return !value;
  },
  
  // Merge function combines multiple operations of the same type
  merge: (op1, op2) => {
    // Toggle twice cancels out, odd number of toggles is a single toggle
    return { toggleCount: (op1.toggleCount || 1) + (op2.toggleCount || 1) };
  },
  
  // Invert function creates the inverse operation
  invert: (op) => {
    // Inverting a toggle is just another toggle
    return op;
  }
};

// Register the custom updater
const ToggleUpdater = defineUpdater(toggleDefinition);

// Use the custom updater
let featureFlags = { 
  darkMode: false,
  notifications: true,
  experimental: false
};

// Create and apply the toggle updater
const toggleDarkMode = ToggleUpdater({}, ["darkMode"]);
featureFlags = applyUpdate(featureFlags, toggleDarkMode);

console.log(featureFlags.darkMode); // true

// Create a string transformer updater
const stringTransformerDefinition = {
  type: "stringTransform",
  
  apply: (value, operation) => {
    if (typeof value !== 'string') return value;
    
    switch (operation.transform) {
      case "uppercase":
        return value.toUpperCase();
      case "lowercase":
        return value.toLowerCase();
      case "capitalize":
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      case "trim":
        return value.trim();
      default:
        return value;
    }
  },
  
  merge: (op1, op2) => {
    // Return the second operation as it would override the first
    return op2;
  },
  
  invert: (op) => {
    // Most string transforms don't have simple inverses
    // Could implement with original value tracking if needed
    return { transform: "identity" };
  }
};

// Register the string transformer
const StringTransformUpdater = defineUpdater(stringTransformerDefinition);

// Use the string transformer
let userData = {
  username: "john_doe",
  displayName: "john smith",
  email: "JOHN@EXAMPLE.COM"
};

// Create string transform updaters
const capitalizeDisplayName = StringTransformUpdater(
  { transform: "capitalize" },
  ["displayName"]
);

const lowercaseEmail = StringTransformUpdater(
  { transform: "lowercase" },
  ["email"]
);

// Apply the updates
userData = applyUpdate(userData, capitalizeDisplayName);
userData = applyUpdate(userData, lowercaseEmail);

console.log(userData.displayName); // "John smith"
console.log(userData.email); // "john@example.com"

// Compose multiple updaters for complex operations
const compositeUpdater = composeUpdaters(
  capitalizeDisplayName,
  lowercaseEmail,
  ToggleUpdater({}, ["verified"])
);

// Apply the composite updater to make multiple changes at once
userData = {
  username: "jane_doe",
  displayName: "jane smith",
  email: "JANE@EXAMPLE.COM",
  verified: false
};

userData = applyUpdate(userData, compositeUpdater);

console.log(userData);
/* Output:
{
  username: "jane_doe",
  displayName: "Jane smith",
  email: "jane@example.com",
  verified: true
}
*/
```

## Why Annette?

- **Unified Programming Model**: Harmonized abstractions for reactive programming, state management, and distributed systems
- **Progressive Disclosure**: Simple APIs for basic use cases with powerful features when needed
- **Type Safety**: Full TypeScript integration with strong typing throughout
- **Performance**: Optimized rule matching, lazy evaluation, and structural sharing
- **Flexibility**: Mix imperative and declarative styles as needed
- **Modularity**: Plugin architecture for extending functionality
- **Developer Experience**: Rich debugging, time travel, and tracing capabilities
- **Isomorphic**: Works in both Node.js and browser environments
- **Serialization**: First-class support for client-server communication

### Feature Comparison

Here's how Annette compares to other libraries in the ecosystem:

| Feature | Annette | Redux | MobX | XState | Recoil | Immer |
|---------|---------|-------|------|--------|--------|-------|
| **State Management** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Immutable Updates** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Mutable API** | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| **Time Travel** | ✅ | ✅* | ❌ | ✅* | ❌ | ❌ |
| **Reactivity** | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Fine-grained Updates** | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **State Machines** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Distributed Sync** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Algebraic Effects** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Type Safety** | ✅ | ✅* | ✅ | ✅ | ✅ | ✅ |
| **Serialization** | ✅ | ✅* | ❌ | ✅* | ❌ | ❌ |
| **Conflict Resolution** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

*With additional libraries or configuration

### Use Cases

Annette is particularly well-suited for:

1. **Complex State Management**: Applications with rich, interconnected state that benefits from a graph-based approach
2. **Real-time Collaboration**: Multi-user applications that need conflict resolution and synchronization
3. **Offline-First Apps**: Applications that must function offline and reconcile changes later
4. **State Machines**: Applications with complex state transitions and behaviors
5. **Time Travel Debugging**: Applications where debugging state changes is critical
6. **Cross-Context Communication**: Applications that need to share state between different contexts (e.g., workers, iframes)
7. **TypeScript Projects**: Teams that value strong typing and compile-time safety

## Architecture

Annette is organized into clear abstraction layers:

1. **[Core Engine](./api-documentation.md#core-engine-layer)**: The fundamental interaction net primitives
2. **[Standard Library](./api-documentation.md#standard-library-layer)**: Common agents, rules, and patterns
3. **[Application Layer](./api-documentation.md#application-layer)**: Domain-specific components and high-level APIs

Each layer builds on the previous, allowing you to use just what you need.

### Detailed Layer Structure

```
Annette
│
├── Core Engine Layer
│   ├── Agent system
│   ├── Port system
│   ├── Connection system
│   ├── Rule system (Action/Rewrite)
│   └── Network system
│
├── Standard Library Layer
│   ├── Time Travel system
│   ├── Updater system
│   ├── Effect system
│   ├── Sync system
│   ├── Connection History
│   ├── Specialized Updaters
│   ├── Reactive system
│   └── Plugin system
│
└── Application Layer
    ├── Serialization
    ├── Distributed Networks
    ├── Vector Clocks
    ├── Conflict Resolution
    ├── Fine-grained Reactivity
    ├── Component Model
    └── Custom Updaters
```

You can import from specific layers based on your needs:

```typescript
// Core layer only
import { Core } from 'annette';
const network = Core.createNetwork('minimal');

// Standard library
import { StdLib } from 'annette';
const enhancedNetwork = StdLib.createEnhancedNetwork('full-featured');

// Specific features
import { 
  Agent, Network, ActionRule,  // Core
  TimeTravelNetwork,           // Standard Library
  serializeValue,              // Application Layer
} from 'annette';
```

### Detailed Layer Structure

```
Annette
│
├── Core Engine Layer
│   ├── Agent system
│   ├── Port system
│   ├── Connection system
│   ├── Rule system (Action/Rewrite)
│   └── Network system
│
├── Standard Library Layer
│   ├── Time Travel system
│   ├── Updater system
│   ├── Effect system
│   ├── Sync system
│   ├── Connection History
│   ├── Specialized Updaters
│   ├── Reactive system
│   └── Plugin system
│
└── Application Layer
    ├── Serialization
    ├── Distributed Networks
    ├── Vector Clocks
    ├── Conflict Resolution
    ├── Fine-grained Reactivity
    ├── Component Model
    └── Custom Updaters
```

You can import from specific layers based on your needs:

```typescript
// Core layer only
import { Core } from 'annette';
const network = Core.createNetwork('minimal');

// Standard library
import { StdLib } from 'annette';
const enhancedNetwork = StdLib.createEnhancedNetwork('full-featured');

// Specific features
import { 
  Agent, Network, ActionRule,  // Core
  TimeTravelNetwork,           // Standard Library
  serializeValue,              // Application Layer
} from 'annette';
```