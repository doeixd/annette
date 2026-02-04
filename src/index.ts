/**
 * Annette - A TypeScript implementation of Interaction Nets
 * 
 * Annette provides a flexible and powerful interaction net system with
 * a unified programming model, plugin architecture, and harmonized abstractions.
 */

// =========== Core Engine Layer ===========
// The fundamental interaction net primitives

// Re-export core engine layer
export * from './core';
export { Core } from './core';

// =========== Standard Library Layer ===========
// Common agents, rules, and patterns

// Re-export standard library layer
export * from './stdlib';
export { StdLib } from './stdlib';

// =========== Application Layer ===========
// Domain-specific components and high-level APIs

// Re-export from individual modules for backward compatibility
// Agent system
export { Agent, IAgent, AgentId, AgentName, isAgent, createAgentFactoryFrom } from './agent';


// Port system
export {
  Port, IPort, IBoundPort, PortTypes, PortName, PortInstanceKey,
  BoundPort, getPortInstanceKey, isPort, isBoundPort, PortFactory, createPortFactoryFrom

} from './port';

// Connection system
export {
  Connection, IConnection, isConnection, ConnectionKey, ConnectionFactory, createConnectionFactoryFrom

} from './connection';

// Rule system
export {
  ActionRule, RewriteRule, Rule, IRule, IActionRule, IRewriteRule,
  TrackedAction, RuleFactory, createRuleFactoryFrom,
  AnyRule, Action, ActionReturn, Rewrite,
  RuleCommand, RuleAddCommand, RuleRemoveCommand

} from './rule';

// Network system
export {
  Network, INetwork, ChangeHistoryEntry
} from './network';

// Time Travel system
export {
  TimeTravelNetwork, ITimeTravelNetwork, enableTimeTravel,
  NetworkSnapshot, AgentState, ConnectionState, TimeTravelManager
} from './timetravel';

// Updater system
export {
  Updater, UpdaterValue, UpdateOperation,
  Updates, applyUpdate, registerUpdaterRules
} from './updater';

// Effect system
export {
  EffectAgent, HandlerAgent, ResultAgent, ErrorResultAgent,
  EffectDescription, EffectHandler as AlgebraicEffectHandler, EffectHandlers, EffectStatus,
  EffectAgentValue, HandlerAgentValue, ResultAgentValue,
  registerEffectRules, ResultScanner, Constructor
} from './effect';

// Sync system
export {
  SyncAgent, RemoteAgent, SyncNetwork,
  SyncOperation, SyncAgentValue, RemoteAgentValue,
  applyRemoteOperations, collectSyncOperations,
  createSyncOperation, serializeAgent, serializeChange,
  registerSyncRules
} from './sync';

// Connection History system
export {
  ConnectionHistoryManager, ConnectionHistoryEntry, ConnectionStatus,
  ReductionSnapshot, VersionedChange, enableConnectionHistory
} from './connection-history';

// Specialized Updaters
export {
  MapUpdater, ListUpdater, TextUpdater, CounterUpdater,
  createSharedMap, createSharedList, createSharedText, createSharedCounter,
  registerSpecializedUpdaterRules, createTextCRDTOperation,
  SpecializedUpdaterValue, DataType, 
  // ListOperation, TextOperation, CounterOperation
} from './specialized-updaters';

// Automated and Synced Networks
export {
  AutoNet, SyncedNet, ConnectionGraph,
  SerializedNode, SerializedPort, SerializedNet,
  createAutoNet, createSyncedNet, createNetworkServer
} from './auto-net';

// Network Boundary
export {
  NetworkBoundary, NetworkMessage, NetworkNode, NetworkMessageType,
  createNetworkBoundaryAgent, registerNetworkBoundaryRules,
  createMessageSender, createMessageReceiver
} from './network-boundary';

// =========== New Unified Architecture ===========

// Plugin system
export {
  // Core plugin interfaces and classes
  IPlugin, IPluginManager, PluginManager, BasePlugin, PluginNetwork,
  createPluginNetwork, EventType, IEvent, EventListener, IEventBus,
  
  // Standard plugins
  TimeTravelPlugin, ReactivityPlugin, SynchronizationPlugin, EffectPlugin,
  
  // Effect system
  IEffectDescription, EffectHandler as PluginEffectHandler, EffectManager
} from './plugin';

// Reactive Agent Model
export {
  // Core reactive types
  ReactiveAgent, DerivedAgent, EffectAgent as ReactiveEffectAgent,
  ReactiveAgentOptions, ReactiveAgentValue, IReactive,
  
  // Reactive API
  createReactive, createComputed, createEffect as createReactiveEffect,
  batch, createRoot, initReactiveSystem, getReactiveNetwork,
  
  // Tracking context
  startTracking, stopTracking, getTrackingContext, trackDependency
} from './reactive-agent';

// SolidJS-like Reactive Library
export {
  // Core reactive primitives
  createSignal, createMemo, createEffect, createResource,
  createStore, batch as solidBatch, createRoot as solidCreateRoot,
  //  initReactive,
  
  // Advanced features with algebraic effects
  createEffectResource,
  
  // Advanced features with cross-network synchronization
  createSyncedResource, createSharedSignal,
  
  // Specialized data structure APIs
  createReactiveMap, createReactiveList, createReactiveText
} from './solid';

