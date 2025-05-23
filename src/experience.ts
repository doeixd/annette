/**
 * Annette Developer Experience Enhancements
 * 
 * This module provides improved developer experience features for Annette,
 * including better error handling, debugging utilities, and progressive disclosure.
 */
import { INetwork, IAgent, IRule, IBoundPort, isAgent, isPort, Core } from './core';
import { StdLib } from './stdlib';
import { 
  AnnetteError, PortConnectionError, RuleApplicationError,
  createOptimizedNetwork, AnnetteOptions, DEFAULT_OPTIONS
} from './optimization';

// ========== Progressive Disclosure ==========

/**
 * Easy mode API for simple use cases
 */
export const Simple = {
  /**
   * Create a simple network with sensible defaults
   */
  createNetwork(name: string): INetwork {
    return Core.createNetwork(name);
  },

  /**
   * Create a simple agent with sensible defaults
   */
  createAgent<T = any>(name: string, value: T): IAgent {
    return Core.createAgent(name, value);
  },

  /**
   * Connect two agents directly using their main ports
   */
  connect(network: INetwork, agent1: IAgent, agent2: IAgent): void {
    network.connectPorts(agent1.ports.main, agent2.ports.main);
  },

  /**
   * Add a simple rule that matches two agent types and performs an action
   */
  addRule(
    network: INetwork, 
    agent1Type: string, 
    agent2Type: string, 
    action: (agent1: IAgent, agent2: IAgent) => void
  ): void {
    network.addRule(Core.createActionRule(
      { name: `${agent1Type}-${agent2Type}`, type: 'action' },
      { agentName1: agent1Type, portName1: 'main', agentName2: agent2Type, portName2: 'main' },
      (a1, a2, net) => {
        action(a1, a2);
        return [a1, a2];
      }
    ));
  },

  /**
   * Run the network until no more rules apply
   */
  run(network: INetwork): void {
    network.reduce();
  },

  /**
   * Run a single step of the network
   */
  step(network: INetwork): boolean {
    return network.reduce(1);
  },

  /**
   * Find all agents of a specific type
   */
  findAgents(network: INetwork, type: string): IAgent[] {
    return network.findAgents({ name: type });
  }
};

/**
 * Advanced API for more complex use cases
 */
export const Advanced = {
  /**
   * Create an optimized network with performance enhancements
   */
  createOptimizedNetwork(name: string, options?: AnnetteOptions): INetwork {
    const network = Core.createNetwork(name);
    return createOptimizedNetwork(network, options);
  },

  /**
   * Create a network with time travel capabilities
   */
  createTimeTravelNetwork(name: string): INetwork {
    return StdLib.TimeTravel.enableTimeTravel(Core.createNetwork(name));
  },

  /**
   * Create a fully featured network with all extensions
   */
  createEnhancedNetwork(name: string): INetwork {
    return StdLib.createEnhancedNetwork(name);
  },

  /**
   * Snapshot the current network state
   */
  takeSnapshot(network: INetwork, description?: string): any {
    if ('takeSnapshot' in network) {
      return (network as any).takeSnapshot(description);
    }
    throw new Error('This network does not support snapshots. Use createTimeTravelNetwork or createEnhancedNetwork instead.');
  },

  /**
   * Roll back to a previous snapshot
   */
  rollbackTo(network: INetwork, snapshotId: string): boolean {
    if ('rollbackTo' in network) {
      return (network as any).rollbackTo(snapshotId);
    }
    throw new Error('This network does not support rollbacks. Use createTimeTravelNetwork or createEnhancedNetwork instead.');
  }
};

// ========== Error Handling ==========

/**
 * Error reporter for better error messages
 */
export class ErrorReporter {
  private static instance: ErrorReporter;
  private errorHandlers: Array<(error: Error) => void> = [];
  private warningHandlers: Array<(warning: string) => void> = [];
  private verbose: boolean = false;

