import { IAgent } from './agent';
import { ConnectFn, DisconnectFn, IConnection } from './connection';
import { IBoundPort, isBoundPort } from './port';
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


type Graph <S extends IAgent = IAgent> = WeakMap<S, IConnection<string, S>[]>
type AgentRulesMap = WeakMap<IAgent, WeakMap<IAgent, Rule<any, any>>>;

export interface INetwork<Name extends string> {
  name: Name;
  agents: IAgent[];
  connections: Graph 
  rules: AgentRulesMap;
  connect: ConnectFn;
  disconnect: DisconnectFn;
  reduce: () => void;
  step: () => void;
}

export type CreateNetworkFn = <Name extends string>(name: Name) => INetwork<Name>;

export const Network: CreateNetworkFn = (name) => {
  const agents: IAgent[] = [];
  const rules: AgentRulesMap = new WeakMap();

  const net = {} as INetwork<typeof name>;

  const types = new Map<string, IAgent[]>() 
  const names = new Map<string, IAgent[]>()
  const graph: Graph = new Map()




  type ConnectArg = IBoundPort | string | IAgent;

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