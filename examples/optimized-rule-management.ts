import { Network, Agent, Port, ActionRule } from '../src';
import { createOptimizedNetwork, RuleIndex } from '../src/optimization';

// Create a network with optimization features
const baseNetwork = Network('optimized-network');

// Create the optimized network wrapper
const network = createOptimizedNetwork(baseNetwork, {
  enableRuleIndexing: true,
  enableLazyEvaluation: true,
  enableMemoryManagement: true
});

// Create test agents
const sourceAgent = Agent('Source', { data: 'hello' }, {
  output: Port('output', 'out')
});

const processorAgent = Agent('Processor', { processed: false }, {
  input: Port('input', 'in'),
  output: Port('output', 'out')
});

const sinkAgent = Agent('Sink', { received: null }, {
  input: Port('input', 'in')
});

// Add agents
network.addAgent(sourceAgent);
network.addAgent(processorAgent);
network.addAgent(sinkAgent);

// Create rules for data flow
const processRule = ActionRule(
  sourceAgent.ports.output,
  processorAgent.ports.input,
  (source, processor, net) => {
    processor.value.processed = true;
    console.log(`Processing data: ${source.value.data}`);
  },
  'process-data'
);

const forwardRule = ActionRule(
  processorAgent.ports.output,
  sinkAgent.ports.input,
  (processor, sink, net) => {
    sink.value.received = processor.value.processed;
    console.log(`Data forwarded to sink: ${sink.value.received}`);
  },
  'forward-data'
);

console.log('\n=== Optimized Rule Management Example ===\n');

// Add rules - this will automatically index them for fast lookup
console.log('Adding rules with automatic indexing...');
network.addRule(processRule);
network.addRule(forwardRule);

// View rules
console.log('Added rules:');
network.getAllRules().forEach(rule => {
  console.log(`  - ${rule.name} (${rule.type})`);
});

// Test rule searching with optimization
console.log('\nSearching for rules...');
const sourceRules = network.findRules({ agentName: 'Source' });
console.log('Source agent rules:', sourceRules.map(r => r.name));

const inputPortRules = network.findRules({ portName: 'input' });
console.log('Input port rules:', inputPortRules.map(r => r.name));

// Connect ports to create active connections
console.log('\nConnecting ports...');
network.connectPorts(sourceAgent.ports.output, processorAgent.ports.input);
network.connectPorts(processorAgent.ports.output, sinkAgent.ports.input);

// Execute network with optimizations
console.log('\nExecuting network (with optimizations)...');
const steps = network.reduce(10);
console.log(`Executed ${steps} steps`);

// Remove rules and see optimization in action
console.log('\nRemoving rules (with index cleanup)...');
network.removeRule('process-data');
console.log('Remaining rules:', network.getAllRules().map(r => r.name));

// Test rule indexing performance with multiple rules
console.log('\nAdding multiple rules for performance testing...');
for (let i = 0; i < 5; i++) {
  const testRule = ActionRule(
    sourceAgent.ports.output,
    sinkAgent.ports.input,
    (source, sink, net) => {
      console.log(`Test rule ${i} executed`);
    },
    `test-rule-${i}`
  );
  network.addRule(testRule);
}

console.log('Total rules after adding test rules:', network.getAllRules().length);

// Find rules efficiently using the index
const testRules = network.findRules({ name: 'test-rule-2' });
console.log('Found specific test rule:', testRules.map(r => r.name));

// Clear all rules
console.log('\nClearing all rules...');
network.clearRules();
console.log('Rules after clearing:', network.getAllRules().length);

console.log('\n=== Optimized Rule Management Example Complete ===\n');