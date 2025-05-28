/**
 * Unified Reactive Agent Model
 * 
 * This module harmonizes the interaction net paradigm with reactive programming,
 * providing a unified programming model where each agent's value is a reactive cell
 * whose changes propagate through connections automatically.
 */
import { Agent, IAgent, AgentId, AgentName } from './agent';
import { Port, BoundPort } from './port';
import { Network, INetwork } from './network';
import { ActionRule } from './rule';

// ========== Types ==========

/**
 * Options for reactive agent creation
 */
export interface ReactiveAgentOptions<T> {
  /** Name for debugging purposes */
  name?: string;
  
  /** Custom equality function */
  equals?: (prev: T, next: T) => boolean;
  
  /** Track dependencies automatically */
  trackDependencies?: boolean;
  
  /** Notify observers automatically */
  notifyObservers?: boolean;
  
  /** Agent type */
  type?: string;
}

/**
 * Value stored in a reactive agent
 */
export interface ReactiveAgentValue<T> {
  /** Current value */
  current: T;
  
  /** Previous value */
  previous?: T;
  
  /** Last update timestamp */
  updatedAt: number;
  
  /** List of observer agent IDs */
  observers: Set<AgentId>;
  
  /** List of dependency agent IDs */
  dependencies: Set<AgentId>;
  
  /** Equals function for determining changes */
  equals: (prev: T, next: T) => boolean;
  
  /** Flag for tracking dependencies */
  trackDependencies: boolean;
  
  /** Flag for notifying observers */
  notifyObservers: boolean;
  
  /** Custom metadata */
  meta: Record<string, any>;
}

/**
 * Interface for reactive getter/setter
 */
export interface IReactive<T> {
  /** Get the current value */
  (): T;
  
  /** Set a new value */
  (value: T): T;
  
  /** Get the current value without tracking */
  peek(): T;
  
  /** Subscribe to changes */
  subscribe(fn: (value: T) => void): () => void;
  
  /** Get the agent ID */
  readonly _agentId: AgentId;
}

// ========== Reactive Tracking Context ==========

/** Global tracking stack for dependency tracking */
const trackingStack: AgentId[][] = [];

/**
 * Start tracking dependencies
 */
export function startTracking(): void {
  trackingStack.push([]);
}

/**
 * Stop tracking dependencies and return the tracked dependencies
 */
export function stopTracking(): AgentId[] {
  return trackingStack.pop() || [];
}

/**
 * Get the current tracking context
 */
export function getTrackingContext(): AgentId[] | undefined {
  if (trackingStack.length === 0) return undefined;
  return trackingStack[trackingStack.length - 1];
}

/**
 * Track a dependency
 */
export function trackDependency(agentId: AgentId): void {
  const context = getTrackingContext();
  if (context) {
    if (!context.includes(agentId)) {
      context.push(agentId);
    }
  }
}

// ========== Reactive Network ==========

/**
 * Shared reactive network
 */
let reactiveNetwork: INetwork | null = null;

/**
 * Initialize the reactive system
 */
export function initReactiveSystem(network?: INetwork): INetwork {
  // Create a new network if none provided
  reactiveNetwork = network || Network("reactive");
  
  // Register reactive rules
  registerReactiveRules(reactiveNetwork);
  
  return reactiveNetwork;
}

/**
 * Get the current reactive network
 */
export function getReactiveNetwork(): INetwork {
  if (!reactiveNetwork) {
    return initReactiveSystem();
  }
  return reactiveNetwork;
}

/**
 * Set the current reactive network
 */
export function setReactiveNetwork(network: INetwork): void {
  reactiveNetwork = network;
}

// ========== Core Reactive Agents ==========

/**
 * Create a reactive agent
 */
