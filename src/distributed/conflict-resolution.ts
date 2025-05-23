/**
 * Conflict Resolution Strategies
 * 
 * This module provides sophisticated conflict resolution strategies for
 * handling concurrent changes in distributed systems.
 */
import { VectorClock, Versioned, compareVersioned } from './vector-clock';

/**
 * Metadata for conflict resolution
 */
export interface ConflictMetadata {
  /** Local timestamp */
  localTimestamp: number;
  
  /** Remote timestamp */
  remoteTimestamp: number;
  
  /** Local node ID */
  localNodeId: string;
  
  /** Remote node ID */
  remoteNodeId: string;
  
  /** Path to the conflicting property */
  path: string[];
  
  /** Local vector clock */
  localClock: VectorClock;
  
  /** Remote vector clock */
  remoteClock: VectorClock;
  
  /** Data type of the conflicting values */
  dataType?: string;
}

/**
 * Interface for conflict resolution strategies
 */
export interface ConflictResolutionStrategy {
  /**
   * Resolve a conflict between local and remote values
   * @param local The local value
   * @param remote The remote value
   * @param metadata Metadata for conflict resolution
   * @returns The resolved value
   */
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T;
  
  /**
   * Get the name of the strategy
   */
  readonly name: string;
}

/**
 * Strategy that always uses the local value
 */
export const keepLocal: ConflictResolutionStrategy = {
  name: 'keepLocal',
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T {
    return local;
  }
};

/**
 * Strategy that always uses the remote value
 */
export const keepRemote: ConflictResolutionStrategy = {
  name: 'keepRemote',
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T {
    return remote;
  }
};

/**
 * Strategy that uses the value with the later timestamp
 */
export const lastWriteWins: ConflictResolutionStrategy = {
  name: 'lastWriteWins',
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T {
    return metadata.remoteTimestamp > metadata.localTimestamp ? remote : local;
  }
};

/**
 * Strategy that uses the value from the higher-priority node
 */
export const nodeIdPriority = (priorities: string[]): ConflictResolutionStrategy => ({
  name: 'nodeIdPriority',
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T {
    const localPriority = priorities.indexOf(metadata.localNodeId);
    const remotePriority = priorities.indexOf(metadata.remoteNodeId);
    
    // Lower index means higher priority
    // If a node is not in the priorities list, it gets lowest priority
    const localPriorityValue = localPriority === -1 ? Infinity : localPriority;
    const remotePriorityValue = remotePriority === -1 ? Infinity : remotePriority;
    
    return localPriorityValue <= remotePriorityValue ? local : remote;
  }
});

/**
 * Strategy that uses vector clocks for causality-based resolution
 */
export const causalityBased: ConflictResolutionStrategy = {
  name: 'causalityBased',
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T {
    const comparison = compareVectorClocks(metadata.localClock, metadata.remoteClock);
    
    if (comparison === -1) {
      // Local is causally before remote
      return remote;
    } else if (comparison === 1) {
      // Remote is causally before local
      return local;
    } else {
      // Concurrent changes, use last write wins as fallback
      return metadata.remoteTimestamp > metadata.localTimestamp ? remote : local;
    }
  }
};

/**
 * Compare two vector clocks
 * @returns -1 if a is before b, 1 if a is after b, 0 if concurrent
 */
function compareVectorClocks(a: VectorClock, b: VectorClock): -1 | 0 | 1 {
  if (a.isBefore(b)) {
    return -1;
  } else if (a.isAfter(b)) {
    return 1;
  } else {
    return 0;
  }
}

/**
 * Strategy that merges object values
 */
export const mergeObjects: ConflictResolutionStrategy = {
  name: 'mergeObjects',
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T {
    if (typeof local === 'object' && local !== null && 
        typeof remote === 'object' && remote !== null) {
      // Handle arrays
      if (Array.isArray(local) && Array.isArray(remote)) {
        // For arrays, concatenate unique values
        return [...new Set([...local, ...remote])] as unknown as T;
      }
      
      // Handle maps
      if (local instanceof Map && remote instanceof Map) {
        const merged = new Map(local);
        for (const [key, value] of remote) {
          merged.set(key, value);
        }
        return merged as unknown as T;
      }
      
      // Handle sets
      if (local instanceof Set && remote instanceof Set) {
        return new Set([...local, ...remote]) as unknown as T;
      }
      
      // Handle plain objects
      if (!Array.isArray(local) && !Array.isArray(remote) &&
          !(local instanceof Map) && !(remote instanceof Map) &&
          !(local instanceof Set) && !(remote instanceof Set)) {
        return { ...local, ...remote } as T;
      }
    }
    
    // Default to remote for non-object values or different types
    return remote;
  }
};

/**
 * Strategy that uses different strategies based on data type
 */
export const typeBasedStrategy = (
  strategies: Record<string, ConflictResolutionStrategy>,
  defaultStrategy: ConflictResolutionStrategy
): ConflictResolutionStrategy => ({
  name: 'typeBasedStrategy',
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T {
    if (metadata.dataType && strategies[metadata.dataType]) {
      return strategies[metadata.dataType].resolve(local, remote, metadata);
    }
    return defaultStrategy.resolve(local, remote, metadata);
  }
});

