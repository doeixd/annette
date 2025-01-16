import { TAgent, AgentPorts, isAgent } from "./agent";

export type PortTypes = 'main' | 'aux'

export interface IPort <Name extends string, Type extends PortTypes = PortTypes> {
  name: Name;
  type: Type 
}

export type MainPort <P extends IPort<string, PortTypes>> = P & { type: 'main' }

export type AuxPort <P extends IPort<string, PortTypes>> = P & { type: 'aux' }

export type TPortType <P extends IPort<string, PortTypes>> = P extends { type: 'main' } ? MainPort<P> : AuxPort<P> 

export type IsMainPort <P extends IPort<string, PortTypes>> = P extends { type: 'main' } ? MainPort<P> : never

export type IsAuxPort <P extends IPort<string, PortTypes>> = P extends { type: 'aux' } ? AuxPort<P> : never

export function isPort(port: any): port is IPort<string, PortTypes> {
  if (typeof port !== 'object') {
    return false
  } else {
    return 'name' in port && 'type' in port
  }
}

export interface BoundPort<A extends TAgent = TAgent, Name extends string = string, Type extends PortTypes = PortTypes>  {
  name: Name;
  type: Type;
  agent: A;
}

export function isBoundPort(port: any): port is BoundPort {
  if (typeof port !== 'object') {
    return false
  } else {
    return 'name' in port && 'type' in port && 'agent' in port && isAgent(port.agent)
  }
}

export type BoundPorts<A extends TAgent, TPorts extends BoundPort<A, string, PortTypes>[] = []> = {
  [K in TPorts[number]['name']]: TPorts[number]
} & Array<TPorts[number] & BoundPort<A, string, PortTypes>>

export type Ports<TPorts extends IPort<string, PortTypes>[] = []> = {
  [K in TPorts[number]['name']]: TPorts[number]
} & Array<TPorts[number] & IPort<string, PortTypes>>

export function Port<Name extends string, Type extends PortTypes = 'aux'>(port: { name: Name, type: Type }): IPort<Name, Type>;
export function Port<Name extends string, Type extends PortTypes = 'aux'>(name: Name, type: Type): IPort<Name, Type>;
export function Port<Name extends string, Type extends PortTypes = 'aux'>(name: Name | { name: Name, type: Type }, type?: Type): IPort<Name, Type> {
  if (typeof name === 'object' && 'name' in name && 'type' in name && name?.name && name?.type && typeof name !== 'string') {
    let n = name
    let port = new class Port {
      name = n.name
      type =  n.type
    } as IPort<Name, Type>

    Object.defineProperty(port, Symbol.hasInstance, {
      value: function (instance: any) {
        return isPort(instance)
      },
      enumerable: false,
      writable: false
    })

    return port
  }
  
  let port = {
    name: name as Name,
    type: type as Type,
  } as IPort<Name, Type>

  Object.defineProperty(port, Symbol.hasInstance, {
    value: function (instance: any) {
      return isPort(instance)
    },
    enumerable: false
  })

  return port
}


export type PortsHasMainPort<P extends Ports | BoundPorts<TAgent>> = P & {
  [I in keyof P]: P[I] extends { type: PortTypes } 
    ? P[I] & { type: 'main' }
    : P[I]
};

export function isHasMainPort<P extends Ports | BoundPorts<TAgent>>(ports: P): ports is PortsHasMainPort<P> {
  return ports.some((port: IPort<string, PortTypes>) => port.type === 'main')
}

export type AgentPortsHasMainPort<A extends TAgent> = AgentPorts<A, BoundPorts<A>> & {
  [I in keyof AgentPorts<A, BoundPorts<A>>]: AgentPorts<A, BoundPorts<A>>[I] extends { type: PortTypes } 
    ? AgentPorts<A, BoundPorts<A>>[I] & { type: 'main' }
    : AgentPorts<A, BoundPorts<A>>[I]
} & Record<AgentPorts<A, BoundPorts<A>>[keyof AgentPorts<A, BoundPorts<A>>]['name'], AgentPorts<A, BoundPorts<A>>[keyof AgentPorts<A, BoundPorts<A>>]>

export function isAgentPortsHasMainPort<A extends TAgent>(ports: any): ports is AgentPortsHasMainPort<A> {
  if (typeof ports !== 'object') {
    return false
  } else {
    return Object.entries(ports).every(([key, port]) => {
      return key == port && isPort(port)
      // @ts-expect-error
    }) && isHasMainPort(Object.values(ports))
  }
}

