/**
 * Parallel Execution Module for Annette
 * 
 * This module provides parallel execution capabilities for the Annette
 * interaction nets library, leveraging web workers for improved performance.
 */

// Export core components
export * from './worker-pool';
export * from './parallel-network';
export * from './rule-dependency-analyzer';
export * from './effect-handler';

// Re-export plugin entry point
import { ParallelNetwork, ParallelNetworkOptions } from './parallel-network';
import { AdvancedRuleDependencyAnalyzer, AdvancedDependencyAnalyzerOptions } from './rule-dependency-analyzer';
import { ParallelEffectHandler, ParallelEffectHandlerOptions } from './effect-handler';
import { INetwork } from '../network';

/**
 * Options for configuring the parallel plugin
 */
export interface ParallelPluginOptions {
  /**
   * Network options
   */
  networkOptions?: ParallelNetworkOptions;
  
  /**
   * Dependency analyzer options
   */
  analyzerOptions?: AdvancedDependencyAnalyzerOptions;
  
  /**
   * Effect handler options
   */
  effectHandlerOptions?: ParallelEffectHandlerOptions;
}

/**
 * Create a parallel-enabled network
 * @param baseNetwork Optional base network to enhance
 * @param options Configuration options
 * @returns Parallel-enabled network
 */
export function createParallelNetwork(
  baseNetwork?: INetwork,
  options?: ParallelNetworkOptions
): ParallelNetwork {
  return new ParallelNetwork({
    baseNetwork,
    ...options
  });
}

/**
 * Create a parallel plugin for Annette
 * @param options Plugin configuration options
 * @returns Plugin configuration object
 */
export function createParallelPlugin(options: ParallelPluginOptions = {}) {
  return {
    name: 'parallel',
    version: '1.0.0',
    description: 'Parallel execution capabilities for Annette',
    
    // Initialize the plugin
    initialize(context: any) {
      // Create the parallel components
      const analyzer = new AdvancedRuleDependencyAnalyzer(options.analyzerOptions);
      const effectHandler = new ParallelEffectHandler(options.effectHandlerOptions);
      
      // Extend the context with parallel capabilities
      return {
        // Factory function for creating parallel networks
        createParallelNetwork: (baseNetwork?: INetwork) => {
          return createParallelNetwork(baseNetwork, {
            ...options.networkOptions,
            analyzeRuleDependencies: true
          });
        },
        
        // Effect handler
        effectHandler,
        
        // Rule dependency analyzer
        ruleAnalyzer: analyzer,
        
        // Helper to check if parallel execution is available
        isParallelExecutionAvailable: () => typeof Worker !== 'undefined',
        
        // Utility to terminate all workers
        terminateWorkers: () => {
          effectHandler.terminate();
        }
      };
    },
    
    // Cleanup function
    cleanup(context: any) {
      if (context.terminateWorkers) {
        context.terminateWorkers();
      }
    }
  };
}