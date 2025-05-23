# Annette-Solid: Advanced Integration Guide

This guide explains how Annette-Solid integrates with advanced Annette features like algebraic effects and cross-network synchronization to create a powerful reactive programming system.

## Table of Contents

1. [Introduction](#introduction)
2. [Core Architecture](#core-architecture)
3. [Integration with Algebraic Effects](#integration-with-algebraic-effects)
4. [Integration with Cross-Network Synchronization](#integration-with-cross-network-synchronization)
5. [Specialized Updaters for Complex Data](#specialized-updaters-for-complex-data)
6. [Complete Integration Patterns](#complete-integration-patterns)
7. [API Reference](#api-reference)
8. [Performance Considerations](#performance-considerations)
9. [Advanced Use Cases](#advanced-use-cases)

## Introduction

Annette-Solid combines the elegant reactive programming model of SolidJS with the powerful capabilities of Annette's interaction nets. This integration creates a system that can:

- Track dependencies automatically and update only what changed
- Handle asynchronous operations with algebraic effects
- Synchronize state across network boundaries
- Efficiently update complex data structures
- Create distributed, real-time collaborative applications

## Core Architecture

Annette-Solid follows a hybrid architecture:

1. **Annette Layer**: Manages the dependency graph and notification propagation using:
   - SignalAgent, MemoAgent, EffectAgent: For reactive primitives
   - SubscriptionManagerAgent: For dependency tracking
   - NotifyAgent, SubscribeAgent, UnsubscribeAgent: For communication

2. **JavaScript Layer**: Handles synchronous computation and provides a clean API:
   - createSignal, createMemo, createEffect: Core reactive primitives
   - createResource, createStore: Higher-level abstractions
   - batch, createRoot: Utility functions

The integration leverages Annette's unique capabilities:
- Agent/Connection graph for dependency representation
- ActionRules for propagating changes
- Network architecture for distribution

## Integration with Algebraic Effects

Annette's algebraic effects system provides a way to handle asynchronous operations elegantly using wait/hold ports. Annette-Solid integrates with this system to support:

### Enhanced Resources with Effects

```typescript
function createEffectResource<T>(source, options = {}) {
  // Standard resource signals
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(undefined);
  const [value, setValue] = createSignal(options.initialValue);
  
  // Create effect agent
  const fetchEffect = EffectAgent({
    type: options.effectType || 'fetch',
    url: options.url,
    source: source()
  });
  
  // Connect to handler
  network.connectPorts(fetchEffect.ports.hold, effectHandler.ports.hold);
  
  // Create component with wait port
  const component = Constructor({
    state: 'waiting',
    setValue: (result) => setValue(result)
  });
  
  // Connect component to effect
  network.connectPorts(component.ports.wait, fetchEffect.ports.wait);
  
  // Refetch function
  const refetch = () => {
    setLoading(true);
    // Create new effect agent and connections
    // ...
  };
  
  return [{ loading, error, value }, refetch];
}
```

### Suspense Pattern

```typescript
function createSuspense(fallback, children) {
  const [suspended, setSuspended] = createSignal(false);
  
  // Create a context for suspense
  const suspenseContext = {
    suspend: (promise) => {
      setSuspended(true);
      
      // Create a suspend effect
      const suspendEffect = EffectAgent({
        type: 'suspend',
        promise
      });
      
      // Add to network
      network.addAgent(suspendEffect);
      
      // When the effect resolves, setSuspended(false)
      // ...
    }
  };
  
  return () => suspended() ? fallback : children;
}
```

### Error Boundaries

```typescript
function createErrorBoundary(fallback, children) {
  const [error, setError] = createSignal(undefined);
  
  // Create error handler
  const errorHandler = HandlerAgent({
    'error': (effect) => {
      setError(effect.error);
      return { handled: true };
    }
  });
  
  // Add to network
  network.addAgent(errorHandler);
  
  // Reset function
  const reset = () => setError(undefined);
  
  return () => error() ? fallback(error(), reset) : children;
}
```

## Integration with Cross-Network Synchronization

Annette-Solid integrates with Annette's cross-network synchronization system using sync/remote ports to support distributed applications.

### Shared Signals

```typescript
function createSharedSignal<T>(initialValue, options = {}) {
  // Create standard signal
  const [value, setValue] = createSignal(initialValue);
  
  // Create shared document for network sync
  const sharedDoc = createSharedMap({
    value: initialValue,
    lastUpdated: Date.now()
  });
  
  // Create sync agent
  const syncAgent = SyncAgent(
    options.networkId || 'default',
    options.signalId || `signal-${Math.random().toString(36).substring(2)}`
  );
  
  // Connect document to sync agent
  network.connectPorts(sharedDoc.ports.sync, syncAgent.ports.sync);
  
  // Update shared doc when signal changes
  createEffect(() => {
    sharedDoc.value = {
      value: value(),
      lastUpdated: Date.now()
    };
  });
  
  // Update signal when shared doc changes from network
  createEffect(() => {
    const newValue = sharedDoc.value.value;
    if (newValue !== value()) {
      setValue(newValue);
    }
  });
  
  return [value, setValue];
}
```

### Synced Resources

```typescript
function createSyncedResource<T>(source, fetcher, options = {}) {
  // Standard resource implementation
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(undefined);
  const [value, setValue] = createSignal(options.initialValue);
  
  // Create shared document for network sync
  const sharedResource = createSharedMap({
    value: options.initialValue,
    loading: true,
    error: null,
    sourceHash: '',
    lastUpdated: Date.now()
  });
  
  // Create sync agent
  const syncAgent = SyncAgent(
    options.networkId || 'default',
    options.resourceId || `resource-${Math.random().toString(36).substring(2)}`
  );
  
  // Connect document to sync agent
  network.connectPorts(sharedResource.ports.sync, syncAgent.ports.sync);
  
  // Track last local update
  let lastLocalUpdate = Date.now();
  
  // Update shared doc when resource changes locally
  createEffect(() => {
    lastLocalUpdate = Date.now();
    sharedResource.value = {
      value: value(),
      loading: loading(),
      error: error()?.message,
      lastUpdated: lastLocalUpdate
    };
  });
  
  // Update resource when shared doc changes from network
  createEffect(() => {
    // Only update if the change originated elsewhere
    if (sharedResource.value.lastUpdated !== lastLocalUpdate) {
      setLoading(sharedResource.value.loading);
      setValue(sharedResource.value.value);
      
      if (sharedResource.value.error) {
        setError(new Error(sharedResource.value.error));
      } else {
        setError(undefined);
      }
    }
  });
  
  // Standard refetch implementation
  // ...
  
  return [{ loading, error, latest: createMemo(() => value()) }, refetch];
}
```

### Network Boundary Integration

```typescript
function createNetworkBoundaryStore<T extends object>(initialValue, options = {}) {
  // Create local store
  const [state, setState] = createStore(initialValue);
  
  // Create network boundary agents
  const boundary = createNetworkBoundaryAgent(options.storeId || 'store');
  
  // Send local changes across boundary
  createEffect(() => {
    const message = {
      type: 'store-update',
      storeId: options.storeId,
      value: JSON.parse(JSON.stringify(state))
    };
    
    const sender = createMessageSender(message);
    network.addAgent(sender);
    network.connectPorts(sender.ports.main, boundary.ports.send);
  });
  
  // Receive remote changes
  const receiver = createMessageReceiver();
  network.addAgent(receiver);
  network.connectPorts(receiver.ports.main, boundary.ports.receive);
  
  createEffect(() => {
    if (receiver.value.message?.type === 'store-update' && 
        receiver.value.message?.storeId === options.storeId) {
      batch(() => {
        setState(draft => {
          Object.assign(draft, receiver.value.message.value);
        });
      });
    }
  });
  
  return [state, setState];
}
```

## Specialized Updaters for Complex Data

Annette-Solid integrates with Annette's specialized updaters to efficiently handle complex data structures like maps, lists, and text.

### Reactive Map

```typescript
function createReactiveMap<K, V>(initialValue = new Map<K, V>(), options = {}) {
  // Create shared map using specialized updater
  const mapAgent = createSharedMap(
    Object.fromEntries(initialValue.entries())
  );
  
  // Add to network
  network.addAgent(mapAgent);
  
  // Create reactive wrapper
  const [state, setState] = createSignal(initialValue);
  
  // Create map operations
  const set = (key, value) => {
    // Create a map updater
    const updater = MapUpdater(
      { type: 'set', key: String(key), value },
      []
    );
    
    // Apply update
    network.addAgent(updater);
    network.connectPorts(updater.ports.main, mapAgent.ports.main);
    
    // Update reactive state
    setState(new Map([...state().entries(), [key, value]]));
  };
  
  const remove = (key) => {
    // Create a map updater
    const updater = MapUpdater(
      { type: 'delete', key: String(key) },
      []
    );
    
    // Apply update
    network.addAgent(updater);
    network.connectPorts(updater.ports.main, mapAgent.ports.main);
    
    // Update reactive state
    const newMap = new Map(state().entries());
    newMap.delete(key);
    setState(newMap);
  };
  
  // Sync agent data with reactive state
  createEffect(() => {
    const mapValue = mapAgent.value;
    const currentMap = state();
    
    let changed = false;
    const newMap = new Map();
    
    // Check for updates
    for (const [key, value] of Object.entries(mapValue)) {
      if (key !== '__metadata') {
        newMap.set(key, value);
        if (currentMap.get(key) !== value) {
          changed = true;
        }
      }
    }
    
    // Update state if changed
    if (changed) {
      setState(newMap);
    }
  });
  
  return [state, { set, remove }];
}
```

### Collaborative Text

```typescript
function createCollaborativeText(initialValue = '', options = {}) {
  // Create shared text using specialized updater
  const textAgent = createSharedText(initialValue);
  
  // Add to network
  network.addAgent(textAgent);
  
  // Create reactive wrapper
  const [text, setText] = createSignal(initialValue);
  
  // Create text operations
  const insertAt = (position, value) => {
    // Create a text updater with CRDT operation
    const updater = TextUpdater(
      createTextCRDTOperation('insert', position, value),
      []
    );
    
    // Apply update
    network.addAgent(updater);
    network.connectPorts(updater.ports.main, textAgent.ports.main);
  };
  
  const deleteAt = (position, length = 1) => {
    // Create a text updater with CRDT operation
    const updater = TextUpdater(
      createTextCRDTOperation('delete', position, undefined, length),
      []
    );
    
    // Apply update
    network.addAgent(updater);
    network.connectPorts(updater.ports.main, textAgent.ports.main);
  };
  
  // Sync agent data with reactive state
  createEffect(() => {
    if (textAgent.value.text !== text()) {
      setText(textAgent.value.text);
    }
  });
  
  // Sync reactive state with agent data
  createEffect(() => {
    // Only update if direct setText was called
    if (text() !== textAgent.value.text) {
      // Create a set operation
      const updater = TextUpdater(
        createTextCRDTOperation('set', 0, text(), text().length),
        []
      );
      
      // Apply update
      network.addAgent(updater);
      network.connectPorts(updater.ports.main, textAgent.ports.main);
    }
  });
  
  return [text, setText, { insertAt, deleteAt }];
}
```

## Complete Integration Patterns

The following patterns demonstrate how to combine all three systems - reactive primitives, algebraic effects, and cross-network synchronization.

### Collaborative Document Editor

```typescript
function createDocumentEditor(docId, options = {}) {
  // Initialize networks
  const localNetwork = Network("local");
  const remoteNetwork = Network("remote");
  
  // Register necessary rules
  registerReactiveRules(localNetwork);
  registerEffectRules(localNetwork);
  registerSyncRules(localNetwork);
  registerSpecializedUpdaterRules(localNetwork);
  
  // Create network boundary
  const [localToBoundary, boundaryToLocal] = NetworkBoundary.createBidirectional(
    localNetwork,
    remoteNetwork
  );
  
  // Create document data
  const [text, setText, textOps] = createCollaborativeText('');
  const [metadata, setMetadata] = createStore({
    title: 'Untitled Document',
    authors: [],
    lastModified: new Date().toISOString()
  });
  
  // Create effects handler
  const effectHandler = HandlerAgent({
    'save': async (effect) => {
      // Simulate saving to server
      console.log(`Saving document ${effect.docId}:`, effect.content);
      return { success: true, timestamp: new Date().toISOString() };
    },
    'load': async (effect) => {
      // Simulate loading from server
      console.log(`Loading document ${effect.docId}`);
      return { 
        content: `Content of document ${effect.docId}`,
        metadata: {
          title: `Document ${effect.docId}`,
          authors: ['User 1'],
          lastModified: new Date().toISOString()
        }
      };
    }
  });
  
  // Add to network
  localNetwork.addAgent(effectHandler);
  
  // Create load resource
  const [document, loadDocument] = createEffectResource(
    () => ({ docId }),
    async (params) => {
      // Create effect for loading
      const loadEffect = EffectAgent({
        type: 'load',
        docId: params.docId
      });
      
      // Connect to handler
      localNetwork.addAgent(loadEffect);
      localNetwork.connectPorts(loadEffect.ports.hold, effectHandler.ports.hold);
      
      // Simulate waiting for result
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            content: `Content of document ${params.docId}`,
            metadata: {
              title: `Document ${params.docId}`,
              authors: ['User 1'],
              lastModified: new Date().toISOString()
            }
          });
        }, 1000);
      });
    },
    { name: 'document', networkId: 'docs', resourceId: docId, sync: true }
  );
  
  // Initialize content when document loads
  createEffect(() => {
    const doc = document.latest();
    if (doc) {
      setText(doc.content);
      setMetadata(draft => {
        Object.assign(draft, doc.metadata);
      });
    }
  });
  
  // Save function using effects
  const saveDocument = async () => {
    // Create save effect
    const saveEffect = EffectAgent({
      type: 'save',
      docId,
      content: text(),
      metadata: metadata
    });
    
    // Connect to handler
    localNetwork.addAgent(saveEffect);
    localNetwork.connectPorts(saveEffect.ports.hold, effectHandler.ports.hold);
    
    // Simulate waiting for result
    return new Promise(resolve => {
      setTimeout(() => {
        setMetadata(draft => {
          draft.lastModified = new Date().toISOString();
        });
        resolve({ success: true });
      }, 1000);
    });
  };
  
  // Auto-save effect
  createEffect(() => {
    // Track text changes
    const currentText = text();
    const debounceTimeout = setTimeout(() => {
      saveDocument();
    }, 2000);
    
    return () => clearTimeout(debounceTimeout);
  });
  
  // Return the editor API
  return {
    text,
    setText,
    metadata,
    setMetadata,
    textOps,
    loading: document.loading,
    error: document.error,
    save: saveDocument,
    reload: loadDocument
  };
}
```

### Reactive Database with Distributed Cache

```typescript
function createReactiveDatabase(options = {}) {
  // Initialize networks
  const clientNetwork = Network("client");
  const serverNetwork = Network("server");
  
  // Create network boundary
  const boundary = NetworkBoundary.createBidirectional(
    clientNetwork,
    serverNetwork
  )[0];
  
  // Create shared cache
  const cache = createSharedMap({});
  clientNetwork.addAgent(cache);
  
  // Register with boundary
  boundary.registerNode(cache);
  
  // Create query resource factory
  const createQuery = (queryKey, queryFn, options = {}) => {
    // Check cache first
    const cachedData = cache.value[queryKey];
    const cacheIsValid = cachedData && 
      (Date.now() - cachedData.timestamp < (options.staleTime || 60000));
    
    // Create the resource
    const [query, refetch] = createResource(
      () => queryKey,
      async (key) => {
        // Check cache first (again, in case it was updated)
        const currentCache = cache.value[key];
        if (currentCache && 
            (Date.now() - currentCache.timestamp < (options.staleTime || 60000))) {
          return currentCache.data;
        }
        
        // Execute query function
        const result = await queryFn(key);
        
        // Update cache
        const cacheEntry = {
          data: result,
          timestamp: Date.now(),
          key
        };
        
        // Use MapUpdater for efficient updates
        const updater = MapUpdater(
          { type: 'set', key, value: cacheEntry },
          []
        );
        
        clientNetwork.addAgent(updater);
        clientNetwork.connectPorts(updater.ports.main, cache.ports.main);
        
        return result;
      },
      {
        initialValue: cacheIsValid ? cachedData.data : undefined
      }
    );
    
    // Handle cache invalidation
    const invalidate = () => {
      if (cache.value[queryKey]) {
        const updater = MapUpdater(
          { type: 'delete', key: queryKey },
          []
        );
        
        clientNetwork.addAgent(updater);
        clientNetwork.connectPorts(updater.ports.main, cache.ports.main);
      }
      
      return refetch(true);
    };
    
    return { 
      data: query.latest, 
      loading: query.loading, 
      error: query.error,
      refetch,
      invalidate
    };
  };
  
  // Create mutation function
  const createMutation = (mutationFn, options = {}) => {
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal(undefined);
    const [data, setData] = createSignal(undefined);
    
    const mutate = async (variables) => {
      setLoading(true);
      setError(undefined);
      
      try {
        const result = await mutationFn(variables);
        setData(result);
        
        // Invalidate affected queries
        if (options.invalidateQueries) {
          options.invalidateQueries.forEach(queryKey => {
            if (cache.value[queryKey]) {
              const updater = MapUpdater(
                { type: 'delete', key: queryKey },
                []
              );
              
              clientNetwork.addAgent(updater);
              clientNetwork.connectPorts(updater.ports.main, cache.ports.main);
            }
          });
        }
        
        return result;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    };
    
    return { 
      mutate, 
      loading, 
      error, 
      data
    };
  };
  
  return {
    createQuery,
    createMutation,
    clearCache: () => {
      // Use specialized updater to clear cache
      const updater = MapUpdater(
        { type: 'set', key: '', value: {} },
        []
      );
      
      clientNetwork.addAgent(updater);
      clientNetwork.connectPorts(updater.ports.main, cache.ports.main);
    }
  };
}
```

## Implementation Details

The Annette-Solid library is implemented using a hybrid architecture that combines Annette's graph-based computation model with JavaScript's reactive programming capabilities.

### Core Implementation

The core implementation consists of:

1. **Agent Types**:
   ```typescript
   // Signal agent for reactive state
   function SignalAgent<T>(value: T, options): IAgent<"Signal", SignalAgentValue<T>>
   
   // Memo agent for derived state
   function MemoAgent<T>(computeFn, managerAgentId, name?): IAgent<"Memo", MemoAgentValue<T>>
   
   // Effect agent for side effects
   function EffectAgent(effectFn, name?): IAgent<"Effect", EffectAgentValue>
   
   // Subscription manager agent
   function SubscriptionManagerAgent(sourceAgentId): IAgent<"SubscriptionManager", SubscriptionManagerAgentValue>
   
   // Message agents for communication
   function NotifyAgent(sourceAgentId): IAgent<"Notify", NotifyAgentValue>
   function SubscribeAgent(subscriberAgentId): IAgent<"Subscribe", SubscribeAgentValue>
   function UnsubscribeAgent(subscriberAgentId): IAgent<"Unsubscribe", UnsubscribeAgentValue>
   ```

2. **ActionRules**:
   ```typescript
   // Register rules for reactive operations
   function registerReactiveRules(network: INetwork): void {
     // Rule for subscribe messages
     network.addRule(ActionRule(
       { name: "Subscribe-Manager", type: "action" },
       { agentName1: "Subscribe", portName1: "main", agentName2: "SubscriptionManager", portName2: "main" },
       (subscribe, manager, network) => {
         // Add subscriber to manager's list
         manager.value.subscribers.add(subscribe.value.subscriberAgentId);
         return [subscribe, manager];
       }
     ));
     
     // Rule for unsubscribe messages
     network.addRule(ActionRule(
       { name: "Unsubscribe-Manager", type: "action" },
       { agentName1: "Unsubscribe", portName1: "main", agentName2: "SubscriptionManager", portName2: "main" },
       (unsubscribe, manager, network) => {
         // Remove subscriber from manager's list
         manager.value.subscribers.delete(unsubscribe.value.subscriberAgentId);
         return [unsubscribe, manager];
       }
     ));
     
     // Rule for notify messages
     network.addRule(ActionRule(
       { name: "Notify-Manager", type: "action" },
       { agentName1: "Notify", portName1: "main", agentName2: "SubscriptionManager", portName2: "main" },
       (notify, manager, network) => {
         // Create a notify agent for each subscriber
         const results = [notify, manager];
         
         for (const subscriberId of manager.value.subscribers) {
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
     
     // Rule for notifying memos
     network.addRule(ActionRule(
       { name: "Notify-Memo", type: "action" },
       { agentName1: "Notify", portName1: "main", agentName2: "Memo", portName2: "trigger_in" },
       (notify, memo, network) => {
         // Mark memo as dirty and propagate notification
         if (!memo.value.dirty) {
           memo.value.dirty = true;
           
           // Get the memo's manager
           const manager = network.getAgent(memo.value.managerAgentId);
           
           if (manager) {
             // Create a new notify agent
             const newNotify = NotifyAgent(memo._agentId);
             
             return [
               notify, 
               memo,
               { type: 'add', entity: newNotify, throwIfExists: false },
               { type: 'add', entity: Connection(newNotify.ports.main, manager.ports.main), throwIfExists: false }
             ];
           }
         }
         
         return [notify, memo];
       }
     ));
     
     // Rule for notifying effects
     network.addRule(ActionRule(
       { name: "Notify-Effect", type: "action" },
       { agentName1: "Notify", portName1: "main", agentName2: "Effect", portName2: "trigger_in" },
       (notify, effect, network) => {
         // Add effect to queue
         if (!effect.value.disposed) {
           effectQueue.add(effect);
         }
         
         return [notify, effect];
       }
     ));
   }
   ```

3. **Dependency Tracking**:
   ```typescript
   // Global tracking stack
   const trackingStack: Array<Set<string>> = [];
   
   // Start tracking dependencies
   function startTracking(): void {
     trackingStack.push(new Set<string>());
   }
   
   // Stop tracking and return dependencies
   function stopTracking(): Set<string> {
     return trackingStack.pop() || new Set<string>();
   }
   
   // Track a dependency
   function trackDependency(agentId: string): void {
     if (trackingStack.length > 0) {
       trackingStack[trackingStack.length - 1].add(agentId);
     }
   }
   
   // Update dependencies for an agent
   function updateDependencies(agent: IAgent, newDeps: Set<string>): void {
     const oldDeps = agent.value.dependencies as Set<string>;
     
     // Find dependencies to add
     for (const depId of newDeps) {
       if (!oldDeps.has(depId)) {
         subscriptionQueue.push({ type: 'subscribe', source: depId, subscriber: agent._agentId });
       }
     }
     
     // Find dependencies to remove
     for (const depId of oldDeps) {
       if (!newDeps.has(depId)) {
         subscriptionQueue.push({ type: 'unsubscribe', source: depId, subscriber: agent._agentId });
       }
     }
     
     // Update the dependencies
     agent.value.dependencies = newDeps;
   }
   ```

4. **Batch Processing**:
   ```typescript
   // Process all pending effects
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
   
   // Process all pending subscriptions
   function processSubscriptions(): void {
     // Process subscription queue...
   }
   
   // Run a batch of reactive updates
   async function runBatch(): Promise<void> {
     if (batchActive) return;
     
     batchActive = true;
     
     try {
       let stability = false;
       
       while (!stability) {
         // Process Annette network
         reactiveNetwork.reduce();
         
         // Process effects
         if (effectQueue.size > 0) {
           processEffects();
           
           // Process subscriptions
           if (subscriptionQueue.length > 0) {
             processSubscriptions();
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
   ```

### Advanced Features Implementation

1. **Effect Resource Implementation**:
   ```typescript
   function createEffectResource<T, U = unknown>(
     source: () => U | Promise<U>,
     effectType: string = 'fetch',
     options: { 
       name?: string;
       initialValue?: T;
       handlerName?: string;
     } = {}
   ): [ResourceReturn<T>, (refetching?: boolean) => Promise<T>] {
     // Create signals for tracking state
     const [loading, setLoading] = createSignal(true);
     const [error, setError] = createSignal<Error | undefined>(undefined);
     const [value, setValue] = createSignal<T | undefined>(options.initialValue);
     
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
           // Add appropriate properties based on the source value
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
         
         // Connect to handler
         // ...
         
         // Wait for result
         // ...
       } catch (err) {
         // Handle errors
         // ...
       }
     };
     
     // ...
   }
   ```

2. **Synced Resource Implementation**:
   ```typescript
   function createSyncedResource<T, U = unknown>(
     source: () => U | Promise<U>,
     fetcher: (source: U) => Promise<T>,
     options: {
       name?: string;
       initialValue?: T;
       networkId?: string;
       resourceId?: string;
       sync?: boolean;
     } = {}
   ): [ResourceReturn<T>, (refetching?: boolean) => Promise<T>] {
     // Create standard resource signals
     // ...
     
     // If sync is enabled, create sync agents and shared data
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
         sourceHash: ""
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
         
         // Only update if the data came from elsewhere
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
     // ...
   }
   ```

3. **Specialized Data Structure Implementation**:
   ```typescript
   function createReactiveText(
     initialValue: string = '',
     options: {
       name?: string;
       networkId?: string;
       textId?: string;
       sync?: boolean;
     } = {}
   ): [ISignal<string>, (value: string) => void, TextOperations] {
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
         // ...
       },
       
       // Additional operations
       // ...
     };
     
     // ...
   }
   ```

## Performance Considerations

When integrating Annette-Solid with algebraic effects and cross-network synchronization, consider the following performance optimizations:

### 1. Efficient Batch Processing

```typescript
// Use batch for multiple updates
batch(() => {
  setUser({ name: 'Jane Doe' });
  setPermissions(['read', 'write']);
  setPreferences({ theme: 'dark' });
});
```

### 2. Lazy Computation

```typescript
// Memos are computed only when accessed
const expensiveComputation = createMemo(() => {
  console.log('Computing...');
  return heavyCalculation(data());
});

// Reading a memo triggers computation only if dependencies changed
createEffect(() => {
  if (shouldCompute()) {
    console.log('Result:', expensiveComputation());
  }
});
```

### 3. Shared Resources

```typescript
// Create a shared resource that uses distributed caching
const [users, refetchUsers] = createSyncedResource(
  () => '/api/users',
  fetchUsers,
  {
    networkId: 'app',
    resourceId: 'users',
    sync: true,
    staleTime: 5 * 60 * 1000 // 5 minutes
  }
);
```

### 4. Specialized Updaters

```typescript
// Use specialized updaters for efficient updates
const [list, listActions] = createReactiveList([1, 2, 3]);

// This is more efficient than replacing the entire list
listActions.insertAt(1, 1.5);
```

## Advanced Use Cases

### 1. Real-time Collaborative Applications

```typescript
const editor = createCollaborativeEditor('doc-123', {
  // Network configuration
  networkId: 'editors',
  syncInterval: 500,
  
  // Conflict resolution strategy
  conflictStrategy: 'last-write-wins',
  
  // Permissions
  permissions: {
    read: true,
    write: true
  },
  
  // Effects configuration
  effectTypes: ['fetch', 'save', 'presence']
});

// Use the editor
editor.setText('Hello, world!');
editor.formatSelection('bold');
editor.addComment('Great intro!');

// Subscribe to remote changes
createEffect(() => {
  console.log('Remote user cursors:', editor.remoteCursors());
});
```

### 2. Offline-First Applications

```typescript
const offlineStore = createOfflineStore({
  // Storage options
  storage: 'indexedDB',
  storeName: 'app-data',
  
  // Sync options
  syncUrl: '/api/sync',
  conflictResolution: 'server-wins',
  
  // Queue options
  maxQueue: 100,
  persistQueue: true
});

// Use offline-capable store
const [data, setData] = offlineStore.createStore({
  user: { name: 'Guest' },
  items: []
});

// Queue operations while offline
offlineStore.queueOperation('update-user', { name: 'John' });

// Sync when back online
createEffect(() => {
  if (navigator.onLine) {
    offlineStore.sync();
  }
});
```

### 3. Distributed State Machines

```typescript
const workflow = createDistributedStateMachine('order-process', {
  initialState: 'draft',
  states: {
    draft: {
      on: { SUBMIT: 'pending' }
    },
    pending: {
      on: { APPROVE: 'approved', REJECT: 'rejected' }
    },
    approved: {
      on: { SHIP: 'shipped' }
    },
    rejected: {
      on: { REVISE: 'draft' }
    },
    shipped: {
      on: { DELIVER: 'delivered' }
    },
    delivered: {
      type: 'final'
    }
  }
}, {
  // Network options
  networkId: 'workflows',
  sync: true,
  
  // Effects
  effectHandlers: {
    onTransition: (from, to) => {
      console.log(`Transitioned from ${from} to ${to}`);
    }
  }
});

// Use the state machine
const [state, send] = workflow;

// Transition the state
send('SUBMIT');

// React to state changes
createEffect(() => {
  console.log('Current state:', state());
});
```

### 4. Combined Systems Example

Here's an example that combines all three systems:

```typescript
function createTaskManagementSystem() {
  // Initialize the system
  const system = {
    // Tasks state with specialized updaters
    tasks: createReactiveList([]),
    
    // User state with network sync
    user: createSharedSignal({ name: 'Guest' }, {
      networkId: 'app',
      signalId: 'current-user'
    })[0],
    
    // Add task with algebraic effects
    addTask: async (title) => {
      // Create effect for task creation
      const createEffect = EffectAgent({
        type: 'create-task',
        title,
        assignee: system.user().name
      });
      
      // Process effect
      network.addAgent(createEffect);
      network.connectPorts(createEffect.ports.hold, taskHandler.ports.hold);
      
      // Wait for result
      // ...implementation details...
      
      // Add to list with specialized updater
      const task = { id: Date.now(), title, completed: false };
      system.tasks.push(task);
      
      return task;
    },
    
    // Toggle task completion
    toggleTask: (id) => {
      const index = system.tasks().findIndex(t => t.id === id);
      if (index >= 0) {
        const task = system.tasks()[index];
        const updater = ListUpdater(
          { 
            type: 'set', 
            index, 
            value: { ...task, completed: !task.completed } 
          },
          []
        );
        
        network.addAgent(updater);
        // Connect to tasks list...
      }
    },
    
    // Search with resource and cache
    search: createQuery(
      (term) => `search:${term}`,
      async (term) => {
        // Create effect for search
        const searchEffect = EffectAgent({
          type: 'search',
          term
        });
        
        // Process effect
        // ...implementation details...
        
        return [/* search results */];
      },
      { staleTime: 60000 }
    )
  };
  
  return system;
}
```

## API Reference

Annette-Solid provides a comprehensive API that integrates all of Annette's advanced features.

### Core Reactive Primitives

```typescript
// Create a reactive signal
function createSignal<T>(
  initialValue: T, 
  options?: SignalOptions<T>
): [ISignal<T>, (value: T) => T]

// Create a derived value
function createMemo<T>(
  compute: () => T, 
  options?: { name?: string }
): IMemo<T>

// Create a side effect
function createEffect(
  effectFn: () => void,
  options?: { name?: string }
): IEffect

// Create a reactive store for objects
function createStore<T extends object>(
  initialValue: T
): [T, (fn: (state: T) => void) => void]

// Batch multiple updates
function batch<T>(fn: () => T): T

// Create a root component
function createRoot<T>(fn: () => T): T

// Standard resource for async data
function createResource<T, U = unknown>(
  source: () => U | Promise<U>,
  fetcher: (source: U) => Promise<T>,
  options?: { name?: string, initialValue?: T }
): [ResourceReturn<T>, (refetching?: boolean) => Promise<T>]
```

### Algebraic Effects Integration

```typescript
// Create a resource using algebraic effects
function createEffectResource<T, U = unknown>(
  source: () => U | Promise<U>,
  effectType?: string,
  options?: { 
    name?: string;
    initialValue?: T;
    handlerName?: string;
  }
): [ResourceReturn<T>, (refetching?: boolean) => Promise<T>]
```

### Cross-Network Synchronization

```typescript
// Create a resource that synchronizes across networks
function createSyncedResource<T, U = unknown>(
  source: () => U | Promise<U>,
  fetcher: (source: U) => Promise<T>,
  options?: {
    name?: string;
    initialValue?: T;
    networkId?: string;
    resourceId?: string;
    sync?: boolean;
  }
): [ResourceReturn<T>, (refetching?: boolean) => Promise<T>]

// Create a signal that synchronizes across networks
function createSharedSignal<T>(
  initialValue: T,
  options?: SignalOptions<T> & {
    networkId?: string;
    signalId?: string;
    sync?: boolean;
  }
): [ISignal<T>, (value: T) => T]
```

### Specialized Data Structures

```typescript
// Create a reactive map with specialized updaters
function createReactiveMap<K extends string | number | symbol, V>(
  initialValue?: Record<K, V>,
  options?: {
    name?: string;
    networkId?: string;
    mapId?: string;
    sync?: boolean;
  }
): [
  ISignal<Record<K, V>>, 
  {
    set: (key: K, value: V) => void;
    delete: (key: K) => void;
    clear: () => void;
  }
]

// Create a reactive list with specialized updaters
function createReactiveList<T>(
  initialValue?: T[],
  options?: {
    name?: string;
    networkId?: string;
    listId?: string;
    sync?: boolean;
  }
): [
  ISignal<T[]>, 
  {
    push: (item: T) => void;
    insertAt: (index: number, item: T) => void;
    removeAt: (index: number) => void;
    update: (index: number, item: T) => void;
    clear: () => void;
  }
]

// Create a collaborative text editor
function createReactiveText(
  initialValue?: string,
  options?: {
    name?: string;
    networkId?: string;
    textId?: string;
    sync?: boolean;
  }
): [
  ISignal<string>, 
  (value: string) => void, 
  {
    insertAt: (position: number, text: string) => void;
    deleteAt: (position: number, length: number) => void;
    replace: (position: number, length: number, text: string) => void;
  }
]
```

### Required Setup

```typescript
// Import everything
import { 
  // Core primitives
  createSignal, createMemo, createEffect, createRoot,
  // Resources
  createResource, createEffectResource, createSyncedResource,
  // Sync capabilities
  createSharedSignal,
  // Data structures
  createReactiveMap, createReactiveList, createReactiveText,
  // Additional required imports
  registerEffectRules, registerSyncRules, registerSpecializedUpdaterRules
} from 'annette';

// Initialize networks and rules
const network = Network("my-app");
registerEffectRules(network);
registerSyncRules(network);
registerSpecializedUpdaterRules(network);

// For cross-network communication
const [localToBoundary, boundaryToLocal] = NetworkBoundary.createBidirectional(
  localNetwork, 
  remoteNetwork
);
```

## Conclusion

Annette-Solid's integration with algebraic effects and cross-network synchronization creates a powerful reactive programming system capable of building sophisticated distributed applications. By leveraging Annette's unique capabilities, you can create applications that are:

- **Reactive**: Automatically update in response to state changes
- **Distributed**: Synchronize state across network boundaries
- **Asynchronous**: Handle complex async operations elegantly
- **Efficient**: Update only what changed with specialized updaters
- **Collaborative**: Enable real-time collaboration between users

This integration demonstrates the power of combining Annette's graph-based computation model with modern reactive programming paradigms.