export function ReactiveAgent<T>(
  initialValue: T,
  options: ReactiveAgentOptions<T> = {}
): IAgent<"ReactiveAgent", ReactiveAgentValue<T>> {
  // Create the agent
  const agent = Agent("ReactiveAgent", {
    current: initialValue,
    previous: undefined,
    updatedAt: Date.now(),
    observers: new Set<AgentId>(),
    dependencies: new Set<AgentId>(),
    equals: options.equals || ((a, b) => a === b),
    trackDependencies: options.trackDependencies !== false,
    notifyObservers: options.notifyObservers !== false,
    meta: {}
  }, {
    main: Port("main", "main"),
    notify: Port("notify", "aux"),
    observe: Port("observe", "aux"),
    read: Port("read", "aux"),
    write: Port("write", "aux")
  }, options.type || "reactive");
  
  // Add to the reactive network
  const network = getReactiveNetwork();
  network.addAgent(agent);
  
  return agent;
}

/**
 * Create a derived reactive agent
 */
export function DerivedAgent<T>(
  computeFn: () => T,
  options: ReactiveAgentOptions<T> = {}
): IAgent<"DerivedAgent", ReactiveAgentValue<T> & { computeFn: () => T, dirty: boolean }> {
  // Create the agent with an undefined initial value
  const agent = Agent("DerivedAgent", {
    current: undefined as unknown as T,
    previous: undefined,
    updatedAt: Date.now(),
    observers: new Set<AgentId>(),
    dependencies: new Set<AgentId>(),
    equals: options.equals || ((a, b) => a === b),
    trackDependencies: options.trackDependencies !== false,
    notifyObservers: options.notifyObservers !== false,
    meta: {},
    computeFn,
    dirty: true
  }, {
    main: Port("main", "main"),
    notify: Port("notify", "aux"),
    observe: Port("observe", "aux"),
    read: Port("read", "aux"),
    compute: Port("compute", "aux")
  }, options.type || "derived");
  
  // Add to the reactive network
  const network = getReactiveNetwork();
  network.addAgent(agent);
  
  // Compute initial value
  computeValue(agent);
  
  return agent;
}

/**
 * Create an effect agent
 */
export function EffectAgent(
  effectFn: () => void,
  options: ReactiveAgentOptions<void> = {}
): IAgent<"EffectAgent", { 
  effectFn: () => void, 
  dependencies: Set<AgentId>,
  lastRun: number,
  disposed: boolean,
  error: Error | null,
  meta: Record<string, any>
}> {
  // Create the agent
  const agent = Agent("EffectAgent", {
    effectFn,
    dependencies: new Set<AgentId>(),
    lastRun: 0,
    disposed: false,
    error: null,
    meta: {}
  }, {
    main: Port("main", "main"),
    trigger: Port("trigger", "aux"),
    dispose: Port("dispose", "aux")
  }, options.type || "effect");
  
  // Add to the reactive network
  const network = getReactiveNetwork();
  network.addAgent(agent);
  
  // Run the effect once
  runEffect(agent);
  
  return agent;
}

// ========== Helper Functions ==========

/**
 * Compute the value of a derived agent
 */
function computeValue<T>(
  agent: IAgent<"DerivedAgent", ReactiveAgentValue<T> & { computeFn: () => T, dirty: boolean }>
): T {
  if (!agent.value.dirty) {
    return agent.value.current;
  }
  
  // Store previous dependencies
  const prevDeps = Array.from(agent.value.dependencies);
  
  // Track dependencies during computation
  startTracking();
  let newValue: T;
  try {
    newValue = agent.value.computeFn();
  } catch (error) {
    stopTracking();
    throw error;
  }
  const newDeps = stopTracking();
  
  // Update dependencies
  updateDependencies(agent, prevDeps, newDeps);
  
  // Update value if changed
  if (!agent.value.equals(agent.value.current, newValue)) {
    agent.value.previous = agent.value.current;
    agent.value.current = newValue;
    agent.value.updatedAt = Date.now();
    
    // Notify observers
    if (agent.value.notifyObservers) {
      notifyObservers(agent);
    }
  }
  
  // Clear dirty flag
  agent.value.dirty = false;
  
  return agent.value.current;
}

