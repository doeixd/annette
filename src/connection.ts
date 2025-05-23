import { isAgent, IAgent } from "./agent";
import {
  IBoundPort,
  IPort,
  isBoundPort,
  PortInstanceKey,
  PortsDefObj,
  PortsMap,
  PortTypes,
  getPortInstanceKey
} from "./port";

export interface IConnection<
  in out Name extends string = string,
  in out Source extends IAgent<string, any> = IAgent,
  in out Destination extends IAgent<string, any> = IAgent,
  in out SourcePort extends
    Source["ports"][keyof Source["ports"]] = Source["ports"][keyof Source["ports"]],
  in out DestinationPort extends
    Destination["ports"][keyof Destination["ports"]] = Destination["ports"][keyof Destination["ports"]],
> {
  name: Name;

  source: Source;
  sourcePort: SourcePort;
  sourcePortKey: PortInstanceKey;

  destination: Destination;
  destinationPort: DestinationPort;
  destinationPortKey: PortInstanceKey;
}

export function isConnection(arg: any): arg is IConnection {
  if (typeof arg !== "object") return false;

  if (
    "name" in arg &&
    "source" in arg &&
    "sourcePort" in arg &&
    "destination" in arg &&
    "destinationPort" in arg
  ) {
    return true;
  }

  return false;
}

// export type ConnectionKey <ConnectionName extends string, AgentOne extends string, AgentTwo extends string, AgentOnePort extends string, AgentTwoPort extends string> =
//   `${AgentOne}.${AgentOnePort} -> ${AgentTwo}.${AgentTwoPort} (${ConnectionName})` | `${AgentTwo}.${AgentTwoPort} -> ${AgentOne}.${AgentOnePort} (${ConnectionName})`

export type ConnectionKey<C extends IConnection> =
  C extends IConnection<infer N, infer S, infer D, infer SP, infer DP>
    ? `${N} -> ${S["name"]}:-:${SP["name"]} -> ${D["name"]}:-:${DP["name"]}`
    : never;

export function ConnectionKey<C extends IConnection>(c: C): ConnectionKey<C> {
  return `${c.name} -> ${c.source.name}:-:${c.sourcePort.name} -> ${c.destination.name}:-:${c.destinationPort.name}` as ConnectionKey<C>;
}

export type Connections<
  Source extends IAgent,
  C extends IConnection<string, Source, IAgent>[] = [],
> = {
  [K in C[number]["name"]]: C[number];
};

export type ConnectFn =
  | ((
      sourcePort: IBoundPort,
      destinationPort: IBoundPort,
      name: string,
    ) => typeof sourcePort extends IBoundPort<infer SA, infer SN, infer ST>
      ? typeof destinationPort extends IBoundPort<infer DA, infer DN, infer DT>
        ? IConnection<
            typeof name,
            SA,
            DA,
            Extract<SA["ports"][keyof SA["ports"]], IBoundPort<SA, SN>>,
            Extract<DA["ports"][keyof DA["ports"]], IBoundPort<DA, DN>>
          >
        : never
      : never)
  | (<
      Source extends IAgent,
      Destination extends IAgent,
      Name extends string = string,
    >(
      source: Source,
      destination: Destination,
      name: Name,
    ) => IConnection<Name, Source, Destination>)
  | (<
      Source extends string = string,
      Destination extends string = string,
      Name extends string = string,
    >(
      source: Source,
      destination: Destination,
      name: string,
    ) => IConnection<Name, IAgent<Source>, IAgent<Destination>>);

export type DisconnectFn =
  | ((
      sourcePort: IBoundPort,
      destinationPort: IBoundPort,
    ) => typeof sourcePort extends IBoundPort<infer SA, infer SN, infer ST>
      ? typeof destinationPort extends IBoundPort<infer DA, infer DN, infer DT>
        ? void
        : never
      : never)
  | (<
      Source extends IAgent,
      Destination extends IAgent,
      Name extends string = string,
    >(
      source: Source,
      destination: Destination,
    ) => void);

export type ConnectArg = IBoundPort | string | IAgent;

