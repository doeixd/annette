# Getting Started with Annette

This tutorial will walk you through the core concepts of Annette and help you build your first interaction net application.

## What You'll Learn

- How to create agents and networks
- How to define rules for agent interactions
- How to connect agents and execute interactions
- How to build a simple counter application

## Prerequisites

- Basic TypeScript/JavaScript knowledge
- Node.js installed
- npm or yarn package manager

## Installation

```bash
npm install annette
```

## Step 1: Your First Agent

Let's start by creating a simple agent:

```typescript
import { Agent } from 'annette';

// Create an agent with a name and initial value
const counter = Agent('Counter', { count: 0 });

console.log(counter.name);  // "Counter"
console.log(counter.value); // { count: 0 }
```

**What you learned:**
- Agents have a `name` (string identifier) and `value` (any data)
- The name defines the agent's "type" for rule matching
- The value can be any TypeScript type

## Step 2: Creating a Network

Agents need a network to interact:

```typescript
import { Agent, Network } from 'annette';

const counter = Agent('Counter', { count: 0 });

// Create a network (like a container for your agents)
const net = Network('counter-app');

// Add the agent to the network
net.addAgent(counter);

console.log(net.name); // "counter-app"
```

**What you learned:**
- Networks are containers that manage agents and their interactions
- Use `addAgent()` to add agents to a network
- Networks have a name for identification

## Step 3: Creating Rules

Rules define what happens when agents interact:

```typescript
import { Agent, Network, ActionRule } from 'annette';

const counter = Agent('Counter', { count: 0 });
const incrementer = Agent('Incrementer', { amount: 1 });

const net = Network('counter-app');
net.addAgent(counter);
net.addAgent(incrementer);

// Create a rule that increments the counter
const incrementRule = ActionRule(
  counter.ports.main,
  incrementer.ports.main,
  (counter, incrementer) => {
    // This function runs when the agents connect
    counter.value.count += incrementer.value.amount;
    return [counter, incrementer]; // Return agents to keep them in network
  }
);

// Add the rule to the network
net.addRule(incrementRule);
```

**What you learned:**
- `ActionRule` creates imperative rules for custom logic
- Rules take two agents and a function that defines their interaction
- The function receives the connected agents and can modify their values
- Return the agents to keep them in the network

## Step 4: Connecting and Executing

Now let's connect the agents and see the rule execute:

```typescript
import { Agent, Network, ActionRule } from 'annette';

const counter = Agent('Counter', { count: 0 });
const incrementer = Agent('Incrementer', { amount: 1 });

const net = Network('counter-app');
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

// Connect the agents
net.connectPorts(counter.ports.main, incrementer.ports.main);

console.log('Before:', counter.value.count); // 0

// Execute one interaction
net.step();

console.log('After:', counter.value.count); // 1
```

**What you learned:**
- `connectPorts()` creates a connection between two agent ports
- `step()` executes one interaction (one rule application)
- The rule automatically runs when connected agents are found
- Agent values are updated as expected

## Step 5: Building a Complete Counter

Let's create a more complete counter with increment and decrement functionality:

```typescript
import { Agent, Network, ActionRule } from 'annette';

function createCounter() {
  // Create the network and agents
  const net = Network('advanced-counter');

  const counter = Agent('Counter', { count: 0 });
  const incrementer = Agent('Incrementer', { amount: 1 });
  const decrementer = Agent('Decrementer', { amount: -1 });

  net.addAgent(counter);
  net.addAgent(incrementer);
  net.addAgent(decrementer);

  // Create increment rule
  const incrementRule = ActionRule(
    counter.ports.main,
    incrementer.ports.main,
    (counter, incrementer) => {
      counter.value.count += incrementer.value.amount;
      return [counter, incrementer];
    }
  );

  // Create decrement rule
  const decrementRule = ActionRule(
    counter.ports.main,
    decrementer.ports.main,
    (counter, decrementer) => {
      counter.value.count += decrementer.value.amount;
      return [counter, decrementer];
    }
  );

  net.addRule(incrementRule);
  net.addRule(decrementRule);

  return { net, counter, incrementer, decrementer };
}

// Use the counter
const { net, counter, incrementer, decrementer } = createCounter();

console.log('Initial:', counter.value.count); // 0

// Increment twice
net.connectPorts(counter.ports.main, incrementer.ports.main);
net.step();
console.log('After +1:', counter.value.count); // 1

net.connectPorts(counter.ports.main, incrementer.ports.main);
net.step();
console.log('After +1:', counter.value.count); // 2

// Decrement once
net.connectPorts(counter.ports.main, decrementer.ports.main);
net.step();
console.log('After -1:', counter.value.count); // 1
```

**What you learned:**
- You can create multiple rules for the same agent
- Different agents can interact with the same counter
- Rules can have different behaviors (increment vs decrement)
- The counter maintains its state between interactions

## Step 6: Understanding Ports

Let's explore how ports work:

