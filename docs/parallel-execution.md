# Parallel Execution in Annette

This document describes the parallel execution system in Annette, which enables improved performance by distributing rule execution across multiple web workers.

## Overview

The parallel execution system in Annette provides the following capabilities:

- Concurrent execution of independent rules across multiple web workers
- Advanced rule dependency analysis to maximize parallelism
- Parallel effect handling for improved performance
- Integration with Annette's plugin system

## Components

### WorkerPool

The `WorkerPool` is the core component that manages a set of web workers for parallel execution. It provides:

- Dynamic allocation of workers based on CPU cores
- Task queuing and distribution
- Communication between the main thread and workers
- Error handling and recovery

### ParallelNetwork

The `ParallelNetwork` extends Annette's `Network` with parallel execution capabilities:

- Distributes rule execution across multiple web workers
- Handles serialization and deserialization of network state
- Batches rules for optimal performance
- Provides fallback to sequential execution when needed

### RuleDependencyAnalyzer

The `RuleDependencyAnalyzer` analyzes rule dependencies to identify independent rule sets that can be executed in parallel:

- Graph-based dependency analysis
- Value-based dependency refinement
- Cache for analysis results
- Batch optimization for improved performance

### ParallelEffectHandler

The `ParallelEffectHandler` provides parallel execution of effect handlers:

- Batching of similar effects
- Priority-based execution
- Fallback to sequential execution when needed
- Integration with Annette's effect system

## Usage

### Basic Usage

```typescript
import { createParallelNetwork } from 'annette';

// Create a parallel network
const network = createParallelNetwork();

// Use the network as usual
network.addAgent(agent);
network.addRule(rule);

// Execute rules in parallel
await network.step();

// Terminate workers when done
network.terminate();
```

### Plugin Integration

```typescript
import { createParallelPlugin } from 'annette';

// Create the parallel plugin
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

// Register the plugin with Annette
const network = createPluginNetwork([parallelPlugin]);

// Create a parallel network
const parallelNetwork = network.plugins.parallel.createParallelNetwork();

// Use the parallel network as usual
```

## Advanced Features

### Rule Dependency Analysis

The rule dependency analyzer uses advanced techniques to identify independent rule sets:

- **Graph-based Analysis**: Builds a dependency graph to identify independent rule sets
- **Value-based Analysis**: Refines dependencies based on agent value access patterns
- **Batch Optimization**: Merges small rule sets for optimal performance

### Effect Handling

The parallel effect handler provides advanced effect handling capabilities:

- **Batching**: Groups similar effects for improved performance
- **Priority-based Execution**: Executes high-priority effects first
- **Handler Registration**: Registers effect handlers with workers

### Configuration Options

The parallel execution system provides extensive configuration options:

- **WorkerPool**: Configure the number of workers, script path, and debugging
- **ParallelNetwork**: Configure batch size, analysis strategy, and wait time
- **RuleDependencyAnalyzer**: Configure batch optimization and analysis options
- **ParallelEffectHandler**: Configure batching, batch size, and wait time

## Performance Considerations

- Parallel execution is most effective with a large number of independent rules
- The overhead of serialization and worker communication may outweigh benefits for small networks
- Value-based dependency analysis can significantly improve parallelism
- Batching improves performance by reducing worker communication

## Implementation Details

The parallel execution system uses web workers to execute rules in parallel:

1. The main thread analyzes rule dependencies to identify independent rule sets
2. The network state is serialized and sent to workers
3. Workers execute their assigned rule sets and return the results
4. The main thread applies the results to the network

The system includes:

- **rule-executor.js**: Worker script that executes rules
- **worker-pool.ts**: Manages workers and task distribution
- **parallel-network.ts**: Provides parallel execution of rules
- **rule-dependency-analyzer.ts**: Analyzes rule dependencies
- **effect-handler.ts**: Provides parallel effect handling

## Future Improvements

- Shared memory optimizations for reduced serialization overhead
- More sophisticated rule dependency analysis
- Adaptive parallelism based on rule execution patterns
- Integration with WebGPU for massively parallel execution

## Example

See the [parallel-execution.ts](../examples/parallel-execution.ts) example for a demonstration of the parallel execution system.