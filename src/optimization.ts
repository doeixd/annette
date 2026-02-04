/**
 * Annette Performance Optimizations
 * 
 * This module provides performance optimizations for Annette networks,
 * including rule indexing, lazy evaluation, structural sharing, and memory management.
 */
import { INetwork, IAgent, IBoundPort, AgentName, AgentId } from './core';
import { AnyRule } from './rule';
import { isAgent } from './agent';
import { produce } from 'immer';

const globalWorker = (globalThis as { Worker?: typeof Worker }).Worker;
const globalNavigator = (globalThis as { navigator?: Navigator }).navigator;


// Extended network interface for optimization features
interface OptimizedNetwork extends INetwork {
  _connections?: any[];
  applyRule?(rule: AnyRule, connection: any): any;
}

// ========== Rule Indexing ==========

/**
 * Rule index for efficient rule matching
 */
export class RuleIndex {
  private agentTypeIndex: Map<AgentName, Set<AnyRule>> = new Map();
  private portNameIndex: Map<string, Set<AnyRule>> = new Map();
  private patternIndex: Map<string, Set<AnyRule>> = new Map();
  private ruleCache: Map<string, AnyRule | null> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * Add a rule to the index
   */
  addRule(rule: AnyRule): void {
    if (!('matchInfo' in rule)) return;

    // Extract pattern information
    const { agentName1, portName1, agentName2, portName2 } = rule.matchInfo;

    // Index by agent types
    this.addToIndex(this.agentTypeIndex, agentName1, rule);
    this.addToIndex(this.agentTypeIndex, agentName2, rule);

    // Index by port names
    this.addToIndex(this.portNameIndex, portName1, rule);
    this.addToIndex(this.portNameIndex, portName2, rule);

    // Index by pattern signature (both directions)
    const signature1 = `${agentName1}:${portName1}-${agentName2}:${portName2}`;
    const signature2 = `${agentName2}:${portName2}-${agentName1}:${portName1}`;
    this.addToIndex(this.patternIndex, signature1, rule);
    this.addToIndex(this.patternIndex, signature2, rule);

    // Clear cache on rule addition
    this.ruleCache.clear();
  }

  /**
   * Remove a rule from the index
   */
  removeRule(rule: AnyRule): void {
    if (!('matchInfo' in rule)) return;

    // Extract pattern information
    const { agentName1, portName1, agentName2, portName2 } = rule.matchInfo;

    // Remove from agent type index
    this.removeFromIndex(this.agentTypeIndex, agentName1, rule);
    this.removeFromIndex(this.agentTypeIndex, agentName2, rule);

    // Remove from port name index
    this.removeFromIndex(this.portNameIndex, portName1, rule);
    this.removeFromIndex(this.portNameIndex, portName2, rule);

    // Remove from pattern signature index
    const signature1 = `${agentName1}:${portName1}-${agentName2}:${portName2}`;
    const signature2 = `${agentName2}:${portName2}-${agentName1}:${portName1}`;
    this.removeFromIndex(this.patternIndex, signature1, rule);
    this.removeFromIndex(this.patternIndex, signature2, rule);

    // Clear cache on rule removal
    this.ruleCache.clear();
  }

