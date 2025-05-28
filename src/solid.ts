/**
 * Annette-Solid: A SolidJS-like reactive library using Annette's interaction nets
 * 
 * This implementation follows a hybrid architecture where:
 * - Annette manages the dependency graph structure and notification propagation
 * - JavaScript handles synchronous computation, dependency tracking, and effect execution
 */
import { 
  Agent, IAgent, Network, INetwork, Port, ActionRule as BaseActionRule, Connection,
  // Import additional Annette features
  EffectAgent as AnnetteEffectAgent, HandlerAgent, ResultScanner, Constructor,
  SyncAgent, RemoteAgent,
  createSharedMap, createSharedList, createSharedText, createSharedCounter,
  MapUpdater, ListUpdater, TextUpdater, CounterUpdater,
  createTextCRDTOperation
} from './index';

// ========== Types ==========

export interface SignalOptions<T> {
  name?: string;
  equals?: (prev: T, next: T) => boolean;
}

export interface ISignal<T> {
  (): T;
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

// Global tracking stack for reactive context
const trackingStack: Array<Set<string>> = [];

// Queue for effects to run after the current batch
const effectQueue: Set<IAgent<"Effect", EffectAgentValue>> = new Set();

// Queue for subscription changes
const subscriptionQueue: Array<{ type: 'subscribe' | 'unsubscribe', sourceAgentId: string, subscriberAgentId: string }> = [];

// Batch processing state
let batchActive = false;
let batchPromise: Promise<void> | null = null;

// ========== Core Reactive Agents ==========

/**
 * Create a SignalAgent to hold reactive state
 */
function SignalAgentInternal<T>(value: T, options: SignalOptions<T> = {}): IAgent<"Signal", SignalAgentValue<T>> {
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
function MemoAgentInternal<T>(
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
function EffectAgentInternal(
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
function SubscriptionManagerAgentInternal(
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
function NotifyAgentInternal(
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
function SubscribeAgentInternal(
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
function UnsubscribeAgentInternal(
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
  // Using dummy agent ports for the rule signature
  network.addRule(BaseActionRule(
    SubscribeAgentInternal("dummySubscriberId").ports.main, // Dummy port for signature
    SubscriptionManagerAgentInternal("dummySourceId").ports.main, // Dummy port for signature
    (subscribe, manager, _network) => {
      // Add subscriber to manager's list
      manager.value.subscribers.add(subscribe.value.subscriberAgentId);
      
      // Return both agents
      return [subscribe, manager];
    },
    "Subscribe-Manager-Rule" 
  ));

  // Rule: UnsubscribeAgent <-> SubscriptionManager
  network.addRule(BaseActionRule(
    UnsubscribeAgentInternal("dummySubscriberId").ports.main,
    SubscriptionManagerAgentInternal("dummySourceId").ports.main,
    (unsubscribe, manager, _network) => {
      // Remove subscriber from manager's list
      manager.value.subscribers.delete(unsubscribe.value.subscriberAgentId);
      
      // Return both agents
      return [unsubscribe, manager];
    },
    "Unsubscribe-Manager-Rule"
  ));

  // Rule: NotifyAgent <-> SubscriptionManager
  network.addRule(BaseActionRule(
    NotifyAgentInternal("dummySourceId").ports.main,
    SubscriptionManagerAgentInternal("dummySourceId").ports.main,
    (notify, manager, _network) => {
      // Process subscribers
      const subscribers = Array.from(manager.value.subscribers);
      
      // For each subscriber, create notifications
      for (const subscriberId of subscribers) {
        // Get the subscriber agent
        const subscriber = _network.getAgent(subscriberId as string);
        
        if (subscriber) {
          // Create a new notify agent
          const newNotify = NotifyAgentInternal(notify.value.sourceAgentId);
          
          // Add to network
          _network.addAgent(newNotify);
          
          // Connect to subscriber if it has a trigger_in port
          if (subscriber.ports.trigger_in) {
            _network.connectPorts(newNotify.ports.main, subscriber.ports.trigger_in);
          }
        }
      }
      
      // Return only manager (notify is consumed)
      return [manager];
    },
    "Notify-Manager-Rule"
  ));

  // Rule: NotifyAgent <-> MemoAgent
  network.addRule(BaseActionRule(
    NotifyAgentInternal("dummySourceId").ports.main,
    MemoAgentInternal(() => null, "dummyManagerId").ports.trigger_in,
    (notify, memo, _network) => {
      // If memo is not already dirty, mark it as dirty
      if (!memo.value.dirty) {
        memo.value.dirty = true;
        
        // Get the memo's manager
        const manager = _network.getAgent(memo.value.managerAgentId);
        
        if (manager) {
          // Create a new notify agent
          const newNotify = NotifyAgentInternal(memo._agentId);
          
          // Add it to the network and connect to the manager
          _network.addAgent(newNotify);
          _network.connectPorts(newNotify.ports.main, manager.ports.main);
        }
      }
      
      return [memo]; // Notify is consumed, memo stays
    },
    "Notify-Memo-Rule"
  ));

  // Rule: NotifyAgent <-> EffectAgent
  network.addRule(BaseActionRule(
    NotifyAgentInternal("dummySourceId").ports.main,
    EffectAgentInternal(() => {}).ports.trigger_in,
    (notify, effect, _network) => {
      // Add the effect to the queue if not disposed
      if (!effect.value.disposed) {
        // We need to cast the effect to the specific type that effectQueue expects
        const typedEffect = effect as IAgent<"Effect", EffectAgentValue>;
        effectQueue.add(typedEffect);
      }
      
      return [effect]; // Notify is consumed, effect stays
    },
    "Notify-Effect-Rule"
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
function updateDependencies(
  agent: IAgent<"Memo" | "Effect", MemoAgentValue<any> | EffectAgentValue>, 
  newDeps: Set<string>
): void {
  if (!agent.value.dependencies) return;

  const oldDeps = agent.value.dependencies as Set<string>;
  
  // Find dependencies to add
  const newDepsArray = Array.from(newDeps);
  for (const depId of newDepsArray) {
    if (!oldDeps.has(depId)) {
      // Queue subscription
      subscriptionQueue.push({ 
        type: 'subscribe', 
        sourceAgentId: depId, 
        subscriberAgentId: agent._agentId 
      });
    }
  }
  
  // Find dependencies to remove
  const oldDepsArray = Array.from(oldDeps);
  for (const depId of oldDepsArray) {
    if (!newDeps.has(depId)) {
      // Queue unsubscription
      subscriptionQueue.push({ 
        type: 'unsubscribe', 
        sourceAgentId: depId, 
        subscriberAgentId: agent._agentId 
      });
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
    const { type, sourceAgentId, subscriberAgentId } = subscriptionQueue.shift()!;
    
    // Get the source's subscription manager
    const sourceAgent = reactiveNetwork.getAgent(sourceAgentId);
    if (!sourceAgent) continue;
    
    let managerAgentId: string | undefined;
    
    if (sourceAgent.name === "Signal") {
      // Find or create a subscription manager for this source
      const managers = reactiveNetwork.findAgents({ name: "SubscriptionManager" });
      const sourceManager = managers.find(m => 
        m.value.sourceAgentId === sourceAgentId
      );
      
      if (sourceManager) {
        managerAgentId = sourceManager._agentId;
      } else {
        const manager = SubscriptionManagerAgentInternal(sourceAgentId);
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
      const sub = SubscribeAgentInternal(subscriberAgentId);
      reactiveNetwork.addAgent(sub);
      reactiveNetwork.connectPorts(sub.ports.main, manager.ports.main);
    } else {
      const unsub = UnsubscribeAgentInternal(subscriberAgentId);
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
    let iterations = 0;
    const maxIterations = 100; // Guard against infinite loops
    
    // First, process any pending subscriptions
    processSubscriptions();
    
    while (!stability && iterations < maxIterations) {
      iterations++;
      
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
    
    if (iterations >= maxIterations) {
      console.warn(`Reached maximum iterations (${maxIterations}) in runBatch(). Possible infinite loop?`);
    }
  } finally {
    // Critical: reset batchActive BEFORE nulling batchPromise
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
export function initReactiveSystem(network?: INetwork): INetwork {
  // If already initialized, return the existing network
  if (reactiveNetwork) return reactiveNetwork;
  
  // Create the Annette network for reactive operations
  reactiveNetwork = network || Network("reactive");
  
  // Register the reactive rules
  registerReactiveRules(reactiveNetwork);
  
  return reactiveNetwork;
}

/**
 * Create a reactive signal
 */
export function createSignal<T>(
  initialValue: T, 
  options: SignalOptions<T> = {}
): [ISignal<T>, (value: T) => T] {
  if (!reactiveNetwork) initReactiveSystem();
  
  // Create the signal agent
  const signalAgent = SignalAgentInternal(initialValue, options);
  
  // Add to the network
  reactiveNetwork.addAgent(signalAgent);
  
  // Create a manager for this signal
  const managerAgent = SubscriptionManagerAgentInternal(signalAgent._agentId);
  reactiveNetwork.addAgent(managerAgent);
  
  // Define the getter function
  const read = function() {
    // Track this signal as a dependency
    trackDependency(signalAgent._agentId);
    
    return signalAgent.value.current;
  } as ISignal<T>;
  
  // Add peek method
  read.peek = () => signalAgent.value.current;
  
  // Add subscribe method
  read.subscribe = (fn: (value: T) => void) => {
    const effectAgent = EffectAgentInternal(() => fn(signalAgent.value.current));
    reactiveNetwork.addAgent(effectAgent);
    
    // Add initial subscription
    subscriptionQueue.push({ 
      type: 'subscribe', 
      sourceAgentId: signalAgent._agentId, 
      subscriberAgentId: effectAgent._agentId 
    });
    processSubscriptions();
    
    // Run the effect once to establish dependencies
    effectQueue.add(effectAgent);
    processEffects();
    
    // Return dispose function
    return () => {
      effectAgent.value.disposed = true;
      
      // Remove all subscriptions
      const depsArray = Array.from(effectAgent.value.dependencies);
      for (const depId of depsArray) {
        subscriptionQueue.push({ 
          type: 'unsubscribe', 
          sourceAgentId: depId, 
          subscriberAgentId: effectAgent._agentId 
        });
      }
      processSubscriptions();
    };
  };
  
  // Define the setter function
  const write = (value: T): T => {
    const prev = signalAgent.value.current;
    
    // Check if value actually changed
    const equals = signalAgent.value.equals || Object.is;
    if (equals(prev, value)) {
      return prev;
    }
    
    // Update the value
    signalAgent.value.current = value;
    
    // Create a notify agent
    const notifyAgent = NotifyAgentInternal(signalAgent._agentId);
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
  options: { name?: string, equals?: (prev: T, next: T) => boolean } = {}
): IMemo<T> {
  if (!reactiveNetwork) initReactiveSystem();
  
  // Create a manager for this memo
  const managerAgent = SubscriptionManagerAgentInternal("");
  reactiveNetwork.addAgent(managerAgent);
  
  // Create the memo agent
  const memoAgent = MemoAgentInternal(compute, managerAgent._agentId, options.name);
  
  // Update the manager with the memo's ID
  managerAgent.value.sourceAgentId = memoAgent._agentId;
  
  // Add to the network
  reactiveNetwork.addAgent(memoAgent);
  
  // Helper function to run the memo computation
  const runComputation = (isInitial = false) => {
    startTracking();
    let newValue: T;
    try {
      newValue = compute();
    } catch (error) {
      console.error("Error in memo computation:", error);
      throw error;
    }
    const newDeps = stopTracking();
    
    // Update dependencies
    updateDependencies(memoAgent, newDeps);
    
    // Check if value changed
    const equals = options.equals || Object.is;
    const valueChanged = !isInitial && !equals(memoAgent.value.cachedValue, newValue);
    
    // Update value
    memoAgent.value.cachedValue = newValue;
    memoAgent.value.dirty = false;
    
    // If value changed and not initial run, notify observers
    if (valueChanged) {
      const notifyAgent = NotifyAgentInternal(memoAgent._agentId);
      reactiveNetwork.addAgent(notifyAgent);
      reactiveNetwork.connectPorts(notifyAgent.ports.main, managerAgent.ports.main);
    }
    
    return newValue;
  };
  
  // Run the computation once to establish dependencies
  const initialValue = runComputation(true);
  
  // Update the memo
  memoAgent.value.cachedValue = initialValue;
  
  // Define the getter function
  const read = function() {
    // Track this memo as a dependency
    trackDependency(memoAgent._agentId);
    
    // If dirty, recompute
    if (memoAgent.value.dirty) {
      runComputation();
    }
    
    return memoAgent.value.cachedValue;
  } as IMemo<T>;
  
  // Add peek method
  read.peek = () => memoAgent.value.cachedValue;
  
  // Add subscribe method (same as signal)
  read.subscribe = (fn: (value: T) => void) => {
    const effectAgent = EffectAgentInternal(() => fn(memoAgent.value.cachedValue));
    reactiveNetwork.addAgent(effectAgent);
    
    // Add initial subscription
    subscriptionQueue.push({ 
      type: 'subscribe', 
      sourceAgentId: memoAgent._agentId, 
      subscriberAgentId: effectAgent._agentId 
    });
    processSubscriptions();
    
    // Run the effect once to establish dependencies
    effectQueue.add(effectAgent);
    processEffects();
    
    // Return dispose function
    return () => {
      effectAgent.value.disposed = true;
      
      // Remove all subscriptions
      const depsArray = Array.from(effectAgent.value.dependencies);
      for (const depId of depsArray) {
        subscriptionQueue.push({ 
          type: 'unsubscribe', 
          sourceAgentId: depId, 
          subscriberAgentId: effectAgent._agentId 
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
  if (!reactiveNetwork) initReactiveSystem();
  
  // Create the effect agent
  const effectAgent = EffectAgentInternal(effectFn, options.name);
  
  // Add to the network
  reactiveNetwork.addAgent(effectAgent);
  
  // Run the effect once to establish dependencies
  effectQueue.add(effectAgent);
  processEffects();
  
  // Define the runner function
  const run = function() {
    if (!effectAgent.value.disposed) {
      effectQueue.add(effectAgent);
      scheduleBatch();
    }
  } as IEffect;
  
  // Define the dispose function
  const dispose = () => {
    effectAgent.value.disposed = true;
    
    // Remove all subscriptions
    const depsArray = Array.from(effectAgent.value.dependencies);
    for (const depId of depsArray) {
      subscriptionQueue.push({ 
        type: 'unsubscribe', 
        sourceAgentId: depId, 
        subscriberAgentId: effectAgent._agentId 
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
): [IMemo<T | undefined> & { loading: ISignal<boolean>, error: ISignal<any> }, { refetch: () => Promise<T> }] {
  if (!reactiveNetwork) initReactiveSystem();
  
  // Create signals for tracking state
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | undefined>(undefined);
  const [value, setValue] = createSignal<T | undefined>(options.initialValue);
  const [resolvedSource, setResolvedSource] = createSignal<U | undefined>(undefined);
  const [trigger, setTrigger] = createSignal(0); // For manual refetching
  
  // Create a memo for the resource value
  const resource = createMemo(() => {
    // Track dependencies on source, trigger, and value
    const currentSource = resolvedSource();
    trigger(); // Just to track the dependency
    return value();
  }, { name: options.name || "resource" });
  
  // Attach loading and error signals to the resource
  Object.defineProperties(resource, {
    loading: { get: () => loading },
    error: { get: () => error }
  });
  
  // Function to fetch the resource
  const refetch = async (): Promise<T> => {
    setLoading(true);
    setError(undefined);
    
    try {
      // Resolve the source value
      const sourceValue = await source();
      setResolvedSource(sourceValue);
      
      // Fetch the data
      const result = await fetcher(sourceValue as U);
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
    try {
      const sourceValue = source();
      if (sourceValue instanceof Promise) {
        sourceValue.then(value => {
          setResolvedSource(value);
          refetch();
        });
      } else {
        setResolvedSource(sourceValue);
        refetch();
      }
    } catch (error) {
      console.error("Error resolving source:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
      setLoading(false);
    }
  });
  
  return [resource as any, { refetch }];
}

/**
 * Create a resource using Annette's effect system
 */
export function createEffectResource<T, U = unknown>(
  source: () => U | Promise<U>,
  fetcher: (source: U) => Promise<T>,
  options: { 
    name?: string;
    initialValue?: T;
    effectType?: string;
    // Other effect-specific options
  } = {}
): [IMemo<T | undefined> & { loading: ISignal<boolean>, error: ISignal<any> }, { refetch: () => Promise<T> }] {
  if (!reactiveNetwork) initReactiveSystem();
  
  // This would use Annette's EffectAgent system for the actual fetching,
  // with the fetcher parameter translated into an effect handler.
  // For now, we'll implement a simple version similar to createResource.
  console.warn("createEffectResource is not fully implemented with Annette effects. Using standard fetching.");
  
  return createResource(source, fetcher, options);
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
    // Other sync-specific options
  } = {}
): [IMemo<T | undefined> & { loading: ISignal<boolean>, error: ISignal<any> }, { refetch: () => Promise<T> }] {
    if (!reactiveNetwork) initReactiveSystem();
    // This would involve integrating with Annette's SyncAgent, RemoteAgent,
    // and potentially CRDT-like structures (SharedMap, etc.) for the resource's state.
    // For now, returns a non-synced resource.
    console.warn("createSyncedResource is not fully implemented with Annette sync. Returning a local resource.");
    
    const [resource, { refetch }] = createResource(source, (sVal) => fetcher(sVal as U) as Promise<T>, options);
    return [resource as any, { refetch }];
}


export function batch<T>(fn: () => T): T {
  if (!reactiveNetwork) initReactiveSystem(); // Ensure system is up

  if (batchActive) { // Already in a batch, just run
    return fn();
  }
  
  batchActive = true;
  try {
    return fn();
  } finally {
    // This is a critical part: batchActive must be false *before* scheduleBatch
    // if scheduleBatch itself might re-enter or check batchActive.
    // The current scheduleBatch will not run if batchActive is true.
    batchActive = false; 
    scheduleBatch(); // Schedule the actual processing
  }
}

export function createRoot<T>(dispose: () => void, fn: () => T): T {
    if (!reactiveNetwork) initReactiveSystem();

    // Solid's createRoot creates a non-tracked scope and handles disposal of effects within it.
    // This implementation is simpler: runs `fn` non-tracked and calls `dispose` at the end.
    // A more complete version would manage a list of disposables created within `fn`.
    const prevStackLength = trackingStack.length;
    let result: T;
    try {
        result = fn();
    } finally {
        // Restore tracking stack to its previous state
        while (trackingStack.length > prevStackLength) {
            trackingStack.pop();
        }
        // Call the provided dispose function
        // This is where effects created inside fn would be cleaned up.
        if (dispose) {
            dispose();
        }
    }
    return result;
}


// createStore and CRDT-like structures (createReactiveMap, etc.)
// require more careful integration with Annette's specialized updaters (MapUpdater, etc.)
// and how changes are propagated and synchronized.
// The provided stubs are very high-level.

// Stub for createStore
export function createStore<T extends object>(
  initialValue: T
): [T, (updater: (prevState: T) => Partial<T> | void | T ) => void] {
  if (!reactiveNetwork) initReactiveSystem();
  // A true store would create signals for each property, or use a single signal
  // for the whole store object and rely on `equals: false` for complex objects.
  // This is a simplified version.
  const [storeSignal, setStoreSignal] = createSignal<T>(initialValue, { equals: () => false }); // equals:false for objects

  const setStore = (updater: (prevState: T) => Partial<T> | void | T ) => {
    // Calculate the new state by applying the updater to the current state
    const prev = storeSignal();
    const draft = { ...prev }; // Shallow clone for mutation
    const updateResult = updater(draft);
    const newState = updateResult === undefined ? draft : (updateResult as T);
    
    // Set the new state
    setStoreSignal(newState);
  };
  return [storeSignal() as T, setStore]; // Proxy would be better here
}


// Stub for createSharedSignal
export function createSharedSignal<T>(
  initialValue: T,
  options: SignalOptions<T> & {
    syncAgentName?: string; // Name of the SyncAgent in Annette
  } = {}
): [ISignal<T>, (value: T) => T] {
  if (!reactiveNetwork) initReactiveSystem();
  // This would use Annette's SyncAgent and a SharedMap/Value for the signal's state.
  console.warn("createSharedSignal is not fully implemented with Annette sync. Returning a local signal.");
  return createSignal(initialValue, options);
}

// Stub for createReactiveMap
export function createReactiveMap<K extends string | number | symbol, V>(
  initialValue: Record<K, V> = {} as Record<K, V>,
  options: { name?: string, syncAgentName?: string } = {}
): [IMemo<Readonly<Record<K,V>>>, {
  set: (key: K, value: V) => void;
  delete: (key: K) => void;
  clear: () => void;
}] {
  if (!reactiveNetwork) initReactiveSystem();
  const [mapSignal, setMapSignal] = createSignal<Record<K,V>>(initialValue, {equals: () => false});

  // In a real implementation, these operations would create MapUpdater agents
  // and connect them to an Annette createSharedMap agent.
  const operations = {
    set: (key: K, value: V) => {
      const prev = mapSignal();
      const next = {...prev};
      next[key] = value;
      setMapSignal(next);
    },
    delete: (key: K) => {
      const prev = mapSignal();
      const next = {...prev};
      delete next[key];
      setMapSignal(next);
    },
    clear: () => setMapSignal({} as Record<K,V>)
  };
  const memoizedMap = createMemo(() => mapSignal() as Readonly<Record<K,V>>, {name: options.name});
  return [memoizedMap, operations];
}

// Stub for createReactiveList
export function createReactiveList<T>(
  initialValue: T[] = [],
  options: { name?: string, syncAgentName?: string } = {}
): [IMemo<ReadonlyArray<T>>, {
  push: (...items: T[]) => number;
  pop: () => T | undefined;
  // Add other array methods as needed, using ListUpdater agents
  insertAt: (index: number, item: T) => void;
  removeAt: (index: number) => T | undefined;
  clear: () => void;
}] {
  if (!reactiveNetwork) initReactiveSystem();
  const [listSignal, setListSignal] = createSignal<T[]>(initialValue, {equals: () => false});

  const operations = {
    push: (...items: T[]) => { 
      const prev = listSignal();
      const next = [...prev, ...items]; 
      const len = next.length; 
      setListSignal(next); 
      return len;
    },
    pop: () => { 
      const prev = listSignal();
      const next = [...prev]; 
      const item = next.pop(); 
      setListSignal(next); 
      return item;
    },
    insertAt: (index: number, item: T) => {
      const prev = listSignal();
      const next = [...prev]; 
      next.splice(index, 0, item); 
      setListSignal(next);
    },
    removeAt: (index: number) => { 
      const prev = listSignal();
      const next = [...prev]; 
      const item = next.splice(index, 1)[0]; 
      setListSignal(next); 
      return item;
    },
    clear: () => setListSignal([])
  };
  const memoizedList = createMemo(() => listSignal() as ReadonlyArray<T>, {name: options.name});
  return [memoizedList, operations];
}

// Stub for createReactiveText
export function createReactiveText(
  initialValue: string = '',
  options: { name?: string, syncAgentName?: string } = {}
): [ISignal<string>, (value: string) => void, {
  insertAt: (position: number, text: string) => void;
  deleteAt: (position: number, length: number) => void;
}] {
  if (!reactiveNetwork) initReactiveSystem();
  const [textSignal, setTextSignal] = createSignal(initialValue);

  // These operations would use TextUpdater agents and createTextCRDTOperation
  const operations = {
    insertAt: (position: number, textToInsert: string) => {
      const prev = textSignal();
      const newText = prev.slice(0, position) + textToInsert + prev.slice(position);
      setTextSignal(newText);
    },
    deleteAt: (position: number, length: number) => {
      const prev = textSignal();
      const newText = prev.slice(0, position) + prev.slice(position + length);
      setTextSignal(newText);
    }
  };

  return [textSignal, setTextSignal, operations];
}

// Ensure the reactive system is initialized on module load,
// or provide an explicit initialization function that users must call.
// Calling it here makes it auto-initialize.
// initReactiveSystem(); // Auto-initialize on load
// Or, export initReactiveSystem and require users to call it.