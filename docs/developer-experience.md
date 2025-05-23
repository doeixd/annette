# Developer Experience Enhancements in Annette

This document explains the developer experience enhancements in Annette, which make the library more user-friendly and easier to debug.

## Overview

Annette includes several developer experience enhancements:

1. **Enhanced Error Handling**: More informative error messages with context
2. **Debugging Tools**: Comprehensive logging and visualization
3. **Network Visualization**: Tools to understand network state
4. **Progressive Disclosure**: APIs for different user levels
5. **Sensible Defaults**: Reducing boilerplate code

## Enhanced Error Handling

Annette provides rich, contextual error messages that help you understand what went wrong:

```typescript
import { createEnhancedNetwork, ErrorReporter } from 'annette';

// Create a network with enhanced error handling
const network = createEnhancedNetwork('error-example');

// Add custom error handling
const errorReporter = ErrorReporter.getInstance();
errorReporter.addErrorHandler((error) => {
  // Custom error handling logic
  console.error('Custom handler:', error.message);
  
  // Log to monitoring system
  monitoringSystem.logError(error);
});

// Try something that will cause an error
try {
  network.connectPorts(
    agent1.ports.main,
    { name: 'nonexistent', agent: agent2 } // Invalid port
  );
} catch (error) {
  // Error will be automatically reported and contain detailed context
  console.error(error);
  
  // For PortConnectionError, you can get detailed information
  if (error.getDetails) {
    console.error(error.getDetails());
  }
}
```

### Error Types

Annette includes several specialized error types:

1. **AnnetteError**: Base class for all Annette errors
2. **PortConnectionError**: Errors when connecting ports, with agent and port details
3. **RuleApplicationError**: Errors during rule application, with rule and agent details

These error types provide rich context about what went wrong, making debugging much easier.

## Debugging Tools

Annette includes powerful debugging tools for tracking and analyzing network behavior:

```typescript
import { DebugTools, DebugLevel } from 'annette';

// Get the debug tools instance
const debugTools = DebugTools.getInstance();

// Configure debug tools
debugTools.configure({
  level: DebugLevel.INFO,           // Debug level: NONE, ERROR, WARNING, INFO, VERBOSE
  trackRuleApplications: true,      // Track rule applications
  trackStateChanges: true,          // Track state changes
  trackConnections: true,           // Track connections
  logToConsole: true,               // Log to console
  maxLogEntries: 1000               // Maximum log entries to keep
});

// Log a debug message
debugTools.log(DebugLevel.INFO, 'category', 'message', { data: 'optional data' });

// Track a state change
debugTools.trackStateChange(agent, oldValue, newValue);

// Take a snapshot of a network
debugTools.takeNetworkSnapshot(network, 'snapshot-id');

// Compare two snapshots
const comparison = debugTools.compareSnapshots('snapshot1-id', 'snapshot2-id');
console.log('Changes:', comparison);

// Get filtered logs
const errorLogs = debugTools.getFilteredLogs(DebugLevel.ERROR);
const stateLogs = debugTools.getFilteredLogs(DebugLevel.INFO, 'state');
```

### Debug Levels

Annette supports five debug levels:

1. **NONE**: No logging
2. **ERROR**: Only errors
3. **WARNING**: Errors and warnings
4. **INFO**: Errors, warnings, and information
5. **VERBOSE**: All messages

You can configure the debug level to control the verbosity of logging.

## Network Visualization

Annette provides tools to help you understand the state of your network:

```typescript
import { DebugTools } from 'annette';

const debugTools = DebugTools.getInstance();

// Take snapshots at different points
debugTools.takeNetworkSnapshot(network, 'before-operation');
// ... perform operations ...
debugTools.takeNetworkSnapshot(network, 'after-operation');

// Compare snapshots to see what changed
const changes = debugTools.compareSnapshots('before-operation', 'after-operation');

console.log('Agents added:', changes.agentsAdded.length);
console.log('Agents removed:', changes.agentsRemoved.length);
console.log('Agents changed:', changes.agentsChanged);
console.log('Connections added:', changes.connectionsAdded.length);
console.log('Connections removed:', changes.connectionsRemoved.length);

// For each changed agent, see exactly what changed
for (const change of changes.agentsChanged) {
  console.log(`Agent ${change.name} (${change.id}) changes:`, change.changes);
  // change.changes is an object showing exactly what properties changed
  // { 'property.path': { old: oldValue, new: newValue } }
}
```

This makes it easy to understand what happened during network operations, which is invaluable for debugging complex scenarios.

## Progressive Disclosure

Annette provides APIs for different user levels, from beginners to experts:

```typescript
import { Simple, Advanced, Core, createEnhancedNetwork } from 'annette';

// Simple API for beginners
const simpleNetwork = Simple.createNetwork('simple-example');
const counter = Simple.createAgent('Counter', { value: 0 });
Simple.addRule(simpleNetwork, 'Counter', 'Incrementer', (counter, incrementer) => {
  counter.value.value += incrementer.value.by;
});

// Advanced API for intermediate users
const ttNetwork = Advanced.createTimeTravelNetwork('timetravel-example');
const snapshot = Advanced.takeSnapshot(ttNetwork);
Advanced.rollbackTo(ttNetwork, snapshot.id);

// Core API for experts
const expertNetwork = Core.createNetwork('expert-example');
const expertAgent = Core.createAgent('Expert', { value: 'complex' }, {
  main: Core.createPort('main', 'main'),
  custom: Core.createPort('custom', 'aux')
});

// Enhanced network with all features
const enhancedNetwork = createEnhancedNetwork('enhanced-example', {
  debugLevel: DebugLevel.INFO
});
```

