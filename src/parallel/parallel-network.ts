/**
 * Parallel Network implementation for Annette
 * 
 * This module provides a parallel execution network that distributes
 * rule execution across multiple web workers for improved performance.
 */

import { IAgent } from '../agent';
import { IConnection } from '../connection';
import { INetwork, Network } from '../network';
import { AnyRule } from '../rule';
import { 
  ExecutionResult, 
  RuleSet, 
  SerializedAgent, 
  SerializedNetworkState, 
  WorkerPool, 
  WorkerPoolOptions 
} from './worker-pool';
import { v4 as uuidv4 } from 'uuid';

/**
 * Options for configuring the parallel network
 */
export interface ParallelNetworkOptions extends WorkerPoolOptions {
  /**
   * The base network to enhance with parallel capabilities
   */
  baseNetwork?: INetwork;
  
  /**
   * Whether to automatically analyze rule dependencies
   * Default: true
   */
  analyzeRuleDependencies?: boolean;
  
  /**
   * Minimum batch size for parallel execution
   * Default: 10
   */
  minBatchSize?: number;
  
  /**
   * Maximum time (ms) to wait for batch completion
   * Default: 100
   */
  maxBatchWaitTime?: number;
}

/**
 * Interface for a dependency analyzer that identifies independent rules
 */
export interface RuleDependencyAnalyzer {
  /**
   * Analyze rule dependencies and group independent rules
   * @param rules All rules that need to be executed
   * @returns Array of independent rule sets that can be executed in parallel
   */
  analyzeRuleDependencies(rules: AnyRule[]): RuleSet[];
}

/**
 * Default implementation of rule dependency analyzer
 */
export class DefaultRuleDependencyAnalyzer implements RuleDependencyAnalyzer {
  /**
   * Analyze rule dependencies and group independent rules
   * @param rules All rules that need to be executed
   * @returns Array of independent rule sets that can be executed in parallel
   */
  analyzeRuleDependencies(rules: AnyRule[]): RuleSet[] {
    // For this simple implementation, we'll just group rules by agent pair
    // A more advanced implementation would build a dependency graph
    
    // Map to track agent dependencies
    const agentDependencyMap = new Map<string, Set<string>>();
    
    // First pass: build dependency map
    for (const rule of rules) {
      const agent1Id = rule.agent1Id || (rule as any).connection?.source?._agentId;
      const agent2Id = rule.agent2Id || (rule as any).connection?.destination?._agentId;
      
      if (!agent1Id || !agent2Id) continue;
      
      // Add bidirectional dependency
      if (!agentDependencyMap.has(agent1Id)) {
        agentDependencyMap.set(agent1Id, new Set<string>());
      }
      if (!agentDependencyMap.has(agent2Id)) {
        agentDependencyMap.set(agent2Id, new Set<string>());
      }
      
      agentDependencyMap.get(agent1Id)!.add(agent2Id);
      agentDependencyMap.get(agent2Id)!.add(agent1Id);
    }
    
    // Second pass: group independent rules
    const ruleSets: RuleSet[] = [];
    const processedRules = new Set<AnyRule>();
    
    // Function to check if an agent conflicts with any in the current group
    const hasConflicts = (agentId: string, agentGroup: Set<string>): boolean => {
      if (agentGroup.has(agentId)) return true;
      
      const dependencies = agentDependencyMap.get(agentId);
      if (!dependencies) return false;
      
      for (const depAgentId of dependencies) {
        if (agentGroup.has(depAgentId)) return true;
      }
      
      return false;
    };
    
    // Group rules that don't have agent conflicts
    while (processedRules.size < rules.length) {
      const currentRuleSet: RuleSet = { rules: [] };
      const currentAgentGroup = new Set<string>();
      
      for (const rule of rules) {
        if (processedRules.has(rule)) continue;
        
        const agent1Id = rule.agent1Id || (rule as any).connection?.source?._agentId;
        const agent2Id = rule.agent2Id || (rule as any).connection?.destination?._agentId;
        
        if (!agent1Id || !agent2Id) continue;
        
        // Check if this rule conflicts with any in the current group
        if (hasConflicts(agent1Id, currentAgentGroup) || hasConflicts(agent2Id, currentAgentGroup)) {
          continue;
        }
        
        // Add to the current rule set
        currentRuleSet.rules.push(this.serializeRule(rule));
        processedRules.add(rule);
        
        // Add agents to the current group
        currentAgentGroup.add(agent1Id);
        currentAgentGroup.add(agent2Id);
      }
      
      if (currentRuleSet.rules.length > 0) {
        ruleSets.push(currentRuleSet);
      } else {
        // If we couldn't find any non-conflicting rules, just take the next one
        for (const rule of rules) {
          if (!processedRules.has(rule)) {
            currentRuleSet.rules.push(this.serializeRule(rule));
            processedRules.add(rule);
            break;
          }
        }
        
        if (currentRuleSet.rules.length > 0) {
          ruleSets.push(currentRuleSet);
        } else {
          // If we still couldn't add any rules, we're done
          break;
        }
      }
    }
    
    return ruleSets;
  }
  
