/**
 * Enhanced Features Example
 * 
 * This example demonstrates the progressive disclosure APIs, performance optimizations,
 * and developer experience enhancements in Annette.
 */

// Import progressive disclosure APIs
import { 
  Simple, Advanced, DebugLevel, createEnhancedNetwork,
  ErrorReporter, DebugTools, StructuralSharing, Core, StdLib
} from '../src';

// ========== Progressive Disclosure ==========

console.log('===== Progressive Disclosure =====');

// Simple API for beginners
console.log('\n--- Simple API ---');

// Create a simple network
const simpleNetwork = Simple.createNetwork('simple-example');

// Create agents
const counter = Simple.createAgent('Counter', { value: 0 });
const incrementer = Simple.createAgent('Incrementer', { by: 5 });

// Add agents to network
simpleNetwork.addAgent(counter);
simpleNetwork.addAgent(incrementer);

// Add a simple rule
Simple.addRule(simpleNetwork, 'Counter', 'Incrementer', (counter, incrementer) => {
  counter.value.value += incrementer.value.by;
});

// Connect agents
Simple.connect(simpleNetwork, counter, incrementer);

// Run the network
Simple.run(simpleNetwork);

// Find all Counter agents
const counters = Simple.findAgents(simpleNetwork, 'Counter');
console.log('Counter value after increment:', counters[0].value.value);

// Advanced API for more complex use cases
console.log('\n--- Advanced API ---');

// Create a time travel network
const ttNetwork = Advanced.createTimeTravelNetwork('timetravel-example');

// Create agents
const advCounter = Core.createAgent('Counter', { value: 0 });
const advIncrementer = Core.createAgent('Incrementer', { by: 10 });

// Add agents to network
ttNetwork.addAgent(advCounter);
ttNetwork.addAgent(advIncrementer);

// Add a rule
ttNetwork.addRule(Core.createActionRule(
  { name: 'increment', type: 'action' },
  { agentName1: 'Counter', portName1: 'main', agentName2: 'Incrementer', portName2: 'main' },
  (counter, incrementer) => {
    counter.value.value += incrementer.value.by;
    return [counter, incrementer];
  }
));

// Connect agents
ttNetwork.connectPorts(advCounter.ports.main, advIncrementer.ports.main);

// Take a snapshot before
const snapshot1 = Advanced.takeSnapshot(ttNetwork, 'Before increment');
console.log('Snapshot taken:', snapshot1.id);

// Run the network
ttNetwork.reduce();
console.log('Counter value after increment:', advCounter.value.value);

// Roll back to the previous snapshot
Advanced.rollbackTo(ttNetwork, snapshot1.id);
console.log('Counter value after rollback:', advCounter.value.value);

// ========== Performance Optimizations ==========

console.log('\n===== Performance Optimizations =====');

// Create an optimized network
const optimizedNetwork = Advanced.createOptimizedNetwork('optimized-example', {
  enableRuleIndexing: true,
  enableLazyEvaluation: true,
  enableStructuralSharing: true,
  enableMemoryManagement: true,
  memoryConfig: {
    maxHistorySize: 100,
    maxHistoryAge: 3600000, // 1 hour
    enableGarbageCollection: true,
    gcInterval: 60000 // 1 minute
  }
});

// Create agents with structural sharing
const sharedCounter = Core.createAgent('Counter', { 
  value: 0, 
  history: [] 
});

// Add to network
optimizedNetwork.addAgent(sharedCounter);

// Use structural sharing for immutable updates
const updatedValue = StructuralSharing.update(sharedCounter.value, draft => {
  draft.value = 42;
  draft.history.push(0);
});

// Apply the update
sharedCounter.value = updatedValue;

console.log('Counter updated with structural sharing:', sharedCounter.value);

// ========== Developer Experience Enhancements ==========

console.log('\n===== Developer Experience Enhancements =====');

// Configure error reporting
const errorReporter = ErrorReporter.getInstance();
errorReporter.addErrorHandler((error) => {
  console.log('Custom error handler called with:', error.message);
});

// Configure debug tools
const debugTools = DebugTools.getInstance();
debugTools.configure({
  level: DebugLevel.INFO,
  trackRuleApplications: true,
  trackStateChanges: true,
  trackConnections: true,
  logToConsole: true
});

// Create an enhanced network with debugging
const enhancedNetwork = createEnhancedNetwork('enhanced-example', {
  debugLevel: DebugLevel.INFO
});

// Create agents
const debugCounter = Core.createAgent('Counter', { value: 0 });
const debugIncrementer = Core.createAgent('Incrementer', { by: 15 });

// Add agents to network
enhancedNetwork.addAgent(debugCounter);
enhancedNetwork.addAgent(debugIncrementer);

// Add a rule
enhancedNetwork.addRule(Core.createActionRule(
  { name: 'increment', type: 'action' },
  { agentName1: 'Counter', portName1: 'main', agentName2: 'Incrementer', portName2: 'main' },
  (counter, incrementer) => {
    // Track state change manually (though enhanced network does this automatically)
    const oldValue = { ...counter.value };
    
    // Update counter
    counter.value.value += incrementer.value.by;
    
    // Log the change
    debugTools.trackStateChange(counter, oldValue, counter.value);
    
    return [counter, incrementer];
  }
));

// Intentionally cause an error to demonstrate error handling
try {
  // Try to connect to a non-existent port
  enhancedNetwork.connectPorts(
    debugCounter.ports.main, 
    // @ts-ignore - intentional error
    { name: 'nonexistent', agent: debugIncrementer }
  );
} catch (error) {
  console.log('Error caught as expected');
}

// Connect properly
enhancedNetwork.connectPorts(debugCounter.ports.main, debugIncrementer.ports.main);

// Take snapshot before reduction
debugTools.takeNetworkSnapshot(enhancedNetwork, 'before-reduction');

// Run the network
enhancedNetwork.reduce();

// Take snapshot after reduction
debugTools.takeNetworkSnapshot(enhancedNetwork, 'after-reduction');

// Compare snapshots
const comparison = debugTools.compareSnapshots('before-reduction', 'after-reduction');
console.log('Snapshot comparison - agents changed:', comparison.agentsChanged.length);

// Get recent logs
const recentLogs = debugTools.getFilteredLogs(DebugLevel.INFO, 'state');
console.log('Recent state change logs:', recentLogs.length);

console.log('Counter value after enhanced increment:', debugCounter.value.value);

// ========== Combining Everything ==========

console.log('\n===== Combining All Features =====');

// Create a fully-featured network
const fullNetwork = StdLib.createEnhancedNetwork('full-featured-example');

// Create reactive agents
const [reactiveCount, setReactiveCount] = StdLib.Reactive.createReactive(0);
const doubled = StdLib.Reactive.createComputed(() => reactiveCount() * 2);

// Create an effect
StdLib.Reactive.createEffect(() => {
  console.log(`Reactive count: ${reactiveCount()}, doubled: ${doubled()}`);
});

// Update the value
setReactiveCount(100);

console.log('Demonstration completed successfully!');