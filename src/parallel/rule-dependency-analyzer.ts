/**
 * Rule Dependency Analyzer for Annette
 * 
 * This module provides advanced dependency analysis for rules to maximize
 * parallel execution potential by identifying independent rule sets.
 */

import { IAgent } from '../agent';
import { AnyRule } from '../rule';
import { RuleSet } from './worker-pool';
import { RuleDependencyAnalyzer } from './parallel-network';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for a node in the dependency graph
 */
interface DependencyNode {
  rule: AnyRule;
  agentIds: string[];
  dependsOn: Set<DependencyNode>;
  dependedOnBy: Set<DependencyNode>;
}

/**
 * Options for advanced dependency analysis
 */
export interface AdvancedDependencyAnalyzerOptions {
  /**
   * Maximum size of each rule batch
   * Default: 50
   */
  maxBatchSize?: number;
  
  /**
   * Minimum size of each rule batch (to avoid excessive fragmentation)
   * Default: 5
   */
  minBatchSize?: number;
  
  /**
   * Whether to use value-based dependency analysis
   * This analyzes agent values to determine if rules might affect each other
   * Default: true
   */
  useValueBasedAnalysis?: boolean;
  
  /**
   * Whether to cache analysis results for similar rule patterns
   * Default: true
   */
  cacheAnalysisResults?: boolean;
}

/**
 * Advanced implementation of rule dependency analyzer
 * Uses graph-based analysis to maximize parallelism
 */
export class AdvancedRuleDependencyAnalyzer implements RuleDependencyAnalyzer {
  /**
   * Configuration options
   */
  private options: AdvancedDependencyAnalyzerOptions;
  
  /**
   * Cache for dependency analysis results
   */
  private analysisCache = new Map<string, RuleSet[]>();
  
  /**
   * Create a new advanced dependency analyzer
   * @param options Configuration options
   */
  constructor(options: AdvancedDependencyAnalyzerOptions = {}) {
    this.options = {
      maxBatchSize: 50,
      minBatchSize: 5,
      useValueBasedAnalysis: true,
      cacheAnalysisResults: true,
      ...options
    };
  }
  
