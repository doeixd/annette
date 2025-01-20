<img src="assets/logo.png" />
# Annette

Annette is a JavaScript library based on [interaction nets](https://en.wikipedia.org/wiki/Interaction_nets). It can be used to model algebraic effects, state machines, a ui state management library, simple network synchronization libraries, or just as a source of entertainment.


## Installation

```bash
npm install annette
```

## Usage
Using / defining interaction nets can be a littile weird at first, and the benefits aren't immediately obvious, but after working with it for a while you'll start to get a better feel for them, and how they can be used to solve complex problems.

### Counter
It may look like a lot of code, but at it's core it's very simple.

```js
import { Network } from 'annette';

// Create a network, this is a runtime object that holds all the agents and rules.
const net = Network('counter');

// Create agents, this is object that holds a value and ports (ports are kinda like props or arguments), and exists in the above network. 
const number = net.Agent('num', 0);
const increment = net.Agent('increment', 1);

// Connect agents together in the network on their primary ports. This doesn't actually increment the number yet or run any rules.
const connection = net.connect(increment, number)

// Create a function that will run when the network comes accross the above type of connection. This is called an interaction rule. It still doesn't actually increment the number yet.
connection.addRule((increment, number) => {
  number.value += increment.value;

  // Return the new number and the increment agent to the network. If this is not done, the network will clean up these agents, and these values will be lost.
  return [ number, increment ];
})


// Run all the interaction rules for the network, this will actually update the number agent's value.
network.reduce()


console.log(number.value); // Output: 1
```

### Toggle Example

A toggle mechanism can be implemented using agents that switch their states when connected:

```js
const net = Network('toggle');

const toggle = net.Agent('toggle', false);
const switcher = net.Agent('switcher', true);

const connection = net.connect(toggle, switcher);

connection.addRule((toggle, switcher) => {
  toggle.value = !toggle.value;
  return [toggle, switcher];
});

net.reduce();
console.log(toggle.value); // Output: true

net.reduce();
console.log(toggle.value); // Output: false
```

### State Machine Example

Interaction nets can model state machines by defining rules for transitions:

```js
const net = Network('stateMachine');

const state = net.Agent('state', 'idle');
const event = net.Agent('event', 'start');

const connection = net.connect(state, event);

connection.addRule((state, event) => {
  if (state.value === 'idle' && event.value === 'start') {
    state.value = 'running';
  } else if (state.value === 'running' && event.value === 'stop') {
    state.value = 'idle';
  }

  return [state, event];
});

// Start the state machine.
event.value = 'start';
net.reduce();
console.log(state.value); // Output: 'running'

// Stop the state machine.
event.value = 'stop';
net.reduce();
console.log(state.value); // Output: 'idle'
```

### Synchronization Example

Interaction nets can also be used for simple synchronization tasks:

```js
const net = Network('synchronization');

const task1 = net.Agent('task', false);
const task2 = net.Agent('task', false);
const sync = net.Agent('sync', null);

const connection1 = net.connect(task1, sync);
const connection2 = net.connect(task2, sync);

connection1.addRule((task, sync) => {
  if (task.value) {
    sync.value = 'Task 1 complete';
  }
  return [task, sync];
});

connection2.addRule((task, sync) => {
  if (task.value) {
    sync.value = 'Task 2 complete';
  }
  return [task, sync];
});

task1.value = true;
net.reduce();
console.log(sync.value); // Output: 'Task 1 complete'

task2.value = true;
net.reduce();
console.log(sync.value); // Output: 'Task 2 complete'
```

## Why Annette?

- **Expressiveness:** Interaction nets provide a declarative way to model complex systems. By focusing on agents and their interactions, developers can articulate the structure and behavior of systems with clarity and precision.
- **Flexibility:** Annette is not tied to any specific paradigm. It can be used for state machines, effect systems, UI state management, or any scenario requiring dynamic and adaptable logic.
- **Modularity:** Interaction rules in Annette encourage reusability and composability. Logic can be divided into small, manageable units that can be easily maintained and extended.
- **Performance:** By leveraging reduction mechanisms, Annette efficiently executes rules, ensuring minimal overhead while resolving interactions.
- **Intuitiveness over time:** While the initial learning curve may seem steep, the mental model of agents and interactions becomes second nature, making it easier to tackle complex problems.
- **Scalability:** Annette’s design supports building both simple and large-scale systems, allowing developers to scale their solutions without rewriting the core logic.
- **No Traditional Garbage Collection:** Interaction nets naturally handle their own memory management. When two agents interact, they are consumed, and the interaction produces new agents (if any). This ensures that unused agents are eliminated during reduction, reducing the need for explicit garbage collection. This characteristic makes interaction nets inherently efficient in managing resources.