  /**
   * Find applicable rules for a given connection
   */
  findRules(agent1: IAgent, port1: IBoundPort, agent2: IAgent, port2: IBoundPort): AnyRule[] {
    // Check cache first
    const cacheKey = this.getCacheKey(agent1, port1, agent2, port2);
    if (this.ruleCache.has(cacheKey)) {
      const cachedRule = this.ruleCache.get(cacheKey);
      this.cacheHits++;
      return cachedRule ? [cachedRule] : [];
    }
    this.cacheMisses++;

    // Look for exact pattern match
    const patternKey = `${agent1.name}:${port1.name}-${agent2.name}:${port2.name}`;
    const reversePatternKey = `${agent2.name}:${port2.name}-${agent1.name}:${port1.name}`;
    
    // Get rules that might match this pattern
    const patternRules = new Set<AnyRule>();
    
    const exactRules = this.patternIndex.get(patternKey);
    if (exactRules) {
      for (const rule of exactRules) {
        patternRules.add(rule);
      }
    }
    
    const reverseRules = this.patternIndex.get(reversePatternKey);
    if (reverseRules) {
      for (const rule of reverseRules) {
        patternRules.add(rule);
      }
    }
    
    // If no pattern matches, try to find rules by agent types
    if (patternRules.size === 0) {
      const agent1Rules = this.agentTypeIndex.get(agent1.name);
      const agent2Rules = this.agentTypeIndex.get(agent2.name);
      
      if (agent1Rules && agent2Rules) {
        // Get intersection of rules that match both agent types
        for (const rule of agent1Rules) {
          if (agent2Rules.has(rule)) {
            patternRules.add(rule);
          }
        }
      }
    }
    
    // Filter rules to ensure they match the exact port names
    const matchingRules: AnyRule[] = [];
    for (const rule of patternRules) {
      if (this.ruleMatches(rule, agent1, port1, agent2, port2)) {
        matchingRules.push(rule);
      }
    }
    
    // Cache the result (only if there's exactly one matching rule)
    if (matchingRules.length === 1) {
      this.ruleCache.set(cacheKey, matchingRules[0]);
    } else if (matchingRules.length === 0) {
      this.ruleCache.set(cacheKey, null);
    }
    
    return matchingRules;
  }

  /**
   * Check if a rule matches the given agents and ports
   */
  private ruleMatches(
    rule: AnyRule, 
    agent1: IAgent, 
    port1: IBoundPort, 
    agent2: IAgent, 
    port2: IBoundPort
  ): boolean {
    if (!('matchInfo' in rule)) return false;
    const pattern = rule.matchInfo;
    
    // Try direct matching
    if (
      (pattern.agentName1 === agent1.name && pattern.portName1 === port1.name &&
       pattern.agentName2 === agent2.name && pattern.portName2 === port2.name)
    ) {
      return true;
    }
    
    // Try reverse matching
    if (
      (pattern.agentName1 === agent2.name && pattern.portName1 === port2.name &&
       pattern.agentName2 === agent1.name && pattern.portName2 === port1.name)
    ) {
      return true;
    }
    
    return false;
  }

  /**
   * Get a cache key for a connection
   */
  private getCacheKey(
    agent1: IAgent, 
    port1: IBoundPort, 
    agent2: IAgent, 
    port2: IBoundPort
  ): string {
    // Use agent IDs for more precise caching
    const a1 = agent1._agentId;
    const p1 = port1.name;
    const a2 = agent2._agentId;
    const p2 = port2.name;
    
    // Sort to ensure consistent order
    if (a1 < a2 || (a1 === a2 && p1 < p2)) {
      return `${a1}:${p1}-${a2}:${p2}`;
    } else {
      return `${a2}:${p2}-${a1}:${p1}`;
    }
  }

  /**
   * Add a value to an index
   */
  private addToIndex<K, V>(index: Map<K, Set<V>>, key: K, value: V): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    index.get(key)!.add(value);
  }

  /**
   * Remove a value from an index
   */
  private removeFromIndex<K, V>(index: Map<K, Set<V>>, key: K, value: V): void {
    if (index.has(key)) {
      index.get(key)!.delete(value);
      // Clean up empty sets
      if (index.get(key)!.size === 0) {
        index.delete(key);
      }
    }
  }

  /**
   * Clear all indexes
   */
  clear(): void {
    this.agentTypeIndex.clear();
    this.portNameIndex.clear();
    this.patternIndex.clear();
    this.ruleCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get cache performance metrics
   */
  getCacheMetrics(): { hits: number; misses: number; ratio: number } {
    const total = this.cacheHits + this.cacheMisses;
    const ratio = total > 0 ? this.cacheHits / total : 0;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      ratio
    };
  }
}

// ========== Lazy Evaluation ==========

/**
 * Connection tracker for lazy evaluation
 */
export class ConnectionTracker {
  private dirtyConnections = new Set<string>();
  private connectionToAgents = new Map<string, [AgentId, AgentId]>();
  private agentConnections = new Map<AgentId, Set<string>>();

