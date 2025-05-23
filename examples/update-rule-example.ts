// Example showing how to use the new UpdateRule feature
import { 
  Agent, 
  Network, 
  Port, 
  UpdateRule
} from '../src';

// Create a simple counter agent with an update port
const counter = Agent('Counter', { count: 0 }, {
  main: Port({ name: 'main', type: 'main' }),
  update: Port({ name: 'update', type: 'aux' })  // Special port for receiving updates
});

// Create an incrementer agent that will update the counter
const incrementer = Agent('Incrementer', { by: 5 }, {
  main: Port({ name: 'main', type: 'main' })
});

// Create a network with our agents
const network = Network('UpdateExample', [counter, incrementer]);

// Add an update rule that will increment the counter
network.addRule(UpdateRule(
  counter.ports.update,  // Target port (the agent being updated)
  incrementer.ports.main, // Source port (the agent providing update data)
  (counterAgent, incrementerAgent) => {
    // Compute the new state (pure function)
    const newCount = counterAgent.value.count + incrementerAgent.value.by;
    
    // Return new state and description
    return {
      newState: { count: newCount },
      description: `Incremented counter by ${incrementerAgent.value.by}`
    };
  },
  'increment-counter' // Optional rule name
));

// Connect the agents to trigger the update
network.connectPorts(counter.ports.update, incrementer.ports.main);

console.log('Initial counter value:', counter.value.count);

// Execute a single step to apply the update rule
network.step();

console.log('Updated counter value:', counter.value.count);

// View the update history
console.log('Update History:');
if (network.getUpdateHistory) {
  console.log(JSON.stringify(network.getUpdateHistory(), null, 2));
}

// Modify the incrementer value
incrementer.value.by = 10;

// Execute another step (this will apply the rule again because the connection was maintained)
network.step();

console.log('Counter value after second update:', counter.value.count);
console.log('Update History:');
if (network.getUpdateHistory) {
  console.log(JSON.stringify(network.getUpdateHistory(), null, 2));
}