/**
 * Strategy that uses different strategies based on path
 */
export const pathBasedStrategy = (
  pathStrategies: Record<string, ConflictResolutionStrategy>,
  defaultStrategy: ConflictResolutionStrategy
): ConflictResolutionStrategy => ({
  name: 'pathBasedStrategy',
  resolve<T>(local: T, remote: T, metadata: ConflictMetadata): T {
    const path = metadata.path.join('.');
    
    for (const [pattern, strategy] of Object.entries(pathStrategies)) {
      if (new RegExp(pattern).test(path)) {
        return strategy.resolve(local, remote, metadata);
      }
    }
    
    return defaultStrategy.resolve(local, remote, metadata);
  }
});

/**
 * Strategy that applies a custom function
 */
export const customStrategy = (
  name: string,
  resolveFunction: <T>(local: T, remote: T, metadata: ConflictMetadata) => T
): ConflictResolutionStrategy => ({
  name,
  resolve: resolveFunction
});

/**
 * Apply a conflict resolution strategy to two versioned values
 */
export function resolveConflict<T>(
  local: Versioned & { value: T },
  remote: Versioned & { value: T },
  strategy: ConflictResolutionStrategy,
  metadata: Omit<ConflictMetadata, 'localClock' | 'remoteClock'>
): T {
  const fullMetadata: ConflictMetadata = {
    ...metadata,
    localClock: local.vectorClock,
    remoteClock: remote.vectorClock
  };
  
  return strategy.resolve(local.value, remote.value, fullMetadata);
}

/**
 * Conflict resolver for handling conflicts in distributed data
 */
export class ConflictResolver {
  private strategies: Map<string, ConflictResolutionStrategy> = new Map();
  private defaultStrategy: ConflictResolutionStrategy = lastWriteWins;
  
  /**
   * Create a new conflict resolver
   * @param defaultStrategy The default strategy to use when no specific strategy is found
   */
  constructor(defaultStrategy?: ConflictResolutionStrategy) {
    if (defaultStrategy) {
      this.defaultStrategy = defaultStrategy;
    }
    
    // Register built-in strategies
    this.registerStrategy(keepLocal);
    this.registerStrategy(keepRemote);
    this.registerStrategy(lastWriteWins);
    this.registerStrategy(causalityBased);
    this.registerStrategy(mergeObjects);
  }
  
  /**
   * Register a conflict resolution strategy
   * @param strategy The strategy to register
   */
  registerStrategy(strategy: ConflictResolutionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }
  
  /**
   * Get a registered strategy by name
   * @param name The name of the strategy
   * @returns The strategy or undefined if not found
   */
  getStrategy(name: string): ConflictResolutionStrategy | undefined {
    return this.strategies.get(name);
  }
  
  /**
   * Set the default strategy
   * @param strategy The strategy to use as default
   */
  setDefaultStrategy(strategy: ConflictResolutionStrategy): void {
    this.defaultStrategy = strategy;
  }
  
  /**
   * Resolve a conflict using a specific strategy
   * @param local The local value
   * @param remote The remote value
   * @param metadata Metadata for conflict resolution
   * @param strategyName Optional name of the strategy to use (defaults to the default strategy)
   * @returns The resolved value
   */
  resolve<T>(
    local: T,
    remote: T,
    metadata: ConflictMetadata,
    strategyName?: string
  ): T {
    const strategy = strategyName 
      ? this.strategies.get(strategyName) || this.defaultStrategy
      : this.defaultStrategy;
    
    return strategy.resolve(local, remote, metadata);
  }
  
  /**
   * Create a composite strategy that tries multiple strategies in order
   * @param strategyNames Names of strategies to try in order
   * @returns A new composite strategy
   */
  createCompositeStrategy(...strategyNames: string[]): ConflictResolutionStrategy {
    const strategies = strategyNames
      .map(name => this.strategies.get(name))
      .filter(Boolean) as ConflictResolutionStrategy[];
    
    if (strategies.length === 0) {
      return this.defaultStrategy;
    }
    
    return {
      name: `composite(${strategyNames.join(',')})`,
      resolve: <T>(local: T, remote: T, metadata: ConflictMetadata): T => {
        // Try each strategy in order
        for (let i = 0; i < strategies.length - 1; i++) {
          const result = strategies[i].resolve(local, remote, metadata);
          
          // If the result is different from both local and remote,
          // it means the strategy made a decision
          if (result !== local && result !== remote) {
            return result;
          }
        }
        
        // Use the last strategy as fallback
        return strategies[strategies.length - 1].resolve(local, remote, metadata);
      }
    };
  }
}

// Export all standard strategies
export const strategies = {
  keepLocal,
  keepRemote,
  lastWriteWins,
  causalityBased,
  mergeObjects,
  nodeIdPriority,
  typeBasedStrategy,
  pathBasedStrategy,
  customStrategy
};