  /**
   * Add a connection to the tracker
   */
  addConnection(connectionKey: string, agent1Id: AgentId, agent2Id: AgentId): void {
    // Track connection
    this.dirtyConnections.add(connectionKey);
    this.connectionToAgents.set(connectionKey, [agent1Id, agent2Id]);
    
    // Track agent connections
    this.addAgentConnection(agent1Id, connectionKey);
    this.addAgentConnection(agent2Id, connectionKey);
  }

  /**
   * Remove a connection from the tracker
   */
  removeConnection(connectionKey: string): void {
    // Remove from dirty connections
    this.dirtyConnections.delete(connectionKey);
    
    // Remove agent-connection mappings
    const agents = this.connectionToAgents.get(connectionKey);
    if (agents) {
      const [agent1Id, agent2Id] = agents;
      this.removeAgentConnection(agent1Id, connectionKey);
      this.removeAgentConnection(agent2Id, connectionKey);
    }
    
    // Remove connection-agent mapping
    this.connectionToAgents.delete(connectionKey);
  }

  /**
   * Mark a connection as dirty (needs evaluation)
   */
  markConnectionDirty(connectionKey: string): void {
    this.dirtyConnections.add(connectionKey);
  }

  /**
   * Mark all connections for an agent as dirty
   */
  markAgentDirty(agentId: AgentId): void {
    const connections = this.agentConnections.get(agentId);
    if (connections) {
      for (const connectionKey of connections) {
        this.dirtyConnections.add(connectionKey);
      }
    }
  }

  /**
   * Mark a connection as clean (evaluated)
   */
  markConnectionClean(connectionKey: string): void {
    this.dirtyConnections.delete(connectionKey);
  }

  /**
   * Get all dirty connections
   */
  getDirtyConnections(): Set<string> {
    return new Set(this.dirtyConnections);
  }

  /**
   * Check if a connection is dirty
   */
  isConnectionDirty(connectionKey: string): boolean {
    return this.dirtyConnections.has(connectionKey);
  }

  /**
   * Clear all dirty connections
   */
  clearDirtyConnections(): void {
    this.dirtyConnections.clear();
  }

  /**
   * Add a connection to an agent's connection set
   */
  private addAgentConnection(agentId: AgentId, connectionKey: string): void {
    if (!this.agentConnections.has(agentId)) {
      this.agentConnections.set(agentId, new Set());
    }
    this.agentConnections.get(agentId)!.add(connectionKey);
  }

  /**
   * Remove a connection from an agent's connection set
   */
  private removeAgentConnection(agentId: AgentId, connectionKey: string): void {
    const connections = this.agentConnections.get(agentId);
    if (connections) {
      connections.delete(connectionKey);
      if (connections.size === 0) {
        this.agentConnections.delete(agentId);
      }
    }
  }
}

// ========== Structural Sharing ==========

/**
 * Immutable update utility using Immer
 */
export class StructuralSharing {
  /**
   * Update an object immutably with structural sharing
   */
  static update<T>(baseState: T, recipe: (draft: T) => void): T {
    return produce(baseState, recipe);
  }

  /**
   * Update an array immutably with structural sharing
   */
  static updateArray<T>(baseArray: T[], recipe: (draft: T[]) => void): T[] {
    return produce(baseArray, recipe);
  }

  /**
   * Merge objects immutably with structural sharing
   */
  static merge<T extends object>(baseObject: T, updates: Partial<T>): T {
    return produce(baseObject, draft => {
      Object.assign(draft, updates);
    });
  }

  /**
   * Deep clone an object with structural sharing optimization
   * (only creates new objects for branches that change)
   */
  static deepClone<T>(obj: T): T {
    return produce(obj, () => {
      // Immer automatically handles deep cloning with structural sharing
    });
  }
}

// ========== Memory Management ==========

/**
 * Configuration for memory management
 */
export interface MemoryManagerConfig {
  maxHistorySize?: number;
  maxHistoryAge?: number;
  enableGarbageCollection?: boolean;
  gcInterval?: number;
  enableObjectPooling?: boolean;
  maxPoolSize?: number;
}