  /**
   * Get the singleton instance
   */
  static getInstance(): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter();
    }
    return ErrorReporter.instance;
  }

  /**
   * Set verbose mode
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Add an error handler
   */
  addErrorHandler(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Add a warning handler
   */
  addWarningHandler(handler: (warning: string) => void): void {
    this.warningHandlers.push(handler);
  }

  /**
   * Report an error
   */
  reportError(error: Error): void {
    // Log to console by default
    if (this.verbose || this.errorHandlers.length === 0) {
      if (error instanceof AnnetteError) {
        console.error('Annette Error:', error.message);
        if (error instanceof PortConnectionError) {
          console.error(error.getDetails());
        } else if (error instanceof RuleApplicationError) {
          console.error(error.getDetails());
        }
      } else {
        console.error('Error:', error);
      }
    }
    
    // Call all registered handlers
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (e) {
        console.error('Error in error handler:', e);
      }
    }
  }

  /**
   * Report a warning
   */
  reportWarning(warning: string): void {
    // Log to console by default
    if (this.verbose || this.warningHandlers.length === 0) {
      console.warn('Annette Warning:', warning);
    }
    
    // Call all registered handlers
    for (const handler of this.warningHandlers) {
      try {
        handler(warning);
      } catch (e) {
        console.error('Error in warning handler:', e);
      }
    }
  }

  /**
   * Create a better error for port connection issues
   */
  createPortConnectionError(
    message: string,
    sourceAgent: IAgent,
    sourcePort: IBoundPort,
    targetAgent: IAgent,
    targetPort: IBoundPort
  ): PortConnectionError {
    const error = new PortConnectionError(
      message,
      sourceAgent,
      sourcePort,
      targetAgent,
      targetPort
    );
    
    // Auto-report the error
    this.reportError(error);
    
    return error;
  }

  /**
   * Create a better error for rule application issues
   */
  createRuleApplicationError(
    message: string,
    rule: IRule,
    agent1?: IAgent,
    port1?: IBoundPort,
    agent2?: IAgent,
    port2?: IBoundPort
  ): RuleApplicationError {
    const error = new RuleApplicationError(
      message,
      rule,
      agent1,
      port1,
      agent2,
      port2
    );
    
    // Auto-report the error
    this.reportError(error);
    
    return error;
  }
}

// ========== Debugging Utilities ==========

/**
 * Debug level for controlling verbosity
 */
export enum DebugLevel {
  NONE = 0,
  ERROR = 1,
  WARNING = 2,
  INFO = 3,
  VERBOSE = 4
}

/**
 * Debug configuration
 */
export interface DebugConfig {
  level: DebugLevel;
  trackRuleApplications: boolean;
  trackStateChanges: boolean;
  trackConnections: boolean;
  logToConsole: boolean;
  maxLogEntries: number;
}

/**
 * Log entry for debug information
 */
export interface LogEntry {
  timestamp: number;
  level: DebugLevel;
  category: string;
  message: string;
  data?: any;
}

/**
 * Debug tools for improved debugging
 */
export class DebugTools {
  private static instance: DebugTools;
  private config: DebugConfig;
  private logs: LogEntry[] = [];
  private networkSnapshots: Map<string, any> = new Map();

  /**
   * Get the singleton instance
   */
  static getInstance(): DebugTools {
    if (!DebugTools.instance) {
      DebugTools.instance = new DebugTools();
    }
    return DebugTools.instance;
  }

  /**
   * Create debug tools with configuration
   */
  private constructor() {
    this.config = {
      level: DebugLevel.ERROR,
      trackRuleApplications: false,
      trackStateChanges: false,
      trackConnections: false,
      logToConsole: true,
      maxLogEntries: 1000
    };
    
    // Register error handler
    const errorReporter = ErrorReporter.getInstance();
    errorReporter.addErrorHandler((error) => {
      this.log(DebugLevel.ERROR, 'error', error.message, error);
    });
    
    // Register warning handler
    errorReporter.addWarningHandler((warning) => {
      this.log(DebugLevel.WARNING, 'warning', warning);
    });
  }

  /**
   * Configure debug tools
   */
  configure(config: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update error reporter verbosity
    const errorReporter = ErrorReporter.getInstance();
    errorReporter.setVerbose(this.config.level >= DebugLevel.VERBOSE);
  }

