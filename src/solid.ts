/**
 * Annette-Solid: A SolidJS-like reactive library using Annette's interaction nets
 * 
 * This implementation follows a hybrid architecture where:
 * - Annette manages the dependency graph structure and notification propagation
 * - JavaScript handles synchronous computation, dependency tracking, and effect execution
 */
import { 
  Agent, IAgent, Network, INetwork, Port, ActionRule, Connection,
  // Import additional Annette features
  EffectAgent, HandlerAgent, ResultScanner, Constructor,
  SyncAgent, RemoteAgent,
  createSharedMap, createSharedList, createSharedText, createSharedCounter,
  MapUpdater, ListUpdater, TextUpdater, CounterUpdater,
  createTextCRDTOperation
} from './index';
import { AutoNet } from './auto-net';

// ========== Types ==========

export interface SignalOptions<T> {
  name?: string;
  equals?: (prev: T, next: T) => boolean;
}

export interface ISignal<T> {
  (): T;
  (value: T): T;
  peek(): T;
  subscribe(fn: (value: T) => void): () => void;
}

export interface IMemo<T> extends ISignal<T> {}

export interface IEffect {
  (): void;
  dispose: () => void;
}

interface SignalAgentValue<T> {
  current: T;
  name?: string;
  equals?: (prev: T, next: T) => boolean;
}

interface MemoAgentValue<T> {
  computeFn: () => T;
  dependencies: Set<string>; // AgentIds
  cachedValue: T;
  dirty: boolean;
  managerAgentId: string;
  name?: string;
}

interface EffectAgentValue {
  effectFn: () => void;
  dependencies: Set<string>; // AgentIds
  disposed: boolean;
  name?: string;
}

interface SubscriptionManagerAgentValue {
  subscribers: Set<string>; // AgentIds
  sourceAgentId: string;
}

interface NotifyAgentValue {
  sourceAgentId: string;
  timestamp: number;
}

interface SubscribeAgentValue {
  subscriberAgentId: string;
  timestamp: number;
}

interface UnsubscribeAgentValue {
  subscriberAgentId: string;
  timestamp: number;
}

// ========== Global State and Tracking ==========

// The Annette network for reactive operations
let reactiveNetwork: INetwork;

// The AutoNet instance for dependency tracking
let autoNet: AutoNet;

// Global tracking stack for reactive context
const trackingStack: Array<Set<string>> = [];

// Queue for effects to run after the current batch
const effectQueue: Set<IAgent<"Effect", EffectAgentValue>> = new Set();

// Queue for subscription changes
const subscriptionQueue: Array<{ type: 'subscribe' | 'unsubscribe', source: string, subscriber: string }> = [];

// Batch processing state
let batchActive = false;
let batchPromise: Promise<void> | null = null;

// ========== Core Reactive Agents ==========

/**
 * Create a SignalAgent to hold reactive state
 */
function SignalAgent<T>(value: T, options: SignalOptions<T> = {}): IAgent<"Signal", SignalAgentValue<T>> {
  return Agent("Signal", {
    current: value,
    name: options.name,
    equals: options.equals
  }, {
    main: Port("main", "main"),
    manage_subs: Port("manage_subs", "main")
  });
}

/**
 * Create a MemoAgent for computed/memoized values
 */
function MemoAgent<T>(
  computeFn: () => T, 
  managerAgentId: string,
  name?: string
): IAgent<"Memo", MemoAgentValue<T>> {
  return Agent("Memo", {
    computeFn,
    dependencies: new Set<string>(),
    cachedValue: undefined as unknown as T, // Will be set on first computation
    dirty: true,
    managerAgentId,
    name
  }, {
    main: Port("main", "main"),
    manage_subs: Port("manage_subs", "main"),
    trigger_in: Port("trigger_in", "aux")
  });
}

/**
 * Create an EffectAgent for side effects
 */
function EffectAgent(
  effectFn: () => void,
  name?: string
): IAgent<"Effect", EffectAgentValue> {
  return Agent("Effect", {
    effectFn,
    dependencies: new Set<string>(),
    disposed: false,
    name
  }, {
    main: Port("main", "main"),
    trigger_in: Port("trigger_in", "aux")
  });
}

/**
 * Create a SubscriptionManagerAgent to manage dependents
 */
function SubscriptionManagerAgent(
  sourceAgentId: string
): IAgent<"SubscriptionManager", SubscriptionManagerAgentValue> {
  return Agent("SubscriptionManager", {
    subscribers: new Set<string>(),
    sourceAgentId
  }, {
    main: Port("main", "main")
  });
}

/**
 * Create a NotifyAgent to signal changes
 */
function NotifyAgent(
  sourceAgentId: string
): IAgent<"Notify", NotifyAgentValue> {
  return Agent("Notify", {
    sourceAgentId,
    timestamp: Date.now()
  }, {
    main: Port("main", "main")
  });
}

/**
 * Create a SubscribeAgent to request subscription
 */
function SubscribeAgent(
  subscriberAgentId: string
): IAgent<"Subscribe", SubscribeAgentValue> {
  return Agent("Subscribe", {
    subscriberAgentId,
    timestamp: Date.now()
  }, {
    main: Port("main", "main")
  });
}

/**
 * Create an UnsubscribeAgent to remove subscription
 */