/**
 * Memory manager for efficient memory usage
 */
export class MemoryManager {
  private config: MemoryManagerConfig;
  private objectPools: Map<string, any[]> = new Map();
  private lastGCTime: number = 0;
  private network: INetwork;

  /**
   * Create a memory manager
   */
  constructor(network: INetwork, config: MemoryManagerConfig = {}) {
    this.network = network;
    this.config = {
      maxHistorySize: 1000,
      maxHistoryAge: 24 * 60 * 60 * 1000, // 24 hours
      enableGarbageCollection: true,
      gcInterval: 60 * 1000, // 1 minute
      enableObjectPooling: true,
      maxPoolSize: 100,
      ...config
    };
  }

  /**
   * Prune history entries
   */
  pruneHistory(history: any[]): any[] {
    if (!history.length) return history;
    
    const now = Date.now();
    const maxAge = this.config.maxHistoryAge!;
    const maxSize = this.config.maxHistorySize!;
    
    // Filter by age if timestamps are available
    if ('timestamp' in history[0]) {
      history = history.filter(entry => now - entry.timestamp < maxAge);
    }
    
    // Trim to max size
    if (history.length > maxSize) {
      history = history.slice(history.length - maxSize);
    }
    
    return history;
  }

  /**
   * Run garbage collection to clean up unreachable agents
   */
  garbageCollect(): number {
    if (!this.config.enableGarbageCollection) return 0;
    
    const now = Date.now();
    if (now - this.lastGCTime < this.config.gcInterval!) {
      return 0; // Too soon to run GC again
    }
    
    this.lastGCTime = now;
    return this.collectGarbage();
  }

  /**
   * Collect garbage (unreachable agents)
   */
  private collectGarbage(): number {
    // Find all reachable agents by traversing the connection graph
    const reachableAgents = new Set<AgentId>();
    const rootAgents = this.findRootAgents();
    
    // Mark phase - traverse from roots to mark reachable agents
    for (const rootId of rootAgents) {
      this.markReachableAgents(rootId, reachableAgents);
    }
    
    // Sweep phase - remove unreachable agents
    let removedCount = 0;
    const allAgents = this.network.getAllAgents();
    for (const agent of allAgents) {
      if (!reachableAgents.has(agent._agentId)) {
        this.network.removeAgent(agent);
        removedCount++;
      }
    }
    
    return removedCount;
  }

  /**
   * Find root agents (likely entry points to the graph)
   */
  private findRootAgents(): Set<AgentId> {
    const roots = new Set<AgentId>();
    
    // Consider agents with no incoming connections as roots
    const incomingConnections = new Map<AgentId, number>();
    
    // Count incoming connections for each agent
    const allConnections = this.network.getAllConnections();
    for (const conn of allConnections) {
      const toAgentId = conn.destination._agentId;
      incomingConnections.set(
        toAgentId, 
        (incomingConnections.get(toAgentId) || 0) + 1
      );
    }
    
    // Agents with no incoming connections are roots
    const allAgents = this.network.getAllAgents();
    for (const agent of allAgents) {
      if (!incomingConnections.has(agent._agentId)) {
        roots.add(agent._agentId);
      }
    }
    
    // If no roots found, consider all agents as roots
    if (roots.size === 0) {
      for (const agent of allAgents) {
        roots.add(agent._agentId);
      }
    }
    
    return roots;
  }

  /**
   * Mark all agents reachable from a root
   */
  private markReachableAgents(agentId: AgentId, reachable: Set<AgentId>): void {
    if (reachable.has(agentId)) return; // Already visited
    
    // Mark this agent as reachable
    reachable.add(agentId);
    
    // Find the agent
    const agent = this.network.getAgent(agentId);
    if (!agent) return;
    
    // Visit all connected agents
    const allConnections = this.network.getAllConnections();
    for (const conn of allConnections) {
      if (conn.source._agentId === agentId) {
        this.markReachableAgents(conn.destination._agentId, reachable);
      }
    }
  }

