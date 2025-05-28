/**
 * Worker Pool implementation for Annette
 * 
 * Manages a pool of web workers for parallel execution of rules and effects
 */

import { IAgent } from '../agent';
import { IBoundPort } from '../port';
import { AnyRule, IRule } from '../rule';
import { v4 as uuidv4 } from 'uuid';

/**
 * Represents a task to be executed by a worker
 */
export interface Task {
  id: string;
  type: 'rule-execution' | 'effect-handling';
  data: any;
  callback: (result: any) => void;
}

/**
 * Represents a rule execution task
 */
export interface RuleExecutionTask extends Task {
  type: 'rule-execution';
  data: {
    ruleSet: RuleSet;
    networkState: SerializedNetworkState;
  };
}

/**
 * Represents an effect handling task
 */
export interface EffectHandlingTask extends Task {
  type: 'effect-handling';
  data: {
    effect: any;
    handlerType: string;
    handlerFn: string;
  };
}

/**
 * A set of rules that can be executed independently
 */
export interface RuleSet {
  rules: Array<{
    ruleId: string;
    port1Id: string;
    port2Id: string;
    agentId1: string;
    agentId2: string;
    ruleName: string;
    ruleType: 'action' | 'rewrite';
    ruleDefinition: any;
  }>;
}

/**
 * A serialized view of the network state for worker execution
 */
export interface SerializedNetworkState {
  agents: Record<string, SerializedAgent>;
  connections: Array<{
    sourceAgentId: string;
    sourcePortName: string;
    destinationAgentId: string;
    destinationPortName: string;
  }>;
}

/**
 * A serialized agent for worker execution
 */
export interface SerializedAgent {
  id: string;
  name: string;
  type?: string;
  value: any;
  ports: Record<string, {
    name: string;
    type: string;
  }>;
}

/**
 * Execution result from a worker
 */
export interface ExecutionResult {
  taskId: string;
  steps: number;
  newAgents: SerializedAgent[];
  removedAgentIds: string[];
  newConnections: Array<{
    sourceAgentId: string;
    sourcePortName: string;
    destinationAgentId: string;
    destinationPortName: string;
  }>;
  removedConnections: Array<{
    sourceAgentId: string;
    sourcePortName: string;
    destinationAgentId: string;
    destinationPortName: string;
  }>;
  error?: string;
}

/**
 * Result of an effect handling operation
 */
export interface EffectResult {
  taskId: string;
  effectId: string;
  result: any;
  error?: string;
}

/**
 * Options for configuring the worker pool
 */
export interface WorkerPoolOptions {
  /**
   * Number of workers to create (defaults to available CPU cores)
   */
  numWorkers?: number;
  
  /**
   * Path to the worker script
   */
  workerScriptPath?: string;
  
  /**
   * Whether to enable debugging information
   */
  debug?: boolean;
}

/**
 * Worker Pool that manages a set of workers for parallel execution
 */
export class WorkerPool {
  private workers: Array<Worker & { busy?: boolean; currentTask?: Task; currentTaskId?: string }> = [];
  private taskQueue: Task[] = [];
  private activeWorkers = 0;
  private options: WorkerPoolOptions;
  
  /**
   * Create a new worker pool
   * @param options Configuration options
   */
  constructor(options: WorkerPoolOptions = {}) {
    this.options = {
      numWorkers: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2,
      workerScriptPath: '/workers/rule-executor.js',
      debug: false,
      ...options
    };
    
    this.initializeWorkers();
  }
  
  /**
   * Initialize the worker pool
   */
  private initializeWorkers(): void {
    // Skip initialization if not in a browser environment
    if (typeof Worker === 'undefined') {
      console.warn('Worker API not available. Parallel execution disabled.');
      return;
    }
    
    for (let i = 0; i < this.options.numWorkers!; i++) {
      try {
        const worker = new Worker(this.options.workerScriptPath!);
        worker.onmessage = this.handleWorkerMessage.bind(this);
        worker.onerror = this.handleWorkerError.bind(this);
        this.workers.push(worker);
        
        if (this.options.debug) {
          console.log(`Initialized worker ${i + 1}/${this.options.numWorkers}`);
        }
      } catch (error) {
        console.error(`Failed to initialize worker: ${error}`);
      }
    }
  }
  
