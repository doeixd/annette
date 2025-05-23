import {
  Core, StdLib, Simple, Advanced,
  IPlugin, PluginManager, createPluginNetwork,
  TimeTravelPlugin, ReactivityPlugin, SynchronizationPlugin, EffectPlugin
} from "../src";

/**
 * This example demonstrates the unified architecture of Annette,
 * highlighting the plugin system, abstraction layers, and
 * progressive disclosure APIs.
 */

console.log("======= Unified Architecture Example =======");

// 1. Core abstraction layer
console.log("\n--- Core Abstraction Layer ---");

// Create a network using the Core API
const coreNetwork = Core.createNetwork("core-example");

// Create agents using the Core API
const counterAgent = Core.createAgent("Counter", 0);
const incrementAgent = Core.createAgent("Increment", { amount: 5 });

// Create a rule using the Core API
const incrementRule = Core.createRule(
  "increment-rule",
  counterAgent.ports.main,
  incrementAgent.ports.main,
  (counter, increment) => {
    // Update counter value
    counter.value += increment.value.amount;
    console.log(`Counter incremented to ${counter.value}`);
    return [counter, increment];
  }
);

// Add agents and rule to the network
coreNetwork.addAgent(counterAgent);
coreNetwork.addAgent(incrementAgent);
coreNetwork.addRule(incrementRule);

// Connect ports and execute
console.log("Before increment:", counterAgent.value);
coreNetwork.connectPorts(counterAgent.ports.main, incrementAgent.ports.main);
coreNetwork.step();
console.log("After increment:", counterAgent.value);

// 2. Standard Library abstraction layer
console.log("\n--- Standard Library Layer ---");

// Create an enhanced network using StdLib
const stdNetwork = StdLib.createEnhancedNetwork("stdlib-example");

// Create a time travel network
const ttNetwork = StdLib.TimeTravel.createTimeTravelNetwork("timetravel-example");
console.log("Created time travel network:", ttNetwork.getName());

// Create a shared counter
const sharedCounter = StdLib.Updater.createSharedCounter("counter", 10);
console.log("Created shared counter with initial value:", sharedCounter.value.current);

// Increment the counter
sharedCounter.value.current += 5;
console.log("Counter after local increment:", sharedCounter.value.current);

// 3. Plugin-based architecture
console.log("\n--- Plugin Architecture ---");

// Create a plugin network
const pluginNetwork = createPluginNetwork("plugin-example");

// Create the plugin manager
const pluginManager = new PluginManager();

// Register standard plugins
pluginManager.registerPlugin(new TimeTravelPlugin());
pluginManager.registerPlugin(new ReactivityPlugin());
pluginManager.registerPlugin(new SynchronizationPlugin());
pluginManager.registerPlugin(new EffectPlugin());

// Create a custom plugin
class LoggerPlugin implements IPlugin {
  id = "logger-plugin";
  name = "Logger Plugin";
  description = "Logs network events";
  version = "1.0.0";
  
  initialize(network) {
    console.log(`Logger plugin initialized for network: ${network.getName()}`);
    
    // Subscribe to network events
    network.eventBus.on("agent:added", (event) => {
      console.log(`[Logger] Agent added: ${event.data.agent.name}`);
    });
    
    network.eventBus.on("connection:created", (event) => {
      console.log(`[Logger] Connection created between ports`);
    });
    
    network.eventBus.on("rule:applied", (event) => {
      console.log(`[Logger] Rule applied: ${event.data.rule.name}`);
    });
  }
  
  shutdown() {
    console.log("Logger plugin shut down");
  }
}

// Register the custom plugin
pluginManager.registerPlugin(new LoggerPlugin());

// Initialize plugins for the network
pluginNetwork.initializePlugins(pluginManager);

// Create agents using the plugin network API
const sourceAgent = pluginNetwork.createAgent("Source", { value: "Hello" });
const targetAgent = pluginNetwork.createAgent("Target", { value: "" });

// Create a rule for transferring the value
const transferRule = pluginNetwork.createRule(
  "transfer-rule",
  sourceAgent.ports.main,
  targetAgent.ports.main,
  (source, target) => {
    target.value.value = source.value.value;
    return [source, target];
  }
);

// Connect the agents to trigger the rule
pluginNetwork.connectPorts(sourceAgent.ports.main, targetAgent.ports.main);
pluginNetwork.step();

console.log("Target value after transfer:", targetAgent.value.value);