  /**
   * Get an object from the pool or create a new one
   */
  getPooledObject<T>(type: string, factory: () => T): T {
    if (!this.config.enableObjectPooling) {
      return factory();
    }
    
    // Get or create a pool for this type
    if (!this.objectPools.has(type)) {
      this.objectPools.set(type, []);
    }
    
    const pool = this.objectPools.get(type)!;
    
    // Get an object from the pool or create a new one
    if (pool.length > 0) {
      return pool.pop() as T;
    } else {
      return factory();
    }
  }

  /**
   * Return an object to the pool
   */
  returnObjectToPool<T>(type: string, obj: T): void {
    if (!this.config.enableObjectPooling) return;
    
    // Get or create a pool for this type
    if (!this.objectPools.has(type)) {
      this.objectPools.set(type, []);
    }
    
    const pool = this.objectPools.get(type)!;
    
    // Add to pool if not full
    if (pool.length < this.config.maxPoolSize!) {
      pool.push(obj);
    }
  }

  /**
   * Clear all object pools
   */
  clearPools(): void {
    this.objectPools.clear();
  }
}

// ========== Parallel Processing ==========

/**
 * Worker task for parallel processing
 */
interface WorkerTask {
  id: string;
  type: 'matchRules' | 'applyRule' | 'custom';
  data: any;
}

/**
 * Worker result for parallel processing
 */
interface WorkerResult {
  taskId: string;
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Parallel processing manager
 */
export class ParallelProcessing {
  private workers: any[] = [];
  private taskCallbacks: Map<string, (result: WorkerResult) => void> = new Map();
  private workerScriptUrl: string;
  private isInitialized = false;

  /**
   * Create a parallel processing manager
   */
  constructor(workerScriptUrl: string, numWorkers = 4) {
    this.workerScriptUrl = workerScriptUrl;
    this.initialize(numWorkers);
  }

  /**
   * Initialize workers
   */
  private initialize(numWorkers: number): void {
    if (this.isInitialized) return;
    
    if (!globalWorker) {
      console.warn('Web Workers are not supported in this environment. Parallel processing disabled.');
      return;
    }

    for (let i = 0; i < numWorkers; i++) {
      try {
        const worker = new globalWorker(this.workerScriptUrl);

        
        // Set up message handler
        worker.onmessage = (event: any) => {
          const result = event.data;
          const callback = this.taskCallbacks.get(result.taskId);
          
          if (callback) {
            callback(result);
            this.taskCallbacks.delete(result.taskId);
          }
        };
        
        this.workers.push(worker);
      } catch (error) {
        console.error('Failed to create worker:', error);
      }
    }
    
    this.isInitialized = this.workers.length > 0;
  }

  /**
   * Check if parallel processing is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.workers.length > 0;
  }

  /**
   * Execute a task in parallel
   */
  executeTask<T>(task: Omit<WorkerTask, 'id'>): Promise<T> {
    if (!this.isAvailable()) {
      return Promise.reject(new Error('Parallel processing is not available'));
    }
    
    return new Promise<T>((resolve, reject) => {
      // Generate a unique task ID
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store the callback
      this.taskCallbacks.set(taskId, (result) => {
        if (result.success) {
          resolve(result.data as T);
        } else {
          reject(new Error(result.error || 'Unknown error'));
        }
      });
      
      // Find the least busy worker
      const workerIndex = this.workers.length > 1 
        ? Math.floor(Math.random() * this.workers.length) 
        : 0;
      
      // Send the task to the worker
      this.workers[workerIndex].postMessage({
        ...task,
        id: taskId
      });
    });
  }

  /**
   * Terminate all workers
   */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    
    this.workers = [];
    this.taskCallbacks.clear();
    this.isInitialized = false;
  }
}

// ========== Error Handling ==========

/**
 * Base error class for Annette
 */
export class AnnetteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnetteError';
  }
}

/**
 * Error for port connection issues
 */
export class PortConnectionError extends AnnetteError {
  sourceAgent: IAgent;
  sourcePort: IBoundPort;
  targetAgent: IAgent;
  targetPort: IBoundPort;

