// src/types.ts

/**
 * Unique identifier for an agent instance (e.g., a UUID).
 */
export type AgentId = string;

/**
 * User-defined name for an agent, acting as its "type" for rule matching.
 */
export type AgentName = string;

/**
 * User-defined name for a port on an agent.
 */
export type PortName = string;

/**
 * Globally unique identifier for a specific port on a specific agent instance.
 * Format: `${AgentId}#${PortName}`
 */
export type PortInstanceKey = string;

/**
 * Key used for looking up interaction rules.
 * Format: `${AgentName1}:${PortName1}<->${AgentName2}:${PortName2}` (canonical, sorted order)
 */
export type RuleLookupKey = string;

/**
 * Defines the possible types for a port.
 * 'main': Typically the principal port for interactions.
 * 'auxiliary': Additional ports for other types of connections.
 */
export type PortType = 'main' | 'auxiliary';
