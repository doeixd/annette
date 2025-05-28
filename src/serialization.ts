/**
 * Serialization Utilities for Annette
 * 
 * This module provides advanced serialization capabilities using both
 * StructuredClone for in-memory operations and Seroval for cross-context
 * serialization (e.g. client-server communication).
 */

import { 
  serialize, 
  deserialize, 
  serializeAsync, 
  toJSON,
  fromJSON,
  crossSerialize,
  crossSerializeAsync,
  crossSerializeStream,
  createReference,
  Feature,
  toCrossJSON,
  fromCrossJSON,
  SerovalJSON
} from 'seroval';

import { IAgent } from './agent';
import { INetwork } from './network';
import { IRule } from './rule';
import { IConnection } from './connection';
import { PortTypes } from './port';

/**
 * Reference registry for isomorphic functions
 */
const references = new Map<string, any>();

/**
 * Register an isomorphic reference that can be used across contexts
 * 
 * @param id Unique identifier for the reference
 * @param value The value to reference (function, object, symbol)
 * @returns The isomorphic reference
 */
export function registerIsomorphicReference<T>(id: string, value: T): T {
  const ref = createReference(id, value);
  references.set(id, ref);
  return ref;
}

/**
 * Get an isomorphic reference by ID
 * 
 * @param id The reference ID
 * @returns The referenced value or undefined
 */
export function getIsomorphicReference<T>(id: string): T | undefined {
  return references.get(id);
}

/**
 * Options for serialization
 */
export interface SerializationOptions {
  /**
   * Use StructuredClone when possible (for better performance)
   * Default: true
   */
  useStructuredClone?: boolean;
  
  /**
   * Disabled features for backward compatibility
   * Default: 0 (all features enabled)
   */
  disabledFeatures?: number;
  
  /**
   * Whether to use JSON-safe serialization (for client-server communication)
   * Default: false
   */
  jsonSafe?: boolean;
  
  /**
   * Cross-reference map for tracking shared references
   */
  refs?: Map<any, number>;
  
  /**
   * Scope ID for isolating cross-references
   */
  scopeId?: string;
}

/**
 * Default serialization options
 */
export const DEFAULT_SERIALIZATION_OPTIONS: SerializationOptions = {
  useStructuredClone: true,
  disabledFeatures: 0,
  jsonSafe: false
};

/**
 * Deep clone a value using the most efficient method available
 * 
 * @param value The value to clone
 * @param options Serialization options
 * @returns A deep clone of the value
 */
export function deepClone<T>(value: T, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): T {
  // Try using structuredClone if available and enabled
  if (options.useStructuredClone && typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (err) {
      console.warn('structuredClone failed, falling back to seroval', err);
    }
  }
  
  // Fall back to seroval for serialization/deserialization
  const serialized = serialize(value, { 
    disabledFeatures: options.disabledFeatures 
  });
  return deserialize(serialized);
}

/**
 * Serialize a value for storage or transmission
 * 
 * @param value The value to serialize
 * @param options Serialization options
 * @returns Serialized string representation
 */
export function serializeValue<T>(value: T, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): string {
  if (options.jsonSafe) {
    return String(toJSON(value));
  } else {
    return String(serialize(value, { disabledFeatures: options.disabledFeatures }));
  }
}

/**
 * Deserialize a value from its string representation
 * 
 * @param serialized The serialized string
 * @param options Serialization options
 * @returns The deserialized value
 */
export function deserializeValue<T>(serialized: string, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): T {
  if (options.jsonSafe) {
    return fromJSON<T>(serialized as unknown as SerovalJSON);
  } else {
    return deserialize(serialized);
  }
}

/**
 * Asynchronously serialize a value that may contain promises
 * 
 * @param value The value to serialize
 * @param options Serialization options
 * @returns Promise resolving to the serialized string
 */
export async function serializeValueAsync<T>(value: T, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): Promise<string> {
  return await serializeAsync(value, { 
    disabledFeatures: options.disabledFeatures 
  });
}

/**
 * Serialize a value for transport across different contexts with shared references
 * 
 * @param value The value to serialize
 * @param options Serialization options
 * @returns Serialized string with cross-references
 */
export function serializeForTransport<T>(value: T, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): string {
  const refs = options.refs || new Map();
  
  if (options.jsonSafe) {
    return String(toCrossJSON(value, {
      disabledFeatures: options.disabledFeatures,
      refs
    }));
  } else {
    return String(crossSerialize(value, {
      disabledFeatures: options.disabledFeatures,
      refs
    }));
  }
}

/**
 * Deserialize a value from cross-serialized string
 * 
 * @param serialized The serialized string
 * @param options Serialization options
 * @returns The deserialized value
 */
