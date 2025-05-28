/**
 * Annette Plugin System
 * 
 * A plugin-based architecture for extending Annette's functionality.
 * Allows for modular features like time travel, synchronization, and reactivity.
 */
import { INetwork, Network } from './network';
import { ActionRule, AnyRule } from './rule';
import { Agent, IAgent } from './agent';
import { getPortInstanceKey, IBoundPort, Port } from './port';
import { IConnection } from './connection';

// ========== Plugin Interfaces ==========

/**
 * Basic plugin interface
 */
export interface IPlugin {
  /** Unique identifier for this plugin */
  id: string;
  
  /** Human-readable name of the plugin */
  name: string;
  
  /** Plugin description */
  description?: string;
  
  /** Plugin version */
  version?: string;
  
  /** Plugin dependencies (other plugin IDs) */
  dependencies?: string[];
  
  /** Initialize the plugin with a network */
  initialize(network: INetwork): void;
  
  /** Clean up plugin resources */
  shutdown(): void;
  
  /** Check if the plugin is compatible with a network */
  isCompatible?(network: INetwork): boolean;
  
  /** Get plugin configuration */
  getConfig?(): Record<string, any>;
  
  /** Set plugin configuration */
  setConfig?(config: Record<string, any>): void;
}

/**
 * Plugin manager for handling plugin lifecycle
 */
export interface IPluginManager {
  /** Register a plugin with the manager */
  register(plugin: IPlugin): void;
  
  /** Unregister a plugin from the manager */
  unregister(pluginId: string): void;
  
  /** Initialize all registered plugins */
  initialize(network: INetwork): void;
  
  /** Shutdown all registered plugins */
  shutdown(): void;
  
  /** Get a plugin by ID */
  getPlugin(pluginId: string): IPlugin | undefined;
  
  /** Get all registered plugins */
  getPlugins(): IPlugin[];
  
  /** Check if a plugin is registered */
  hasPlugin(pluginId: string): boolean;
}

// ========== Event System ==========

/**
 * Event types for the plugin system
 */
export enum EventType {
  NETWORK_CHANGED = 'network-changed',
  AGENT_ADDED = 'agent-added',
  AGENT_REMOVED = 'agent-removed',
  CONNECTION_CREATED = 'connection-created',
  CONNECTION_REMOVED = 'connection-removed',
  RULE_ADDED = 'rule-added',
  RULE_REMOVED = 'rule-removed',
  PLUGIN_REGISTERED = 'plugin-registered',
  PLUGIN_UNREGISTERED = 'plugin-unregistered',
  PLUGIN_INITIALIZED = 'plugin-initialized',
  PLUGIN_SHUTDOWN = 'plugin-shutdown',
  NETWORK_REDUCED = 'network-reduced',
  CONFIG_CHANGED = 'config-changed',
  CUSTOM = 'custom'
}

/**
 * Event interface for the plugin system
 */
export interface IEvent {
  /** Event type */
  type: EventType | string;
  
  /** Event source */
  source: string;
  
  /** Event target */
  target?: string;
  
  /** Event data */
  data?: any;
  
  /** Event timestamp */
  timestamp: number;
}

/**
 * Event listener function type
 */
export type EventListener = (event: IEvent) => void;

/**
 * Event bus interface for the plugin system
 */
export interface IEventBus {
  /** Add an event listener */
  addEventListener(type: EventType | string, listener: EventListener): void;
  
  /** Remove an event listener */
  removeEventListener(type: EventType | string, listener: EventListener): void;
  
  /** Dispatch an event */
  dispatchEvent(event: IEvent): void;
  
  /** Create and dispatch an event */
  emit(type: EventType | string, source: string, data?: any, target?: string): void;
}

// ========== Plugin Manager Implementation ==========

/**
 * Implementation of the plugin manager
 */
export class PluginManager implements IPluginManager, IEventBus {
  private plugins: Map<string, IPlugin> = new Map();
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private network?: INetwork;
  
  /**
   * Create a new plugin manager
   */
  constructor() {}
  