  constructor(
    message: string,
    sourceAgent: IAgent,
    sourcePort: IBoundPort,
    targetAgent: IAgent,
    targetPort: IBoundPort
  ) {
    super(message);
    this.name = 'PortConnectionError';
    this.sourceAgent = sourceAgent;
    this.sourcePort = sourcePort;
    this.targetAgent = targetAgent;
    this.targetPort = targetPort;
  }

  /**
   * Get detailed error information
   */
  getDetails(): string {
    return `
      Failed to connect ports: ${this.message}
      Source agent: ${this.sourceAgent.name} (${this.sourceAgent._agentId})
      Source port: ${this.sourcePort.name} (${this.sourcePort.type})
      Target agent: ${this.targetAgent.name} (${this.targetAgent._agentId})
      Target port: ${this.targetPort.name} (${this.targetPort.type})
    `;
  }
}

/**
 * Error for rule application issues
 */
export class RuleApplicationError extends AnnetteError {
  rule: AnyRule;
  agent1?: IAgent;
  port1?: IBoundPort;
  agent2?: IAgent;
  port2?: IBoundPort;

  constructor(
    message: string,
    rule: AnyRule,
    agent1?: IAgent,
    port1?: IBoundPort,
    agent2?: IAgent,
    port2?: IBoundPort
  ) {
    super(message);
    this.name = 'RuleApplicationError';
    this.rule = rule;
    this.agent1 = agent1;
    this.port1 = port1;
    this.agent2 = agent2;
    this.port2 = port2;
  }

  /**
   * Get detailed error information
   */
  getDetails(): string {
    let details = `
      Failed to apply rule: ${this.message}
      Rule: ${this.rule.name}
    `;
    
    if (this.agent1 && this.port1) {
      details += `
        Agent 1: ${this.agent1.name} (${this.agent1._agentId})
        Port 1: ${this.port1.name} (${this.port1.type})
      `;
    }
    
    if (this.agent2 && this.port2) {
      details += `
        Agent 2: ${this.agent2.name} (${this.agent2._agentId})
        Port 2: ${this.port2.name} (${this.port2.type})
      `;
    }
    
    return details;
  }
}

// ========== Progressive Disclosure ==========

/**
 * Interface for Annette options with sensible defaults
 */
export interface AnnetteOptions {
  enableRuleIndexing?: boolean;
  enableLazyEvaluation?: boolean;
  enableStructuralSharing?: boolean;
  enableMemoryManagement?: boolean;
  enableParallelProcessing?: boolean;
  memoryConfig?: MemoryManagerConfig;
  numWorkers?: number;
  workerScriptUrl?: string;
}

/**
 * Default options with sensible defaults
 */
export const DEFAULT_OPTIONS: AnnetteOptions = {
  enableRuleIndexing: true,
  enableLazyEvaluation: true,
  enableStructuralSharing: true,
  enableMemoryManagement: true,
  enableParallelProcessing: false, // Disabled by default as it requires worker setup
  memoryConfig: {
    maxHistorySize: 1000,
    maxHistoryAge: 24 * 60 * 60 * 1000, // 24 hours
    enableGarbageCollection: true,
    gcInterval: 60 * 1000, // 1 minute
    enableObjectPooling: true,
    maxPoolSize: 100
  },
  numWorkers: globalNavigator?.hardwareConcurrency || 4,

  workerScriptUrl: ''
};

/**
 * Create an optimized network with all performance enhancements
 */