This allows users to start simple and gradually access more advanced features as their needs evolve.

## Sensible Defaults

Annette provides sensible defaults to reduce boilerplate code:

```typescript
import { createEnhancedNetwork } from 'annette';

// Create a network with all defaults
const network1 = createEnhancedNetwork('default-example');
// Equivalent to:
// createEnhancedNetwork('default-example', {
//   debugLevel: DebugLevel.ERROR,
//   enableRuleIndexing: true,
//   enableLazyEvaluation: true,
//   enableStructuralSharing: true,
//   enableMemoryManagement: true,
//   enableParallelProcessing: false,
//   memoryConfig: {
//     maxHistorySize: 1000,
//     maxHistoryAge: 24 * 60 * 60 * 1000,
//     enableGarbageCollection: true,
//     gcInterval: 60 * 1000,
//     enableObjectPooling: true,
//     maxPoolSize: 100
//   }
// });

// Override only what you need
const network2 = createEnhancedNetwork('custom-example', {
  debugLevel: DebugLevel.INFO,
  memoryConfig: {
    maxHistorySize: 500
    // Other memory settings use defaults
  }
});
```

This makes it easy to get started without having to configure everything, while still allowing customization when needed.

## Context-Aware Functions

Many functions in Annette are context-aware, providing extra help and validation:

```typescript
import { createEnhancedNetwork } from 'annette';

const network = createEnhancedNetwork('context-example');

// Add agents
const agent1 = Agent('Agent1', { value: 'data' });
const agent2 = Agent('Agent2', { value: 'data' });
network.addAgent(agent1);
network.addAgent(agent2);

// This will validate ports and provide helpful errors
network.connectPorts(agent1.ports.main, agent2.ports.main);

// This will warn if the ports are already connected
network.connectPorts(agent1.ports.main, agent2.ports.main);

// This will provide a helpful error message
try {
  network.connectPorts(
    agent1.ports.main,
    { name: 'nonexistent', agent: agent2 } // Invalid port
  );
} catch (error) {
  // Error will explain exactly what's wrong
  console.error(error);
}
```

## Use Case: Debugging a Complex Network

Here's how to use Annette's developer experience features to debug a complex network:

```typescript
import { 
  createEnhancedNetwork, DebugTools, DebugLevel,
  ErrorReporter
} from 'annette';

// Step 1: Create an enhanced network with debugging
const network = createEnhancedNetwork('debug-example', {
  debugLevel: DebugLevel.VERBOSE
});

// Step 2: Set up custom error handling
const errorReporter = ErrorReporter.getInstance();
errorReporter.addErrorHandler((error) => {
  console.error('Custom handler:', error.message);
});

// Step 3: Configure debug tools
const debugTools = DebugTools.getInstance();
debugTools.configure({
  level: DebugLevel.VERBOSE,
  trackRuleApplications: true,
  trackStateChanges: true,
  trackConnections: true
});

// Step 4: Take initial snapshot
debugTools.takeNetworkSnapshot(network, 'initial');

// Step 5: Add agents and rules
// ... add agents and rules ...

// Step 6: Take snapshot after setup
debugTools.takeNetworkSnapshot(network, 'after-setup');

// Step 7: Connect agents
try {
  network.connectPorts(agent1.ports.main, agent2.ports.main);
} catch (error) {
  console.error('Connection error:', error);
}

// Step 8: Take snapshot after connections
debugTools.takeNetworkSnapshot(network, 'after-connections');

// Step 9: Run the network
network.reduce();

// Step 10: Take final snapshot
debugTools.takeNetworkSnapshot(network, 'final');

// Step 11: Analyze what happened
const setupChanges = debugTools.compareSnapshots('initial', 'after-setup');
console.log('Setup changes:', setupChanges);

const connectionChanges = debugTools.compareSnapshots('after-setup', 'after-connections');
console.log('Connection changes:', connectionChanges);

const reductionChanges = debugTools.compareSnapshots('after-connections', 'final');
console.log('Reduction changes:', reductionChanges);

// Step 12: Look at specific logs
const errorLogs = debugTools.getFilteredLogs(DebugLevel.ERROR);
console.log('Errors:', errorLogs);

const stateChanges = debugTools.getFilteredLogs(DebugLevel.INFO, 'state');
console.log('State changes:', stateChanges);

const ruleApplications = debugTools.getFilteredLogs(DebugLevel.INFO, 'rule');
console.log('Rule applications:', ruleApplications);
```

This approach gives you a comprehensive view of what happened in your network, making it much easier to diagnose and fix issues.

## Best Practices

1. **Start with Enhanced Networks**: Use `createEnhancedNetwork` for built-in debugging
2. **Take Regular Snapshots**: Take snapshots before and after key operations
3. **Use Appropriate Debug Levels**: Start with INFO and adjust as needed
4. **Track Changes**: Use `trackStateChange` to monitor important state changes
5. **Compare Snapshots**: Use `compareSnapshots` to understand what changed
6. **Filter Logs**: Use `getFilteredLogs` to focus on relevant information
7. **Add Custom Error Handlers**: Use `addErrorHandler` for application-specific error handling
8. **Override Selectively**: Only override defaults when necessary

## Conclusion

Annette's developer experience enhancements make it easier to understand, debug, and fix issues in your interaction net applications. By providing rich errors, comprehensive debugging tools, network visualization, progressive disclosure, and sensible defaults, Annette helps you build better applications more efficiently.