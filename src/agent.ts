import { Connections } from "./connection";
import { BoundPort, BoundPorts, isHasMainPort, isPort, IPort, Ports, Port } from "./port";

export type AgentPorts <A extends TAgent, BP extends BoundPorts<A>> = {
  [K in BP[number]['name']]: BP[number]
} & Record<BP[number]['name'], BP[number]>

export function isAgentPorts(ports: any): ports is AgentPorts<TAgent, BoundPorts<TAgent>> {
  if (typeof ports !== 'object') {
    return false
  } else {
    return Object.entries(ports).every(([key, port]) => {
      return key == port && isPort(port)
    })
  }
}

export interface TAgent<Name extends string = string, Value extends any = any, Type extends string = string> {
  name: Name;
  value: Value; 
  ports: AgentPorts<TAgent<Name, Value, Type>, BoundPorts<TAgent<Name, Value, Type>>>;
  type: Type;
  connections: Connections<TAgent<Name, Value, Type>> ;
}

export type CreateAgentFn = <Name extends string, Value extends any, Type extends string = string>(name: Name, value: Value, ports?: BoundPorts<TAgent<Name, Value>>, type?: Type) => TAgent<Name, Value>

export const Agent: CreateAgentFn = <Name extends string, Value extends any, Type extends string = string>(name: Name, value: Value, ports?: Ports, type?: Type ) => {
  if (!ports || !isHasMainPort(ports)) {
    let agent = new class Agent {
      name = name
      value = value
      type = type || 'agent'
      ports = {
        'main': Port({'name': 'main', 'type': 'main'})
      } as AgentPorts<TAgent<Name, Value>, BoundPorts<TAgent<Name, Value>>>
    } as TAgent<Name, Value>

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
  
  let p = ports.reduce((acc, port: IPort<string>) => {
    // @ts-expect-error
    acc[port.name as keyof typeof acc] = port
    return acc
  }, {} as AgentPorts<TAgent<Name, Value>, BoundPorts<TAgent<Name, Value>>>)

  return {
    name,
    value,
    ports: p 
  } as TAgent<Name, Value>
}

Object.defineProperty(Agent, Symbol.hasInstance, {
  value: function (instance: any) {
    return isAgent(instance)
  },
  writable: false,
  configurable: false,
  enumerable: false
})

export function isAgent (agent: any): agent is TAgent {
  return 'name' in agent && 'value' in agent && 'ports' in agent && 'type' in agent
}