  /**
   * Execute a rule set in parallel
   * @param ruleSet The rule set to execute
   * @param networkState The current network state
   * @returns Promise that resolves to the execution result
   */
  executeRuleSet(ruleSet: RuleSet, networkState: SerializedNetworkState): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const taskId = uuidv4();
      
      this.taskQueue.push({
        id: taskId,
        type: 'rule-execution',
        data: {
          ruleSet,
          networkState
        },
        callback: resolve
      });
      
      this.processQueue();
    });
  }
  
  /**
   * Execute an effect handler in parallel
   * @param effect The effect to handle
   * @param handlerType The type of effect handler
   * @param handlerFn The handler function serialized as a string
   * @returns Promise that resolves to the effect result
   */
  executeEffectHandler(effect: any, handlerType: string, handlerFn: string): Promise<EffectResult> {
    return new Promise((resolve) => {
      const taskId = uuidv4();
      
      this.taskQueue.push({
        id: taskId,
        type: 'effect-handling',
        data: {
          effect,
          handlerType,
          handlerFn
        },
        callback: resolve
      });
      
      this.processQueue();
    });
  }
  
  /**
   * Process the task queue
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0 || this.activeWorkers >= this.workers.length) {
      return;
    }
    
    // Find an available worker
    const availableWorkerIndex = this.workers.findIndex(w => !w.busy);
    if (availableWorkerIndex === -1) return;
    
    const worker = this.workers[availableWorkerIndex];
    const task = this.taskQueue.shift()!;
    
    // Mark worker as busy
    worker.busy = true;
    worker.currentTask = task;
    worker.currentTaskId = task.id;
    this.activeWorkers++;
    
    // Send task to worker
    worker.postMessage({
      taskId: task.id,
      type: task.type,
      data: task.data
    });
    
    if (this.options.debug) {
      console.log(`Sent task ${task.id} (${task.type}) to worker ${availableWorkerIndex}`);
    }
    
    // Process next task if workers are available
    this.processQueue();
  }
  
  /**
   * Handle a message from a worker
   * @param event The message event
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { taskId, result } = event.data;
    
    // Find the worker that sent the message
    const workerIndex = this.workers.findIndex(w => w.currentTaskId === taskId);
    if (workerIndex === -1) return;
    
    const worker = this.workers[workerIndex];
    const task = worker.currentTask!;
    
    // Mark worker as available
    worker.busy = false;
    this.activeWorkers--;
    
    // Execute the callback
    task.callback(result);
    
    // Clear task references
    delete worker.currentTask;
    delete worker.currentTaskId;
    
    if (this.options.debug) {
      console.log(`Worker ${workerIndex} completed task ${taskId}`);
    }
    
    // Process next task
    this.processQueue();
  }
  
  /**
   * Handle an error from a worker
   * @param error The error event
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Worker error:', error);
    
    // Find the worker that caused the error
    const workerIndex = this.workers.findIndex(w => w.onerror === error.target);
    if (workerIndex === -1) return;
    
    const worker = this.workers[workerIndex];
    
    // If the worker was executing a task, fail the task
    if (worker.currentTask) {
      const task = worker.currentTask;
      const errorResult = {
        taskId: task.id,
        error: `Worker error: ${error.message}`
      };
      
      // Execute the callback with error
      task.callback(errorResult);
      
      // Mark worker as available
      worker.busy = false;
      this.activeWorkers--;
      
      // Clear task references
      delete worker.currentTask;
      delete worker.currentTaskId;
      
      // Process next task
      this.processQueue();
    }
  }
  
  /**
   * Terminate all workers in the pool
   */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    
    this.workers = [];
    this.activeWorkers = 0;
    
    if (this.options.debug) {
      console.log('All workers terminated');
    }
  }
  
  /**
   * Get the current status of the worker pool
   */
  getStatus(): { totalWorkers: number; activeWorkers: number; queuedTasks: number } {
    return {
      totalWorkers: this.workers.length,
      activeWorkers: this.activeWorkers,
      queuedTasks: this.taskQueue.length
    };
  }
}