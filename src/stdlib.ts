/**
 * Annette Standard Library
 * 
 * This module represents the standard library abstraction layer of Annette,
 * providing common agents, rules, and patterns that build upon the core engine.
 */
import { Core, IAgent, INetwork } from './core';
import { ReactiveAgent, createReactive, createComputed, createEffect } from './reactive-agent';
import { 
  TimeTravelPlugin, ReactivityPlugin, SynchronizationPlugin, EffectPlugin,
  createPluginNetwork, IPlugin, IPluginManager, EventType 
} from './plugin';

// Import individual feature modules
import { 
  TimeTravelNetwork, enableTimeTravel, 
  NetworkSnapshot, AgentState, ConnectionState, TimeTravelManager 
} from './timetravel';

import {
  Updater, UpdaterValue, UpdateOperation,
  Updates, applyUpdate, registerUpdaterRules
} from './updater';

import {
  EffectAgent as EffectAgentBase, HandlerAgent, ResultAgent, ErrorResultAgent,
  EffectDescription, EffectHandler, EffectHandlers, EffectStatus,
  EffectAgentValue, HandlerAgentValue, ResultAgentValue,
  registerEffectRules, ResultScanner, Constructor
} from './effect';

import {
  SyncAgent, RemoteAgent, SyncNetwork,
  SyncOperation, SyncAgentValue, RemoteAgentValue,
  applyRemoteOperations, collectSyncOperations,
  createSyncOperation, serializeAgent, serializeChange,
  registerSyncRules
} from './sync';

import {
  ConnectionHistoryManager, ConnectionHistoryEntry, ConnectionStatus,
  ReductionSnapshot, VersionedChange, enableConnectionHistory
} from './connection-history';

import {
  MapUpdater, ListUpdater, TextUpdater, CounterUpdater,
  createSharedMap, createSharedList, createSharedText, createSharedCounter,
  registerSpecializedUpdaterRules, createTextCRDTOperation,
  SpecializedUpdaterValue, DataType, MapOperation, ListOperation,
  TextOperation, CounterOperation
} from './specialized-updaters';

/**
 * Standard library namespace providing common patterns and utilities
 */
export const StdLib = {
  // Time Travel system
  TimeTravel: {
    enableTimeTravel,
    TimeTravelNetwork,
    TimeTravelManager
  },
  
  // Updater system
  Updater: {
    Updater,
    applyUpdate,
    registerUpdaterRules
  },
  
  // Effect system
  Effect: {
    EffectAgent: EffectAgentBase,
    HandlerAgent,
    ResultAgent,
    ResultScanner,
    registerEffectRules
  },
  
  // Sync system
  Sync: {
    SyncAgent,
    RemoteAgent,
    SyncNetwork,
    registerSyncRules,
    createSyncOperation,
    applyRemoteOperations
  },
  
  // Connection History system
  History: {
    enableConnectionHistory,
    ConnectionHistoryManager
  },
  
  // Specialized Updaters
  DataStructures: {
    createSharedMap,
    createSharedList,
    createSharedText,
    createSharedCounter,
    MapUpdater,
    ListUpdater,
    TextUpdater,
    CounterUpdater,
    registerSpecializedUpdaterRules
  },
  
  // Reactive system
  Reactive: {
    ReactiveAgent,
    createReactive,
    createComputed,
    createEffect
  },
  
  // Plugin system
  Plugin: {
    createPluginNetwork,
    TimeTravelPlugin,
    ReactivityPlugin,
    SynchronizationPlugin,
    EffectPlugin
  },
  
  /**
   * Create a fully-featured network with all standard features enabled
   */
  createEnhancedNetwork(name: string): INetwork {
    // Create a plugin network
    const network = createPluginNetwork(name);
    
    // Register standard plugins
    network.registerPlugin(new TimeTravelPlugin());
    network.registerPlugin(new ReactivityPlugin());
    network.registerPlugin(new SynchronizationPlugin());
    network.registerPlugin(new EffectPlugin());
    
    // Register standard rules
    registerUpdaterRules(network);
    registerEffectRules(network);
    registerSyncRules(network);
    registerSpecializedUpdaterRules(network);
    
    return network;
  },
  
  /**
   * Create a minimal network with only core features
   */
  createMinimalNetwork(name: string): INetwork {
    return Core.createNetwork(name);
  }
};

/**
 * Type definitions for the standard library
 */
export type {
  // Time Travel types
  TimeTravelNetwork,
  NetworkSnapshot,
  AgentState, 
  ConnectionState,
  TimeTravelManager,
  
  // Updater types
  Updater,
  UpdaterValue,
  UpdateOperation,
  Updates,
  
  // Effect types
  EffectAgentBase as EffectAgent,
  HandlerAgent,
  ResultAgent,
  ErrorResultAgent,
  EffectDescription,
  EffectHandler,
  EffectHandlers,
  EffectStatus,
  EffectAgentValue,
  HandlerAgentValue,
  ResultAgentValue,
  ResultScanner,
  Constructor,
  
  // Sync types
  SyncAgent,
  RemoteAgent,
  SyncNetwork,
  SyncOperation,
  SyncAgentValue,
  RemoteAgentValue,
  
  // Connection History types
  ConnectionHistoryManager,
  ConnectionHistoryEntry,
  ConnectionStatus,
  ReductionSnapshot,
  VersionedChange,
  
  // Specialized Updaters types
  MapUpdater,
  ListUpdater,
  TextUpdater,
  CounterUpdater,
  SpecializedUpdaterValue,
  DataType,
  MapOperation,
  ListOperation,
  TextOperation,
  CounterOperation,
  
  // Plugin types
  IPlugin,
  IPluginManager,
  EventType
};

export default StdLib;