// Distributed Networks
export {
  DistributedNetwork, SerializedDistributedNet, SerializedRule,
  DistributedNetworkMessage, NetworkUpdateMessage, DistributedNetworkOptions,
  ConnectionStatus as DistributedConnectionStatus,
  createDistributedNetworkServer, createDistributedNetworkClient, createDistributedNetworkPeer
} from './distributed-net';

// =========== Performance Optimizations ===========

export {
  // Rule indexing
  RuleIndex,
  ConnectionTracker,
  
  // Structural sharing
  StructuralSharing,
  
  // Memory management
  MemoryManager,
  
  // Parallel processing
  ParallelProcessing,
  
  // Error handling
  AnnetteError,
  PortConnectionError,
  RuleApplicationError,
  
  // Options
  AnnetteOptions,
  DEFAULT_OPTIONS,
  
  // Factory functions
  createOptimizedNetwork
} from './optimization';

// =========== Developer Experience Enhancements ===========

export * from './scoped-network';


export {
  // Progressive disclosure APIs
  Simple,
  Advanced,
  
  // Error handling
  ErrorReporter,
  
  // Debugging
  DebugTools,
  DebugLevel,
  
  // Enhanced networks
  createEnhancedNetwork
} from './experience';

// =========== Distributed Systems ===========

export {
  // Vector clocks
  VectorClock,
  VersionedData,
  compareVersioned,
  Versioned
} from './distributed/vector-clock';

export {
  // Conflict resolution
  ConflictResolver,
  ConflictResolutionStrategy,
  ConflictMetadata,
  strategies as conflictStrategies,
  resolveConflict
} from './distributed/conflict-resolution';

// =========== Fine-Grained Reactivity ===========

export {
  // Reactive proxy
  ReactiveProxy,
  Subscription,
  
  // Reactive store
  ReactiveStore,
  createReactiveStore,
  
  // Computed values
  computed
} from './reactive/fine-grained';

// =========== Component Model ===========

export {
  // Component creation
  createComponent,
  defineComponent,
  
  // Component types
  ComponentOptions,
  ComponentContext,
  LifecycleHooks,
  
  // DOM integration
  render,
  createElement,
  DOMRenderer
} from './reactive/component';

// =========== Custom Updaters ===========

export {
  // Updater definition
  defineUpdater,
  UpdaterDefinition,
  IUpdater,
  
  // Updater composition
  composeUpdaters,
  applyComposedUpdate,
  
  // Standard updaters
  SetUpdater,
  MergeUpdater,
  DeleteUpdater,
  IncrementUpdater,
  ArrayInsertUpdater,
  
  // Updater registration
  registerStandardUpdaters,
  getUpdaterDefinition,
  createCustomUpdater,
  CustomUpdater
} from './updaters/custom-updater';

// =========== Serialization Utilities ===========

export {
  // Core serialization functions
  serializeValue,
  deserializeValue,
  serializeValueAsync,
  serializeForTransport,
  deserializeFromTransport,
  serializeForTransportAsync,
  streamSerialize,
  deepClone,
  
  // Isomorphic references
  registerIsomorphicReference,
  getIsomorphicReference,
  registerStandardReferences,
  
  // Annette-specific serialization
  serializeAgent as serializeAgentToString,
  serializeNetwork as serializeNetworkToString,
  serializeRule as serializeRuleToString,
  
  // Cross-reference utilities
  getCrossReferenceHeader,
  
  // Options and types
  SerializationOptions,
  StreamSerializationOptions,
  DEFAULT_SERIALIZATION_OPTIONS,
  
  // Feature flags from seroval
  Feature
} from './serialization';

// =========== Parallel Execution ===========

export {
  // Core parallel execution
  WorkerPool,
  WorkerPoolOptions,
  
  // Parallel network
  ParallelNetwork,
  ParallelNetworkOptions,
  
  // Rule dependency analysis
  RuleDependencyAnalyzer,
  AdvancedRuleDependencyAnalyzer,
  AdvancedDependencyAnalyzerOptions,
  
  // Effect handling
  ParallelEffectHandler,
  ParallelEffectHandlerOptions,
  Effect,
  EffectHandler,
  EffectHandlerRegistry,
  
  // Plugin
  createParallelNetwork,
  createParallelPlugin,
  ParallelPluginOptions
} from './parallel';

// Helper function
export function getRuleKey(agent1Name: string, port1Name: string, agent2Name: string, port2Name: string): string {
  // Create canonical order for rule keys
  const names = [
    { agentName: agent1Name, portName: port1Name },
    { agentName: agent2Name, portName: port2Name }
  ].sort((a, b) => a.agentName.localeCompare(b.agentName) || a.portName.localeCompare(b.portName));
  
  return `${names[0].agentName}:${names[0].portName}<->${names[1].agentName}:${names[1].portName}`;
}