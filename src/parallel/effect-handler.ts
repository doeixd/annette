/**
 * Parallel Effect Handler for Annette
 * 
 * This module provides parallel execution of effect handlers
 * using web workers for improved performance.
 */

import { WorkerPool, WorkerPoolOptions } from './worker-pool';

/**
 * Options for configuring the parallel effect handler
 */
export interface ParallelEffectHandlerOptions extends WorkerPoolOptions {
  /**
   * Whether to batch similar effects
   * Default: true
   */
  batchSimilarEffects?: boolean;
  
  /**
   * Maximum batch size for effect handling
   * Default: 50
   */
  maxBatchSize?: number;
  
  /**
   * Time to wait for batching (ms)
   * Default: 20
   */
  batchWaitTime?: number;
}

/**
 * Interface for an effect to be handled
 */
export interface Effect {
  /**
   * Unique identifier for the effect
   */
  id: string;
  
  /**
   * Type of the effect
   */
  type: string;
  
  /**
   * Effect payload
   */
  payload: any;
  
  /**
   * Time the effect was created
   */
  timestamp?: number;
  
  /**
   * Priority of the effect (higher numbers are higher priority)
   */
  priority?: number;
}

/**
 * Interface for an effect handler
 */
export interface EffectHandler<T extends Effect = Effect> {
  /**
   * Handle an effect
   * @param effect The effect to handle
   * @returns The result of handling the effect
   */
  handle(effect: T): Promise<any>;
}

/**
 * Interface for an effect handler registry
 */
export interface EffectHandlerRegistry {
  /**
   * Register an effect handler
   * @param type Effect type
   * @param name Handler name
   * @param handler The handler function
   */
  registerHandler(type: string, name: string, handler: Function): void;
  
  /**
   * Get a handler for an effect
   * @param type Effect type
   * @param name Handler name
   * @returns The handler function or undefined
   */
  getHandler(type: string, name: string): Function | undefined;
}

/**
 * Parallel Effect Handler that distributes effect handling
 * across multiple web workers for improved performance
 */
export class ParallelEffectHandler implements EffectHandler, EffectHandlerRegistry {
  /**
   * Worker pool for parallel execution
   */
  private workerPool: WorkerPool;
  
  /**
   * Configuration options
   */
  private options: ParallelEffectHandlerOptions;
  
  /**
   * Registered effect handlers
   */
  private handlers = new Map<string, Function>();
  
  /**
   * Pending effect batches by type
   */
  private pendingEffects = new Map<string, Effect[]>();
  
  /**
   * Batch timers by effect type
   */
  private batchTimers = new Map<string, any>();
  
  /**
   * Flag indicating whether parallel execution is enabled
   */
  private parallelEnabled: boolean = true;
  
  /**
   * Create a new parallel effect handler
   * @param options Configuration options
   */
  constructor(options: ParallelEffectHandlerOptions = {}) {
    this.options = {
      batchSimilarEffects: true,
      maxBatchSize: 50,
      batchWaitTime: 20,
      ...options
    };
    
    this.workerPool = new WorkerPool(options);
    
    // Check if parallel execution is available
    if (typeof Worker === 'undefined') {
      this.parallelEnabled = false;
      console.warn('Web Workers not available. Falling back to sequential execution.');
    }
  }
  
  /**
   * Register an effect handler
   * @param type Effect type
   * @param name Handler name
   * @param handler The handler function
   */
  registerHandler(type: string, name: string, handler: Function): void {
    const key = `${type}:${name}`;
    this.handlers.set(key, handler);
    
    // Register with worker pool if possible
    if (this.parallelEnabled) {
      // Convert the handler to a string for serialization
      const handlerStr = handler.toString();
      
      // Send to worker pool
      this.workerPool.executeEffectHandler({
        type: 'register',
        id: key
      }, type, handlerStr);
    }
  }
  
  /**
   * Get a handler for an effect
   * @param type Effect type
   * @param name Handler name
   * @returns The handler function or undefined
   */
  getHandler(type: string, name: string): Function | undefined {
    return this.handlers.get(`${type}:${name}`);
  }
  
  /**
   * Handle an effect
   * @param effect The effect to handle
   * @returns The result of handling the effect
   */
  async handle(effect: Effect): Promise<any> {
    // If batching is enabled, add to batch
    if (this.options.batchSimilarEffects && this.parallelEnabled) {
      return this.batchEffect(effect);
    }
    
    // Otherwise handle immediately
    return this.handleSingleEffect(effect);
  }
  
