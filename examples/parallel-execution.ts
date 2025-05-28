/**
 * Parallel Execution Example
 * 
 * This example demonstrates how to use the parallel execution features
 * to improve performance of rule execution in Annette.
 */

import {
  Agent,
  ActionRule,
  ParallelNetwork,
  createParallelNetwork,
  createParallelPlugin
} from '../src';

// Create a parallel network
const parallelNetwork = createParallelNetwork();

// Add some agents to the network
const agents = [];
for (let i = 0; i < 1000; i++) {
  const agent = new Agent(`Agent${i}`, { count: i });
  parallelNetwork.addAgent(agent);
  agents.push(agent);
}

// Create connections and rules between agents
for (let i = 0; i < agents.length - 1; i++) {
  const agent1 = agents[i];
  const agent2 = agents[i + 1];
  
  // Connect the agents
  parallelNetwork.connect(agent1, 'main', agent2, 'main');
  
  // Add a rule for the connection
  const rule = ActionRule(
    agent1.ports.main,
    agent2.ports.main,
    (source, target) => {
      // Simple counting rule
      const sourceCount = source.value.count || 0;
      const targetCount = target.value.count || 0;
      
      // Update the target's count
      target.value.count = targetCount + 1;
      
      // Update the source's count
      source.value.count = sourceCount + 1;
    },
    `CountRule-${i}`
  );
  
  parallelNetwork.addRule(rule);
}

// Measure performance with parallel execution
console.time('Parallel Execution');
(async () => {
  for (let i = 0; i < 10; i++) {
    const steps = await parallelNetwork.step();
    console.log(`Step ${i + 1}: Executed ${steps} rules`);
  }
  console.timeEnd('Parallel Execution');
  
  // Show worker pool status
  console.log('Worker Pool Status:', parallelNetwork.getWorkerPoolStatus());
  
  // Disable parallel execution for comparison
  parallelNetwork.setParallelExecution(false);
  
  // Measure performance with sequential execution
  console.time('Sequential Execution');
  for (let i = 0; i < 10; i++) {
    const steps = await parallelNetwork.step();
    console.log(`Step ${i + 1}: Executed ${steps} rules (sequential)`);
  }
  console.timeEnd('Sequential Execution');
  
  // Terminate the worker pool when done
  parallelNetwork.terminate();
})();

/**
 * Parallel Plugin Example
 * 
 * This demonstrates how to use the parallel execution as a plugin
 */
function parallelPluginExample() {
  // Create the plugin
  const parallelPlugin = createParallelPlugin({
    networkOptions: {
      numWorkers: 4,
      debug: true
    },
    analyzerOptions: {
      maxBatchSize: 100,
      useValueBasedAnalysis: true
    },
    effectHandlerOptions: {
      batchSimilarEffects: true
    }
  });
  
  // Initialize the plugin
  const context = parallelPlugin.initialize({});
  
  // Create a parallel network
  const network = context.createParallelNetwork();
  
  // Use the network as usual...
  
  // Clean up when done
  parallelPlugin.cleanup(context);
}

// Export examples for external use
export {
  parallelNetwork,
  parallelPluginExample
};