function UnsubscribeAgent(
  subscriberAgentId: string
): IAgent<"Unsubscribe", UnsubscribeAgentValue> {
  return Agent("Unsubscribe", {
    subscriberAgentId,
    timestamp: Date.now()
  }, {
    main: Port("main", "main")
  });
}

// ========== Rule Definitions ==========

/**
 * Define rules for reactive operations
 */
function registerReactiveRules(network: INetwork): void {
  // Rule: SubscribeAgent <-> SubscriptionManager
  network.addRule(ActionRule(
    { name: "Subscribe-Manager", type: "action" },
    { agentName1: "Subscribe", portName1: "main", agentName2: "SubscriptionManager", portName2: "main" },
    (subscribe, manager, network) => {
      // Add subscriber to manager's list
      manager.value.subscribers.add(subscribe.value.subscriberAgentId);
      
      // Return both agents
      return [subscribe, manager];
    }
  ));

  // Rule: UnsubscribeAgent <-> SubscriptionManager
  network.addRule(ActionRule(
    { name: "Unsubscribe-Manager", type: "action" },
    { agentName1: "Unsubscribe", portName1: "main", agentName2: "SubscriptionManager", portName2: "main" },
    (unsubscribe, manager, network) => {
      // Remove subscriber from manager's list
      manager.value.subscribers.delete(unsubscribe.value.subscriberAgentId);
      
      // Return both agents
      return [unsubscribe, manager];
    }
  ));

  // Rule: NotifyAgent <-> SubscriptionManager
  network.addRule(ActionRule(
    { name: "Notify-Manager", type: "action" },
    { agentName1: "Notify", portName1: "main", agentName2: "SubscriptionManager", portName2: "main" },
    (notify, manager, network) => {
      // Create a notify agent for each subscriber
      const results: (IAgent | { type: string, entity: any, throwIfExists?: boolean })[] = [notify, manager];
      
      // For each subscriber in the manager's list
      for (const subscriberId of manager.value.subscribers) {
        // Get the subscriber agent
        const subscriber = network.getAgent(subscriberId);
        
        if (subscriber) {
          // Create a new notify agent
          const newNotify = NotifyAgent(notify.value.sourceAgentId);
          
          // Add it to the network
          results.push({ type: 'add', entity: newNotify, throwIfExists: false });
          
          // Connect it to the subscriber's trigger_in port
          if (subscriber.ports.trigger_in) {
            results.push({ 
              type: 'add', 
              entity: Connection(newNotify.ports.main, subscriber.ports.trigger_in),
              throwIfExists: false 
            });
          }
        }
      }
      
      return results;
    }
  ));

  // Rule: NotifyAgent <-> MemoAgent
  network.addRule(ActionRule(
    { name: "Notify-Memo", type: "action" },
    { agentName1: "Notify", portName1: "main", agentName2: "Memo", portName2: "trigger_in" },
    (notify, memo, network) => {
      // If memo is not already dirty, mark it as dirty
      if (!memo.value.dirty) {
        memo.value.dirty = true;
        
        // Get the memo's manager
        const manager = network.getAgent(memo.value.managerAgentId);
        
        if (manager) {
          // Create a new notify agent
          const newNotify = NotifyAgent(memo._agentId);
          
          // Add it to the network and connect to the manager
          return [
            notify, 
            memo,
            { type: 'add', entity: newNotify, throwIfExists: false },
            { 
              type: 'add', 
              entity: Connection(newNotify.ports.main, manager.ports.main),
              throwIfExists: false 
            }
          ];
        }
      }
      
      return [notify, memo];
    }
  ));

  // Rule: NotifyAgent <-> EffectAgent
  network.addRule(ActionRule(
    { name: "Notify-Effect", type: "action" },
    { agentName1: "Notify", portName1: "main", agentName2: "Effect", portName2: "trigger_in" },
    (notify, effect, network) => {
      // Add the effect to the queue if not disposed
      if (!effect.value.disposed) {
        effectQueue.add(effect);
      }
      
      return [notify, effect];
    }
  ));
}

// ========== Dependency Tracking ==========

/**
 * Start tracking dependencies
 */
function startTracking(): void {
  trackingStack.push(new Set<string>());
}

/**
 * Stop tracking dependencies and return the tracked dependencies
 */
function stopTracking(): Set<string> {
  return trackingStack.pop() || new Set<string>();
}

/**
 * Track a dependency
 */
function trackDependency(agentId: string): void {
  if (trackingStack.length > 0) {
    trackingStack[trackingStack.length - 1].add(agentId);
  }
}

/**
 * Update dependencies for a reactive agent
 */
function updateDependencies(agent: IAgent, newDeps: Set<string>): void {
  if (!agent.value.dependencies) return;

  const oldDeps = agent.value.dependencies as Set<string>;
  
  // Find dependencies to add
  for (const depId of newDeps) {
    if (!oldDeps.has(depId)) {
      // Queue subscription
      subscriptionQueue.push({ type: 'subscribe', source: depId, subscriber: agent._agentId });
    }
  }
  
  // Find dependencies to remove
  for (const depId of oldDeps) {
    if (!newDeps.has(depId)) {
      // Queue unsubscription
      subscriptionQueue.push({ type: 'unsubscribe', source: depId, subscriber: agent._agentId });
    }
  }
  
  // Update the dependencies
  agent.value.dependencies = newDeps;
}

// ========== Batch Processing ==========

/**
 * Process all pending subscriptions
 */
