/**
 * Annette Standard Library
 */
import { Core, INetwork, /* IAgent is used in INetwork<S,A> type constraints */ } from './core';
// Make sure this path and exports are correct
import { ReactiveAgent, createReactive, createComputed, createEffect } from './reactive-agent'; 
import { 
  TimeTravelPlugin, ReactivityPlugin, SynchronizationPlugin, EffectPlugin,
  createPluginNetwork, IPlugin, IPluginManager, EventType, IPluginNetwork // Assuming IPluginNetwork extends INetwork
} from './plugin';

import { 
  TimeTravelNetwork as TTNetworkClass, // Alias if TimeTravelNetwork is also a type
  enableTimeTravel, 
  NetworkSnapshot, AgentState, ConnectionState, TimeTravelManager 
} from './timetravel';

import {
  Updater as UpdaterClass, // Alias if Updater is also a type
  UpdaterValue, UpdateOperation,
  applyUpdate, registerUpdaterRules
} from './updater';

import {
  EffectAgent as EffectAgentBase, HandlerAgent as HandlerAgentClass, ResultAgent as ResultAgentClass, ErrorResultAgent as ErrorResultAgentClass,
  EffectDescription, EffectHandler, EffectHandlers, EffectStatus,
  EffectAgentValue, HandlerAgentValue, ResultAgentValue,
  registerEffectRules, ResultScanner as ResultScannerClass, Constructor as ConstructorClass
} from './effect';

import {
  SyncAgent as SyncAgentClass, RemoteAgent as RemoteAgentClass, SyncNetwork as SyncNetworkClass,
  SyncOperation, SyncAgentValue, RemoteAgentValue,
  applyRemoteOperations, /* collectSyncOperations, // Marked as unused */
  createSyncOperation, /* serializeAgent, serializeChange, // Marked as unused */
  registerSyncRules
} from './sync';

import {
  ConnectionHistoryManager as CHManagerClass, ConnectionHistoryEntry, ConnectionStatus,
  ReductionSnapshot, VersionedChange, enableConnectionHistory
} from './connection-history';

import {
  MapUpdater as MapUpdaterFn, ListUpdater as ListUpdaterFn, TextUpdater as TextUpdaterFn, CounterUpdater as CounterUpdaterFn,
  createSharedMap, createSharedList, createSharedText, createSharedCounter,
  registerSpecializedUpdaterRules, /* createTextCRDTOperation, // Marked as unused */
  SpecializedUpdaterValue, DataType,
  MapOperationDescriptor, ListOperationDescriptor, TextOperationDescriptor, CounterOperationDescriptor
} from './specialized-updaters';

/**
 * Standard library namespace providing common patterns and utilities
 */
export const StdLib = {
  TimeTravel: {
    enableTimeTravel,
    TimeTravelNetwork: TTNetworkClass,
    TimeTravelManager
  },
  Updater: {
    Updater: UpdaterClass,
    applyUpdate,
    registerUpdaterRules
  },
  Effect: {
    EffectAgent: EffectAgentBase,
    HandlerAgent: HandlerAgentClass,
    ResultAgent: ResultAgentClass,
    ResultScanner: ResultScannerClass,
    registerEffectRules
  },
  Sync: {
    SyncAgent: SyncAgentClass,
    RemoteAgent: RemoteAgentClass,
    SyncNetwork: SyncNetworkClass,
    registerSyncRules,
    createSyncOperation,
    applyRemoteOperations
  },
  History: {
    enableConnectionHistory,
    ConnectionHistoryManager: CHManagerClass
  },
  DataStructures: {
    createSharedMap,
    createSharedList,
    createSharedText,
    createSharedCounter,
    MapUpdater: MapUpdaterFn,
    ListUpdater: ListUpdaterFn,
    TextUpdater: TextUpdaterFn,
    CounterUpdater: CounterUpdaterFn,
    registerSpecializedUpdaterRules
  },
  Reactive: {
    ReactiveAgent,
    createReactive,
    createComputed,
    createEffect
  },
  Plugin: {
    createPluginNetwork,
    TimeTravelPlugin,
    ReactivityPlugin,
    SynchronizationPlugin,
    EffectPlugin
  },
  
  createEnhancedNetwork(name: string): IPluginNetwork { // Return IPluginNetwork
    // Assuming createPluginNetwork's first param is name, second is optional plugins
    // If createPluginNetwork(initialPlugins: IPlugin[], name: string) then:
    // const network = createPluginNetwork([], name);
    const network = createPluginNetwork([],name); // This assumes signature (name: string, plugins?: IPlugin[])
    
    // Ensure 'network' is assignable to INetwork for these calls
    // This requires IPluginNetwork to extend INetwork, and PluginNetwork to implement it.
    network.registerPlugin(new TimeTravelPlugin());
    network.registerPlugin(new ReactivityPlugin());
    network.registerPlugin(new SynchronizationPlugin());
    network.registerPlugin(new EffectPlugin());
    
    registerUpdaterRules(network);
    registerEffectRules(network);
    registerSyncRules(network);
    registerSpecializedUpdaterRules(network);
    
    return network;
  },
  
  createMinimalNetwork(name: string): INetwork {
    return Core.createNetwork(name);
  }
};

/**
 * Type definitions for the standard library
 */
export type {
  // Time Travel types
  TTNetworkClass as TimeTravelNetwork, // Use alias if it's a class
  NetworkSnapshot,
  AgentState, 
  ConnectionState,
  TimeTravelManager,
  
  UpdaterClass as Updater,
  UpdaterValue,
  UpdateOperation,
  // Updates, // This is an object with static methods

  EffectAgentBase as EffectAgent,
  HandlerAgentClass as HandlerAgent,
  ResultAgentClass as ResultAgent,
  ErrorResultAgentClass as ErrorResultAgent,
  EffectDescription,
  EffectHandler,
  EffectHandlers,
  EffectStatus,
  EffectAgentValue,
  HandlerAgentValue,
  ResultAgentValue,
  ResultScannerClass as ResultScanner,
  ConstructorClass as Constructor,
  
  SyncAgentClass as SyncAgent,
  RemoteAgentClass as RemoteAgent,
  SyncNetworkClass as SyncNetwork,
  SyncOperation,
  SyncAgentValue,
  RemoteAgentValue,
  
  CHManagerClass as ConnectionHistoryManager,
  ConnectionHistoryEntry,
  ConnectionStatus,
  ReductionSnapshot,
  VersionedChange,
  
  // Specialized Updaters types
  // The MapUpdaterFn etc. are functions. If their return types (IAgent<...>) are what you want to export,
  // you might not need to re-export the function names themselves as types.
  // However, IAgent is already generic.
  SpecializedUpdaterValue,
  DataType,
  MapOperationDescriptor,
  ListOperationDescriptor,
  TextOperationDescriptor,
  CounterOperationDescriptor,
  
  IPlugin,
  IPluginManager,
  EventType,
  IPluginNetwork
};

export default StdLib;