export function deserializeFromTransport<T>(serialized: string, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): T {
  if (options.jsonSafe) {
    return fromCrossJSON(JSON.parse(serialized), options);
  } else {
    return deserialize(serialized);
  }
}

/**
 * Asynchronously serialize a value for transport across different contexts
 * 
 * @param value The value to serialize (may contain promises)
 * @param options Serialization options
 * @returns Promise resolving to the serialized string
 */
export async function serializeForTransportAsync<T>(value: T, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): Promise<string> {
  const refs = options.refs || new Map();
  
  return await crossSerializeAsync(value, {
    disabledFeatures: options.disabledFeatures,
    refs,
    scopeId: options.scopeId
  });
}

/**
 * Options for streaming serialization
 */
export interface StreamSerializationOptions extends SerializationOptions {
  onSerialize: (data: string) => void;
}

/**
 * Stream serialize a value for cross-context use
 * 
 * @param value The value to serialize
 * @param options Streaming serialization options
 */
export function streamSerialize<T>(value: T, options: StreamSerializationOptions): void {
  const refs = options.refs || new Map();
  
  crossSerializeStream(value, {
    disabledFeatures: options.disabledFeatures,
    refs,
    scopeId: options.scopeId,
    onSerialize: options.onSerialize
  });
}

/**
 * Get initialization header for cross-references
 * 
 * @param scopeId Optional scope ID for isolating references
 * @returns Script for initializing cross-references
 */
export function getCrossReferenceHeader(scopeId?: string): string {
  if (scopeId) {
    return `(self.$R=self.$R||{})["${scopeId}"]=[]`;
  }
  return 'self.$R=self.$R||[]';
}

/**
 * Serialize an agent for transport
 * 
 * @param agent The agent to serialize
 * @param options Serialization options
 * @returns Serialized agent string
 */
export function serializeAgent(agent: IAgent, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): string {
  const serializable = {
    _agentId: agent._agentId,
    name: agent.name,
    value: agent.value,
    portNames: Object.keys(agent.ports).map(key => ({
      name: key,
      type: agent.ports[key].type
    }))
  };
  
  return String(serializeForTransport(serializable, options));
}

/**
 * Serialize a network for transport
 * 
 * @param network The network to serialize
 * @param options Serialization options
 * @returns Serialized network string
 */
export function serializeNetwork(network: INetwork, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): string {
  const serializable = {
    id: network.id,
    name: network.name,
    agents: network.getAllAgents().map((agent: IAgent) => ({
      _agentId: agent._agentId,
      name: agent.name,
      value: agent.value,
      portNames: Object.keys(agent.ports).map(key => ({
        name: key,
        type: agent.ports[key].type
      }))
    })),
    connections: network.getAllConnections().map((conn: IConnection) => ({
      sourceAgent: conn.source._agentId,
      sourcePort: conn.sourcePort.name,
      targetAgent: conn.destination._agentId,
      targetPort: conn.destinationPort.name
    }))
  };
  
  return String(serializeForTransport(serializable, options));
}

/**
 * Serialize a rule for transport
 * 
 * @param rule The rule to serialize
 * @param options Serialization options
 * @returns Serialized rule string
 */
export function serializeRule(rule: IRule, options: SerializationOptions = DEFAULT_SERIALIZATION_OPTIONS): string {
  const serializable = {
    name: rule.name,
    connection: {
      sourceAgent: rule.connection.source._agentId,
      sourcePort: rule.connection.sourcePort.name,
      targetAgent: rule.connection.destination._agentId,
      targetPort: rule.connection.destinationPort.name
    },
    hasAction: !!rule.action
  };
  
  return String(serializeForTransport(serializable, options));
}

// Register common isomorphic references
export function registerStandardReferences(): void {
  // Standard types
  registerIsomorphicReference('Object', Object);
  registerIsomorphicReference('Array', Array);
  registerIsomorphicReference('Map', Map);
  registerIsomorphicReference('Set', Set);
  registerIsomorphicReference('Date', Date);
  registerIsomorphicReference('RegExp', RegExp);
  registerIsomorphicReference('Promise', Promise);
  
  // Error types
  registerIsomorphicReference('Error', Error);
  registerIsomorphicReference('TypeError', TypeError);
  registerIsomorphicReference('RangeError', RangeError);
  registerIsomorphicReference('SyntaxError', SyntaxError);
  registerIsomorphicReference('ReferenceError', ReferenceError);
  
  // Other global objects
  registerIsomorphicReference('JSON', JSON);
  registerIsomorphicReference('Math', Math);
  
  // Register AggregateError if available (ES2021+)
  if (typeof AggregateError !== 'undefined') {
    registerIsomorphicReference('AggregateError', AggregateError);
  }
}

// Register standard references by default
registerStandardReferences();

// Export seroval feature flags for compatibility options
export { Feature };