// export const Connection = <Name extends string, Source extends IAgent, Destination extends IAgent, SourcePort extends IPort, DestinationPort extends IPort>(name: Name, source: Source, sourcePort: SourcePort, destination: Destination, destinationPort: DestinationPort) => {
//   let connection = new class Connection implements IConnection<Name, Source, Destination, SourcePort, DestinationPort> {
//     name = name;
//     source = source;
//     sourcePort = sourcePort;
//     destination = destination;
//     destinationPort = destinationPort;
//   } as IConnection<Name, Source, Destination, SourcePort, DestinationPort>
// }

export function Connection<
  SP extends IBoundPort,
  DP extends IBoundPort,
  N extends string = string,
>(
  sourcePort: SP,
  destinationPort: DP,
  name?: N,
): typeof sourcePort extends IBoundPort<infer SA, infer SN, infer ST>
  ? typeof destinationPort extends IBoundPort<infer DA, infer DN, infer DT>
    ? IConnection<
        N,
        SA,
        DA,
        Extract<SA["ports"][keyof SA["ports"]], IBoundPort<SA, SN>>,
        Extract<DA["ports"][keyof DA["ports"]], IBoundPort<DA, DN>>
      >
    : never
  : never;

export function Connection<
  Source extends IAgent,
  Destination extends IAgent,
  Name extends string = string,
>(
  source: Source,
  destination: Destination,
  name?: Name,
): IConnection<Name, Source, Destination>;

// Implementation signature
export function Connection<
  S extends IAgent | IBoundPort,
  D extends IAgent | IBoundPort,
  N extends string = string,
>(source: S, destination: D, name?: N) {
  const usingPorts = isBoundPort(source) && isBoundPort(destination);

  if (usingPorts) {
    const sourcePort = source as IBoundPort;
    const destPort = destination as IBoundPort;
    let sa = sourcePort.agent;
    let da = destPort.agent;
    const sourcePortKey = getPortInstanceKey(sourcePort);
    const destPortKey = getPortInstanceKey(destPort);
    
    // Generate a name if not provided
    const connectionName = name || 
      `${sa.name}.${sourcePort.name}(${sourcePort.type})-to-${da.name}.${destPort.name}(${destPort.type})` as N;

    let c = new (class Connection
      implements
        IConnection<
          N,
          S extends IBoundPort ? S["agent"] : never,
          D extends IBoundPort ? D["agent"] : never,
          S extends IBoundPort ? S["agent"]["ports"][S["name"]] : never,
          D extends IBoundPort ? D["agent"]["ports"][D["name"]] : never
        >
    {
      name = connectionName;

      source = sa as S extends IBoundPort ? S["agent"] : never;
      sourcePort = sourcePort as unknown as S extends IBoundPort
        ? S["agent"]["ports"][S["name"]]
        : never;
      sourcePortKey = sourcePortKey;

      destination = da as D extends IBoundPort ? D["agent"] : never;
      destinationPort = destPort as unknown as D extends IBoundPort
        ? D["agent"]["ports"][D["name"]]
        : never;
      destinationPortKey = destPortKey;
    })();

    return Object.seal(c);
  }

  const usingAgents = isAgent(source) && isAgent(destination);

  if (usingAgents) {
    let s = source as IAgent;
    let d = destination as IAgent;
    const sourcePort = s.ports.main;
    const destPort = d.ports.main;
    const sourcePortKey = getPortInstanceKey(sourcePort);
    const destPortKey = getPortInstanceKey(destPort);
    
    // Generate a name if not provided
    const connectionName = name || 
      `${s.name}.main-to-${d.name}.main` as N;

    let c = new (class Connection
      implements
        IConnection<
          N,
          S extends IAgent ? S : never,
          D extends IAgent ? D : never
        >
    {
      name = connectionName;

      source = s as S extends IAgent ? S : never;
      sourcePort = sourcePort as unknown as S extends IAgent
        ? S["ports"][keyof S["ports"]]
        : never;
      sourcePortKey = sourcePortKey;

      destination = d as D extends IAgent ? D : never;
      destinationPort = destPort as unknown as D extends IAgent
        ? D["ports"][keyof D["ports"]]
        : never;
      destinationPortKey = destPortKey;
    })();

    return Object.seal(c);
  }

  throw new Error("Invalid arguments");
}