  /**
   * Log a debug message
   */
  log(level: DebugLevel, category: string, message: string, data?: any): void {
    // Skip if below current debug level
    if (level > this.config.level) return;
    
    // Create log entry
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data
    };
    
    // Add to logs
    this.logs.push(entry);
    
    // Trim logs if needed
    if (this.logs.length > this.config.maxLogEntries) {
      this.logs = this.logs.slice(this.logs.length - this.config.maxLogEntries);
    }
    
    // Log to console if enabled
    if (this.config.logToConsole) {
      switch (level) {
        case DebugLevel.ERROR:
          console.error(`[${category}] ${message}`, data);
          break;
        case DebugLevel.WARNING:
          console.warn(`[${category}] ${message}`, data);
          break;
        case DebugLevel.INFO:
          console.info(`[${category}] ${message}`, data);
          break;
        case DebugLevel.VERBOSE:
          console.debug(`[${category}] ${message}`, data);
          break;
      }
    }
  }

  /**
   * Track rule application
   */
  trackRuleApplication(rule: IRule, agent1: IAgent, agent2: IAgent, result: boolean): void {
    if (!this.config.trackRuleApplications) return;
    
    this.log(
      DebugLevel.INFO,
      'rule',
      `Rule ${rule.name} applied to ${agent1.name} and ${agent2.name}: ${result ? 'success' : 'failure'}`,
      { rule, agent1, agent2, result }
    );
  }

  /**
   * Track state change
   */
  trackStateChange(agent: IAgent, oldValue: any, newValue: any): void {
    if (!this.config.trackStateChanges) return;
    
    this.log(
      DebugLevel.INFO,
      'state',
      `Agent ${agent.name} (${agent._agentId}) state changed`,
      { agent, oldValue, newValue }
    );
  }

  /**
   * Track connection
   */
  trackConnection(connection: any, created: boolean): void {
    if (!this.config.trackConnections) return;
    
    if (created) {
      this.log(
        DebugLevel.INFO,
        'connection',
        `Connection created: ${connection.from.agent.name}.${connection.from.name} -> ${connection.to.agent.name}.${connection.to.name}`,
        { connection }
      );
    } else {
      this.log(
        DebugLevel.INFO,
        'connection',
        `Connection removed: ${connection.from.agent.name}.${connection.from.name} -> ${connection.to.agent.name}.${connection.to.name}`,
        { connection }
      );
    }
  }

  /**
   * Take a snapshot of a network
   */
  takeNetworkSnapshot(network: INetwork, id: string): void {
    // If the network supports snapshots natively, use that
    if ('takeSnapshot' in network) {
      const snapshot = (network as any).takeSnapshot(`Debug snapshot ${id}`);
      this.networkSnapshots.set(id, snapshot);
      return;
    }
    
    // Otherwise, create a simple snapshot
    const snapshot = {
      id,
      timestamp: Date.now(),
      agents: network.agents.map(agent => ({
        id: agent._agentId,
        name: agent.name,
        type: agent.type,
        value: JSON.parse(JSON.stringify(agent.value))
      })),
      connections: network.connections.map(conn => ({
        key: conn.key,
        from: {
          agentId: conn.from.agent._agentId,
          portName: conn.from.name
        },
        to: {
          agentId: conn.to.agent._agentId,
          portName: conn.to.name
        }
      }))
    };
    
    this.networkSnapshots.set(id, snapshot);
    
    this.log(
      DebugLevel.INFO,
      'snapshot',
      `Network snapshot ${id} taken`,
      { snapshot }
    );
  }

  /**
   * Compare two network snapshots
   */
  compareSnapshots(id1: string, id2: string): { 
    agentsAdded: any[],
    agentsRemoved: any[],
    agentsChanged: Array<{ id: string, name: string, changes: any }>,
    connectionsAdded: any[],
    connectionsRemoved: any[]
  } {
    const snapshot1 = this.networkSnapshots.get(id1);
    const snapshot2 = this.networkSnapshots.get(id2);
    
    if (!snapshot1 || !snapshot2) {
      throw new Error(`Snapshots with IDs ${id1} and ${id2} not found`);
    }
    
    // Compare agents
    const agentsMap1 = new Map(snapshot1.agents.map((a: any) => [a.id, a]));
    const agentsMap2 = new Map(snapshot2.agents.map((a: any) => [a.id, a]));
    
    const agentsAdded = Array.from(agentsMap2.values())
      .filter((a: any) => !agentsMap1.has(a.id));
    
    const agentsRemoved = Array.from(agentsMap1.values())
      .filter((a: any) => !agentsMap2.has(a.id));
    
    const agentsChanged = Array.from(agentsMap1.entries())
      .filter(([id, agent1]: [string, any]) => {
        const agent2 = agentsMap2.get(id);
        return agent2 && JSON.stringify(agent1.value) !== JSON.stringify(agent2.value);
      })
      .map(([id, agent1]: [string, any]) => {
        const agent2 = agentsMap2.get(id)!;
        return {
          id,
          name: agent1.name,
          changes: this.diffObjects(agent1.value, agent2.value)
        };
      });
    
    // Compare connections
    const connectionsMap1 = new Map(snapshot1.connections.map((c: any) => [c.key, c]));
    const connectionsMap2 = new Map(snapshot2.connections.map((c: any) => [c.key, c]));
    
    const connectionsAdded = Array.from(connectionsMap2.values())
      .filter((c: any) => !connectionsMap1.has(c.key));
    
    const connectionsRemoved = Array.from(connectionsMap1.values())
      .filter((c: any) => !connectionsMap2.has(c.key));
    
    return {
      agentsAdded,
      agentsRemoved,
      agentsChanged,
      connectionsAdded,
      connectionsRemoved
    };
  }

  /**
   * Compare two objects and return their differences
   */
  private diffObjects(obj1: any, obj2: any, path: string = ''): any {
    // If objects are the same, return empty
    if (JSON.stringify(obj1) === JSON.stringify(obj2)) {
      return {};
    }
    
    // Handle null/undefined
    if (obj1 === null || obj1 === undefined || obj2 === null || obj2 === undefined) {
      return { 
        [path || 'value']: { 
          old: obj1, 
          new: obj2 
        } 
      };
    }
    
    // Handle different types
    if (typeof obj1 !== typeof obj2) {
      return { 
        [path || 'value']: { 
          old: obj1, 
          new: obj2 
        } 
      };
    }
    
    // Handle primitive types
    if (typeof obj1 !== 'object') {
      return { 
        [path || 'value']: { 
          old: obj1, 
          new: obj2 
        } 
      };
    }
    
    // Handle arrays
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      if (obj1.length !== obj2.length) {
        return { 
          [path || 'value']: { 
            old: obj1, 
            new: obj2 
          } 
        };
      }
      
      const diffs: any = {};
      let hasDiff = false;
      
      for (let i = 0; i < obj1.length; i++) {
        const childPath = path ? `${path}[${i}]` : `[${i}]`;
        const childDiff = this.diffObjects(obj1[i], obj2[i], childPath);
        
        if (Object.keys(childDiff).length > 0) {
          Object.assign(diffs, childDiff);
          hasDiff = true;
        }
      }
      
      return hasDiff ? diffs : {};
    }
    
    // Handle objects
    const diffs: any = {};
    let hasDiff = false;
    
    // Check for properties in obj1
    for (const key in obj1) {
      if (Object.prototype.hasOwnProperty.call(obj1, key)) {
        const childPath = path ? `${path}.${key}` : key;
        
        if (key in obj2) {
          // Property exists in both objects
          const childDiff = this.diffObjects(obj1[key], obj2[key], childPath);
          
          if (Object.keys(childDiff).length > 0) {
            Object.assign(diffs, childDiff);
            hasDiff = true;
          }
        } else {
          // Property exists only in obj1
          diffs[childPath] = { 
            old: obj1[key], 
            new: undefined 
          };
          hasDiff = true;
        }
      }
    }
    
    // Check for properties in obj2 that don't exist in obj1
    for (const key in obj2) {
      if (Object.prototype.hasOwnProperty.call(obj2, key) && !(key in obj1)) {
        const childPath = path ? `${path}.${key}` : key;
        diffs[childPath] = { 
          old: undefined, 
          new: obj2[key] 
        };
        hasDiff = true;
      }
    }
    
    return hasDiff ? diffs : {};
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level and category
   */
  getFilteredLogs(level?: DebugLevel, category?: string): LogEntry[] {
    return this.logs.filter(log => 
      (level === undefined || log.level <= level) &&
      (category === undefined || log.category === category)
    );
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): Array<{ id: string, snapshot: any }> {
    return Array.from(this.networkSnapshots.entries())
      .map(([id, snapshot]) => ({ id, snapshot }));
  }

  /**
   * Clear all snapshots
   */
  clearSnapshots(): void {
    this.networkSnapshots.clear();
  }
}