  /**
   * Add an effect to a batch
   * @param effect The effect to batch
   * @returns Promise that resolves with the effect result
   */
  private batchEffect(effect: Effect): Promise<any> {
    return new Promise((resolve, reject) => {
      // Add callback to the effect
      const enhancedEffect = {
        ...effect,
        _resolve: resolve,
        _reject: reject,
        timestamp: effect.timestamp || Date.now()
      };
      
      // Get or create the batch for this effect type
      if (!this.pendingEffects.has(effect.type)) {
        this.pendingEffects.set(effect.type, []);
      }
      
      const batch = this.pendingEffects.get(effect.type)!;
      batch.push(enhancedEffect);
      
      // If the batch is full, process it immediately
      if (batch.length >= this.options.maxBatchSize!) {
        this.processBatch(effect.type);
        return;
      }
      
      // Otherwise, set a timer to process the batch
      if (!this.batchTimers.has(effect.type)) {
        const timer = setTimeout(() => {
          this.processBatch(effect.type);
        }, this.options.batchWaitTime);
        
        this.batchTimers.set(effect.type, timer);
      }
    });
  }
  
  /**
   * Process a batch of effects
   * @param effectType The effect type to process
   */
  private async processBatch(effectType: string): Promise<void> {
    // Clear the timer
    if (this.batchTimers.has(effectType)) {
      clearTimeout(this.batchTimers.get(effectType));
      this.batchTimers.delete(effectType);
    }
    
    // Get the batch
    const batch = this.pendingEffects.get(effectType) || [];
    this.pendingEffects.delete(effectType);
    
    if (batch.length === 0) {
      return;
    }
    
    // Sort by priority and timestamp
    batch.sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }
      
      return (a.timestamp || 0) - (b.timestamp || 0); // Earlier timestamp first
    });
    
    // Process each effect
    for (const effect of batch) {
      try {
        const result = await this.handleSingleEffect(effect);
        (effect as any)._resolve(result);
      } catch (error) {
        (effect as any)._reject(error);
      }
    }
  }
  
  /**
   * Handle a single effect
   * @param effect The effect to handle
   * @returns The result of handling the effect
   */
  private async handleSingleEffect(effect: Effect): Promise<any> {
    // Find the registered handler for this effect type
    const handler = this.getHandlerForEffect(effect);
    
    if (!handler) {
      throw new Error(`No handler found for effect type: ${effect.type}`);
    }
    
    // If parallel execution is disabled, execute locally
    if (!this.parallelEnabled) {
      return handler(effect);
    }
    
    // Otherwise, execute in a worker
    const handlerStr = handler.toString();
    const result = await this.workerPool.executeEffectHandler(
      effect,
      effect.type,
      handlerStr
    );
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    return result.result;
  }
  
  /**
   * Get the handler for an effect
   * @param effect The effect to handle
   * @returns The handler function or undefined
   */
  private getHandlerForEffect(effect: Effect): Function | undefined {
    // Try to get a specific handler for this effect
    if (effect.type.includes(':')) {
      const [type, subtype] = effect.type.split(':');
      const handler = this.getHandler(type, subtype);
      if (handler) {
        return handler;
      }
    }
    
    // Try to get a generic handler for this effect type
    const handler = this.getHandler(effect.type, 'default');
    if (handler) {
      return handler;
    }
    
    // Try to get a fallback handler
    return this.getHandler('*', 'default');
  }
  
  /**
   * Enable or disable parallel execution
   * @param enabled Whether parallel execution is enabled
   */
  setParallelExecution(enabled: boolean): void {
    this.parallelEnabled = enabled && typeof Worker !== 'undefined';
  }
  
  /**
   * Check if parallel execution is enabled
   * @returns True if parallel execution is enabled
   */
  isParallelExecutionEnabled(): boolean {
    return this.parallelEnabled;
  }
  
  /**
   * Get the worker pool status
   * @returns Worker pool status
   */
  getWorkerPoolStatus(): { totalWorkers: number; activeWorkers: number; queuedTasks: number } {
    return this.workerPool.getStatus();
  }
  
  /**
   * Terminate the worker pool
   */
  terminate(): void {
    // Process any pending batches
    for (const effectType of this.pendingEffects.keys()) {
      this.processBatch(effectType);
    }
    
    // Clear all timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    
    // Terminate the worker pool
    this.workerPool.terminate();
  }
}