export function createOptimizedNetwork(
  network: INetwork, 
  options: AnnetteOptions = {}
): OptimizedNetwork {
  // Merge with default options
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  
  // Create optimizations
  const ruleIndex = mergedOptions.enableRuleIndexing ? new RuleIndex() : undefined;
  const connectionTracker = mergedOptions.enableLazyEvaluation ? new ConnectionTracker() : undefined;
  const memoryManager = mergedOptions.enableMemoryManagement ? 
    new MemoryManager(network, mergedOptions.memoryConfig) : undefined;
  const parallelProcessing = mergedOptions.enableParallelProcessing && mergedOptions.workerScriptUrl ?
    new ParallelProcessing(mergedOptions.workerScriptUrl, mergedOptions.numWorkers) : undefined;
  
  // Enable parallel processing if available
  if (parallelProcessing && parallelProcessing.isAvailable()) {
    console.log('Parallel processing enabled with', mergedOptions.numWorkers, 'workers');
  }
  
  // Initialize the rule index with existing rules
  if (ruleIndex && network.getAllRules) {
    for (const rule of network.getAllRules()) {
      ruleIndex.addRule(rule);
    }
  }
  
  // Create a proxy for the network
  const optimizedNetwork = new Proxy(network, {
    get(target, prop, receiver) {
      // Intercept specific methods
      if (prop === 'addRule' && ruleIndex) {
        return function addRule(rule: AnyRule) {
          // Add rule to index
          ruleIndex.addRule(rule);
          // Call original method
          return target.addRule(rule);
        };
      }
      
      if (prop === 'removeRule' && ruleIndex) {
        return function removeRule(rule: AnyRule | string) {
          // Remove rule from index
          if (typeof rule !== 'string') {
            ruleIndex.removeRule(rule);
          }
          // Call original method
          return target.removeRule(rule);
        };
      }
      
      if (prop === 'connectPorts' && connectionTracker) {
        return function connectPorts(port1: IBoundPort, port2: IBoundPort) {
          // Call original method
          const connection = target.connectPorts(port1, port2);
          // Track connection
          if (connection && connectionTracker) {
            // Generate a unique key for this connection
            const connectionKey = `${port1.agent._agentId}-${port1.name}:${port2.agent._agentId}-${port2.name}`;
            connectionTracker.addConnection(
              connectionKey,
              port1.agent._agentId,
              port2.agent._agentId
            );
          }
          return connection;
        };
      }
      
      if (prop === 'reduce' && (ruleIndex || connectionTracker || memoryManager)) {
        return function reduce(maxSteps?: number) {
          // Run memory management if enabled
          if (memoryManager) {
            memoryManager.garbageCollect();
          }
          
          // If using lazy evaluation, only process dirty connections
          if (connectionTracker && ruleIndex) {
            let changed = false;
            let steps = 0;
            const maxIterations = maxSteps || 1000;
            
            while (steps < maxIterations) {
              const dirtyConnections = connectionTracker.getDirtyConnections();
              if (dirtyConnections.size === 0) break;
              
              let iterationChanged = false;
              
              // Process each dirty connection
              for (const connectionKey of dirtyConnections) {
                // Try to find the connection in available connections
                const allConnections = target.getAllConnections ? target.getAllConnections() : (target as any)._connections || [];
                const connection = allConnections.find((c: any) => {
                  const key = `${c.source._agentId}-${c.source.name}:${c.destination._agentId}-${c.destination.name}`;
                  return key === connectionKey;
                });
                
                if (!connection) {
                  connectionTracker.removeConnection(connectionKey);
                  continue;
                }
                
                // Find applicable rules
                const rules = ruleIndex.findRules(
                  connection.source,
                  connection.source,
                  connection.destination,
                  connection.destination
                );
                
                // Apply the first matching rule
                if (rules.length > 0) {
                  try {
                    // Apply the rule if method exists
                    let result;
                    if ((target as any).applyRule) {
                      result = (target as any).applyRule(rules[0], connection);
                    } else if (target.step) {
                      // Fallback to step method
                      result = target.step();
                    }
                    
                    if (result) {
                      iterationChanged = true;
                      
                      // Mark affected agents as dirty
                      const affectedAgents = result.affectedAgents || [];
                      for (const agent of affectedAgents) {
                        if (isAgent(agent) && connectionTracker) {
                          connectionTracker.markAgentDirty(agent._agentId);
                        }
                      }
                    }
                  } catch (error) {
                    console.error('Error applying rule:', error);
                  }
                }
                
                // Mark this connection as processed
                connectionTracker.markConnectionClean(connectionKey);
              }
              
              changed = changed || iterationChanged;
              if (!iterationChanged) break;
              
              steps++;
            }
            
            return changed;
          }
          
          // Fall back to original reduce method
          return target.reduce(maxSteps);
        };
      }
      
      // Return original property
      return Reflect.get(target, prop, receiver);
    }
  });
  
  return optimizedNetwork;
}