// ========== Enhanced Networks ==========

/**
 * Create a network with improved developer experience
 */
export function createEnhancedNetwork(
  name: string, 
  options?: AnnetteOptions & { debugLevel?: DebugLevel }
): INetwork {
  // Create the network
  const network = StdLib.createEnhancedNetwork(name);
  
  // Apply optimizations
  const optimizedNetwork = createOptimizedNetwork(network, options);
  
  // Set up debug tools
  const debugTools = DebugTools.getInstance();
  debugTools.configure({ 
    level: options?.debugLevel || DebugLevel.ERROR,
    trackRuleApplications: true,
    trackStateChanges: true,
    trackConnections: true
  });
  
  // Take initial snapshot
  debugTools.takeNetworkSnapshot(optimizedNetwork, `${name}_initial`);
  
  // Create a proxy with enhanced error handling and debugging
  const enhancedNetwork = new Proxy(optimizedNetwork, {
    get(target, prop, receiver) {
      // Intercept specific methods
      if (prop === 'connectPorts') {
        return function connectPorts(port1: IBoundPort, port2: IBoundPort) {
          try {
            // Validate ports
            if (!port1 || !isPort(port1)) {
              throw new Error('Invalid port: port1 is not a valid port');
            }
            if (!port2 || !isPort(port2)) {
              throw new Error('Invalid port: port2 is not a valid port');
            }
            
            // Check if ports are already connected
            const existingConnection = target.connections.find(
              c => (c.from === port1 && c.to === port2) || 
                   (c.from === port2 && c.to === port1)
            );
            
            if (existingConnection) {
              const errorReporter = ErrorReporter.getInstance();
              errorReporter.reportWarning(
                `Ports are already connected: ${port1.agent.name}.${port1.name} and ${port2.agent.name}.${port2.name}`
              );
            }
            
            // Call original method
            const connection = target.connectPorts(port1, port2);
            
            // Track connection
            if (connection) {
              debugTools.trackConnection(connection, true);
            }
            
            return connection;
          } catch (error) {
            // Create a better error
            const errorReporter = ErrorReporter.getInstance();
            if (error instanceof Error) {
              throw errorReporter.createPortConnectionError(
                error.message,
                port1?.agent,
                port1,
                port2?.agent,
                port2
              );
            }
            throw error;
          }
        };
      }
      
      if (prop === 'reduce') {
        return function reduce(maxSteps?: number) {
          // Take snapshot before reduction
          debugTools.takeNetworkSnapshot(target, `${name}_before_reduce`);
          
          // Call original method
          const result = target.reduce(maxSteps);
          
          // Take snapshot after reduction
          debugTools.takeNetworkSnapshot(target, `${name}_after_reduce`);
          
          // Log result
          debugTools.log(
            DebugLevel.INFO,
            'network',
            `Network ${name} reduced with result: ${result}`,
            { stepsLimit: maxSteps }
          );
          
          return result;
        };
      }
      
      // Return original property
      return Reflect.get(target, prop, receiver);
    }
  });
  
  return enhancedNetwork;
}

// ========== Module Exports ==========

// Export all enhancers
export {
  // Progressive disclosure APIs
  Simple,
  Advanced,
  
  // Error handling
  ErrorReporter,
  AnnetteError,
  PortConnectionError,
  RuleApplicationError,
  
  // Debugging
  DebugTools,
  DebugLevel,
  
  // Enhanced networks
  createEnhancedNetwork
};