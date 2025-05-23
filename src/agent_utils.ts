import { IAgent } from './agent';
import { AgentId, PortName, PortInstanceKey } from '../types';

/**
 * Attaches the provided id to the agent's _agentId property.
 * The _agentId property is configured to be non-enumerable, non-configurable, and non-writable.
 * Throws an error if an attempt is made to change an existing _agentId.
 * @param agent The agent to set the ID for.
 * @param id The AgentId to set.
 */
export function setAgentId(agent: IAgent, id: AgentId): void {
  // Check if _agentId is already defined on the agent object itself
  if (Object.prototype.hasOwnProperty.call(agent, '_agentId')) {
    // If it's defined, check if the existing ID is different from the new ID
    // Accessing it directly is fine here as we are within the library's controlled utilities
    const existingId = (agent as any)._agentId; 
    if (existingId !== id) {
      throw new Error(`Agent already has an ID: ${existingId}. Cannot change it to ${id}.`);
    }
    // If the ID is the same, we can consider it a no-op, but the property is already non-writable.
    // If it was set by this function, it's already correctly configured.
    // If it was set by other means and is writable, this function would make it non-writable.
    // However, the primary intent is to prevent changing an established ID.
    // If existingId === id, and property is already configured, this will do nothing.
    // If it's somehow writable, it would re-apply and make it non-writable.
    // For strictness, one might even throw if it exists, regardless of same ID,
    // but current spec implies error on *change*.
  }
  
  Object.defineProperty(agent, '_agentId', {
    value: id,
    writable: false,
    enumerable: false,
    configurable: false,
  });
}

/**
 * Retrieves the _agentId property of the given agent.
 * @param agent The agent from which to get the ID.
 * @returns The AgentId of the agent, or undefined if not set (though IAgent requires it).
 */
export function getAgentId(agent: IAgent): AgentId {
  // IAgent interface now makes _agentId non-optional.
  // So, it should always be present if the object is a valid IAgent.
  return agent._agentId;
}

/**
 * Constructs a PortInstanceKey string from an AgentId and PortName.
 * The format is `${AgentId}#${PortName}`.
 * @param agentId The ID of the agent.
 * @param portName The name of the port.
 * @returns The generated PortInstanceKey.
 */
export function generatePortKey(agentId: AgentId, portName: PortName): PortInstanceKey {
  return `${agentId}#${portName}`;
}
