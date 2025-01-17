import { IAgent } from './agent';
import { ConnectFn, DisconnectFn } from './connection';
import { IBoundPort, isBoundPort } from './port';
import { Rule } from './rule';

export type AgentRulesMap = WeakMap<IAgent, WeakMap<IAgent, Rule<any, any>>>;

export interface INetwork<Name extends string> {
  name: Name;
  agents: IAgent[];
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

  
  type ConnectArg = IBoundPort | string | IAgent;

  const connect: ConnectFn = (source: ConnectArg, destination: ConnectArg, name: string) => {
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