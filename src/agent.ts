import { Connections } from "./connection";
import { BoundPort, BoundPortsMap, isHasMainPort, isPort, IPort, Ports, Port, PortsHasMainPort, UnboundPortArray, UnboundPortDefObj, isUnboundPortArray, isUnboundPortDefObj } from "./port";


// export type AgentPorts <A extends TAgent, BP extends BoundPortsMap<A>> = {
//   [K in keyof BP()]: BP[number]
// } & Record<BP[number]['name'], BP[number]>

// export function isAgentPorts(ports: any): ports is AgentPorts<TAgent, BoundPortsMap<TAgent>> {
//   if (typeof ports !== 'object') {
//     return false
//   } else {
//     return Object.entries(ports).every(([key, port]) => {
//       return key == port && isPort(port)
//     })
//   }
// }

export interface TAgent<Name extends string = string, Value extends any = any, Type extends string = string, P extends UnboundPortArray | UnboundPortDefObject> {
  name: Name;
  value: Value; 
  ports: BoundPortsMap<TAgent<Name, Value, Type>>; 
  type: Type;
  connections: Connections<TAgent<Name, Value, Type>> ;
}

export type CreateAgentFn = <Name extends string, Value extends any, Type extends string = string>(name: Name, value: Value, ports?: BoundPortsMap<TAgent<Name, Value>>, type?: Type) => TAgent<Name, Value>

export const Agent: CreateAgentFn = <Name extends string, Value extends any, Type extends string = string, P extends UnboundPortArray | UnboundPortDefObj  = UnboundPortArray>(name: Name, value: Value, ports?: P, type?: Type ) => {
  let agent = new class Agent {
    name = name
    value = value
    type = type || 'agent'
  } 


  if (isUnboundPortArray(ports)) {
    let p = ports.forEach(i => {
      
      i.agent = 

    })
  }


  if (isUnboundPortDefObj(ports)) {




  }


  if (!ports || !isHasMainPort(ports)) {
    let agent = new class Agent {
      name = name
      value = value
      type = type || 'agent'
      ports = {
        'main': Port({'name': 'main', 'type': 'main'})
      } as AgentPorts<TAgent<Name, Value>, BoundPortsMap<TAgent<Name, Value>>>
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
  }, {} as AgentPorts<TAgent<Name, Value>, BoundPortsMap<TAgent<Name, Value>>>)

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
