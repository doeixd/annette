# Annette-Solid: Reactive Library Implementation

This document explains how the SolidJS-like reactive library is implemented using Annette's interaction nets.

## Architecture Overview

Annette-Solid follows a hybrid architecture:

1. **Annette Layer**: Manages the dependency graph structure and notification propagation.
2. **JavaScript Layer**: Handles synchronous computation, dependency tracking, and effect execution.

## Core Components

### Agent Types

1. **SignalAgent**: Holds reactive state.
   ```typescript
   function SignalAgent<T>(value: T, options): IAgent<"Signal", SignalAgentValue<T>>
   ```

2. **MemoAgent**: Represents a computed/memoized value.
   ```typescript
   function MemoAgent<T>(computeFn, managerAgentId, name?): IAgent<"Memo", MemoAgentValue<T>>
   ```

3. **EffectAgent**: Represents a side effect.
   ```typescript
   function EffectAgent(effectFn, name?): IAgent<"Effect", EffectAgentValue>
   ```

4. **SubscriptionManagerAgent**: Manages dependents for a signal or memo.
   ```typescript
   function SubscriptionManagerAgent(sourceAgentId): IAgent<"SubscriptionManager", SubscriptionManagerAgentValue>
   ```

5. **Message Agents**:
   - **NotifyAgent**: Signals that a source has changed.
   - **SubscribeAgent**: Requests a subscription.
   - **UnsubscribeAgent**: Requests an unsubscription.

### Interaction Rules

1. **Subscribe-Manager**: Adds a subscriber to a manager's list.
2. **Unsubscribe-Manager**: Removes a subscriber from a manager's list.
3. **Notify-Manager**: Creates notify agents for each subscriber.
4. **Notify-Memo**: Marks a memo as dirty and propagates notification.
5. **Notify-Effect**: Adds an effect to the execution queue.

### Dependency Tracking

JavaScript-based dependency tracking:
- Global tracking stack that maintains sets of dependencies.
- `startTracking()` and `stopTracking()` to begin/end tracking context.
- `trackDependency(agentId)` to register a dependency.
- `updateDependencies(agent, newDeps)` to update an agent's dependencies.

### Batch Processing

Three-phase batch processing:
1. **Propagate Notifications**: Process Annette network to propagate notifications.
2. **Run Effects**: Execute pending effects with dependency tracking.
3. **Process Subscriptions**: Update the dependency graph based on new subscriptions.

## Public API

### Core Primitives

1. **createSignal**: Creates a reactive signal with getter/setter.
   ```typescript
   function createSignal<T>(initialValue: T, options?: SignalOptions<T>): [ISignal<T>, (value: T) => T]
   ```

2. **createMemo**: Creates a derived value that updates automatically.
   ```typescript
   function createMemo<T>(compute: () => T, options?: { name?: string }): IMemo<T>
   ```

3. **createEffect**: Creates a side effect that runs when dependencies change.
   ```typescript
   function createEffect(effectFn: () => void, options?: { name?: string }): IEffect
   ```

### Advanced Features

1. **createResource**: Handles async data fetching.
   ```typescript
   function createResource<T, U = unknown>(
     source: () => U | Promise<U>,
     fetcher: (source: U) => Promise<T>,
     options?: { name?: string, initialValue?: T }
   ): [{ loading, error, latest }, (refetching?: boolean) => Promise<T>]
   ```

2. **batch**: Batches multiple updates for better performance.
   ```typescript
   function batch<T>(fn: () => T): T
   ```

3. **createRoot**: Creates an isolated root for cleanup.
   ```typescript
   function createRoot<T>(fn: () => T): T
   ```

4. **createStore**: Creates a reactive object with auto-tracking properties.
   ```typescript
   function createStore<T extends object>(initialValue: T): [T, (fn: (state: T) => void) => void]
   ```

## Implementation Details

### Connection Between JavaScript and Annette

- **Signal updates**: When a signal value changes, a NotifyAgent is created and connected.
- **Memo computation**: When a memo is accessed, it recomputes if dirty and tracks dependencies.
- **Effect execution**: Effects are added to a JavaScript queue and executed after notifications propagate.
- **Dependency changes**: When dependencies change, Subscribe/Unsubscribe agents are created and connected.

### Optimizations

1. **Batching**: Multiple updates are batched for better performance.
2. **Laziness**: Memos only recompute when accessed and dirty.
3. **Equality checking**: Signals can use custom equality functions to avoid unnecessary updates.
4. **Dependency caching**: Dependencies are cached to avoid redundant subscriptions.

## Using Annette's Features

This implementation leverages several key features of Annette:

1. **Agent/Connection Graph**: The core dependency tracking uses Annette's graph structure.
2. **ActionRules**: For propagating notifications and updating subscriptions.
3. **Tracking Capabilities**: For recording dependencies between reactive primitives.

## Comparison with SolidJS

While inspired by SolidJS, this implementation has some differences:

1. **Graph Representation**: Uses explicit Annette agents/connections instead of closures.
2. **Notification Propagation**: Leverages Annette's rule system instead of direct function calls.
3. **Hybrid Architecture**: Splits responsibilities between Annette and JavaScript.

## Future Improvements

1. **Performance Optimization**: Further batching and caching strategies.
2. **Debugging Tools**: Better integration with Annette's time travel features.
3. **Memory Management**: More efficient cleanup of disposed effects and signals.
4. **Components**: Building a component system on top of the reactive primitives.