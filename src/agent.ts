import add from ".";
import { Connections } from "./connection";
import { IBoundPort, BoundPortsMap, isHasMainPort, isPort, IPort, IPorts, Port, PortsHasMainPort, UnboundPortArray, UnboundPortDefObj, isUnboundPortArray, isUnboundPortDefObj, UnboundPort, BoundPort, PortsDefObj, PortArray, PortsMap, isPortArray, UnboundPortsMap, addMainPortIfNotExists, isPortsDefObj, isPortsMap, createBoundPortsMap } from "./port";

export interface IAgent<Name extends string = string, Value extends any = any, Type extends string = string, P extends PortArray | PortsDefObj | PortsMap = PortArray | PortsDefObj | PortsMap> {
  name: Name;
  value: Value; 
  ports: BoundPortsMap<IAgent<Name, Value, Type>, P> & PortsHasMainPort<BoundPortsMap<IAgent<Name, Value, Type>, P>>; 
  type: Type;
  connections: Connections<IAgent<Name, Value, Type>> ;
}


export function Agent<Name extends string, Value extends any, Type extends string = string, P extends PortArray | PortsDefObj | PortsMap = PortArray | PortsDefObj | PortsMap>(name: Name, value: Value, ports?: P, type?: Type) {
  let t = typeof type === 'string' ? type : 'agent' as const;
  let po = typeof ports === 'undefined' ? { main: Port({ name: 'main', type: 'main' }) } as PortsMap : ports;
  let agent = new class Agent implements IAgent<Name, Value, typeof t, typeof po> {
    name = name;
    value = value;
    type = t;
    ports: BoundPortsMap<IAgent<Name, Value, typeof t, typeof po>, typeof po> & PortsHasMainPort<BoundPortsMap<IAgent<Name, Value, typeof t, typeof po>, typeof po>> = createBoundPortsMap(this as IAgent<Name, Value, typeof t, typeof po>, po);
    connections = {} as Connections<IAgent<Name, Value, Type>>;
  } as IAgent<Name, Value, typeof t, typeof po>;

    Object.defineProperties(agent, {
      value: {
        value: agent.value,
        writable: true,
        configurable: false,
      },
      type: {
        value: agent.type,
        writable: false,
        configurable: false,
      },
      name: {
        value: name,
        writable: false,
        configurable: false,
        // enumerable: false
      },
      [Symbol.toStringTag]: {
        value: `Agent ${name} (${type || 'agent'})`,
        writable: false,
        configurable: false,
        enumerable: false
      }
    })

    return agent
  }
  

Object.defineProperty(Agent, Symbol.hasInstance, {
  value: function (instance: any) {
    return isAgent(instance)
  },
  writable: false,
  configurable: false,
  enumerable: false
})

export function isAgent (agent: any): agent is IAgent {
  return 'name' in agent && 'value' in agent && 'ports' in agent && 'type' in agent
}


export default Agent