  /**
   * Register a plugin with the manager
   */
  register(plugin: IPlugin): void {
    // Check if plugin is already registered
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with ID ${plugin.id} is already registered`);
    }
    
    // Check dependencies
    if (plugin.dependencies) {
      for (const depId of plugin.dependencies) {
        if (!this.plugins.has(depId)) {
          throw new Error(`Plugin ${plugin.id} depends on ${depId}, which is not registered`);
        }
      }
    }
    
    // Add plugin to registry
    this.plugins.set(plugin.id, plugin);
    
    // Emit event
    this.emit(EventType.PLUGIN_REGISTERED, 'plugin-manager', { pluginId: plugin.id });
    
    // Initialize if network is already set
    if (this.network) {
      this.initializePlugin(plugin, this.network);
    }
  }
  
  /**
   * Unregister a plugin from the manager
   */
  unregister(pluginId: string): void {
    // Check if plugin exists
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin with ID ${pluginId} is not registered`);
    }
    
    // Check if other plugins depend on this one
    const entries = Array.from(this.plugins.entries());
    entries.forEach(([id, p]) => {
      if (p.dependencies && p.dependencies.includes(pluginId)) {
        throw new Error(`Cannot unregister plugin ${pluginId}: plugin ${id} depends on it`);
      }
    });
    
    // Shutdown plugin if initialized
    if (this.network) {
      plugin.shutdown();
      this.emit(EventType.PLUGIN_SHUTDOWN, 'plugin-manager', { pluginId });
    }
    
    // Remove plugin from registry
    this.plugins.delete(pluginId);
    
    // Emit event
    this.emit(EventType.PLUGIN_UNREGISTERED, 'plugin-manager', { pluginId });
  }
  
  /**
   * Initialize all registered plugins
   */
  initialize(network: INetwork): void {
    this.network = network;
    
    // Initialize plugins in dependency order
    const initialized = new Set<string>();
    const initializePlugins = (plugins: IPlugin[]): void => {
      let progress = false;
      
      for (const plugin of plugins) {
        if (initialized.has(plugin.id)) continue;
        
        // Check if all dependencies are initialized
        const depsReady = !plugin.dependencies || 
          plugin.dependencies.every(depId => initialized.has(depId));
        
        if (depsReady) {
          this.initializePlugin(plugin, network);
          initialized.add(plugin.id);
          progress = true;
        }
      }
      
      // If we made progress and there are still plugins to initialize, continue
      if (progress && initialized.size < this.plugins.size) {
        initializePlugins(Array.from(this.plugins.values()));
      }
    };
    
    initializePlugins(Array.from(this.plugins.values()));
    
    // Check if all plugins were initialized
    if (initialized.size < this.plugins.size) {
      const uninitialized = Array.from(this.plugins.keys())
        .filter(id => !initialized.has(id));
      throw new Error(`Could not initialize plugins due to circular dependencies: ${uninitialized.join(', ')}`);
    }
  }
  
  /**
   * Initialize a single plugin
   */
  private initializePlugin(plugin: IPlugin, network: INetwork): void {
    // Check compatibility if method exists
    if (plugin.isCompatible && !plugin.isCompatible(network)) {
      throw new Error(`Plugin ${plugin.id} is not compatible with the provided network`);
    }
    
    // Initialize plugin
    plugin.initialize(network);
    
    // Emit event
    this.emit(EventType.PLUGIN_INITIALIZED, 'plugin-manager', { pluginId: plugin.id });
  }
  
  /**
   * Shutdown all registered plugins
   */
  shutdown(): void {
    if (!this.network) return;
    
    // Shutdown plugins in reverse dependency order
    const shutdown = new Set<string>();
    const pluginsArray = Array.from(this.plugins.values());
    
    while (shutdown.size < this.plugins.size) {
      let progress = false;
      
      for (const plugin of pluginsArray) {
        if (shutdown.has(plugin.id)) continue;
        
        // Check if any dependent plugins are still running
        const dependents = pluginsArray.filter(p => 
          p.dependencies && p.dependencies.includes(plugin.id) && !shutdown.has(p.id)
        );
        
        if (dependents.length === 0) {
          plugin.shutdown();
          this.emit(EventType.PLUGIN_SHUTDOWN, 'plugin-manager', { pluginId: plugin.id });
          shutdown.add(plugin.id);
          progress = true;
        }
      }
      
      if (!progress) {
        // This should never happen if dependency checking is correct
        console.warn('Could not shut down all plugins properly');
        break;
      }
    }
    
    this.network = undefined;
  }
  
  /**
   * Get a plugin by ID
   */
  getPlugin(pluginId: string): IPlugin | undefined {
    return this.plugins.get(pluginId);
  }
  
  /**
   * Get all registered plugins
   */
  getPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Check if a plugin is registered
   */
  hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }
  
  // ========== Event Bus Implementation ==========
  
  /**
   * Add an event listener
   */
  addEventListener(type: EventType | string, listener: EventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }
  
  /**
   * Remove an event listener
   */
  removeEventListener(type: EventType | string, listener: EventListener): void {
    if (this.eventListeners.has(type)) {
      this.eventListeners.get(type)!.delete(listener);
    }
  }
  
  /**
   * Dispatch an event
   */
  dispatchEvent(event: IEvent): void {
    // Call listeners for the specific event type
    if (this.eventListeners.has(event.type)) {
      Array.from(this.eventListeners.get(event.type)!).forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
    }
    
    // Call listeners for all events
    if (this.eventListeners.has('*')) {
      Array.from(this.eventListeners.get('*')!).forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in wildcard event listener:`, error);
        }
      });
    }
  }
  
  /**
   * Create and dispatch an event
   */
  emit(type: EventType | string, source: string, data?: any, target?: string): void {
    const event: IEvent = {
      type,
      source,
      target,
      data,
      timestamp: Date.now()
    };
    this.dispatchEvent(event);
  }
}
export interface IPluginNetwork extends INetwork {
    registerPlugin(plugin: IPlugin): void;
    unregisterPlugin(pluginId: string): void;
    getPlugin(pluginId: string): IPlugin | undefined;
    getPlugins(): IPlugin[];
    hasPlugin(pluginId: string): boolean;
    addEventListener(type: EventType | string, listener: EventListener): void;
    removeEventListener(type: EventType | string, listener: EventListener): void;
    emit(type: EventType | string, data?: any, source?: string): void; // Adjusted emit slightly
    // It will inherit all methods from INetwork
}


export class PluginNetwork implements IPluginNetwork { // Implement the new IPluginNetwork
  private underlyingNetwork: INetwork; // Store the wrapped network
  private pluginManager: PluginManager;
  public readonly name: string; // Add name property
  public readonly id: string;   // Add id property

  constructor(initialPlugins: IPlugin[] = [], name: string) { // Accept name and plugins
    this.underlyingNetwork = Network(name); // Create the core network here
    this.name = this.underlyingNetwork.name;
    this.id = this.underlyingNetwork.id;
    this.pluginManager = new PluginManager();
    this.pluginManager.initialize(this); // Initialize manager with this PluginNetwork instance

    for (const plugin of initialPlugins) {
        this.registerPlugin(plugin);
    }
  }

  // --- IPluginNetwork specific methods ---
  public registerPlugin(plugin: IPlugin): void {
    this.pluginManager.register(plugin);
    // Plugin's initialize will be called by PluginManager, passing 'this' (PluginNetwork)
  }

  public unregisterPlugin(pluginId: string): void {
    this.pluginManager.unregister(pluginId);
  }

  public getPlugin(pluginId: string): IPlugin | undefined {
    return this.pluginManager.getPlugin(pluginId);
  }

  public getPlugins(): IPlugin[] {
    return this.pluginManager.getPlugins();
  }

  public hasPlugin(pluginId: string): boolean {
    return this.pluginManager.hasPlugin(pluginId);
  }

  public addEventListener(type: EventType | string, listener: EventListener): void {
    this.pluginManager.addEventListener(type, listener);
  }

  public removeEventListener(type: EventType | string, listener: EventListener): void {
    this.pluginManager.removeEventListener(type, listener);
  }

  public emit(type: EventType | string, data?: any, source: string = 'PluginNetwork'): void {
    this.pluginManager.emit(type, source, data);
  }

  // --- INetwork method implementations (delegation) ---
  public addAgent<T extends IAgent>(agent: T): T {
    const result = this.underlyingNetwork.addAgent(agent);
    this.emit(EventType.AGENT_ADDED, { agent }, this.id);
    return result;
  }

  public removeAgent(agentOrId: string | IAgent): boolean {
    const agentId = typeof agentOrId === 'string' ? agentOrId : agentOrId._agentId;
    const agent = this.underlyingNetwork.getAgent(agentId); // Get agent before removal for event
    const result = this.underlyingNetwork.removeAgent(agentOrId);
    if (result && agent) {
      this.emit(EventType.AGENT_REMOVED, { agentId: agent._agentId, agentName: agent.name }, this.id);
    }
    return result;
  }

  public getAgent<T extends IAgent = IAgent>(agentId: string): T | undefined {
    return this.underlyingNetwork.getAgent<T>(agentId);
  }

  public findAgents(query: { name?: string }): IAgent[] {
    return this.underlyingNetwork.findAgents(query);
  }
  
  public getAllAgents(): IAgent[] {
      return this.underlyingNetwork.getAllAgents();
  }

  public connectPorts<P1 extends IBoundPort, P2 extends IBoundPort>(
    port1: P1, port2: P2, connectionName?: string
  ): IConnection<string, P1["agent"], P2["agent"], any, any> | undefined {
    const connection = this.underlyingNetwork.connectPorts(port1, port2, connectionName);
    if (connection) {
      this.emit(EventType.CONNECTION_CREATED, { connection }, this.id);
    }
    return connection;
  }

  public disconnectPorts<P1 extends IBoundPort, P2 extends IBoundPort>(
    port1: P1, port2: P2
  ): boolean {
    // To emit the connection object, we might need to find it first if disconnectPorts doesn't return it.
    // For simplicity, emitting port keys.
    const port1Key = getPortInstanceKey(port1);
    const port2Key = getPortInstanceKey(port2);
    const result = this.underlyingNetwork.disconnectPorts(port1, port2);
    if (result) {
      this.emit(EventType.CONNECTION_REMOVED, { port1Key, port2Key }, this.id);
    }
    return result;
  }

  public isPortConnected<P extends IBoundPort>(port: P): boolean {
    return this.underlyingNetwork.isPortConnected(port);
  }
  
  public getAllConnections(): IConnection[] {
      return this.underlyingNetwork.getAllConnections();
  }

  public findConnections(query?: { from?: IBoundPort, to?: IBoundPort }): IConnection[] {
      return this.underlyingNetwork.findConnections(query);
  }

  public addRule(rule: AnyRule): void {
    this.underlyingNetwork.addRule(rule);
    this.emit(EventType.RULE_ADDED, { rule }, this.id);
  }

  public removeRule(ruleOrName: string | AnyRule): boolean {
    // Get rule details before removal for the event
    const ruleToRemove = typeof ruleOrName === 'string' ? this.findRules({name: ruleOrName})[0] : ruleOrName;
    const result = this.underlyingNetwork.removeRule(ruleOrName);
    if (result && ruleToRemove) {
      this.emit(EventType.RULE_REMOVED, { ruleName: ruleToRemove.name, ruleType: ruleToRemove.type }, this.id);
    }
    return result;
  }
  
  public getAllRules(): AnyRule[] {
      return this.underlyingNetwork.getAllRules();
  }
  
  public findRules(query?: { name?: string; type?: string; agentName?: string; portName?: string }): AnyRule[] {
      return this.underlyingNetwork.findRules(query);
  }

  public clearRules(): void {
      this.underlyingNetwork.clearRules();
      // Consider emitting an event for all rules removed
  }

  public step(): boolean { // INetwork in network.ts has step returning boolean
    const madeProgress = this.underlyingNetwork.step();
    if (madeProgress) {
      this.emit(EventType.NETWORK_REDUCED, { steps: 1 }, this.id); // Assuming step means 1 reduction if successful
    }
    return madeProgress;
  }

  public reduce(maxSteps?: number): number {
    const steps = this.underlyingNetwork.reduce(maxSteps);
    if (steps > 0) {
      this.emit(EventType.NETWORK_REDUCED, { steps }, this.id);
    }
    return steps;
  }
  
  public getChangeHistory?(): any[] { // Make optional if not all INetwork impl have it
      if (this.underlyingNetwork.getChangeHistory) {
          return this.underlyingNetwork.getChangeHistory();
      }
      return [];
  }
}

// Update createPluginNetwork factory in plugin.ts
// export function createPluginNetwork(name: string, initialPlugins: IPlugin[] = []): IPluginNetwork {
//   return new PluginNetwork(name, initialPlugins);
// }
// ========== Plugin Base Classes ==========

/**
 * Abstract base class for plugins
 */
export abstract class BasePlugin implements IPlugin {
  id: string;
  name: string;
  description?: string;
  version?: string;
  dependencies?: string[];
  
  protected network?: INetwork;
  private config: Record<string, any> = {};
  
  constructor(options: {
    id: string;
    name: string;
    description?: string;
    version?: string;
    dependencies?: string[];
    config?: Record<string, any>;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.description = options.description;
    this.version = options.version;
    this.dependencies = options.dependencies;
    this.config = options.config || {};
  }
  
  abstract initialize(network: INetwork): void;
  
  shutdown(): void {
    this.network = undefined;
  }
  
  isCompatible(_network: INetwork): boolean {
    return true;
  }
  
  getConfig(): Record<string, any> {
    return { ...this.config };
  }
  
  setConfig(config: Record<string, any>): void {
    this.config = { ...this.config, ...config };
  }
}

// ========== Network Plugin Wrapper ==========

/**
 * Extension to the INetwork interface with additional methods
 */
interface IEnhancedNetwork {
  // Base INetwork properties
  id: string;
  name?: string;
  
  // Base INetwork methods
  addAgent<T extends IAgent>(agent: T): T;
  removeAgent(agentOrId: string | IAgent): boolean;
  getAgent<T extends IAgent = IAgent>(agentId: string): T | undefined;
  addRule(rule: AnyRule): void;
  removeRule(rule: string | AnyRule): boolean;
  findAgents(query?: any): IAgent[];
  findConnections(query?: any): IConnection[];
  findRules(query?: any): AnyRule[];
  reduce(maxSteps?: number): number;
  getAllAgents(): IAgent[];
  getAllConnections(): IConnection[];
  getAllRules(): AnyRule[];
  clearRules?(): void;
  
  // Extended methods
  connect?(agent1: IAgent, port1: string, agent2: IAgent, port2: string): IConnection | undefined;
  disconnect?(connection: IConnection): boolean;
  getAgents?(query?: any): IAgent[];
  getConnections?(query?: any): IConnection[];
  getRules?(query?: any): AnyRule[];
  getConnection?(agent1: IAgent, port1: string, agent2: IAgent, port2: string): IConnection | undefined;
  createAgent?(name: string, value?: any): IAgent;
  step?(): number;
}

/**
 * Enhanced network with plugin support
 */
// export class PluginNetwork implements IEnhancedNetwork {
//   private network: INetwork;
//   private pluginManager: PluginManager;
  
//   constructor(network: INetwork) {
//     this.network = network;
//     this.pluginManager = new PluginManager();
    
//     // Initialize the plugin manager with the network
//     this.pluginManager.initialize(network);
//   }
  
//   // ========== INetwork Required Properties ==========
  
//   get name(): string {
//     return this.network.name;
//   }
  
//   get id(): string {
//     return this.network.id;
//   }
  
//   // ========== Plugin Methods ==========
  
//   /**
//    * Register a plugin with the network
//    */
//   registerPlugin(plugin: IPlugin): void {
//     this.pluginManager.register(plugin);
//   }
  
//   /**
//    * Unregister a plugin from the network
//    */
//   unregisterPlugin(pluginId: string): void {
//     this.pluginManager.unregister(pluginId);
//   }
  
//   /**
//    * Get a plugin by ID
//    */
//   getPlugin(pluginId: string): IPlugin | undefined {
//     return this.pluginManager.getPlugin(pluginId);
//   }
  
//   /**
//    * Get all registered plugins
//    */
//   getPlugins(): IPlugin[] {
//     return this.pluginManager.getPlugins();
//   }
  
//   /**
//    * Check if a plugin is registered
//    */
//   hasPlugin(pluginId: string): boolean {
//     return this.pluginManager.hasPlugin(pluginId);
//   }
  
//   /**
//    * Create an agent in the network
//    */
//   createAgent(name: string, value: any): IAgent {
//     if (typeof (this.network as any).createAgent === 'function') {
//       return (this.network as any).createAgent(name, value);
//     } else {
//       return Agent(name, value);
//     }
//   }
  
//   /**
//    * Add an event listener
//    */
//   addEventListener(type: EventType | string, listener: EventListener): void {
//     this.pluginManager.addEventListener(type, listener);
//   }
  
//   /**
//    * Remove an event listener
//    */
//   removeEventListener(type: EventType | string, listener: EventListener): void {
//     this.pluginManager.removeEventListener(type, listener);
//   }
  
//   /**
//    * Emit an event
//    */
//   emit(type: EventType | string, data?: any): void {
//     this.pluginManager.emit(type, 'network', data);
//   }
  
//   // ========== INetwork Implementation ==========
  
//   /**
//    * Add an agent to the network
//    */
//   addAgent<T extends IAgent>(agent: T): T {
//     const result = this.network.addAgent(agent);
//     this.pluginManager.emit(EventType.AGENT_ADDED, 'network', { agent });
//     return result;
//   }
  
//   /**
//    * Remove an agent from the network
//    */
//   removeAgent(agentOrId: string | IAgent): boolean {
//     const result = this.network.removeAgent(agentOrId);
//     this.pluginManager.emit(EventType.AGENT_REMOVED, 'network', { agentOrId });
//     return result;
//   }
  
//   /**
//    * Connect two agents in the network
//    */
//   connect(agent1: IAgent, port1: string, agent2: IAgent, port2: string): IConnection | undefined {
//     if (typeof (this.network as any).connect === 'function') {
//       const connection = (this.network as any).connect(agent1, port1, agent2, port2);
//       if (connection) {
//         this.pluginManager.emit(EventType.CONNECTION_CREATED, 'network', { connection });
//       }
//       return connection;
//     }
//     return undefined;
//   }
  
//   /**
//    * Add a rule to the network
//    */
//   addRule(rule: AnyRule): void {
//     this.network.addRule(rule);
//     this.pluginManager.emit(EventType.RULE_ADDED, 'network', { rule });
//   }
  
//   /**
//    * Remove a rule from the network
//    */
//   removeRule(rule: string | AnyRule): boolean {
//     const result = this.network.removeRule(rule);
//     this.pluginManager.emit(EventType.RULE_REMOVED, 'network', { rule });
//     return result;
//   }
  
//   /**
//    * Get an agent by ID
//    */
//   getAgent<T extends IAgent>(agentId: string): T | undefined {
//     return this.network.getAgent<T>(agentId);
//   }
  
//   /**
//    * Find agents in the network
//    */
//   findAgents(query: any): IAgent[] {
//     return this.network.findAgents(query);
//   }
  
//   /**
//    * Find connections in the network
//    */
//   findConnections(query: any): any[] {
//     return this.network.findConnections(query);
//   }
  
//   /**
//    * Find rules in the network
//    */
//   findRules(query?: { name?: string; type?: string; agentName?: string; portName?: string }): AnyRule[] {
//     return this.network.findRules(query);
//   }
  
//   /**
//    * Reduce the network (apply rules)
//    */
//   reduce(maxSteps?: number): number {
//     const reduced = this.network.reduce(maxSteps);
//     this.pluginManager.emit(EventType.NETWORK_REDUCED, 'network', { reduced });
//     return reduced;
//   }
  
//   /**
//    * Get all agents in the network
//    */
//   getAllAgents(): IAgent[] {
//     return this.network.getAllAgents();
//   }
  
//   /**
//    * Disconnect a connection in the network
//    */
//   disconnect(connection: IConnection): boolean {
//     if (typeof (this.network as any).disconnect === 'function') {
//       const result = (this.network as any).disconnect(connection);
//       if (result) {
//         this.pluginManager.emit(EventType.CONNECTION_REMOVED, 'network', { connection });
//       }
//       return result;
//     }
//     return false;
//   }
  
//   /**
//    * Get all agents matching a query
//    */
//   getAgents(query?: any): IAgent[] {
//     if (typeof (this.network as any).getAgents === 'function') {
//       return (this.network as any).getAgents(query);
//     } else {
//       return this.network.getAllAgents();
//     }
//   }
  
//   /**
//    * Get all connections in the network
//    */
//   getConnections(query?: any): IConnection[] {
//     if (typeof (this.network as any).getConnections === 'function') {
//       return (this.network as any).getConnections(query);
//     } else if (typeof this.network.getAllConnections === 'function') {
//       return this.network.getAllConnections();
//     } else {
//       return [];
//     }
//   }
  
//   /**
//    * Get all rules in the network
//    */
//   getRules(query?: any): AnyRule[] {
//     if (typeof (this.network as any).getRules === 'function') {
//       return (this.network as any).getRules(query);
//     } else {
//       return this.network.findRules(query || {});
//     }
//   }
  
//   /**
//    * Get a connection between two agents
//    */
//   getConnection(agent1: IAgent, port1: string, agent2: IAgent, port2: string): IConnection | undefined {
//     if (typeof (this.network as any).getConnection === 'function') {
//       return (this.network as any).getConnection(agent1, port1, agent2, port2);
//     }
//     return undefined;
//   }
  
//   /**
//    * Get all connections in the network
//    */
//   getAllConnections(): any[] {
//     return this.network.getAllConnections ? this.network.getAllConnections() : [];
//   }
  
//   /**
//    * Get all rules in the network
//    */
//   getAllRules(): AnyRule[] {
//     return this.network.getAllRules ? this.network.getAllRules() : this.network.findRules();
//   }
  
//   /**
//    * Clear all rules from the network
//    */
//   clearRules(): void {
//     if (this.network.clearRules) {
//       this.network.clearRules();
//     }
//   }
  
//   /**
//    * Perform a single reduction step
//    */
//   step(): number {
//     if (typeof this.network.step === 'function') {
//       const result = this.network.step();
//       return typeof result === 'boolean' ? (result ? 1 : 0) : result;
//     } else {
//       return this.network.reduce(1);
//     }
//   }
// }

// ========== Plugin Factory ==========

/**
 * Create a new plugin network
 */
export function createPluginNetwork(plugins: IPlugin[] = [], name: string): PluginNetwork {
  // const network = Network('PluginNetwork');
  const pluginNetwork = new PluginNetwork(plugins, name);
  
  // Register provided plugins
  for (const plugin of plugins) {
    pluginNetwork.registerPlugin(plugin);
  }
  
  return pluginNetwork;
}

// ========== Standard Plugins ==========

/**
 * Time Travel plugin for undo/redo functionality
 */
export class TimeTravelPlugin extends BasePlugin {
  private history: any[] = [];
  private currentIndex: number = -1;
  private maxHistory: number = 100;
  
  constructor(options: {
    id?: string;
    name?: string;
    description?: string;
    version?: string;
    dependencies?: string[];
    config?: {
      maxHistory?: number;
    };
  } = {}) {
    super({
      id: options.id || 'time-travel',
      name: options.name || 'Time Travel',
      description: options.description || 'Provides undo/redo functionality',
      version: options.version || '1.0.0',
      dependencies: options.dependencies,
      config: options.config
    });
    
    if (options.config?.maxHistory) {
      this.maxHistory = options.config.maxHistory;
    }
  }
  
  initialize(network: INetwork): void {
    this.network = network;
    
    // Listen for network changes
    if (network instanceof PluginNetwork) {
      network.addEventListener(EventType.NETWORK_REDUCED, this.onNetworkReduced.bind(this));
    }
    
    // Clear history
    this.history = [];
    this.currentIndex = -1;
    
    // Take initial snapshot
    this.takeSnapshot();
  }
  
  shutdown(): void {
    // Remove event listeners
    if (this.network instanceof PluginNetwork) {
      this.network.removeEventListener(EventType.NETWORK_REDUCED, this.onNetworkReduced.bind(this));
    }
    
    super.shutdown();
  }
  
  /**
   * Event handler for network reductions
   */
  private onNetworkReduced(event: IEvent): void {
    if (event.data?.reduced) {
      this.takeSnapshot();
    }
  }
  
  /**
   * Take a snapshot of the current network state
   */
  private takeSnapshot(): void {
    if (!this.network) return;
    
    // Create snapshot
    const snapshot = this.createSnapshot();
    
    // If we're not at the end of history, truncate
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }
    
    // Add snapshot to history
    this.history.push(snapshot);
    this.currentIndex++;
    
    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }
  }
  
  /**
   * Create a snapshot of the current network state
   */
  private createSnapshot(): any {
    if (!this.network) return null;
    
    // Get agents and connections safely
    const agents = typeof (this.network as any).getAgents === 'function' 
      ? (this.network as any).getAgents() 
      : this.network.getAllAgents();
      
    const connections = typeof (this.network as any).getConnections === 'function'
      ? (this.network as any).getConnections()
      : this.network.getAllConnections();
    
    // Serialize agents, connections, and rules
    return {
      agents: agents.map((agent: IAgent) => ({
        id: agent._agentId,
        name: agent.name,
        type: agent.type || 'unknown',
        value: JSON.parse(JSON.stringify(agent.value))
      })),
      connections: connections.map((conn: IConnection) => ({
        from: {
          agentId: conn.source?._agentId,
          portName: conn.sourcePort?.name
        },
        to: {
          agentId: conn.destination?._agentId,
          portName: conn.destinationPort?.name
        }
      })),
      timestamp: Date.now()
    };
  }
  
  /**
   * Undo the last network change
   */
  undo(): boolean {
    if (this.currentIndex <= 0) return false;
    
    this.currentIndex--;
    this.restoreSnapshot(this.history[this.currentIndex]);
    return true;
  }
  
  /**
   * Redo a previously undone network change
   */
  redo(): boolean {
    if (this.currentIndex >= this.history.length - 1) return false;
    
    this.currentIndex++;
    this.restoreSnapshot(this.history[this.currentIndex]);
    return true;
  }
  
  /**
   * Restore a network snapshot
   */
  private restoreSnapshot(snapshot: any): void {
    if (!this.network || !snapshot) return;
    
    // TODO: Implement snapshot restoration
    // This is complex and requires deep knowledge of the network internals
    
    // For now, just emit an event
    if (this.network instanceof PluginNetwork) {
      this.network.emit('time-travel-restored', { snapshot });
    }
  }
  
  /**
   * Get the current history state
   */
  getHistoryState(): { 
    canUndo: boolean; 
    canRedo: boolean; 
    historySize: number;
    currentIndex: number;
  } {
    return {
      canUndo: this.currentIndex > 0,
      canRedo: this.currentIndex < this.history.length - 1,
      historySize: this.history.length,
      currentIndex: this.currentIndex
    };
  }
}

/**
 * Reactivity plugin for reactive programming
 */
export class ReactivityPlugin extends BasePlugin {
  constructor(options: {
    id?: string;
    name?: string;
    description?: string;
    version?: string;
    dependencies?: string[];
    config?: Record<string, any>;
  } = {}) {
    super({
      id: options.id || 'reactivity',
      name: options.name || 'Reactivity',
      description: options.description || 'Provides reactive programming capabilities',
      version: options.version || '1.0.0',
      dependencies: options.dependencies,
      config: options.config
    });
  }
  
  initialize(network: INetwork): void {
    this.network = network;
    
    // Register rules for reactive agents
    this.registerReactiveRules();
  }
  
  /**
   * Register rules for reactive operations
   */
  private registerReactiveRules(): void {
    if (!this.network) return;
    
    // Define standard reactive agent types (useful for future extensions)
    // const reactiveAgentTypes = ['Signal', 'Derived', 'Effect', 'Resource'];
    
    // Create reactive agents if they don't exist
    let changeAgent = this.network.findAgents({ name: 'ReactiveChange' })[0];
    let observerAgent = this.network.findAgents({ name: 'ReactiveObserver' })[0];
    
    if (!changeAgent) {
      changeAgent = Agent('ReactiveChange', {}, { main: Port('main', 'main') });
      this.network.addAgent(changeAgent);
    }
    
    if (!observerAgent) {
      observerAgent = Agent('ReactiveObserver', {}, { notify: Port('notify', 'main') });
      this.network.addAgent(observerAgent);
    }
    
    // Create a rule for reactive propagation using the actual port objects
    this.network.addRule(ActionRule(
      changeAgent.ports.main,
      observerAgent.ports.notify,
      (change, observer, network) => {
        // Mark the observer as dirty
        observer.value.dirty = true;
        
        // If the observer is an effect, schedule it to run
        if (observer.name === 'Effect' && !observer.value.disposed) {
          // Queue the effect to run
          if (this.network instanceof PluginNetwork) {
            this.network.emit('effect-queued', { effectId: observer._agentId });
          }
        }
        
        // If the observer has its own observers, notify them
        if (observer.value.observers && observer.value.observers.length > 0) {
          const results = [change, observer];
          
          for (const observerId of observer.value.observers) {
            const observerAgent = network.getAgent(observerId);
            if (observerAgent) {
              // Create a new change notification
              const newChange = Agent('ReactiveChange', {
                sourceId: observer._agentId,
                value: observer.value.current,
                timestamp: Date.now()
              }, {
                main: Port('main', 'main')
              });
              
              // Add agent to network
              network.addAgent(newChange);
              
              // Add to results
              results.push(newChange);
              
              // Try to connect the agents
              (network as any).connect?.(newChange, 'main', observerAgent, 'notify');
            }
          }
          
          return results;
        }
        
        return [change, observer];
      }
    ));
  }
  
  /**
   * Create a reactive agent
   */
  createReactiveAgent<T>(
    agentName: string, // Changed parameter name to avoid unused warning
    initialValue: T,
    options: {
      type?: string;
      equals?: (prev: T, next: T) => boolean;
    } = {}
  ): IAgent {
    if (!this.network) {
      throw new Error('Cannot create reactive agent: network not initialized');
    }
    
    // Create the agent
    const agent = Agent(options.type || 'Signal', {
      current: initialValue,
      displayName: agentName, // Use the parameter
      dirty: false,
      observers: [],
      equals: options.equals || ((a, b) => a === b)
    }, {
      main: Port('main', 'main'),
      notify: Port('notify', 'aux'),
      read: Port('read', 'aux'),
      write: Port('write', 'aux')
    });
    
    // Add to network
    this.network.addAgent(agent);
    
    return agent;
  }
  
  /**
   * Create an effect that runs when dependencies change
   */
  createEffect(
    effectFn: () => void,
    options: {
      name?: string;
      onError?: (error: Error) => void;
    } = {}
  ): () => void {
    if (!this.network) {
      throw new Error('Cannot create effect: network not initialized');
    }
    
    // Create the effect agent
    const effectAgent = Agent('Effect', {
      fn: effectFn,
      dirty: true,
      disposed: false,
      dependencies: [],
      observers: [],
      error: null,
      name: options.name,
      onError: options.onError
    }, {
      main: Port('main', 'main'),
      notify: Port('notify', 'aux')
    });
    
    // Add to network
    this.network.addAgent(effectAgent);
    
    // Run the effect immediately
    try {
      effectFn();
    } catch (error) {
      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
    
    // Return a dispose function
    return () => {
      effectAgent.value.disposed = true;
      
      // Clean up connections
      for (const depId of effectAgent.value.dependencies) {
        const dep = this.network?.getAgent(depId);
        if (dep) {
          // Remove this effect from the dependency's observers
          dep.value.observers = dep.value.observers.filter(
            (id: string) => id !== effectAgent._agentId
          );
        }
      }
    };
  }
}

/**
 * Synchronization plugin for distributed networks
 */
export class SynchronizationPlugin extends BasePlugin {
  constructor(options: {
    id?: string;
    name?: string;
    description?: string;
    version?: string;
    dependencies?: string[];
    config?: Record<string, any>;
  } = {}) {
    super({
      id: options.id || 'synchronization',
      name: options.name || 'Synchronization',
      description: options.description || 'Provides network synchronization capabilities',
      version: options.version || '1.0.0',
      dependencies: options.dependencies,
      config: options.config
    });
  }
  
  initialize(network: INetwork): void {
    this.network = network;
    
    // Register sync rules
    this.registerSyncRules();
  }
  
  /**
   * Register rules for synchronization
   */
  private registerSyncRules(): void {
    if (!this.network) return;
    
    // Define sync agent types (useful for future extensions)
    // const syncAgentTypes = ['SyncSend', 'SyncReceive', 'SyncManager'];
    
    // Create sync agents if they don't exist
    let syncAgent = this.network.findAgents({ name: 'SyncAgent' })[0];
    let dataAgent = this.network.findAgents({ name: 'SyncableData' })[0];
    
    if (!syncAgent) {
      syncAgent = Agent('SyncAgent', {}, { sync: Port('sync', 'main') });
      this.network.addAgent(syncAgent);
    }
    
    if (!dataAgent) {
      dataAgent = Agent('SyncableData', {}, { sync: Port('sync', 'main') });
      this.network.addAgent(dataAgent);
    }
    
    // Create rules for sync operations
    // These are simplified examples; real implementation would be more complex
    this.network.addRule(ActionRule(
      syncAgent.ports.sync,
      dataAgent.ports.sync,
      (syncAgent, data, network) => {
        // Create a serialized version of the data
        const serialized = JSON.stringify(data.value);
        
        // Update the sync agent with the data
        syncAgent.value.lastData = serialized;
        syncAgent.value.lastUpdate = Date.now();
        
        // If we have a sync manager, notify it
        if (syncAgent.value.managerId) {
          const manager = network.getAgent(syncAgent.value.managerId);
          if (manager) {
            // Create a notification
            const notification = Agent('SyncNotification', {
              sourceId: syncAgent._agentId,
              data: serialized,
              timestamp: Date.now()
            }, {
              main: Port('main', 'main')
            });
            
            // Add the notification to the network
            network.addAgent(notification);
            
            // Connect the agents
            (network as any).connect?.(notification, 'main', manager, 'main');
            
            return [syncAgent, data, notification];
          }
        }
        
        return [syncAgent, data];
      }
    ));
  }
  
  /**
   * Create a synchronizable data structure
   */
  createSyncedData<T>(
    initialValue: T,
    options: {
      id?: string;
      type?: string;
    } = {}
  ): IAgent {
    if (!this.network) {
      throw new Error('Cannot create synced data: network not initialized');
    }
    
    // Create the data agent
    const dataAgent = Agent(options.type || 'SyncableData', initialValue, {
      main: Port('main', 'main'),
      sync: Port('sync', 'aux')
    });
    
    // Add to network
    this.network.addAgent(dataAgent);
    
    // Create a sync agent for this data
    const syncAgent = Agent('SyncAgent', {
      dataId: dataAgent._agentId,
      syncId: options.id || dataAgent._agentId,
      lastUpdate: Date.now(),
      lastData: JSON.stringify(initialValue),
      managerId: null
    }, {
      sync: Port('sync', 'main'),
      manage: Port('manage', 'aux')
    });
    
    // Add to network
    this.network.addAgent(syncAgent);
    
    // Connect the agents
    (this.network as any).connect?.(dataAgent, 'sync', syncAgent, 'sync');
    
    return dataAgent;
  }
  
  /**
   * Create a sync manager for coordinating synchronization
   */
  createSyncManager(
    options: {
      transport?: 'websocket' | 'postmessage' | 'custom';
      endpoint?: string;
      onMessage?: (data: any) => void;
      onConnect?: () => void;
      onDisconnect?: () => void;
    } = {}
  ): IAgent {
    if (!this.network) {
      throw new Error('Cannot create sync manager: network not initialized');
    }
    
    // Create the manager agent
    const managerAgent = Agent('SyncManager', {
      connected: false,
      transport: options.transport || 'custom',
      endpoint: options.endpoint,
      agents: [],
      lastSync: null,
      onMessage: options.onMessage,
      onConnect: options.onConnect,
      onDisconnect: options.onDisconnect
    }, {
      main: Port('main', 'main'),
      connect: Port('connect', 'aux'),
      disconnect: Port('disconnect', 'aux')
    });
    
    // Add to network
    this.network.addAgent(managerAgent);
    
    return managerAgent;
  }
}

// ========== Effect System ==========

/**
 * Effect description interface
 */
export interface IEffectDescription {
  /** Effect type */
  type: string;
  
  /** Effect data */
  data?: any;
  
  /** Effect metadata */
  meta?: Record<string, any>;
}

/**
 * Effect handler function type
 */
export type EffectHandler = (effect: IEffectDescription) => any;

/**
 * Effect manager for handling all side effects
 */
export class EffectManager {
  private handlers: Map<string, EffectHandler> = new Map();
  
  /**
   * Register an effect handler
   */
  registerHandler(type: string, handler: EffectHandler): void {
    this.handlers.set(type, handler);
  }
  
  /**
   * Unregister an effect handler
   */
  unregisterHandler(type: string): void {
    this.handlers.delete(type);
  }
  
  /**
   * Handle an effect
   */
  handleEffect(effect: IEffectDescription): any {
    // Check if we have a handler for this effect type
    if (this.handlers.has(effect.type)) {
      try {
        return this.handlers.get(effect.type)!(effect);
      } catch (error) {
        throw error;
      }
    } else {
      throw new Error(`No handler registered for effect type: ${effect.type}`);
    }
  }
  
  /**
   * Check if we have a handler for an effect type
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }
  
  /**
   * Get all registered effect types
   */
  getEffectTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Effect plugin for managing side effects
 */
export class EffectPlugin extends BasePlugin {
  private effectManager: EffectManager;
  
  constructor(options: {
    id?: string;
    name?: string;
    description?: string;
    version?: string;
    dependencies?: string[];
    config?: Record<string, any>;
  } = {}) {
    super({
      id: options.id || 'effect',
      name: options.name || 'Effect System',
      description: options.description || 'Provides a unified system for handling side effects',
      version: options.version || '1.0.0',
      dependencies: options.dependencies,
      config: options.config
    });
    
    this.effectManager = new EffectManager();
  }
  
  initialize(network: INetwork): void {
    this.network = network;
    
    // Register effect rules
    this.registerEffectRules();
    
    // Register standard effect handlers
    this.registerStandardHandlers();
  }
  
  /**
   * Register rules for effect operations
   */
  private registerEffectRules(): void {
    if (!this.network) return;
    
    // Create effect agents if they don't exist
    let effectAgent = this.network.findAgents({ name: 'Effect' })[0];
    let handlerAgent = this.network.findAgents({ name: 'EffectHandler' })[0];
    
    if (!effectAgent) {
      effectAgent = Agent('Effect', {}, { perform: Port('perform', 'main'), result: Port('result', 'aux') });
      this.network.addAgent(effectAgent);
    }
    
    if (!handlerAgent) {
      handlerAgent = Agent('EffectHandler', {}, { handle: Port('handle', 'main') });
      this.network.addAgent(handlerAgent);
    }
    
    // Create rules for effect handling
    this.network.addRule(ActionRule(
      effectAgent.ports.perform,
      handlerAgent.ports.handle,
      (effect, handler, network) => {
        // Use a non-async function that returns ActionReturn
        // Extract effect description
        const effectDesc: IEffectDescription = {
          type: effect.value.type,
          data: effect.value.data,
          meta: effect.value.meta
        };
        
        try {
          // Since we can't use async/await in the action function, we'll handle this synchronously
          // This is not ideal but necessary for type compatibility
          let result;
          try {
            result = this.effectManager.handleEffect(effectDesc);
          } catch (err) {
            console.error('Error handling effect:', err);
            result = { error: String(err) };
          }
          
          // Create a result agent
          const resultAgent = Agent('EffectResult', {
            effectId: effect._agentId,
            result,
            error: null,
            status: 'success',
            timestamp: Date.now()
          }, {
            main: Port('main', 'main')
          });
          
          // Update effect status
          effect.value.status = 'completed';
          effect.value.result = result;
          
          // Add the result agent to the network
          network.addAgent(resultAgent);
            
          // Connect the agents
          (network as any).connect?.(resultAgent, 'main', effect, 'result');
          
          return [effect, handler, resultAgent];
        } catch (error) {
          // Create an error result agent
          const errorAgent = Agent('EffectError', {
            effectId: effect._agentId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            status: 'error',
            timestamp: Date.now()
          }, {
            main: Port('main', 'main')
          });
          
          // Update effect status
          effect.value.status = 'error';
          effect.value.error = error instanceof Error ? error : new Error(String(error));
          
          // Add the error agent to the network
          network.addAgent(errorAgent);
            
          // Connect the agents
          (network as any).connect?.(errorAgent, 'main', effect, 'result');
          
          return [effect, handler, errorAgent];
        }
      }
    ));
  }
  
  /**
   * Register standard effect handlers
   */
  private registerStandardHandlers(): void {
    // Register fetch handler
    this.effectManager.registerHandler('fetch', async (effect) => {
      const url = typeof effect.data === 'string' ? effect.data : effect.data?.url;
      
      if (!url) {
        throw new Error('Fetch effect requires a URL');
      }
      
      const options = typeof effect.data === 'object' ? effect.data : {};
      
      try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        
        // Parse response based on content type
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        } else {
          return await response.text();
        }
      } catch (error) {
        throw error;
      }
    });
    
    // Register timeout handler
    this.effectManager.registerHandler('timeout', async (effect) => {
      const ms = typeof effect.data === 'number' ? effect.data : 0;
      
      return new Promise(resolve => {
        setTimeout(() => resolve(true), ms);
      });
    });
    
    // Register storage handler
    this.effectManager.registerHandler('storage', async (effect) => {
      const { operation, key, value } = effect.data || {};
      
      if (!operation) {
        throw new Error('Storage effect requires an operation');
      }
      
      switch (operation) {
        case 'get':
          if (typeof key !== 'string') {
            throw new Error('Storage get operation requires a key');
          }
          return localStorage.getItem(key);
        
        case 'set':
          if (typeof key !== 'string') {
            throw new Error('Storage set operation requires a key');
          }
          localStorage.setItem(key, value);
          return true;
        
        case 'remove':
          if (typeof key !== 'string') {
            throw new Error('Storage remove operation requires a key');
          }
          localStorage.removeItem(key);
          return true;
        
        case 'clear':
          localStorage.clear();
          return true;
        
        default:
          throw new Error(`Unknown storage operation: ${operation}`);
      }
    });
  }
  
  /**
   * Register a custom effect handler
   */
  registerEffectHandler(type: string, handler: EffectHandler): void {
    this.effectManager.registerHandler(type, handler);
  }
  
  /**
   * Unregister an effect handler
   */
  unregisterEffectHandler(type: string): void {
    this.effectManager.unregisterHandler(type);
  }
  
  /**
   * Create an effect agent
   */
  createEffect(
    effectDesc: IEffectDescription,
    options: {
      name?: string;
      onResult?: (result: any) => void;
      onError?: (error: Error) => void;
    } = {}
  ): IAgent {
    if (!this.network) {
      throw new Error('Cannot create effect: network not initialized');
    }
    
    // Check if we have a handler for this effect type
    if (!this.effectManager.hasHandler(effectDesc.type)) {
      throw new Error(`No handler registered for effect type: ${effectDesc.type}`);
    }
    
    // Create the effect agent
    const effectAgent = Agent('Effect', {
      ...effectDesc,
      status: 'pending',
      result: null,
      error: null,
      timestamp: Date.now(),
      name: options.name,
      onResult: options.onResult,
      onError: options.onError
    }, {
      perform: Port('perform', 'main'),
      result: Port('result', 'aux')
    });
    
    // Add to network
    this.network.addAgent(effectAgent);
    
    // Find a handler for this effect type
    const handlers = this.network.findAgents({ name: 'EffectHandler' });
    let handler: IAgent | undefined;
    
    if (handlers.length === 0) {
      // Create a handler
      handler = Agent('EffectHandler', {
        types: [effectDesc.type]
      }, {
        handle: Port('handle', 'main')
      });
      
      // Add to network
      this.network.addAgent(handler);
    } else {
      handler = handlers[0];
    }
    
    // Connect effect to handler
    (this.network as any).connect?.(effectAgent, 'perform', handler, 'handle');
    
    return effectAgent;
  }
  
  /**
   * Perform an effect and get the result
   */
  async performEffect(effectDesc: IEffectDescription): Promise<any> {
    const effectAgent = this.createEffect(effectDesc);
    
    return new Promise((resolve, reject) => {
      // Check status periodically
      const interval = setInterval(() => {
        if (effectAgent.value.status === 'completed') {
          clearInterval(interval);
          resolve(effectAgent.value.result);
        } else if (effectAgent.value.status === 'error') {
          clearInterval(interval);
          reject(effectAgent.value.error);
        }
      }, 50);
    });
  }
}

// Export standard plugins
export const standardPlugins = {
  TimeTravel: TimeTravelPlugin,
  Reactivity: ReactivityPlugin,
  Synchronization: SynchronizationPlugin,
  Effect: EffectPlugin
};