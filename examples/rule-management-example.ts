import { Network, Agent, Port, ActionRule } from '../src';

// Create a simple network
const network = Network('test-network');

// Create some test agents
const agent1 = Agent('Counter', { count: 0 }, {
  input: Port('input', 'in'),
  output: Port('output', 'out')
});

const agent2 = Agent('Display', { value: '' }, {
  input: Port('input', 'in'),
  trigger: Port('trigger', 'out')
});

// Add agents to network
network.addAgent(agent1);
network.addAgent(agent2);

// Create some test rules
const incrementRule = ActionRule(
  agent1.ports.input,
  agent2.ports.trigger,
  (counter, display, net) => {
    counter.value.count += 1;
    display.value.value = `Count: ${counter.value.count}`;
  },
  'increment-rule'
);

const resetRule = ActionRule(
  agent2.ports.input,
  agent1.ports.output,
  (display, counter, net) => {
    counter.value.count = 0;
    display.value.value = 'Reset';
  },
  'reset-rule'
);

// Test rule management functions
console.log('\n=== Rule Management Example ===\n');

// Add rules
console.log('Adding rules...');
network.addRule(incrementRule);
network.addRule(resetRule);

// View all rules
console.log('All rules:', network.getAllRules().map(r => r.name));

// Find specific rules
console.log('Counter rules:', network.findRules({ agentName: 'Counter' }).map(r => r.name));
console.log('Action rules:', network.findRules({ type: 'action' }).map(r => r.name));
console.log('Input port rules:', network.findRules({ portName: 'input' }).map(r => r.name));

// Remove a rule by name
console.log('\nRemoving "reset-rule" by name...');
const removed = network.removeRule('reset-rule');
console.log('Removed successfully:', removed);
console.log('Remaining rules:', network.getAllRules().map(r => r.name));

// Remove a rule by object
console.log('\nRemoving increment rule by object...');
const removed2 = network.removeRule(incrementRule);
console.log('Removed successfully:', removed2);
console.log('Remaining rules:', network.getAllRules().map(r => r.name));

// Clear all rules
console.log('\nClearing all rules...');
network.clearRules();
console.log('Remaining rules:', network.getAllRules().map(r => r.name));
console.log('Rules count:', network.getAllRules().length);

console.log('\n=== Rule Management Example Complete ===\n');