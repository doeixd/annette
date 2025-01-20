import { IAgent } from './agent';
import { ConnectFn, DisconnectFn, IConnection } from './connection';
import { IBoundPort, IPort, isBoundPort, PortsDefObj, PortsMap, PortTypes } from './port';
import { Rule } from './rule';


// const ctx = {};

// ctx['person'] = {
//   '~agent~': Person;
// }

// type Graph = Map<IAgent, GraphEntry>

// type GraphEntry<S extends IAgent = IAgent> = {
//   '~agent~': S,
// } & {
//   [destName in string]: IConnection<string, S, IAgent<destName>>
// }

// type ConnectionsSet = Set<IConnection>

type Graph <A extends IAgent<any, any, any, any> = IAgent, C extends IConnection[] = IConnection<string, A>[]> = Map<A, C | IConnection[]>
type AgentRulesMap <A extends IAgent = IAgent> = Map<A, Map<A, Rule<any, any>>>;
type AgentMap <A extends IAgent = IAgent> = Map<A['name'], A>

export interface INetwork<Name extends string, A extends IAgent = IAgent> {
  name: Name;
  agents: AgentMap<A>;
  connections: Graph<A | IAgent>
  rules: AgentRulesMap;
  names: Map<string, (A | IAgent)[]>
  types: Map<string, (A | IAgent)[]>
  connect: ConnectFn;
  disconnect: DisconnectFn;
  reduce: () => void;
  step: () => void;
}

// export type CreateNetworkFn = <Name extends string, A extends IAgent = IAgent>(name: Name) => INetwork<Name>;

export function Network <Name extends string, A extends IAgent = IAgent, R extends Rule = Rule, C extends IConnection = IConnection> 
  (name: Name, agents?: A[], rules?: R[], connections?: C[]) {

  const agentsMap: AgentMap<A> = new Map();
  const rulesMap: AgentRulesMap<A> = new Map();

  const types = new Map<string, IAgent[]>() 
  const names = new Map<string, IAgent[]>()

  const graph: Graph<A | IAgent, (C | IConnection)[]> = new Map()

  if (Array.isArray(connections) && connections) {
    for (let connection of connections) {
      const s = connection.source
      const gc = graph.has(s) ? graph.get(s) : [connection]
      if (gc) graph.set(s, gc)
    }
  }

  const n = new class Network implements INetwork<Name, A> {
    name = name
    agents = agentsMap
    rules = rulesMap
    names = names
    types = types
    connections = graph
  }


  
  type ConnectArg = IBoundPort | string | IAgent;

  function 

  const connect: ConnectFn = (source: ConnectArg, destination: ConnectArg, name: string = 'connection') => {
    const usingPorts = isBoundPort(source) && isBoundPort(destination);
    if (usingPorts) {
      const connection = Connection
      return {
        source,
        destination
      }
    }

    return {
      source,
      destination
    }
  }

  const disconnect: DisconnectFn = (source, destination) => {
    return
  }

  const reduce = () => {
    return
  }

  const step = () => {
    return
  }

  return {
    name,
    agents,
    rules,
    connect,
    disconnect,
    reduce,
    step
  }
} 