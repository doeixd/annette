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
    destination?: ConnectArg,
    name?: string,
  ): boolean {
    if (isConnection(source)) {
      const connection = source as IConnection;
      if (graph.has(connection.source)) {
        const list = graph.get(connection.source);
        if (list) {
          const foundIndex = list.findIndex((c) => c === connection);
          if (foundIndex !== -1) {
            list.splice(foundIndex, 1);
            if (list.length === 0) {
              graph.delete(connection.source);
            }
            return true;
          }
        }
      }
      return false;
    }

    if (
      (isAgent(source) && isAgent(destination)) ||
      (isBoundPort(source) && isBoundPort(destination))
    ) {
      // TS type guards don't seem to narrow down the union type for Connection function
      // So casting to any for now
      const connectionToDisconnect = Connection(
        source as any,
        destination as any,
        name,
      );

      if (graph.has(connectionToDisconnect.source)) {
        const list = graph.get(connectionToDisconnect.source);
        if (list) {
          const foundIndex = list.findIndex((c) => {
            return (
              c.destination === connectionToDisconnect.destination &&
              c.sourcePort === connectionToDisconnect.sourcePort &&
              c.destinationPort === connectionToDisconnect.destinationPort &&
              c.name === connectionToDisconnect.name
            );
          });

          if (foundIndex !== -1) {
            list.splice(foundIndex, 1);
            if (list.length === 0) {
              graph.delete(connectionToDisconnect.source);
            }
            return true;
          }
        }
      }
      return false;
    }

    throw new TypeError(
      "Invalid arguments provided to network disconnect function",
    );
  }

  function removeAgentData(agent: IAgent) {
    // 1. Remove from agentsMap
    agentsMap.delete(agent.name);

    // 2. Remove from names map
    const agentsByName = names.get(agent.name);
    if (agentsByName) {
      const index = agentsByName.indexOf(agent);
      if (index > -1) {
        agentsByName.splice(index, 1);
      }
      if (agentsByName.length === 0) {
        names.delete(agent.name);
      }
    }

    // 3. Remove from types map
    const agentsByType = types.get(agent.type);
    if (agentsByType) {
      const index = agentsByType.indexOf(agent);
      if (index > -1) {
        agentsByType.splice(index, 1);
      }
      if (agentsByType.length === 0) {
        types.delete(agent.type);
      }
    }

    // 4. Remove rules
    // Rules where agent is a source
    rulesMap.delete(agent);
    // Rules where agent is a destination
    for (const [source, destMap] of rulesMap.entries()) {
      if (destMap.has(agent)) {
        destMap.delete(agent);
        if (destMap.size === 0) {
          rulesMap.delete(source);
        }
      }
    }

    // 5. Remove connections
    // Connections where agent is a source
    graph.delete(agent);
    // Connections where agent is a destination
    for (const [sourceAgent, connectionList] of graph.entries()) {
      const filteredList = connectionList.filter(
        (conn) => conn.destination !== agent,
      );
      if (filteredList.length !== connectionList.length) {
        if (filteredList.length === 0) {
          graph.delete(sourceAgent);
        } else {
          graph.set(sourceAgent, filteredList);
        }
      }
    }
  }

  function reduce() {
    const initialConnections: IConnection[] = [];
    for (const conns of graph.values()) {
      initialConnections.push(...conns);
    }

    const consumedAgentsInThisPass = new Set<IAgent>();

    for (const connection of initialConnections) {
      const sourceAgent = connection.source as A; // Cast to A for rule lookup
      const destAgent = connection.destination as A; // Cast to A for rule lookup

      if (
        consumedAgentsInThisPass.has(sourceAgent) ||
        consumedAgentsInThisPass.has(destAgent)
      ) {
        continue; // Agents already consumed in this pass
      }

      const sourceRules = rulesMap.get(sourceAgent);
      const rule = sourceRules?.get(destAgent) as IRule<A, A> | undefined; // Ensure rule type matches

      if (rule) {
        // Assuming rule.action is (source: S, destination: D) => IAgent[] | void
        // The actual type of rule.action is Action<S, D> which is a union.
        // We need to ensure the correct function signature is called.
        // For this implementation, we'll assume it's the (source, destination) variant.
        const ruleAction = rule.action as (
          s: A,
          d: A,
        ) => (A | IAgent)[] | void;
        const newAgentsFromRule = ruleAction(sourceAgent, destAgent);

        // Consume sourceAgent and destAgent
        removeAgentData(sourceAgent);
        removeAgentData(destAgent);

        consumedAgentsInThisPass.add(sourceAgent);
        consumedAgentsInThisPass.add(destAgent);

        // Add new agents from the rule
        if (Array.isArray(newAgentsFromRule)) {
          for (const newAgent of newAgentsFromRule) {
            const agentToAdd = newAgent as A; // Cast to A
            agentsMap.set(agentToAdd.name, agentToAdd);

            if (!names.has(agentToAdd.name)) {
              names.set(agentToAdd.name, []);
            }
            names.get(agentToAdd.name)?.push(agentToAdd);

            if (!types.has(agentToAdd.type)) {
              types.set(agentToAdd.type, []);
            }
            types.get(agentToAdd.type)?.push(agentToAdd);
          }
        }
      }
    }
  }

  function step(): boolean {
    for (const [sourceAgent, connectionsArray] of graph.entries()) {
      for (const connection of connectionsArray) {
        const destAgent = connection.destination as A; // Cast to A for rule lookup

        // Check if agents still exist in the graph (might have been removed by a previous iteration if a rule consumed one of them indirectly)
        // However, removeAgentData should clean up connections, so this check might be redundant
        // if sourceAgent or destAgent were already removed.
        // For safety, we can check if they are still in agentsMap.
        if (!agentsMap.has(sourceAgent.name) || !agentsMap.has(destAgent.name)) {
          continue; 
        }

        const sourceRules = rulesMap.get(sourceAgent as A); // sourceAgent is key in graph, should be A
        const rule = sourceRules?.get(destAgent) as IRule<A, A> | undefined;

        if (rule) {
          // Eligible interaction found
          const ruleAction = rule.action as (
            s: A,
            d: A,
          ) => (A | IAgent)[] | void;
          const newAgentsFromRule = ruleAction(sourceAgent as A, destAgent);

          // Consume sourceAgent and destAgent
          // removeAgentData will also remove all connections involving these agents,
          // including the current 'connection' being processed.
          removeAgentData(sourceAgent); 
          removeAgentData(destAgent);
          // No need to add to a 'consumedAgents' set like in reduce, as step only processes one.

          // Add new agents from the rule
          if (Array.isArray(newAgentsFromRule)) {
            for (const newAgent of newAgentsFromRule) {
              const agentToAdd = newAgent as A; // Cast to A
              agentsMap.set(agentToAdd.name, agentToAdd);

              if (!names.has(agentToAdd.name)) {
                names.set(agentToAdd.name, []);
              }
              names.get(agentToAdd.name)?.push(agentToAdd);

              if (!types.has(agentToAdd.type)) {
                types.set(agentToAdd.type, []);
              }
              types.get(agentToAdd.type)?.push(agentToAdd);
            }
          }
          return true; // A step was taken
        }
      }
    }
    return false; // No eligible interaction found
  }

  function addRule<R extends IRule>(rule: R) {
    if (!rule.connection || rule.connection.source == null) {
      throw new TypeError("Rule must have a valid source agent in its connection.");
    }
    const sourceAgent = rule.connection.source as A; // Cast to A, as it's used as a key

    if (rule.connection.destination == null) {
      throw new TypeError(
        "Rule must have a valid destination agent in its connection.",
      );
    }
    const destAgent = rule.connection.destination as A; // Cast to A

    const sourceAgentMap = rulesMap.get(sourceAgent) || createAgentRuleMap(sourceAgent);
    rulesMap.set(sourceAgent, sourceAgentMap);
    sourceAgentMap.set(destAgent, rule);
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