```typescript
import { Agent, Network, ActionRule, Port } from 'annette';

// Create agents with custom ports
const processor = Agent('Processor', { status: 'idle' }, {
  input: Port('input', 'main'),
  output: Port('output', 'aux'),
  control: Port('control', 'aux')
});

const data = Agent('Data', { value: 42 }, {
  main: Port('main', 'main')
});

const control = Agent('Control', { command: 'process' }, {
  main: Port('main', 'main')
});

const net = Network('processor-example');
net.addAgent(processor);
net.addAgent(data);
net.addAgent(control);

// Create processing rule
const processRule = ActionRule(
  processor.ports.input,
  data.ports.main,
  (processor, data) => {
    processor.value.status = 'processing';
    processor.value.result = data.value.value * 2;
    return [processor, data];
  }
);

// Create control rule
const controlRule = ActionRule(
  processor.ports.control,
  control.ports.main,
  (processor, control) => {
    if (control.value.command === 'process') {
      processor.value.status = 'active';
    }
    return [processor, control];
  }
);

net.addRule(processRule);
net.addRule(controlRule);

// Test the processor
console.log('Initial:', processor.value);

// Process data
net.connectPorts(processor.ports.input, data.ports.main);
net.step();
console.log('After processing:', processor.value);

// Send control command
net.connectPorts(processor.ports.control, control.ports.main);
net.step();
console.log('After control:', processor.value);
```

**What you learned:**
- Agents can have multiple ports with different names
- Ports have types: "main" (primary) and "aux" (auxiliary)
- Different ports can have different rules
- You can define custom port configurations

## Step 7: Error Handling

Let's see how to handle common errors:

```typescript
import { Agent, Network, ActionRule } from 'annette';

const net = Network('error-handling-example');
const counter = Agent('Counter', { count: 0 });

net.addAgent(counter);

// Try to get a non-existent agent
const missingAgent = net.getAgent('non-existent-id');
console.log(missingAgent); // undefined

// Try to remove a non-existent agent
const removed = net.removeAgent('non-existent-id');
console.log(removed); // false

// Stepping an empty network does not throw and returns 0
try {
  // This is safe - no error thrown
  const result = net.step();
  console.log('Step result:', result); // 0 (no interactions possible)
} catch (error) {
  console.error('Error:', error);
}
```

**What you learned:**
- Annette is designed to be safe and not throw errors for common operations
- Missing agents return `undefined`
- Failed removals return `false`
- Empty networks can be stepped without errors

## Next Steps

Now that you understand the basics, try these exercises:

1. **Create a Todo List**: Build agents for todos, add new todos, mark them complete
2. **Build a Calculator**: Create number agents and operation agents (+, -, *, /)
3. **Make a State Machine**: Implement a traffic light with red, yellow, green states
4. **Add Persistence**: Use serialization to save and load network state

## Common Patterns

### Pattern 1: Data Flow
```typescript
// Input -> Process -> Output
const input = Agent('Input', { data: [1, 2, 3] });
const processor = Agent('Processor', { result: null });
const output = Agent('Output', { final: null });

const processRule = ActionRule(
  input.ports.main,
  processor.ports.main,
  (input, processor) => {
    processor.value.result = input.value.data.map(x => x * 2);
    return [input, processor];
  }
);
```

### Pattern 2: State Management
```typescript
// State + Event = New State
const state = Agent('State', { current: 'idle' });
const event = Agent('Event', { type: 'start' });

const transitionRule = ActionRule(
  state.ports.main,
  event.ports.main,
  (state, event) => {
    if (state.value.current === 'idle' && event.value.type === 'start') {
      state.value.current = 'running';
    }
    return [state, event];
  }
);
```

### Pattern 3: Multiple Interactions
```typescript
// One agent can interact with many others
const user = Agent('User', { name: 'Alice' });
const validator = Agent('Validator', { valid: false });
const logger = Agent('Logger', { entries: [] });

const validateRule = ActionRule(user.ports.main, validator.ports.main, /* ... */);
const logRule = ActionRule(user.ports.main, logger.ports.main, /* ... */);
```

## Troubleshooting

### Common Issues:

1. **"Property 'ports' does not exist"**
   - Make sure you're using the Agent function correctly
   - Check that you imported Agent from 'annette'

2. **"Cannot connect undefined ports"**
   - Ensure your agents have the expected ports
   - Check port names match between agents and rules

3. **"Rule didn't execute"**
   - Make sure agents are added to the network
   - Verify the rule is added to the network
   - Check that ports are properly connected

4. **"Type errors with ActionRule"**
   - Ensure your action function has the correct signature
   - Make sure you're returning the agents from the action function

## Further Reading

- [Core Concepts](../README.md#core-concepts)
- [Advanced Examples](../examples/)
- [API Reference](../README.md#api-reference)
- [Time Travel Tutorial](time-travel-tutorial.md)
- [Distributed Systems Tutorial](distributed-tutorial.md)

Happy coding with Annette! 🚀