  /**
   * Serialize a rule for worker execution
   */
  private serializeRule(rule: AnyRule): any {
    if (rule.type === 'action' || rule.type === 'rewrite') {
      return {
        ruleId: uuidv4(),
        ruleName: rule.name,
        ruleType: rule.type,
        agentId1: rule.matchInfo.agent1Id || rule.agent1Id,
        agentId2: rule.matchInfo.agent2Id || rule.agent2Id,
        port1Id: rule.matchInfo.port1Id || rule.port1Id,
        port2Id: rule.matchInfo.port2Id || rule.port2Id,
        ruleDefinition: rule.type === 'action' ? rule.action : rule.rewrite
      };
    } else {
      // Legacy rule format
      return {
        ruleId: uuidv4(),
        ruleName: rule.name,
        ruleType: 'action',
        agentId1: (rule as any).connection?.source?._agentId,
        agentId2: (rule as any).connection?.destination?._agentId,
        port1Id: (rule as any).connection?.sourcePort?.id,
        port2Id: (rule as any).connection?.destinationPort?.id,
        ruleDefinition: (rule as any).action
      };
    }
  }
}

/**
 * Parallel Network implementation that distributes rule execution
 * across multiple web workers for improved performance
 */
export class ParallelNetwork implements INetwork {
  /**
   * The base network that handles the actual data
   */
  private baseNetwork: INetwork;
  
  /**
   * Worker pool for parallel execution
   */
  private workerPool: WorkerPool;
  
  /**
   * Dependency analyzer for rule parallelization
   */
  private dependencyAnalyzer: RuleDependencyAnalyzer;
  
  /**
   * Configuration options
   */
  private options: ParallelNetworkOptions;
  
  /**
   * Pending rule batches
   */
  private pendingRuleBatch: AnyRule[] = [];
  
  /**
   * Batch processing timer
   */
  private batchTimer: any = null;
  
  /**
   * Flag indicating whether parallel execution is enabled
   */
  private parallelEnabled: boolean = true;
  
  /**
   * Flag to track if we're currently processing a batch
   */
  private processingBatch: boolean = false;
  
  /**
   * Create a new parallel network
   * @param options Configuration options
   */
  constructor(options: ParallelNetworkOptions = {}) {
    this.options = {
      baseNetwork: new Network(),
      analyzeRuleDependencies: true,
      minBatchSize: 10,
      maxBatchWaitTime: 100,
      ...options
    };
    
    this.baseNetwork = this.options.baseNetwork!;
    this.workerPool = new WorkerPool(options);
    this.dependencyAnalyzer = new DefaultRuleDependencyAnalyzer();
    
    // Check if parallel execution is available
    if (typeof Worker === 'undefined') {
      this.parallelEnabled = false;
      console.warn('Web Workers not available. Falling back to sequential execution.');
    }
  }
  
  // INetwork interface implementation
  
  /**
   * Get the network ID
   */
  get id(): string {
    return this.baseNetwork.id;
  }
  
  /**
   * Get the network name
   */
  get name(): string {
    return this.baseNetwork.name;
  }
  
  /**
   * Add an agent to the network
   * @param agent The agent to add
   * @returns The added agent
   */
  addAgent(agent: IAgent): IAgent {
    return this.baseNetwork.addAgent(agent);
  }
  
  /**
   * Remove an agent from the network
   * @param agentOrId The agent or agent ID to remove
   * @returns True if the agent was removed
   */
  removeAgent(agentOrId: IAgent | string): boolean {
    return this.baseNetwork.removeAgent(agentOrId);
  }
  
  /**
   * Get an agent by ID
   * @param id The agent ID
   * @returns The agent or undefined
   */
  getAgent(id: string): IAgent | undefined {
    return this.baseNetwork.getAgent(id);
  }
  
