import { IConnection } from "./connection";
import { IAgent, isAgent } from "./agent";
import { IBoundPort } from "./port";

export type ActionReturn = void | (IAgent | IConnection)[];

export type Action<
  Source extends IAgent = IAgent,
  Destination extends IAgent = IAgent,
  TActionReturn extends ActionReturn = ActionReturn,
> =
  | ((connection: IConnection<string, Source, Destination>) => TActionReturn)
  | ((source: Source, destination: Destination) => TActionReturn)
  | ((
      sourceName: Source["name"],
      destinationName: Destination["name"],
    ) => TActionReturn);

export interface IRule<
  in out Name extends string = string,
  in out TConnection extends IConnection<any, any, any, any, any> = IConnection,
  TAction extends Action<
    TConnection["source"],
    TConnection["destination"]
  > = Action<TConnection["source"], TConnection["destination"]>,
> {
  name: Name;
  connection: TConnection;
  action: TAction;
}

export type CreateRuleFn = <
  Name extends string,
  Source extends IAgent,
  Destination extends IAgent,
  TAction extends Action<Source, Destination>,
  TConnection extends IConnection<string, Source, Destination>,
>(
  name: Name,
  connection: TConnection,
  action: TAction,
) =>
  | IRule<Name, TConnection, TAction>
  | ((
      name: Name,
      connection: [source: string, destination: string],
      action: TAction,
    ) => IRule<Name, TConnection, TAction>);

export function isRule(rule: any): rule is IRule {
  if (typeof rule !== "object") {
    return false;
  } else {
    return (
      ("name" in rule && "connection" in rule && "action" in rule) ||
      rule instanceof Rule
    );
  }
}

export function Rule<
  S extends IBoundPort,
  D extends IBoundPort<any, S["name"], S["type"]>,
>(sourcePort: S, destPort: D): IRule;
export function Rule<
  S extends IAgent,
  D extends IAgent,
  A extends Action<S, D> & { name: string },
>(
  source: S,
  destination: D,
  action: A,
): IRule<
  `${S["name"]}-to-${D["name"]}:${A["name"]}`,
  IConnection<`${S["name"]}-to-${D["name"]}`, S, D>,
  A
>;
export function Rule<
  N extends string,
  C extends IConnection<any, any, any>,
  A extends Action<C["source"], C["destination"]>,
>(name: N, connection: C, action: A): IRule<N, C, A>;
export function Rule<
  S extends IAgent | string,
  D extends IAgent | IConnection<any, any, any>,
  A extends Action<any, any>,
>(
  sourceOrName: S,
  destinationOrConnection: D,
  action: A,
): IRule<any, any, any> {
  if (isAgent(sourceOrName)) {
    const source = sourceOrName;
    const destination = destinationOrConnection as IAgent;
    const connectionName = `${source.name}-to-${destination.name}` as const;
    const ruleName = `${connectionName}:${action.name}` as const;

    // Create the connection
    const connection = {
      name: connectionName,
      source,
      destination,
    } as IConnection<any, any, any>;

    return Rule(ruleName, connection, action);
  }

  // Handle the second overload case
  const name = sourceOrName as string;
  const connection = destinationOrConnection as IConnection<any, any, any>;

  const rule = new (class Rule {
    name = name;
    connection = connection;
    action = action;
  })() as IRule<typeof name, typeof connection, typeof action>;

  Object.defineProperties(rule, {
    name: {
      value: name,
      writable: false,
      configurable: false,
    },
    connection: {
      value: connection,
      writable: false,
      configurable: false,
    },
    action: {
      value: action,
      writable: false,
      configurable: false,
    },
    [Symbol.toStringTag]: {
      value: `Rule ${name}`,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });

  return rule;
}

Object.defineProperty(Rule, Symbol.hasInstance, {
  value: function (instance: any) {
    return isRule(instance);
  },
  writable: false,
  configurable: false,
  enumerable: false,
});

// const createRule: CreateRuleFn = <AgentOne extends Agent<string, any>, AgentTwo extends Agent<string, any>, Action extends (AgentOne, AgentTwo) => any = (AgentOne, AgentTwo) => any, Name extends string = ''>(name: Name, agentOne: AgentOne, agentTwo: AgentTwo, action: Action) => {
//   return {
//     name,
//     action
//   } as Rule<AgentOne, AgentTwo, Action, Name>
// }
