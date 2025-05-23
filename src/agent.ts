import { AgentId, AgentName, PortName } from "../types";
import { 
  IBoundPort, 
  PortsDefObj, 
  PortArray, 
  PortsMap as PortFilePortsMap, // Renaming to avoid conflict if IAgent.PortsMap is different
  createBoundPortsMap,
  Port, // Assuming Port factory is still needed for default ports
  BoundPortsMap // Keep if createBoundPortsMap returns this and it's compatible
} from "./port";

// Define a simplified PortsMap for IAgent as per instructions for now
// This will eventually align with a refactored PortsMap from port.ts
type AgentPortsMap = Record<PortName, IBoundPort>;

export interface IAgent<V = any> {
  readonly name: AgentName;
  readonly type: string; 
  value: V;
  // Using BoundPortsMap for now as createBoundPortsMap returns it.
  // This is compatible with Record<PortName, IBoundPort> if IBoundPort is generic enough.
  // The goal is to simplify to `ports: PortsMap<this>` later.
  readonly ports: BoundPortsMap<IAgent<V>, PortsDefObj | PortArray | PortFilePortsMap>;
  readonly _agentId: AgentId;
}

export function Agent<V = any>(
  name: AgentName, 
  initialValue: V, 
  portsDef?: PortsDefObj | PortArray | PortFilePortsMap // Use imported PortsMap from port.ts for definition
  // agentType parameter removed as per latest spec for this subtask
): IAgent<V> {
  const generatedId: AgentId = 'uuid-' + Date.now() + '-' + Math.random().toString(36).substring(2, 15);
  const resolvedAgentType = name; // type defaults to name
  
  // Temporary agent object to pass to createBoundPortsMap
  // `this` is not available before full object construction in a factory.
  // We'll define properties after ports are created.
  const agentInstance = {
    name,
    value: initialValue,
    type: resolvedAgentType,
    _agentId: generatedId,
  } as IAgent<V>; // Cast needed as ports is not yet assigned

  const defaultPortsDef = { main: Port({ name: 'main', type: 'main' }) } as PortFilePortsMap;
  const actualPortsDef = portsDef || defaultPortsDef;
  
  // createBoundPortsMap needs an agent reference.
  // The `ports` property will be assigned after this call using Object.defineProperty.
  const boundPorts = createBoundPortsMap(agentInstance, actualPortsDef);

  // Define properties on the agentInstance
  Object.defineProperties(agentInstance, {
    name: {
      value: name,
      writable: false,
      enumerable: true, // As per spec "primary identifier"
      configurable: false,
    },
    value: {
      value: initialValue,
      writable: true,
      enumerable: true,
      configurable: false,
    },
    type: {
      value: resolvedAgentType,
      writable: false,
      enumerable: true, // As per spec "auxiliary" but can be primary
      configurable: false,
    },
    ports: {
      value: boundPorts, // Assign the created ports
      writable: false,
      enumerable: true,
      configurable: false,
    },
    _agentId: {
      value: generatedId,
      writable: false,
      enumerable: false, // Non-enumerable
      configurable: false,
    },
    [Symbol.toStringTag]: {
      value: `Agent ${name} (${resolvedAgentType})`,
      writable: false,
      configurable: false,
      enumerable: false,
    },
  });
  
  // The 'agentInstance' is now fully constructed and typed as IAgent<V>
  return agentInstance;
}
  
// No default export, Agent is a named export.

// Symbol.hasInstance should refer to the factory function directly if needed,
// or be removed if not strictly necessary for this phase.
// For now, let's remove it to simplify, can be added back if class-like behavior is a goal.
// Object.defineProperty(Agent, Symbol.hasInstance, { ... });

export function isAgent(agent: any): agent is IAgent {
  if (typeof agent !== 'object' || agent === null) {
    return false;
  }
  return (
    'name' in agent &&
    'value' in agent &&
    'ports' in agent &&
    'type' in agent &&
    Object.prototype.hasOwnProperty.call(agent, '_agentId')
  );
}
