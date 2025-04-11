import { IAgent, isAgent } from "./agent";
import {
  ConnectFn,
  Connection,
  DisconnectFn,
  IConnection,
  isConnection,
} from "./connection";
import {
  IBoundPort,
  IPort,
  isBoundPort,
  PortsDefObj,
  PortsMap,
  PortTypes,
} from "./port";
import { IRule } from "./rule";

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

type Graph<
  A extends IAgent<any, any, any, any> = IAgent,
  C extends IConnection[] = IConnection<string, A>[],
> = Map<A, C | IConnection[]>;

type AgentRuleMap<
  A extends IAgent<any, any, any, any> = IAgent<any, any, any, any>,
> = Map<A, IRule<any, any>>;

function createAgentRuleMap<A extends IAgent<any, any, any, any>>(agent: A) {
  return new Map() as AgentRuleMap;
}

type AgentRulesMap<
  A extends IAgent<any, any, any, any> = IAgent<any, any, any, any>,
> = Map<A, AgentRuleMap>;

type AgentMap<A extends IAgent = IAgent> = Map<A["name"], A>;

export interface INetwork<Name extends string, A extends IAgent = IAgent> {
  name: Name;
  agents: AgentMap<A>;
  connections: Graph<A | IAgent>;
  rules: AgentRulesMap;
  names: Map<string, (A | IAgent)[]>;
  types: Map<string, (A | IAgent)[]>;
  connect: ConnectFn;
  disconnect: DisconnectFn;
  reduce: () => void;
  step: () => void;
  addRule: (rule: IRule) => void;
}

// export type CreateNetworkFn = <Name extends string, A extends IAgent = IAgent>(name: Name) => INetwork<Name>;

export function Network<
  Name extends string,
  A extends IAgent = IAgent,
  R extends IRule = IRule,
  C extends IConnection = IConnection,
>(name: Name, agents?: A[], rules?: R[], connections?: C[]) {
  const agentsMap: AgentMap<A> = new Map();
  const rulesMap: AgentRulesMap = new Map();

  const types = new Map<string, IAgent[]>();
  const names = new Map<string, IAgent[]>();

  const graph: Graph<A | IAgent, (C | IConnection)[]> = new Map();

  const addConnectionToGraph = <C extends IConnection<any, any, any, any>>(
    connection: C,
  ) => {
    if (graph.has(connection.source)) {
      let list = graph.get(connection.source);
      list?.push(connection);
    } else {
      let list = [connection];
      graph.set(connection.source, list);
    }
  };

  if (Array.isArray(connections) && connections) {
    for (let connection of connections) {
      const s = connection.source;
      const gc = graph.has(s) ? graph.get(s) : [connection];
      if (gc) graph.set(s, gc);
    }
  }

  type ConnectArg = IBoundPort | string | IAgent;

  function connect<
    S extends IAgent,
    D extends IAgent,
    N extends string = string,
  >(source: S, destination: D, name?: N): IConnection<N, S, D>;
  function connect<
    S extends IBoundPort,
    D extends IBoundPort,
    N extends string = string,
  >(
    sourcePort: S,
    destinationPort: D,
    name?: N,
  ): IConnection<N, S["agent"], D["agent"]>;
  function connect(
    source: ConnectArg | IConnection,
    destination: ConnectArg,
    name?: string,
  ) {
    const usingPorts = isBoundPort(source) && isBoundPort(destination);

    if (usingPorts) {
      if (!name || typeof name !== "string") {
        name = source["name"] + " to " + destination["name"];
      }
      const connection = Connection(source, destination, name);

      addConnectionToGraph(connection);

      return connection;
    }

    const usingAgents = isAgent(source) && isAgent(destination);
    if (usingAgents) {
      if (!name || typeof name !== "string") {
        name = source["name"] + " to " + destination["name"];
      }
      const connection = Connection(source, destination, name);

      addConnectionToGraph(connection);

      return connection;
    }

    const usingConnection = isConnection(source);
    if (usingConnection) {
      addConnectionToGraph(source);
    }

    throw new TypeError(
      "Invalid arguments provided to network connect function",
    );
  }

  function disconnect(
    source: ConnectArg | IConnection,
    destination: ConnectArg,
    name: string = "connection",
  ) {
    const usingPorts = isBoundPort(source) && isBoundPort(destination);

    if (usingPorts) {
      const connection = Connection(source, destination, name);

      if (graph.has(connection.source)) {
        const list = graph.get(connection.source);
        const foundIndex = list?.findIndex((subject) => {
          return (
            subject.destination == connection.destination &&
            subject.destinationPort == connection.destinationPort &&
            subject.sourcePort == connection.sourcePort
          );
        });
      }
    }
  }

  function reduce() {
    return;
  }

  function step() {
    return;
  }

  function addRule<R extends IRule>(rule: R) {
    const sourceAgent = rule.connection.source;
    const sourceAgentMap = rulesMap.has(sourceAgent)
      ? (rulesMap.get(sourceAgent) as unknown as ReturnType<
          typeof createAgentRuleMap
        >)
      : createAgentRuleMap(sourceAgent);

    rulesMap.set(sourceAgent, sourceAgentMap);

    const destAgent = rule.connection.destination;

    // TODO: Maybe we should thow if there isnt a destination agent? not sure when that would be the case though?
    if (destAgent) {
      sourceAgentMap.set(destAgent, rule);
    }
  }

  const n = new (class Network implements INetwork<Name, A> {
    name = name;
    agents = agentsMap;
    rules = rulesMap;
    names = names;
    types = types;
    connections = graph;
    connect = connect;
    disconnect = disconnect;
    reduce = reduce;
    step = step;
    addRule = addRule;
  })();

  return n;
}