/**
 * Run an effect
 */
function runEffect(
  agent: IAgent<"EffectAgent", { 
    effectFn: () => void, 
    dependencies: Set<AgentId>,
    lastRun: number,
    disposed: boolean,
    error: Error | null,
    meta: Record<string, any>
  }>
): void {
  if (agent.value.disposed) return;
  
  // Store previous dependencies
  const prevDeps = Array.from(agent.value.dependencies);
  
  // Track dependencies during effect
  startTracking();
  try {
    agent.value.effectFn();
    agent.value.error = null;
  } catch (error) {
    agent.value.error = error instanceof Error ? error : new Error(String(error));
    console.error("Error in effect:", error);
  }
  const newDeps = stopTracking();
  
  // Update dependencies
  updateDependencies(agent, prevDeps, newDeps);
  
  // Update last run timestamp
  agent.value.lastRun = Date.now();
}

/**
 * Update an agent's dependencies
 */
function updateDependencies(
  agent: IAgent,
  prevDeps: AgentId[],
  newDeps: AgentId[]
): void {
  const network = getReactiveNetwork();
  
  // Remove old dependencies
  for (const depId of prevDeps) {
    if (!newDeps.includes(depId)) {
      const dep = network.getAgent(depId);
      if (dep && 'observers' in dep.value) {
        (dep.value.observers as Set<AgentId>).delete(agent._agentId);
      }
    }
  }
  
  // Add new dependencies
  for (const depId of newDeps) {
    if (!prevDeps.includes(depId)) {
      const dep = network.getAgent(depId);
      if (dep && 'observers' in dep.value) {
        (dep.value.observers as Set<AgentId>).add(agent._agentId);
      }
    }
  }
  
  // Update the agent's dependencies
  if ('dependencies' in agent.value) {
    (agent.value.dependencies as Set<AgentId>).clear();
    for (const depId of newDeps) {
      (agent.value.dependencies as Set<AgentId>).add(depId);
    }
  }
}

/**
 * Notify an agent's observers of changes
 */
function notifyObservers(agent: IAgent): void {
  if (!('observers' in agent.value)) return;
  
  const network = getReactiveNetwork();
  const observers = agent.value.observers as Set<AgentId>;
  
  // Create notification agents for each observer
  // Convert to array first to avoid iteration issues
  const observerIds = Array.from(observers);
  for (const observerId of observerIds) {
    const observer = network.getAgent(observerId);
    if (!observer) continue;
    
    if (observer.name === "DerivedAgent") {
      // Mark derived agents as dirty
      observer.value.dirty = true;
    } else if (observer.name === "EffectAgent" && !observer.value.disposed) {
      // Run effects
      runEffect(observer as any);
    }
  }
}

// ========== Reactive Rules ==========

/**
 * Register rules for reactive operations
 */