  /**
   * Connect two agents
   * @param agent1 The first agent
   * @param port1 The port name on the first agent
   * @param agent2 The second agent
   * @param port2 The port name on the second agent
   * @returns The created connection
   */
  connect(agent1: IAgent, port1: string, agent2: IAgent, port2: string): IConnection {
    return this.baseNetwork.connect(agent1, port1, agent2, port2);
  }
  
  /**
   * Disconnect two agents
   * @param connection The connection to remove
   * @returns True if the connection was removed
   */
  disconnect(connection: IConnection): boolean {
    return this.baseNetwork.disconnect(connection);
  }
  
  /**
   * Add a rule to the network
   * @param rule The rule to add
   * @returns The added rule
   */
  addRule(rule: AnyRule): AnyRule {
    return this.baseNetwork.addRule(rule);
  }
  
  /**
   * Remove a rule from the network
   * @param rule The rule to remove
   * @returns True if the rule was removed
   */
  removeRule(rule: AnyRule): boolean {
    return this.baseNetwork.removeRule(rule);
  }
  
  /**
   * Execute all applicable rules in the network
   * @returns The number of rules executed
   */
  async step(): Promise<number> {
    // If parallel execution is disabled or currently processing, fall back to sequential
    if (!this.parallelEnabled || this.processingBatch) {
      return this.baseNetwork.step();
    }
    
    // Get the applicable rules
    const rules = this.baseNetwork.getApplicableRules();
    
    if (rules.length === 0) {
      return 0;
    }
    
    // Add to the pending batch
    this.pendingRuleBatch.push(...rules);
    
    // If we have enough rules, process the batch immediately
    if (this.pendingRuleBatch.length >= this.options.minBatchSize!) {
      return this.processBatch();
    }
    
    // Otherwise, set a timer to process the batch
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.options.maxBatchWaitTime);
    }
    
    // Return 0 since we haven't actually processed anything yet
    return 0;
  }
  
  /**
   * Process the pending rule batch in parallel
   */
  private async processBatch(): Promise<number> {
    if (this.pendingRuleBatch.length === 0) {
      return 0;
    }
    
    // Clear the batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Set the processing flag
    this.processingBatch = true;
    
    // Get the rules to process
    const rules = [...this.pendingRuleBatch];
    this.pendingRuleBatch = [];
    
    try {
      // Analyze rule dependencies
      const ruleSets = this.options.analyzeRuleDependencies ? 
        this.dependencyAnalyzer.analyzeRuleDependencies(rules) :
        [{ rules: rules.map(rule => this.serializeRule(rule)) }];
      
      // Serialize the network state
      const networkState = this.serializeNetworkState();
      
      // Execute the rule sets in parallel
      const results = await Promise.all(
        ruleSets.map(ruleSet => this.workerPool.executeRuleSet(ruleSet, networkState))
      );
      
      // Apply the results to the network
      let totalSteps = 0;
      for (const result of results) {
        totalSteps += this.applyExecutionResult(result);
      }
      
      return totalSteps;
    } catch (error) {
      console.error('Error processing rule batch:', error);
      return 0;
    } finally {
      // Clear the processing flag
      this.processingBatch = false;
    }
  }
  
  /**
   * Apply the execution result to the network
   * @param result The execution result from a worker
   * @returns The number of steps executed
   */
  private applyExecutionResult(result: ExecutionResult): number {
    if (result.error) {
      console.error('Error executing rules:', result.error);
      return 0;
    }
    
    // Add new agents
    for (const agentData of result.newAgents) {
      // Create the agent
      const agent = this.baseNetwork.createAgent(
        agentData.name,
        agentData.value
      );
      
      // Set the agent ID
      (agent as any)._agentId = agentData.id;
      
      // Add to the network
      this.baseNetwork.addAgent(agent);
    }
    
    // Remove agents
    for (const agentId of result.removedAgentIds) {
      this.baseNetwork.removeAgent(agentId);
    }
    
    // Add new connections
    for (const connData of result.newConnections) {
      const sourceAgent = this.baseNetwork.getAgent(connData.sourceAgentId);
      const destAgent = this.baseNetwork.getAgent(connData.destinationAgentId);
      
      if (sourceAgent && destAgent) {
        this.baseNetwork.connect(
          sourceAgent,
          connData.sourcePortName,
          destAgent,
          connData.destinationPortName
        );
      }
    }
    
    // Remove connections
    for (const connData of result.removedConnections) {
      const sourceAgent = this.baseNetwork.getAgent(connData.sourceAgentId);
      const destAgent = this.baseNetwork.getAgent(connData.destinationAgentId);
      
      if (sourceAgent && destAgent) {
        const connection = this.baseNetwork.getConnection(
          sourceAgent,
          connData.sourcePortName,
          destAgent,
          connData.destinationPortName
        );
        
        if (connection) {
          this.baseNetwork.disconnect(connection);
        }
      }
    }
    
    return result.steps;
  }
  
  /**
   * Serialize a rule for worker execution
   */
  private serializeRule(rule: AnyRule): any {
    if (rule.type === 'action' || rule.type === 'rewrite') {
      return {
        ruleId: uuidv4(),
        ruleName: rule.name,
        ruleType: rule.type,
        agentId1: rule.matchInfo.agent1Id || rule.agent1Id,
        agentId2: rule.matchInfo.agent2Id || rule.agent2Id,
        port1Id: rule.matchInfo.port1Id || rule.port1Id,
        port2Id: rule.matchInfo.port2Id || rule.port2Id,
      };
    } else {
      // Legacy rule format
      return {
        ruleId: uuidv4(),
        ruleName: rule.name,
        ruleType: 'action',
        agentId1: (rule as any).connection?.source?._agentId,
        agentId2: (rule as any).connection?.destination?._agentId,
        port1Id: (rule as any).connection?.sourcePort?.id,
        port2Id: (rule as any).connection?.destinationPort?.id,
       };
    }
  }

  /**
   * Serialize the network state for worker execution
   */
  private serializeNetworkState(): SerializedNetworkState {
    const agents: Record<string, SerializedAgent> = {};
    const connections: Array<{
      sourceAgentId: string;
      sourcePortName: string;
      destinationAgentId: string;
      destinationPortName: string;
    }> = [];
    
    // Serialize agents
    for (const agent of this.baseNetwork.getAgents()) {
      agents[agent._agentId] = {
        id: agent._agentId,
        name: agent.name,
        type: agent.type,
        value: agent.value,
        ports: Object.fromEntries(
          Object.entries(agent.ports).map(([name, port]) => [
            name, 
            { name, type: port.type }
          ])
        )
      };
    }
    
    // Serialize connections
    for (const connection of this.baseNetwork.getConnections()) {
      connections.push({
        sourceAgentId: connection.source._agentId,
        sourcePortName: connection.sourcePort.name,
        destinationAgentId: connection.destination._agentId,
        destinationPortName: connection.destinationPort.name
      });
    }
    
    return { agents, connections };
  }
  
  /**
   * Get all agents in the network
   * @returns Array of agents
   */
  getAgents(): IAgent[] {
    return this.baseNetwork.getAgents();
  }
  
  /**
   * Get all connections in the network
   * @returns Array of connections
   */
  getConnections(): IConnection[] {
    return this.baseNetwork.getConnections();
  }
  
  /**
   * Get all rules in the network
   * @returns Array of rules
   */
  getRules(): AnyRule[] {
    return this.baseNetwork.getRules();
  }
  
  /**
   * Get the applicable rules in the network
   * @returns Array of applicable rules
   */
  getApplicableRules(): AnyRule[] {
    return this.baseNetwork.getApplicableRules();
  }
  
  /**
   * Create an agent with the given name and value
   * @param name The agent name
   * @param value The agent value
   * @returns The created agent
   */
  createAgent(name: string, value: any): IAgent {
    return this.baseNetwork.createAgent(name, value);
  }
  
  /**
   * Get a connection between two agents
   * @param agent1 The first agent
   * @param port1 The port name on the first agent
   * @param agent2 The second agent
   * @param port2 The port name on the second agent
   * @returns The connection or undefined
   */
  getConnection(agent1: IAgent, port1: string, agent2: IAgent, port2: string): IConnection | undefined {
    return this.baseNetwork.getConnection(agent1, port1, agent2, port2);
  }
  
  /**
   * Find agents matching the given criteria
   * @param criteria The search criteria
   * @returns Array of matching agents
   */
  findAgents(criteria: any): IAgent[] {
    return this.baseNetwork.findAgents(criteria);
  }
  
  /**
   * Find connections matching the given criteria
   * @param criteria The search criteria
   * @returns Array of matching connections
   */
  findConnections(criteria: any): IConnection[] {
    return this.baseNetwork.findConnections(criteria);
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
    this.workerPool.terminate();
  }
}