function processSubscriptions(): void {
  while (subscriptionQueue.length > 0) {
    const { type, source, subscriber } = subscriptionQueue.shift()!;
    
    // Get the source's subscription manager
    const sourceAgent = reactiveNetwork.getAgent(source);
    if (!sourceAgent) continue;
    
    let managerAgentId: string | undefined;
    
    if (sourceAgent.name === "Signal") {
      // Find or create a subscription manager for this source
      const managers = reactiveNetwork.findAgents({ 
        name: "SubscriptionManager", 
        value: { sourceAgentId: source } 
      });
      
      if (managers.length > 0) {
        managerAgentId = managers[0]._agentId;
      } else {
        const manager = SubscriptionManagerAgent(source);
        reactiveNetwork.addAgent(manager);
        managerAgentId = manager._agentId;
      }
    } else if (sourceAgent.name === "Memo") {
      managerAgentId = (sourceAgent.value as MemoAgentValue<any>).managerAgentId;
    }
    
    if (!managerAgentId) continue;
    
    const manager = reactiveNetwork.getAgent(managerAgentId);
    if (!manager) continue;
    
    // Create and connect the appropriate agent
    if (type === 'subscribe') {
      const sub = SubscribeAgent(subscriber);
      reactiveNetwork.addAgent(sub);
      reactiveNetwork.connectPorts(sub.ports.main, manager.ports.main);
    } else {
      const unsub = UnsubscribeAgent(subscriber);
      reactiveNetwork.addAgent(unsub);
      reactiveNetwork.connectPorts(unsub.ports.main, manager.ports.main);
    }
  }
  
  // Process all the connections through Annette
  reactiveNetwork.reduce();
}

/**
 * Process all pending effects
 */
function processEffects(): void {
  const effectsToRun = Array.from(effectQueue);
  effectQueue.clear();
  
  for (const effect of effectsToRun) {
    if (effect.value.disposed) continue;
    
    // Execute the effect with dependency tracking
    startTracking();
    try {
      effect.value.effectFn();
    } catch (error) {
      console.error("Error in effect:", error);
    }
    const newDeps = stopTracking();
    
    // Update dependencies
    updateDependencies(effect, newDeps);
  }
}

/**
 * Run a batch of reactive updates
 */
async function runBatch(): Promise<void> {
  if (batchActive) return;
  
  batchActive = true;
  
  try {
    let stability = false;
    
    while (!stability) {
      // First, process the Annette network to propagate notifications
      reactiveNetwork.reduce();
      
      // If there are effects to run, process them
      if (effectQueue.size > 0) {
        processEffects();
        
        // Process any new subscriptions from effects
        if (subscriptionQueue.length > 0) {
          processSubscriptions();
          
          // If we got new effects from subscriptions, we need another iteration
          stability = effectQueue.size === 0;
        } else {
          stability = true;
        }
      } else {
        stability = true;
      }
    }
  } finally {
    batchActive = false;
    batchPromise = null;
  }
}

/**
 * Schedule a batch of reactive updates
 */
function scheduleBatch(): Promise<void> {
  if (!batchPromise) {
    batchPromise = Promise.resolve().then(runBatch);
  }
  return batchPromise;
}

// ========== Public API ==========

/**
 * Initialize the reactive system
 */
export function initReactive(): void {
  // Create the Annette network for reactive operations
  reactiveNetwork = Network("reactive");
  
  // Create the AutoNet for dependency tracking
  autoNet = new AutoNet("reactive-auto");
  
  // Register the reactive rules
  registerReactiveRules(reactiveNetwork);
}

/**
 * Create a reactive signal
 */
export function createSignal<T>(
  initialValue: T, 
  options: SignalOptions<T> = {}
): [ISignal<T>, (value: T) => T] {
  // Create the signal agent
  const signalAgent = SignalAgent(initialValue, options);
  
  // Add to the network
  reactiveNetwork.addAgent(signalAgent);
  
  // Create a manager for this signal
  const managerAgent = SubscriptionManagerAgent(signalAgent._agentId);
  reactiveNetwork.addAgent(managerAgent);
  
  // Define the getter function
  const read: ISignal<T> = (() => {
    // Track this signal as a dependency
    trackDependency(signalAgent._agentId);
    
    return signalAgent.value.current;
  }) as ISignal<T>;
  
  // Add peek method
  read.peek = () => signalAgent.value.current;
  
  // Add subscribe method
  read.subscribe = (fn: (value: T) => void) => {
    const effectAgent = EffectAgent(() => fn(signalAgent.value.current));
    reactiveNetwork.addAgent(effectAgent);
    
    // Add initial subscription
    subscriptionQueue.push({ 
      type: 'subscribe', 
      source: signalAgent._agentId, 
      subscriber: effectAgent._agentId 
    });
    processSubscriptions();
    
    // Run the effect once to establish dependencies
    effectQueue.add(effectAgent);
    processEffects();
    
    // Return dispose function
    return () => {
      effectAgent.value.disposed = true;
      
      // Remove all subscriptions
      for (const depId of effectAgent.value.dependencies) {
        subscriptionQueue.push({ 
          type: 'unsubscribe', 
          source: depId, 
          subscriber: effectAgent._agentId 
        });
      }
      processSubscriptions();
    };
  };
  
  // Define the setter function
  const write = (value: T): T => {
    const prev = signalAgent.value.current;
    
    // If equals function is provided, use it to check for changes
    if (signalAgent.value.equals && signalAgent.value.equals(prev, value)) {
      return prev;
    }
    
    // Update the value
    signalAgent.value.current = value;
    
    // Create a notify agent
    const notifyAgent = NotifyAgent(signalAgent._agentId);
    reactiveNetwork.addAgent(notifyAgent);
    
    // Connect to the manager
    reactiveNetwork.connectPorts(notifyAgent.ports.main, managerAgent.ports.main);
    
    // Schedule a batch
    scheduleBatch();
    
    return value;
  };
  
  return [read, write];
}

