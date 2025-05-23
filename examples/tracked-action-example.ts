// Example showing how to use the TrackedAction feature
import { 
  Agent, 
  Network, 
  Port, 
  TrackedAction
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
const network = Network('TrackedExample', [counter, incrementer]);

// Add a tracked action rule that will increment the counter
network.addRule(TrackedAction(
  counter.ports.update,  // Target port (the agent being updated)
  incrementer.ports.main, // Source port (the agent providing update data)
  (counterAgent, incrementerAgent) => {
    // Update the counter state
    counterAgent.value.count += incrementerAgent.value.by;
    
    // Return the agents to keep in the network
    return [counterAgent, incrementerAgent];
  },
  `Incremented counter by ${incrementer.value.by}` // Description of the change
));

// Connect the agents to trigger the action
network.connectPorts(counter.ports.update, incrementer.ports.main);

console.log('Initial counter value:', counter.value.count);

// Execute a single step to apply the rule
network.step();

console.log('Updated counter value:', counter.value.count);

// View the change history
console.log('Change History:');
if (network.getChangeHistory) {
  console.log(JSON.stringify(network.getChangeHistory(), null, 2));
}

// Modify the incrementer value
incrementer.value.by = 10;

// Execute another step (this will apply the rule again because the connection was maintained)
network.step();

console.log('Counter value after second update:', counter.value.count);
console.log('Change History:');
if (network.getChangeHistory) {
  console.log(JSON.stringify(network.getChangeHistory(), null, 2));
}