// Enable time travel capabilities
const timeTravel = pluginNetwork.getPlugin<TimeTravelPlugin>("time-travel-plugin");
if (timeTravel) {
  console.log("Time travel enabled, taking snapshot...");
  timeTravel.takeSnapshot();
}

// 4. Progressive disclosure APIs
console.log("\n--- Progressive Disclosure APIs ---");

// Simple API - For beginners
console.log("\nSimple API Example:");
const simpleNetwork = Simple.createNetwork("simple-example");
const simpleCounter = Simple.createAgent("Counter", 0);
const simpleIncrement = Simple.createAgent("Increment", 1);

// Define a simple rule
Simple.defineRule(
  simpleNetwork,
  "increment-rule",
  (counter, increment) => {
    if (counter.name === "Counter" && increment.name === "Increment") {
      counter.value += increment.value;
      return true;
    }
    return false;
  }
);

// Connect and run
Simple.connect(simpleNetwork, simpleCounter, simpleIncrement);
Simple.runNetwork(simpleNetwork);
console.log("Simple counter value:", simpleCounter.value);

// Advanced API - For intermediate users
console.log("\nAdvanced API Example:");
const advancedNetwork = Advanced.createNetwork("advanced-example");

// Create a typed counter
interface AdvancedCounter {
  value: number;
  history: number[];
  lastUpdated: number;
}

const advCounter = Advanced.createTypedAgent<"Counter", AdvancedCounter>(
  "Counter",
  {
    value: 0,
    history: [],
    lastUpdated: Date.now()
  }
);

const advIncrement = Advanced.createTypedAgent<"Increment", { amount: number }>(
  "Increment",
  { amount: 10 }
);

// Define a rule with more options
Advanced.defineActionRule(
  advancedNetwork,
  "advanced-increment",
  advCounter,
  advIncrement,
  (counter, increment) => {
    counter.value.history.push(counter.value.value);
    counter.value.value += increment.value.amount;
    counter.value.lastUpdated = Date.now();
    
    return [counter, increment];
  }
);

// Connect and run with monitoring
Advanced.connectAgents(advancedNetwork, advCounter, advIncrement);
Advanced.executeWithMonitoring(advancedNetwork, 1);
console.log("Advanced counter:", advCounter.value);

// 5. Abstraction Layer Integration
console.log("\n--- Abstraction Layer Integration ---");

// Create a comprehensive example that uses all layers
const appNetwork = Core.createNetwork("comprehensive-example");

// Create agents
const dataAgent = Core.createAgent("DataSource", { items: [1, 2, 3] });
const processorAgent = Core.createAgent("Processor", { 
  transform: (x) => x * 2,
  processed: []
});
const resultAgent = Core.createAgent("Result", { 
  values: [],
  sum: 0 
});

// Add agents to network
appNetwork.addAgent(dataAgent);
appNetwork.addAgent(processorAgent);
appNetwork.addAgent(resultAgent);

// Create processing rule
const processRule = Core.createRule(
  "process-data",
  dataAgent.ports.main,
  processorAgent.ports.main,
  (data, processor) => {
    // Process all items
    processor.value.processed = data.value.items.map(
      item => processor.value.transform(item)
    );
    
    console.log("Data processed:", processor.value.processed);
    
    return [data, processor];
  }
);

// Create aggregation rule
const aggregateRule = Core.createRule(
  "aggregate-results",
  processorAgent.ports.main,
  resultAgent.ports.main,
  (processor, result) => {
    // Store processed values
    result.value.values = processor.value.processed;
    
    // Calculate sum
    result.value.sum = processor.value.processed.reduce(
      (sum, val) => sum + val, 0
    );
    
    console.log("Results aggregated, sum:", result.value.sum);
    
    return [processor, result];
  }
);

// Add rules
appNetwork.addRule(processRule);
appNetwork.addRule(aggregateRule);

// Connect and run in sequence
console.log("\nRunning comprehensive example...");
appNetwork.connectPorts(dataAgent.ports.main, processorAgent.ports.main);
appNetwork.step();
appNetwork.connectPorts(processorAgent.ports.main, resultAgent.ports.main);
appNetwork.step();

// Show final results
console.log("\nFinal results:");
console.log("Original data:", dataAgent.value.items);
console.log("Processed data:", processorAgent.value.processed);
console.log("Result values:", resultAgent.value.values);
console.log("Sum:", resultAgent.value.sum);

console.log("\nEnd of unified architecture example.");