/**
 * Create a derived memo
 */
export function createMemo<T>(
  compute: () => T,
  options: { name?: string } = {}
): IMemo<T> {
  // Create a manager for this memo
  const managerAgent = SubscriptionManagerAgent("");
  reactiveNetwork.addAgent(managerAgent);
  
  // Create the memo agent
  const memoAgent = MemoAgent(compute, managerAgent._agentId, options.name);
  
  // Update the manager with the memo's ID
  managerAgent.value.sourceAgentId = memoAgent._agentId;
  
  // Add to the network
  reactiveNetwork.addAgent(memoAgent);
  
  // Run the computation once to establish dependencies
  startTracking();
  const initialValue = compute();
  const initialDeps = stopTracking();
  
  // Update the memo
  memoAgent.value.cachedValue = initialValue;
  memoAgent.value.dirty = false;
  memoAgent.value.dependencies = initialDeps;
  
  // Subscribe to all dependencies
  for (const depId of initialDeps) {
    subscriptionQueue.push({ 
      type: 'subscribe', 
      source: depId, 
      subscriber: memoAgent._agentId 
    });
  }
  processSubscriptions();
  
  // Define the getter function
  const read: IMemo<T> = (() => {
    // Track this memo as a dependency
    trackDependency(memoAgent._agentId);
    
    // If dirty, recompute
    if (memoAgent.value.dirty) {
      startTracking();
      try {
        memoAgent.value.cachedValue = memoAgent.value.computeFn();
      } catch (error) {
        console.error("Error in memo computation:", error);
      }
      const newDeps = stopTracking();
      
      // Update dependencies
      updateDependencies(memoAgent, newDeps);
      
      // Clear dirty flag
      memoAgent.value.dirty = false;
    }
    
    return memoAgent.value.cachedValue;
  }) as IMemo<T>;
  
  // Add peek method
  read.peek = () => memoAgent.value.cachedValue;
  
  // Add subscribe method (same as signal)
  read.subscribe = (fn: (value: T) => void) => {
    const effectAgent = EffectAgent(() => fn(memoAgent.value.cachedValue));
    reactiveNetwork.addAgent(effectAgent);
    
    // Add initial subscription
    subscriptionQueue.push({ 
      type: 'subscribe', 
      source: memoAgent._agentId, 
      subscriber: effectAgent._agentId 
    });
    processSubscriptions();
    
    // Run the effect once to establish dependencies
    effectQueue.add(effectAgent);
    processEffects();
    
    // Return dispose function
    return () => {
      effectAgent.value.disposed = true;
      
      // Remove all subscriptions
      for (const depId of effectAgent.value.dependencies) {
        subscriptionQueue.push({ 
          type: 'unsubscribe', 
          source: depId, 
          subscriber: effectAgent._agentId 
        });
      }
      processSubscriptions();
    };
  };
  
  return read;
}

/**
 * Create an effect
 */
export function createEffect(
  effectFn: () => void,
  options: { name?: string } = {}
): IEffect {
  // Create the effect agent
  const effectAgent = EffectAgent(effectFn, options.name);
  
  // Add to the network
  reactiveNetwork.addAgent(effectAgent);
  
  // Run the effect once to establish dependencies
  effectQueue.add(effectAgent);
  processEffects();
  
  // Define the runner function
  const run = () => {
    if (!effectAgent.value.disposed) {
      effectQueue.add(effectAgent);
      scheduleBatch();
    }
  };
  
  // Define the dispose function
  const dispose = () => {
    effectAgent.value.disposed = true;
    
    // Remove all subscriptions
    for (const depId of effectAgent.value.dependencies) {
      subscriptionQueue.push({ 
        type: 'unsubscribe', 
        source: depId, 
        subscriber: effectAgent._agentId 
      });
    }
    processSubscriptions();
  };
  
  // Attach dispose to the runner
  run.dispose = dispose;
  
  return run;
}

/**
 * Create a resource (async version of createMemo)
 */
