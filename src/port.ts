import { IAgent, isAgent } from "./agent";

export type PortTypes = 'main' | 'aux'

export interface IPort <Name extends string = string, Type extends PortTypes = PortTypes> {
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

export interface IBoundPort<A extends IAgent = IAgent, Name extends string = string, Type extends PortTypes = PortTypes>  {
  name: Name;
  type: Type;
  agent: A;
}

export function BoundPort<P extends IPort, A extends IAgent> (port: P, agent: A): IBoundPort<A, P['name']> {
  // if (isPort(port) && isAgent(agent)) {
  let boundPort = new class BoundPort implements IBoundPort<A, P['name'], P['type']> {
    name = port.name
    type = port.type
    agent = agent
  } 

  Object.defineProperty(boundPort, Symbol.hasInstance, {
    value: function (instance: any) {
      return isBoundPort(instance)
    },
    enumerable: false
  })

  return boundPort
// } 
}

export function isBoundPort(port: any): port is IBoundPort {
  if (typeof port !== 'object') {
    return false
  } else {
    return 'name' in port && 'type' in port && 'agent' in port && isAgent(port.agent)
  }
}


export type BoundPortArray <A extends IAgent = IAgent, U extends PortArray | PortsMap | PortsDefObj = PortArray | PortsMap | PortsDefObj, M = UnboundPortsMap<U>> = UniqueNameArray<{
  [K in Extract<keyof M, string>]: M[K] extends IPort ? IBoundPort<A, K, M[K]['type']> : never
}[Extract<keyof M, string>][]>

export type BoundPortsMap<A extends IAgent, U extends PortArray | PortsMap | PortsDefObj, M = UnboundPortsMap<U>> = {
  [K in Extract<keyof M, string>]: M[K] extends IPort ? IBoundPort<A, K, M[K]['type']> : never
}

export const createBoundPortsMap = <A extends IAgent, P extends PortArray | PortsDefObj | PortsMap>(agent: A, ports: P): BoundPortsMap<A, P> & PortsHasMainPort<BoundPortsMap<A, P>> => {
  if (!isAgent(agent)) {
    throw new Error('Invalid agent provided')
  }

  if (isPortArray(ports)) {
    let a = Object.fromEntries(ports.map((port) => {
      return [port.name, BoundPort(port, agent)]
     })) as BoundPortsMap<A, P>

     let m = addMainPortIfNotExists(a)

     return m
  }

  if (isPortsDefObj(ports)) {
    let a = Object.fromEntries(Object.entries(ports).map(([key, type]) => {
      return [key, BoundPort({ name: key, type: type }, agent)]
    })) as BoundPortsMap<A, P>

    let m = addMainPortIfNotExists(a)

    return m
  }

  if (isPortsMap(ports)) {
    let a = Object.fromEntries(Object.entries(ports).map(([key, port]) => {
      return [key, BoundPort({name: port.name, type: port.type}, agent)]
    })) as BoundPortsMap<A, P>

    let m = addMainPortIfNotExists(a)

    return m
  }

  throw new Error('Invalid ports provided')
}

// export type BoundPortsMap<A extends TAgent, TPorts extends IBoundPort<A, string, PortTypes>[] = []> = {
//   [K in TPorts[number]['name']]: TPorts[number]
// }
//  & Array<TPorts[number] & BoundPort<A, string, PortTypes>>



export type PortsMap<TPorts extends IPort<string, PortTypes>[] = IPort<string, PortTypes>[]> = {
  [K in TPorts[number]['name']]: TPorts[number]
} 

export type PortsDefObj<TPorts extends IPort<string, PortTypes>[] =  IPort<string, PortTypes>[]> = {
  [K in TPorts[number]['name']]: TPorts[number]['type']
} 


export function isPortType (str: any): str is PortTypes {
  if (typeof str !== 'string') return false
  if (str == 'aux') return true
  if (str == 'main') return true
  return false
}

export function isUnboundPortDefObj (object: any): object is UnboundPortDefObj {
  if (typeof object !== 'object') return false
  return Object.values(object).every(o => isPortType(o))
}

export function isUnboundPortArray (arr: any): arr is UnboundPortArray {
  if (!Array.isArray(arr)) return false
  return Object.values(arr).every(o => typeof o == 'object' && 'type' in o && isPortType(o.type) && typeof o?.agent == 'undefined' && typeof o?.name == 'string')
}

export type StripAgentFromBoundPort <P extends IBoundPort> = UnboundPort<{ name: P['name'], type: P['type'] }>

export type StripAgentFromPortArray <P extends BoundPortArray | PortArray> = UnboundPortArray<{
  [K in keyof P]: 
    P[K] extends IBoundPort 
      ? StripAgentFromBoundPort<P[K]> 
      : P[K] extends IPort 
        ? UnboundPort<{name: P[K]['name'], type: P[K]['type']}> 
        : never
}[number][]>


type UniqueNameArray<T extends { name: string }[]> = T extends { [K in keyof T]: { name: T[K]["name"] } } 
  ? { [K in keyof T]: T[K] } extends infer U 
    ? Extract<U, any[]> & { [K in keyof T]: T[K] }
    : never 
  : never;

export type PortArray <PA extends IPort[] = IPort[]> = UniqueNameArray<PA>

export type IPorts <P extends PortsMap | PortsDefObj | PortArray = PortsMap | PortsDefObj | PortArray> =
  P extends PortsMap 
    ? PortsMapWithPreservedKinds<P> 
    : P extends PortsDefObj 
      ? PortsMapFromPortsDefObj<P>
      : P extends PortArray
        ? PortsMapFromPortArray<P> 
        : never

export type PortsWithAddedPort <O extends PortsMap | PortsDefObj | PortArray, P extends IPort> = 
  O extends PortsMap 
    ? O & { [K in P['name']]: P }
    : O extends PortsDefObj 
      ? O & { [K in P['name']]: P['type'] }
      : O extends PortArray
        ? [...O, P] & UniqueNameArray<[...O, P]>
        : never


export function addPortToPorts <O extends PortsMap | PortsDefObj | PortArray, P extends IPort> (ports: O, port: P): PortsWithAddedPort<O, P> {
  if (isPortsMap(ports)) {
    ports[port.name] = port
    return ports as PortsWithAddedPort<O, P>
  }

  if (isPortsDefObj(ports)) {
    ports[port.name] = port.type
    return ports as PortsWithAddedPort<O, P> 
  }

  if (isPortArray(ports)) {
    ports.push(port)
    return ports as PortsWithAddedPort<O, P> 
  }

  throw new Error('Invalid ports provided')
}


export type PortsMapWithPreservedKinds <P extends PortsMap> = {
  [K in keyof P]: P[K] extends IBoundPort ? P[K] : P[K] extends UnboundPort ? P[K] : P[K] extends IPort ? P[K] : never
} 
export type PortsMapFromPortArray<P extends PortArray> = {
  [K in P[number] as K['name']]: K extends IBoundPort ? K : K extends UnboundPort ? K : K extends IPort ? K : never
}
export type PortsMapFromPortsDefObj <P extends PortsDefObj> = {
 [K in Extract<keyof P, string>]: P[K] extends PortTypes ? IPort<K, P[K]> : never 
}

export function Ports<P extends PortsMap | PortsDefObj | PortArray>(ports: P): IPorts<P> {
  if (isPortsDefObj(ports)) {
    let p: any = {} 
    for (let [key, type] of Object.entries(ports)) {
      p[key] = Port(key, type)
    }

    return p as PortsMapFromPortsDefObj<typeof ports> & IPorts<P>
  }

  if (isPortArray(ports)) {
    let p: any = {} 
    for (let port of ports) {
      p[port.name] = port
    }

    return p as PortsMapFromPortArray<typeof ports> & IPorts<P>
  }

  if (isPortsMap(ports)) {
    return ports as IPorts<P>
  }

  throw new Error('Invalid ports provided')
}

export type UnboundPort <P extends IPort = IPort> = Omit<P, 'agent'> & { name: P['name'], type: P['type'] }

export type UnboundPortArray <P extends IPort[] = IPort[]> = UniqueNameArray<{
  [K in Extract<keyof P, number>]: UnboundPort<P[K]>
}[number][]>

export type UnboundPortDefObj <N extends string = string> = Record<N, PortTypes> 

export type UnboundPortsMap <P extends PortsMap | PortsDefObj | PortArray> = 
  P extends PortsMap
    ? { [K in keyof P]: UnboundPort<P[K]> }
    : P extends PortsDefObj
      ? { [K in Extract<keyof P, string>]: UnboundPort<IPort<K, P[K]>> }
      : P extends PortArray
        ? { [K in P[number] as K['name']]:  UnboundPort<K> }
        : never


// & Array<TPorts[number] & IPort<string, PortTypes>>

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

export type DefaultPorts = IPorts<IPort<string, 'main'>[]>

export type PortsHasMainPort<P extends PortArray | PortsMap | PortsDefObj> = P & {
  [I in keyof P]: P[I] extends { type: PortTypes } 
    ? P[I] & { type: 'main' }
    : P[I]
};

export function isHasMainPort<P extends IPorts>(ports: P): ports is PortsHasMainPort<P> {
  const p = Ports(ports)
  return Object.values(p).some((port) => port.type === 'main')
}

export function isPortsMap(ports: any): ports is PortsMap {
  if (typeof ports !== 'object') {
    return false
  } else {
    return Object.entries(ports).every(([key, port]) => {
      if (port && typeof key == 'string' && typeof port == 'object' && 'name' in port ) {
        return key == port['name'] && isPort(port)
      }
      return false
    })
  }
}

export function isPortsDefObj(ports: object): ports is PortsDefObj {
  if (typeof ports !== 'object') {
    return false
  } else {
    return Object.entries(ports).every(([key, port]) => {
      if (port && typeof key == 'string' && typeof port == 'string') {
        return isPortType(port)
      }
      return false
    })
  }
}

export function isPortArray(ports: any): ports is PortArray {
  if (!Array.isArray(ports)) {
    return false
  } else {
    return ports.every(port => isPort(port))
  }
}



export function addMainPortIfNotExists<P extends PortsMap | PortsDefObj | PortArray>(ports: P): PortsHasMainPort<P> {
  let p = Ports(ports) 

  const alreadyHasMainPortKey = 'main' in p
  const alreadyHasMainPortValue = Object.values(ports).some(port => port.type === 'main')
  if (alreadyHasMainPortValue) {
    return ports as PortsHasMainPort<P>
  }

  let key = alreadyHasMainPortKey ? `main-${Date.now()}` : 'main';
  let port = Port(key, 'main');

  let n = p as IPorts<PortsWithAddedPort<typeof p, typeof port>> & PortsHasMainPort<P>

  return n 
}


