import { v4 as uuidv4 } from 'uuid';
import { Connections } from "./connection";
import { IBoundPort, BoundPortsMap, isHasMainPort, isPort, IPort, IPorts, Port, PortsHasMainPort, UnboundPortArray, UnboundPortDefObj, isUnboundPortArray, isUnboundPortDefObj, UnboundPort, BoundPort, PortsDefObj, PortArray, PortsMap, isPortArray, UnboundPortsMap, addMainPortIfNotExists, isPortsDefObj, isPortsMap, createBoundPortsMap } from "./port";

export type AgentId = string;
export type AgentName = string;

/**
 * Core Agent interface with generic type parameters
 * 
 * @template Name - The agent's name/type for rule matching
 * @template Value - The type of the agent's value
 * @template Type - The agent's subtype/category
 * @template P - Port definition format (array, object, or map)
 */
export interface IAgent<Name extends string = string, Value = any, Type extends string = string, P extends PortArray | PortsDefObj | PortsMap = PortArray | PortsDefObj | PortsMap> {
  /** The agent's name/type for rule matching */
  name: Name;
  
  /** The agent's mutable state */
  value: Value; 
  
  /** Map of ports for connections with other agents */
  ports: BoundPortsMap<IAgent<Name, Value, Type>, P> & PortsHasMainPort<BoundPortsMap<IAgent<Name, Value, Type>, P>>; 
  
  /** Optional subtype/category */
  type: Type;
  
  /** Active connections to other agents */
  connections: Connections<IAgent<Name, Value, Type>>;
  
  /** Unique identifier for this agent instance */
  _agentId: AgentId;
}

/**
 * Create an agent with typed state and ports
 * 
 * @template Name - The agent name/type for rule matching
 * @template Value - The type of the agent's value
 * @template Type - Optional subtype (defaults to 'agent')
 * @template P - Port definitions format
 * 
 * @param name - The agent's name
 * @param value - The agent's initial value
 * @param ports - Optional port definitions (defaults to a single main port)
 * @param type - Optional subtype
 * @returns A new agent instance
 */
export function Agent<Name extends string, Value = any, Type extends string = string, P extends PortArray | PortsDefObj | PortsMap = PortArray | PortsDefObj | PortsMap>(name: Name, value: Value, ports?: P, type?: Type) {
  let t = typeof type === 'string' ? type : 'agent' as const;
  let po = typeof ports === 'undefined' ? { main: Port({ name: 'main', type: 'main' }) } as PortsMap : ports;
  let agentId = uuidv4();
  
  // First create the agent without the ports to avoid circular dependency
  let agent = {} as IAgent<Name, Value, typeof t, typeof po>;
  
  // Define base properties
  Object.defineProperties(agent, {
    name: {
      value: name,
      writable: false,
      configurable: false,
      enumerable: true
    },
    value: {
      value: value,
      writable: true,
      configurable: false,
      enumerable: true
    },
    type: {
      value: t,
      writable: false,
      configurable: false,
      enumerable: true
    },
    _agentId: {
      value: agentId,
      writable: false,
      configurable: false,
      enumerable: false
    },
    connections: {
      value: {} as Connections<IAgent<Name, Value, Type>>,
      writable: true,
      configurable: false,
      enumerable: true
    },
    [Symbol.toStringTag]: {
      value: `Agent ${name} (${type || 'agent'})`,
      writable: false,
      configurable: false,
      enumerable: false
    }
  });
  
  // Now that the agent exists, create the ports
  const boundPorts = createBoundPortsMap(agent, po);
  
  // Add ports to the agent
  Object.defineProperty(agent, 'ports', {
    value: boundPorts,
    writable: false,
    configurable: false,
    enumerable: true
  });

  return agent;
}

Object.defineProperty(Agent, Symbol.hasInstance, {
  value: function (instance: any) {
    return isAgent(instance)
  },
  writable: false,
  configurable: false,
  enumerable: false
});

/**
 * Type guard to check if an object is an Agent
 * Note: This keeps the original dynamism and doesn't require _agentId for backward compatibility
 */
export function isAgent(agent: any): agent is IAgent {
  return 'name' in agent && 'value' in agent && 'ports' in agent && 'type' in agent;
}

export default Agent;