export function createResource<T, U = unknown>(
  source: () => U | Promise<U>,
  fetcher: (source: U) => Promise<T>,
  options: { name?: string, initialValue?: T } = {}
): [{
  loading: ISignal<boolean>;
  error: ISignal<Error | undefined>;
  latest: IMemo<T | undefined>;
}, (refetching?: boolean) => Promise<T>] {
  // Create signals for tracking state
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [value, setValue] = createSignal<T | undefined>(options.initialValue);
  
  // Create a source memo
  const sourceSignal = createMemo(source);
  
  // Create a memo for the latest value
  const latest = createMemo(() => {
    // This will be tracked as a dependency
    return value();
  }, { name: `${options.name || 'resource'}-latest` });
  
  // Function to fetch the resource
  const refetch = async (refetching = false): Promise<T> => {
    setLoading(true);
    setError(undefined);
    
    try {
      const sourceValue = sourceSignal();
      const result = await fetcher(sourceValue);
      setValue(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  // Create an effect to refetch when source changes
  createEffect(() => {
    sourceSignal(); // Track the source
    refetch();
  });
  
  return [{ loading, error, latest }, refetch];
}

/**
 * Create a resource using algebraic effects
 */
export function createEffectResource<T, U = unknown>(
  source: () => U | Promise<U>,
  effectType: string = 'fetch',
  options: { 
    name?: string;
    initialValue?: T;
    handlerName?: string;
  } = {}
): [{
  loading: ISignal<boolean>;
  error: ISignal<Error | undefined>;
  latest: IMemo<T | undefined>;
}, (refetching?: boolean) => Promise<T>] {
  // Create signals for tracking state
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [value, setValue] = createSignal<T | undefined>(options.initialValue);
  
  // Create a source memo
  const sourceSignal = createMemo(source);
  
  // Create a memo for the latest value
  const latest = createMemo(() => {
    return value();
  }, { name: `${options.name || 'effect-resource'}-latest` });
  
  // Find or create a result scanner
  let resultScanner: IAgent | undefined;
  const scanners = reactiveNetwork.findAgents({ name: "ResultScanner" });
  if (scanners.length > 0) {
    resultScanner = scanners[0];
  } else {
    resultScanner = ResultScanner();
    reactiveNetwork.addAgent(resultScanner);
  }
  
  // Function to fetch using effect
  const refetch = async (refetching = false): Promise<T> => {
    setLoading(true);
    setError(undefined);
    
    try {
      const sourceValue = await sourceSignal();
      
      // Create an effect agent
      const effectAgent = EffectAgent({
        type: effectType,
        data: sourceValue,
        ...(typeof sourceValue === 'string' ? { url: sourceValue } : {}),
        ...(typeof sourceValue === 'object' ? sourceValue : {})
      });
      
      // Create a component to receive the result
      const component = Constructor({
        id: `component-${Date.now()}`,
        setValue
      });
      
      // Add agents to the network
      reactiveNetwork.addAgent(effectAgent);
      reactiveNetwork.addAgent(component);
      
      // Connect component to effect via wait port
      reactiveNetwork.connectPorts(component.ports.wait, effectAgent.ports.wait);
      
      // Find a handler for this effect type
      const handlers = reactiveNetwork.findAgents({ 
        name: options.handlerName || "Handler"
      });
      
      if (handlers.length > 0) {
        const handler = handlers[0];
        // Connect effect to handler
        reactiveNetwork.connectPorts(effectAgent.ports.hold, handler.ports.hold);
      } else {
        console.warn(`No handler found for effect type: ${effectType}`);
      }
      
      // Wait for the effect to complete
      return new Promise<T>((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (effectAgent.value.status === 'completed') {
            clearInterval(checkInterval);
            const result = value() as T;
            setLoading(false);
            resolve(result);
          } else if (effectAgent.value.status === 'error') {
            clearInterval(checkInterval);
            const errorMsg = effectAgent.value.error?.message || 'Unknown error';
            const error = new Error(errorMsg);
            setError(error);
            setLoading(false);
            reject(error);
          }
        }, 100);
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    }
  };
  
  // Create an effect to refetch when source changes
  createEffect(() => {
    sourceSignal(); // Track the source
    refetch();
  });
  
  return [{ loading, error, latest }, refetch];
}

/**
 * Create a resource that synchronizes across network boundaries
 */
export function createSyncedResource<T, U = unknown>(
  source: () => U | Promise<U>,
  fetcher: (source: U) => Promise<T>,
  options: {
    name?: string;
    initialValue?: T;
    networkId?: string;
    resourceId?: string;
    sync?: boolean;
  } = {}
): [{
  loading: ISignal<boolean>;
  error: ISignal<Error | undefined>;
  latest: IMemo<T | undefined>;
}, (refetching?: boolean) => Promise<T>] {
  // Create standard resource signals
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [value, setValue] = createSignal<T | undefined>(options.initialValue);
  
  // Create a source memo
  const sourceSignal = createMemo(source);
  
  // Create a memo for the latest value
  const latest = createMemo(() => {
    return value();
  }, { name: `${options.name || 'synced-resource'}-latest` });
  
  // If sync is enabled, create sync agents and shared data
  let syncAgent: IAgent | undefined;
  let sharedResource: IAgent | undefined;
  let lastLocalUpdate = Date.now();
  
  if (options.sync && options.networkId && options.resourceId) {
    // Create a sync agent for this resource
    syncAgent = SyncAgent(
      options.networkId,
      `resource-${options.resourceId}`
    );
    
    // Create a shared resource data structure
    sharedResource = createSharedMap({
      value: options.initialValue,
      loading: true,
      error: null,
      timestamp: Date.now(),
      sourceHash: "" // Will be updated with hash of source value
    });
    
    // Add to the network
    reactiveNetwork.addAgent(syncAgent);
    reactiveNetwork.addAgent(sharedResource);
    
    // Connect the shared resource to the sync agent
    reactiveNetwork.connectPorts(sharedResource.ports.sync, syncAgent.ports.sync);
    
    // Listen for remote changes
    createEffect(() => {
      if (!sharedResource) return;
      
      const resourceData = sharedResource.value;
      
      // Only update if the data came from elsewhere (different timestamp)
      if (resourceData.timestamp !== lastLocalUpdate) {
        setLoading(resourceData.loading);
        
        if (resourceData.error) {
          setError(new Error(resourceData.error));
        } else {
          setError(undefined);
        }
        
        if (resourceData.value !== undefined) {
          setValue(resourceData.value);
        }
      }
    });
  }
  
  // Function to fetch the resource
  const refetch = async (refetching = false): Promise<T> => {
    setLoading(true);
    setError(undefined);
    
    // Update shared resource if enabled
    if (sharedResource) {
      lastLocalUpdate = Date.now();
      sharedResource.value = {
        ...sharedResource.value,
        loading: true,
        error: null,
        timestamp: lastLocalUpdate
      };
    }
    
    try {
      const sourceValue = await sourceSignal();
      
      // Create a hash of the source value for change detection
      const sourceHash = JSON.stringify(sourceValue);
      
      // Check if we can use existing data from another network
      if (sharedResource && 
          sharedResource.value.sourceHash === sourceHash && 
          sharedResource.value.value !== undefined && 
          !refetching) {
        // We can use the existing data
        setValue(sharedResource.value.value);
        setLoading(false);
        return sharedResource.value.value;
      }
      
      // Otherwise fetch new data
      const result = await fetcher(sourceValue);
      setValue(result);
      
      // Update shared resource if enabled
      if (sharedResource) {
        lastLocalUpdate = Date.now();
        sharedResource.value = {
          value: result,
          loading: false,
          error: null,
          timestamp: lastLocalUpdate,
          sourceHash
        };
      }
      
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      
      // Update shared resource if enabled
      if (sharedResource) {
        lastLocalUpdate = Date.now();
        sharedResource.value = {
          ...sharedResource.value,
          loading: false,
          error: error.message,
          timestamp: lastLocalUpdate
        };
      }
      
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  // Create an effect to refetch when source changes
  createEffect(() => {
    const sourceValue = sourceSignal();
    const sourceHash = JSON.stringify(sourceValue);
    
    // Check if we need to refetch
    if (!sharedResource || 
        sharedResource.value.sourceHash !== sourceHash || 
        sharedResource.value.value === undefined) {
      refetch();
    }
  });
  
  return [{ loading, error, latest }, refetch];
}

/**
 * Batch multiple reactive updates
 */
export function batch<T>(fn: () => T): T {
  // If already in a batch, just run the function
  if (batchActive) {
    return fn();
  }
  
  // Start a new batch
  try {
    batchActive = true;
    return fn();
  } finally {
    batchActive = false;
    scheduleBatch();
  }
}

/**
 * Run a computation only once (during initialization)
 */
export function createRoot<T>(fn: () => T): T {
  // Clear the tracking stack to ensure no dependencies are tracked
  const prevStack = [...trackingStack];
  trackingStack.length = 0;
  
  try {
    return fn();
  } finally {
    // Restore the tracking stack
    trackingStack.length = 0;
    trackingStack.push(...prevStack);
  }
}

/**
 * Create a reactive object with auto-tracking properties
 */
export function createStore<T extends object>(
  initialValue: T
): [T, (fn: (state: T) => void) => void] {
  const signals = new Map<string | symbol, [ISignal<any>, (value: any) => any]>();
  const proxy = new Proxy({} as T, {
    get(target, prop) {
      if (!signals.has(prop)) {
        // Create a new signal for this property
        const path = String(prop);
        const initialPropValue = initialValue[prop as keyof T];
        signals.set(prop, createSignal(initialPropValue));
      }
      
      // Get the signal and return its value
      const [getter] = signals.get(prop)!;
      
      if (typeof initialPropValue === 'object' && initialPropValue !== null) {
        // For objects, we recurse to create nested stores
        return createStore(initialPropValue)[0];
      }
      
      return getter();
    },
    
    set(target, prop, value) {
      if (!signals.has(prop)) {
        // Create a new signal for this property
        signals.set(prop, createSignal(value));
      }
      
      // Set the signal value
      const [, setter] = signals.get(prop)!;
      setter(value);
      return true;
    }
  });
  
  // Create a setter function for immutable updates
  const setStore = (fn: (state: T) => void) => {
    batch(() => {
      // Create a draft that captures all changes
      const draft = { ...initialValue };
      
      // Apply the changes
      fn(draft as T);
      
      // Update each changed property
      for (const prop in draft) {
        if (Object.prototype.hasOwnProperty.call(draft, prop)) {
          proxy[prop as keyof T] = draft[prop];
        }
      }
    });
  };
  
  return [proxy, setStore];
}

/**
 * Create a signal that synchronizes across network boundaries
 */
export function createSharedSignal<T>(
  initialValue: T,
  options: SignalOptions<T> & {
    networkId?: string;
    signalId?: string;
    sync?: boolean;
  } = {}
): [ISignal<T>, (value: T) => T] {
  // Create standard signal
  const [value, setValue] = createSignal(initialValue, options);
  
  // If sync is enabled, create sync agents and shared data
  if (options.sync && options.networkId && options.signalId) {
    // Create a sync agent for this signal
    const syncAgent = SyncAgent(
      options.networkId,
      `signal-${options.signalId}`
    );
    
    // Create a shared document for the signal
    const sharedDoc = createSharedMap({
      value: initialValue,
      lastUpdated: Date.now()
    });
    
    // Add to the network
    reactiveNetwork.addAgent(syncAgent);
    reactiveNetwork.addAgent(sharedDoc);
    
    // Connect document to sync agent
    reactiveNetwork.connectPorts(sharedDoc.ports.sync, syncAgent.ports.sync);
    
    // Track the last local update time
    let lastLocalUpdate = Date.now();
    
    // Update shared doc when signal changes
    createEffect(() => {
      lastLocalUpdate = Date.now();
      sharedDoc.value = {
        value: value(),
        lastUpdated: lastLocalUpdate
      };
    });
    
    // Update signal when shared doc changes from remote
    createEffect(() => {
      // Only update if the change came from elsewhere
      if (sharedDoc.value.lastUpdated !== lastLocalUpdate) {
        setValue(sharedDoc.value.value);
      }
    });
  }
  
  return [value, setValue];
}

/**
 * Create a reactive map using specialized updaters
 */
export function createReactiveMap<K extends string | number | symbol, V>(
  initialValue: Record<K, V> = {} as Record<K, V>,
  options: {
    name?: string;
    networkId?: string;
    mapId?: string;
    sync?: boolean;
  } = {}
): [ISignal<Record<K, V>>, {
  set: (key: K, value: V) => void;
  delete: (key: K) => void;
  clear: () => void;
}] {
  // Create a shared map agent
  const mapAgent = createSharedMap(initialValue);
  
  // Add to the network
  reactiveNetwork.addAgent(mapAgent);
  
  // Create a reactive wrapper
  const [state, setState] = createSignal(initialValue);
  
  // If sync is enabled, create sync agent
  if (options.sync && options.networkId && options.mapId) {
    // Create a sync agent
    const syncAgent = SyncAgent(
      options.networkId,
      `map-${options.mapId}`
    );
    
    // Add to network
    reactiveNetwork.addAgent(syncAgent);
    
    // Connect to map
    reactiveNetwork.connectPorts(mapAgent.ports.sync, syncAgent.ports.sync);
  }
  
  // Create map operations
  const mapOperations = {
    set: (key: K, value: V) => {
      // Create a map updater
      const updater = MapUpdater(
        { type: 'set', key: String(key), value },
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to map
      reactiveNetwork.connectPorts(updater.ports.main, mapAgent.ports.main);
      
      // Update reactive state
      setState({ ...state(), [key]: value });
    },
    
    delete: (key: K) => {
      // Create a map updater
      const updater = MapUpdater(
        { type: 'delete', key: String(key) },
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to map
      reactiveNetwork.connectPorts(updater.ports.main, mapAgent.ports.main);
      
      // Update reactive state
      const newState = { ...state() };
      delete newState[key];
      setState(newState);
    },
    
    clear: () => {
      // Create a map updater to set empty object
      const updater = MapUpdater(
        { type: 'set', key: '', value: {} },
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to map
      reactiveNetwork.connectPorts(updater.ports.main, mapAgent.ports.main);
      
      // Update reactive state
      setState({} as Record<K, V>);
    }
  };
  
  // Sync map agent data with reactive state
  createEffect(() => {
    const mapValue = mapAgent.value;
    
    // Create a new state object
    const newState = {} as Record<K, V>;
    
    // Copy values from map agent
    for (const [key, value] of Object.entries(mapValue)) {
      if (key !== '__metadata') {
        newState[key as K] = value as V;
      }
    }
    
    // Update state if changed
    if (JSON.stringify(newState) !== JSON.stringify(state())) {
      setState(newState);
    }
  });
  
  return [state, mapOperations];
}

/**
 * Create a reactive list using specialized updaters
 */
export function createReactiveList<T>(
  initialValue: T[] = [],
  options: {
    name?: string;
    networkId?: string;
    listId?: string;
    sync?: boolean;
  } = {}
): [ISignal<T[]>, {
  push: (item: T) => void;
  insertAt: (index: number, item: T) => void;
  removeAt: (index: number) => void;
  update: (index: number, item: T) => void;
  clear: () => void;
}] {
  // Create a shared list agent
  const listAgent = createSharedList(initialValue);
  
  // Add to the network
  reactiveNetwork.addAgent(listAgent);
  
  // Create a reactive wrapper
  const [state, setState] = createSignal(initialValue);
  
  // If sync is enabled, create sync agent
  if (options.sync && options.networkId && options.listId) {
    // Create a sync agent
    const syncAgent = SyncAgent(
      options.networkId,
      `list-${options.listId}`
    );
    
    // Add to network
    reactiveNetwork.addAgent(syncAgent);
    
    // Connect to list
    reactiveNetwork.connectPorts(listAgent.ports.sync, syncAgent.ports.sync);
  }
  
  // Create list operations
  const listOperations = {
    push: (item: T) => {
      // Create a list updater
      const updater = ListUpdater(
        { type: 'insert', index: state().length, value: item },
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to list
      reactiveNetwork.connectPorts(updater.ports.main, listAgent.ports.main);
      
      // Update reactive state
      setState([...state(), item]);
    },
    
    insertAt: (index: number, item: T) => {
      // Clamp index to valid range
      const actualIndex = Math.max(0, Math.min(state().length, index));
      
      // Create a list updater
      const updater = ListUpdater(
        { type: 'insert', index: actualIndex, value: item },
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to list
      reactiveNetwork.connectPorts(updater.ports.main, listAgent.ports.main);
      
      // Update reactive state
      const newState = [...state()];
      newState.splice(actualIndex, 0, item);
      setState(newState);
    },
    
    removeAt: (index: number) => {
      // Check if index is valid
      if (index < 0 || index >= state().length) return;
      
      // Create a list updater
      const updater = ListUpdater(
        { type: 'delete', index },
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to list
      reactiveNetwork.connectPorts(updater.ports.main, listAgent.ports.main);
      
      // Update reactive state
      const newState = [...state()];
      newState.splice(index, 1);
      setState(newState);
    },
    
    update: (index: number, item: T) => {
      // Check if index is valid
      if (index < 0 || index >= state().length) return;
      
      // Create a list updater
      const updater = ListUpdater(
        { type: 'set', index, value: item },
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to list
      reactiveNetwork.connectPorts(updater.ports.main, listAgent.ports.main);
      
      // Update reactive state
      const newState = [...state()];
      newState[index] = item;
      setState(newState);
    },
    
    clear: () => {
      // Create a list updater to set empty array
      const updater = ListUpdater(
        { type: 'set', index: 0, value: [] },
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to list
      reactiveNetwork.connectPorts(updater.ports.main, listAgent.ports.main);
      
      // Update reactive state
      setState([]);
    }
  };
  
  // Sync list agent data with reactive state
  createEffect(() => {
    if (listAgent.value.items && Array.isArray(listAgent.value.items)) {
      // Check if the items have changed
      if (JSON.stringify(listAgent.value.items) !== JSON.stringify(state())) {
        setState([...listAgent.value.items]);
      }
    }
  });
  
  return [state, listOperations];
}

/**
 * Create a collaborative text editor using specialized updaters
 */
export function createReactiveText(
  initialValue: string = '',
  options: {
    name?: string;
    networkId?: string;
    textId?: string;
    sync?: boolean;
  } = {}
): [ISignal<string>, (value: string) => void, {
  insertAt: (position: number, text: string) => void;
  deleteAt: (position: number, length: number) => void;
  replace: (position: number, length: number, text: string) => void;
}] {
  // Create a shared text agent
  const textAgent = createSharedText(initialValue);
  
  // Add to the network
  reactiveNetwork.addAgent(textAgent);
  
  // Create a reactive wrapper
  const [state, setState] = createSignal(initialValue);
  
  // If sync is enabled, create sync agent
  if (options.sync && options.networkId && options.textId) {
    // Create a sync agent
    const syncAgent = SyncAgent(
      options.networkId,
      `text-${options.textId}`
    );
    
    // Add to network
    reactiveNetwork.addAgent(syncAgent);
    
    // Connect to text
    reactiveNetwork.connectPorts(textAgent.ports.sync, syncAgent.ports.sync);
  }
  
  // Create text operations
  const textOperations = {
    insertAt: (position: number, text: string) => {
      // Create a text updater with CRDT operation
      const updater = TextUpdater(
        createTextCRDTOperation('insert', position, text),
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to text
      reactiveNetwork.connectPorts(updater.ports.main, textAgent.ports.main);
      
      // Update reactive state
      const currentText = state();
      const newText = currentText.substring(0, position) + 
                     text + 
                     currentText.substring(position);
      setState(newText);
    },
    
    deleteAt: (position: number, length: number) => {
      // Create a text updater with CRDT operation
      const updater = TextUpdater(
        createTextCRDTOperation('delete', position, undefined, length),
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(updater);
      
      // Connect to text
      reactiveNetwork.connectPorts(updater.ports.main, textAgent.ports.main);
      
      // Update reactive state
      const currentText = state();
      const newText = currentText.substring(0, position) + 
                     currentText.substring(position + length);
      setState(newText);
    },
    
    replace: (position: number, length: number, text: string) => {
      // Create a text updater with CRDT operation for delete
      const deleteUpdater = TextUpdater(
        createTextCRDTOperation('delete', position, undefined, length),
        []
      );
      
      // Create a text updater with CRDT operation for insert
      const insertUpdater = TextUpdater(
        createTextCRDTOperation('insert', position, text),
        []
      );
      
      // Add to network
      reactiveNetwork.addAgent(deleteUpdater);
      reactiveNetwork.addAgent(insertUpdater);
      
      // Connect to text
      reactiveNetwork.connectPorts(deleteUpdater.ports.main, textAgent.ports.main);
      reactiveNetwork.connectPorts(insertUpdater.ports.main, textAgent.ports.main);
      
      // Update reactive state
      const currentText = state();
      const newText = currentText.substring(0, position) + 
                     text + 
                     currentText.substring(position + length);
      setState(newText);
    }
  };
  
  // Setter function for the text
  const setText = (value: string) => {
    // Create a text updater with set operation
    const updater = TextUpdater(
      createTextCRDTOperation('set', 0, value, state().length),
      []
    );
    
    // Add to network
    reactiveNetwork.addAgent(updater);
    
    // Connect to text
    reactiveNetwork.connectPorts(updater.ports.main, textAgent.ports.main);
    
    // Update reactive state
    setState(value);
    
    return value;
  };
  
  // Sync text agent data with reactive state
  createEffect(() => {
    if (textAgent.value.text !== state()) {
      setState(textAgent.value.text);
    }
  });
  
  return [state, setText, textOperations];
}

// Extend exports with advanced features
export {
  createEffectResource,
  createSyncedResource,
  createSharedSignal,
  createReactiveMap,
  createReactiveList,
  createReactiveText
};

// Initialize the reactive system
initReactive();