  /**
   * Analyze rule dependencies and group independent rules
   * @param rules All rules that need to be executed
   * @returns Array of independent rule sets that can be executed in parallel
   */
  analyzeRuleDependencies(rules: AnyRule[]): RuleSet[] {
    if (rules.length === 0) {
      return [];
    }
    
    // Check cache first
    if (this.options.cacheAnalysisResults) {
      const cacheKey = this.generateCacheKey(rules);
      const cached = this.analysisCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
    
    // Build the dependency graph
    const nodes = this.buildDependencyGraph(rules);
    
    // Partition the graph into independent sets
    const ruleSets = this.partitionGraph(nodes);
    
    // Cache the result
    if (this.options.cacheAnalysisResults) {
      const cacheKey = this.generateCacheKey(rules);
      this.analysisCache.set(cacheKey, ruleSets);
      
      // Limit cache size
      if (this.analysisCache.size > 100) {
        const oldestKey = this.analysisCache.keys().next().value;
        this.analysisCache.delete(oldestKey);
      }
    }
    
    return ruleSets;
  }
  
  /**
   * Build a dependency graph from the rules
   * @param rules The rules to analyze
   * @returns Array of dependency nodes
   */
  private buildDependencyGraph(rules: AnyRule[]): DependencyNode[] {
    const nodes: DependencyNode[] = [];
    const agentToNodes = new Map<string, Set<DependencyNode>>();
    
    // Create nodes for each rule
    for (const rule of rules) {
      const agentIds = this.getAgentIdsFromRule(rule);
      
      const node: DependencyNode = {
        rule,
        agentIds,
        dependsOn: new Set(),
        dependedOnBy: new Set()
      };
      
      nodes.push(node);
      
      // Register the node with each agent it depends on
      for (const agentId of agentIds) {
        if (!agentToNodes.has(agentId)) {
          agentToNodes.set(agentId, new Set());
        }
        agentToNodes.get(agentId)!.add(node);
      }
    }
    
    // Build dependencies between nodes
    for (const node of nodes) {
      for (const agentId of node.agentIds) {
        const dependentNodes = agentToNodes.get(agentId) || new Set();
        
        for (const dependentNode of dependentNodes) {
          if (dependentNode !== node) {
            // Create bidirectional dependency
            node.dependsOn.add(dependentNode);
            dependentNode.dependedOnBy.add(node);
          }
        }
      }
    }
    
    // If using value-based analysis, refine the dependencies
    if (this.options.useValueBasedAnalysis) {
      this.refineValueBasedDependencies(nodes);
    }
    
    return nodes;
  }
  
  /**
   * Refine dependencies based on agent value analysis
   * @param nodes The dependency nodes
   */
  private refineValueBasedDependencies(nodes: DependencyNode[]): void {
    // Map of agent properties accessed by each rule
    const rulePropertyAccess = new Map<DependencyNode, Set<string>>();
    
    // Map of agent properties modified by each rule
    const rulePropertyModification = new Map<DependencyNode, Set<string>>();
    
    // Analyze property access patterns
    for (const node of nodes) {
      const rule = node.rule;
      const accessSet = new Set<string>();
      const modificationSet = new Set<string>();
      
      // Simple heuristic for detecting property access/modification
      // This could be more sophisticated with actual code analysis
      if (rule.type === 'action' && typeof rule.action === 'function') {
        const fnStr = rule.action.toString();
        
        // Check for property access patterns like agent.value.x
        const accessMatches = fnStr.match(/agent\d?\.value\.(\w+)/g) || [];
        for (const match of accessMatches) {
          const prop = match.split('.')[2];
          accessSet.add(prop);
        }
        
        // Check for property modification patterns like agent.value.x = y
        const modMatches = fnStr.match(/agent\d?\.value\.(\w+)\s*=/g) || [];
        for (const match of modMatches) {
          const prop = match.split('.')[2];
          modificationSet.add(prop);
        }
      }
      
      rulePropertyAccess.set(node, accessSet);
      rulePropertyModification.set(node, modificationSet);
    }
    
    // Refine dependencies based on property access/modification
    for (const nodeA of nodes) {
      const nodeAAccess = rulePropertyAccess.get(nodeA) || new Set();
      const nodeAMod = rulePropertyModification.get(nodeA) || new Set();
      
      // Remove dependencies that don't actually conflict
      const dependenciesToRemove = new Set<DependencyNode>();
      
      for (const nodeB of nodeA.dependsOn) {
        const nodeBAccess = rulePropertyAccess.get(nodeB) || new Set();
        const nodeBMod = rulePropertyModification.get(nodeB) || new Set();
        
        // Check for real conflicts
        let hasConflict = false;
        
        // If A modifies a property that B reads, there's a conflict
        for (const prop of nodeAMod) {
          if (nodeBAccess.has(prop)) {
            hasConflict = true;
            break;
          }
        }
        
        // If B modifies a property that A reads, there's a conflict
        if (!hasConflict) {
          for (const prop of nodeBMod) {
            if (nodeAAccess.has(prop)) {
              hasConflict = true;
              break;
            }
          }
        }
        
        // If A and B modify the same property, there's a conflict
        if (!hasConflict) {
          for (const prop of nodeAMod) {
            if (nodeBMod.has(prop)) {
              hasConflict = true;
              break;
            }
          }
        }
        
        // If no real conflict, remove the dependency
        if (!hasConflict) {
          dependenciesToRemove.add(nodeB);
        }
      }
      
      // Remove non-conflicting dependencies
      for (const nodeB of dependenciesToRemove) {
        nodeA.dependsOn.delete(nodeB);
        nodeB.dependedOnBy.delete(nodeA);
      }
    }
  }
  
  /**
   * Partition the dependency graph into independent sets
   * @param nodes The dependency nodes
   * @returns Array of independent rule sets
   */
  private partitionGraph(nodes: DependencyNode[]): RuleSet[] {
    const ruleSets: RuleSet[] = [];
    const remainingNodes = new Set(nodes);
    
    // Function to check if a node conflicts with any in the current group
    const conflictsWithGroup = (node: DependencyNode, group: Set<DependencyNode>): boolean => {
      for (const groupNode of group) {
        if (node.dependsOn.has(groupNode) || groupNode.dependsOn.has(node)) {
          return true;
        }
      }
      return false;
    };
    
    // Use graph coloring approach to find independent sets
    while (remainingNodes.size > 0) {
      const currentGroup = new Set<DependencyNode>();
      const currentRules: any[] = [];
      
      // Try to add as many non-conflicting nodes as possible
      for (const node of remainingNodes) {
        if (!conflictsWithGroup(node, currentGroup) && 
            currentRules.length < this.options.maxBatchSize!) {
          currentGroup.add(node);
          currentRules.push(this.serializeRule(node.rule));
        }
      }
      
      // If we couldn't find any non-conflicting nodes, take the first one
      if (currentGroup.size === 0 && remainingNodes.size > 0) {
        const firstNode = remainingNodes.values().next().value;
        currentGroup.add(firstNode);
        currentRules.push(this.serializeRule(firstNode.rule));
      }
      
      // Remove the nodes we've processed
      for (const node of currentGroup) {
        remainingNodes.delete(node);
      }
      
      // Add the rule set
      if (currentRules.length > 0) {
        ruleSets.push({ rules: currentRules });
      }
    }
    
    // Merge small rule sets if needed
    return this.optimizeRuleSets(ruleSets);
  }
  
  /**
   * Optimize rule sets by merging small ones
   * @param ruleSets The rule sets to optimize
   * @returns Optimized rule sets
   */
  private optimizeRuleSets(ruleSets: RuleSet[]): RuleSet[] {
    if (ruleSets.length <= 1) {
      return ruleSets;
    }
    
    // Sort by size (ascending)
    ruleSets.sort((a, b) => a.rules.length - b.rules.length);
    
    // Merge small rule sets
    const optimizedSets: RuleSet[] = [];
    let currentSet: RuleSet | null = null;
    
    for (const ruleSet of ruleSets) {
      if (ruleSet.rules.length < this.options.minBatchSize!) {
        // This is a small set, try to merge
        if (currentSet === null) {
          currentSet = { rules: [...ruleSet.rules] };
        } else {
          // Add to current set if it's not too big
          if (currentSet.rules.length + ruleSet.rules.length <= this.options.maxBatchSize!) {
            currentSet.rules.push(...ruleSet.rules);
          } else {
            // Current set is full, add it to optimized sets and start a new one
            optimizedSets.push(currentSet);
            currentSet = { rules: [...ruleSet.rules] };
          }
        }
      } else {
        // This is a large enough set, add it directly
        optimizedSets.push(ruleSet);
      }
    }
    
    // Add the last set if there is one
    if (currentSet !== null) {
      optimizedSets.push(currentSet);
    }
    
    return optimizedSets;
  }
  
  /**
   * Get agent IDs from a rule
   * @param rule The rule to analyze
   * @returns Array of agent IDs
   */
  private getAgentIdsFromRule(rule: AnyRule): string[] {
    const agentIds: string[] = [];
    
    if (rule.type === 'action' || rule.type === 'rewrite') {
      // New rule format
      const agent1Id = rule.matchInfo.agent1Id || rule.agent1Id;
      const agent2Id = rule.matchInfo.agent2Id || rule.agent2Id;
      
      if (agent1Id) agentIds.push(agent1Id);
      if (agent2Id) agentIds.push(agent2Id);
    } else {
      // Legacy rule format
      const conn = (rule as any).connection;
      if (conn) {
        const sourceId = conn.source?._agentId;
        const destId = conn.destination?._agentId;
        
        if (sourceId) agentIds.push(sourceId);
        if (destId) agentIds.push(destId);
      }
    }
    
    return agentIds;
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
        ruleName: rule.name,
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
        ruleName: rule.name,
        ruleDefinition: (rule as any).action
      };
    }
  }
  
  /**
   * Generate a cache key for a set of rules
   * @param rules The rules to generate a key for
   * @returns Cache key
   */
  private generateCacheKey(rules: AnyRule[]): string {
    // Create a structural key based on rule types and agent connections
    return rules.map(rule => {
      if (rule.type === 'action' || rule.type === 'rewrite') {
        return `${rule.type}:${rule.name}:${rule.matchInfo.agentName1}.${rule.matchInfo.portName1}-${rule.matchInfo.agentName2}.${rule.matchInfo.portName2}`;
      } else {
        const conn = (rule as any).connection;
        if (conn) {
          return `legacy:${rule.name}:${conn.source?.name}.${conn.sourcePort?.name}-${conn.destination?.name}.${conn.destinationPort?.name}`;
        }
        return `unknown:${rule.name}`;
      }
    }).sort().join('|');
  }
}