function registerReactiveRules(network: INetwork): void {
  // Rule: ReactiveChangeAgent <-> ReactiveAgent
  network.addRule({
    type: "action",
    name: "ReactiveChange",
    matchInfo: {
      agentName1: "ReactiveChangeAgent", 
      portName1: "main", 
      agentName2: "ReactiveAgent", 
      portName2: "notify"
    },
    action: (change, agent, network) => {
      // Mark the agent as changed
      if (agent.name === "DerivedAgent") {
        agent.value.dirty = true;
      }
      
      // Notify observers
      if (agent.value.notifyObservers) {
        notifyObservers(agent);
      }
      
      return [change, agent];
    }
  });
  
  // Rule: ReactiveReadAgent <-> ReactiveAgent
  network.addRule({
    type: "action",
    name: "ReactiveRead",
    matchInfo: {
      agentName1: "ReactiveReadAgent", 
      portName1: "main", 
      agentName2: "ReactiveAgent", 
      portName2: "read"
    },
    action: (read, agent, network) => {
      // Track as dependency if tracking is enabled
      if (agent.value.trackDependencies) {
        trackDependency(agent._agentId);
      }
      
      // Update read agent with current value
      read.value.result = agent.value.current;
      
      return [read, agent];
    }
  });
  
  // Rule: ReactiveWriteAgent <-> ReactiveAgent
  network.addRule({
    type: "action",
    name: "ReactiveWrite",
    matchInfo: {
      agentName1: "ReactiveWriteAgent", 
      portName1: "main", 
      agentName2: "ReactiveAgent", 
      portName2: "write"
    },
    action: (write, agent, network) => {
      const newValue = write.value.value;
      const prevValue = agent.value.current;
      
      // Check if value actually changed
      if (!agent.value.equals(prevValue, newValue)) {
        // Update value
        agent.value.previous = prevValue;
        agent.value.current = newValue;
        agent.value.updatedAt = Date.now();
        
        // Notify observers
        if (agent.value.notifyObservers) {
          notifyObservers(agent);
        }
      }
      
      return [write, agent];
    }
  });
  
  // Rule: ReactiveObserveAgent <-> ReactiveAgent
  network.addRule({
    type: "action",
    name: "ReactiveObserve",
    matchInfo: {
      agentName1: "ReactiveObserveAgent", 
      portName1: "main", 
      agentName2: "ReactiveAgent", 
      portName2: "observe"
    },
    action: (observe, agent, network) => {
      // Add observer to agent's observers
      if (!agent.value.observers.has(observe.value.observerId)) {
        agent.value.observers.add(observe.value.observerId);
      }
      
      return [observe, agent];
    }
  });
  
  // Rule: ReactiveTriggerAgent <-> EffectAgent
  network.addRule({
    type: "action",
    name: "ReactiveTrigger",
    matchInfo: {
      agentName1: "ReactiveTriggerAgent", 
      portName1: "main", 
      agentName2: "EffectAgent", 
      portName2: "trigger"
    },
    action: (trigger, effect, network) => {
      // Run the effect if not disposed
      if (!effect.value.disposed) {
        runEffect(effect as IAgent<"EffectAgent", { 
          effectFn: () => void, 
          dependencies: Set<AgentId>,
          lastRun: number,
          disposed: boolean,
          error: Error | null,
          meta: Record<string, any>
        }>);
      }
      
      return [trigger, effect];
    }
  });
  
  // Rule: ReactiveDisposeAgent <-> EffectAgent
  network.addRule({
    type: "action",
    name: "ReactiveDispose",
    matchInfo: {
      agentName1: "ReactiveDisposeAgent", 
      portName1: "main", 
      agentName2: "EffectAgent", 
      portName2: "dispose"
    },
    action: (dispose, effect, network) => {
      // Mark effect as disposed
      effect.value.disposed = true;
      
      // Clean up dependencies
      const deps = Array.from(effect.value.dependencies);
      // Convert to string array explicitly
      const depsAsStrings = deps.map(dep => String(dep));
      updateDependencies(effect, depsAsStrings, []);
      
      return [dispose, effect];
    }
  });
}

// ========== Public API ==========

/**
 * Create a reactive value
 */
export function createReactive<T>(
  initialValue: T,
  options: ReactiveAgentOptions<T> = {}
): IReactive<T> {
  // Create the agent
  const agent = ReactiveAgent(initialValue, options);
  
  // Create the reactive interface
  const reactive = function(this: any, value: T): T {
    // When called with no arguments, read the value
    if (arguments.length === 0) {
      // Track as dependency if in a tracking context
      trackDependency(agent._agentId);
      return agent.value.current;
    }
    
    // When called with one argument, set the value
    const newValue = value;
    
    // Check if value actually changed
    if (typeof newValue !== 'undefined' && !agent.value.equals(agent.value.current, newValue)) {
      // Update value
      agent.value.previous = agent.value.current;
      agent.value.current = newValue;
      agent.value.updatedAt = Date.now();
      
      // Notify observers
      if (agent.value.notifyObservers) {
        notifyObservers(agent);
      }
    }
    
    return newValue;
  } as IReactive<T>;
  
  // Add peek method
  reactive.peek = () => agent.value.current;
  
  // Add subscribe method
  reactive.subscribe = (fn: (value: T) => void) => {
    // Create an effect
    const effect = EffectAgent(() => {
      fn(agent.value.current);
    });
    
    // Add to observers
    agent.value.observers.add(effect._agentId);
    
    // Return unsubscribe function
    return () => {
      effect.value.disposed = true;
      agent.value.observers.delete(effect._agentId);
    };
  };
  
  // Add agent ID
  Object.defineProperty(reactive, '_agentId', {
    value: agent._agentId,
    writable: false,
    enumerable: false,
    configurable: false
  });
  
  return reactive;
}

/**
 * Create a computed (derived) reactive value
 */
export function createComputed<T>(
  computeFn: () => T,
  options: ReactiveAgentOptions<T> = {}
): IReactive<T> {
  // Create the agent
  const agent = DerivedAgent(computeFn, options);
  
  // Create the reactive interface
  const reactive = function(this: any): T {
    // Track as dependency if in a tracking context
    trackDependency(agent._agentId);
    
    // Compute value if dirty
    if (agent.value.dirty) {
      computeValue(agent);
    }
    
    return agent.value.current;
  } as IReactive<T>;
  
  // Add peek method
  reactive.peek = () => {
    // Compute value if dirty
    if (agent.value.dirty) {
      computeValue(agent);
    }
    return agent.value.current;
  };
  
  // Add subscribe method
  reactive.subscribe = (fn: (value: T) => void) => {
    // Create an effect
    const effect = EffectAgent(() => {
      fn(agent.value.current);
    });
    
    // Add to observers
    agent.value.observers.add(effect._agentId);
    
    // Return unsubscribe function
    return () => {
      effect.value.disposed = true;
      agent.value.observers.delete(effect._agentId);
    };
  };
  
  // Add agent ID
  Object.defineProperty(reactive, '_agentId', {
    value: agent._agentId,
    writable: false,
    enumerable: false,
    configurable: false
  });
  
  // Setter is not allowed for computed values
  Object.defineProperty(reactive, 'set', {
    value: () => {
      throw new Error('Cannot set a computed value');
    },
    writable: false,
    enumerable: false,
    configurable: false
  });
  
  return reactive;
}

/**
 * Create an effect
 */
export function createEffect(
  effectFn: () => void,
  options: ReactiveAgentOptions<void> = {}
): () => void {
  // Create the agent
  const agent = EffectAgent(effectFn, options);
  
  // Create the effect runner
  const run = () => {
    if (!agent.value.disposed) {
      runEffect(agent);
    }
  };
  
  // Add dispose method
  run.dispose = () => {
    agent.value.disposed = true;
    
    // Clean up dependencies
    const deps = Array.from(agent.value.dependencies);
    updateDependencies(agent, deps, []);
  };
  
  return run;
}

/**
 * Batch multiple reactive updates
 */
export function batch<T>(fn: () => T): T {
  // TODO: Implement batching with a transaction system
  return fn();
}

/**
 * Create a reactive root
 */
export function createRoot<T>(fn: () => T): T {
  // Clear tracking stack to prevent leaking dependencies
  const prevStack = [...trackingStack];
  trackingStack.length = 0;
  
  try {
    return fn();
  } finally {
    // Restore tracking stack
    trackingStack.length = 0;
    trackingStack.push(...prevStack);
  }
}

// Export additional APIs
export {
  computeValue,
  runEffect,
  updateDependencies,
  notifyObservers
};