import { isAgent, IAgent } from "./agent";
import { IBoundPort, IPort, isBoundPort, PortsDefObj, PortsMap, PortTypes } from "./port";

export interface IConnection <Name extends string = string, Source extends IAgent<string, any> = IAgent, Destination extends IAgent<string, any> = IAgent, SourcePort extends Source['ports'][keyof Source['ports']] = Source['ports'][keyof Source['ports']], DestinationPort extends Destination['ports'][keyof Destination['ports']] = Destination['ports'][keyof Destination['ports']]> {
  name: Name;

  source: Source;
  sourcePort: SourcePort;

  destination: Destination;
  destinationPort: DestinationPort;
}


// export type ConnectionKey <ConnectionName extends string, AgentOne extends string, AgentTwo extends string, AgentOnePort extends string, AgentTwoPort extends string> = 
//   `${AgentOne}.${AgentOnePort} -> ${AgentTwo}.${AgentTwoPort} (${ConnectionName})` | `${AgentTwo}.${AgentTwoPort} -> ${AgentOne}.${AgentOnePort} (${ConnectionName})`

export type ConnectionKey <C extends IConnection> =  
  C extends IConnection<infer N, infer S, infer D, infer SP, infer DP> 
    ?  `${N} -> ${S['name']}:-:${SP['name']} -> ${D['name']}:-:${DP['name']}`
    : never

export function ConnectionKey<C extends IConnection> (c: C): ConnectionKey<C> {
  return `${c.name} -> ${c.source.name}:-:${c.sourcePort.name} -> ${c.destination.name}:-:${c.destinationPort.name}` as ConnectionKey<C>
}

export type Connections<Source extends IAgent, C extends IConnection<string, Source, IAgent>[] = []> = {
  [K in C[number]['name']]: C[number]
}

export type ConnectFn = (
  ((sourcePort: IBoundPort, destinationPort: IBoundPort, name: string) => (
    typeof sourcePort extends IBoundPort<infer SA, infer SN, infer ST> 
    ? typeof destinationPort extends IBoundPort<infer DA, infer DN, infer DT>
    ? IConnection<typeof name, SA, DA, Extract<SA['ports'][keyof SA['ports']], IBoundPort<SA, SN>>, Extract<DA['ports'][keyof DA['ports']], IBoundPort<DA, DN>>>
    : never
    : never
  )) 
  | (<Source extends IAgent, Destination extends IAgent, Name extends string = string>(source: Source, destination: Destination, name: Name) => IConnection<Name, Source, Destination>)
  | (<Source extends string = string, Destination extends string = string, Name extends string = string>(source: Source, destination: Destination, name: string) => IConnection<Name, IAgent<Source>, IAgent<Destination>>)
);


export type DisconnectFn = (
  ((sourcePort: IBoundPort, destinationPort: IBoundPort) => (
    typeof sourcePort extends IBoundPort<infer SA, infer SN, infer ST> 
    ? typeof destinationPort extends IBoundPort<infer DA, infer DN, infer DT>
    ? void
    : never
    : never
  )) 
  | (<Source extends IAgent, Destination extends IAgent, Name extends string = string>(source: Source, destination: Destination) => void)
);


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


export function Connection(
  sourcePort: IBoundPort,
  destinationPort: IBoundPort,
  name: string
): typeof sourcePort extends IBoundPort<infer SA, infer SN, infer ST> 
  ? typeof destinationPort extends IBoundPort<infer DA, infer DN, infer DT>
    ? IConnection<typeof name, SA, DA, Extract<SA['ports'][keyof SA['ports']], IBoundPort<SA, SN>>, Extract<DA['ports'][keyof DA['ports']], IBoundPort<DA, DN>>>
    : never
  : never;

export function Connection<Source extends IAgent, Destination extends IAgent, Name extends string = string>(
  source: Source,
  destination: Destination,
  name: Name
): IConnection<Name, Source, Destination>;

// export function Connection<Source extends string = string, Destination extends string = string, Name extends string = string>(
//   source: Source,
//   destination: Destination,
//   name: Name
// ): IConnection<Name, IAgent<Source>, IAgent<Destination>>;

// Implementation signature
export function Connection(
  source: IAgent | IBoundPort,
  destination: IAgent | IBoundPort,
  name: string 
) {

  const usingPorts = isBoundPort(source) && isBoundPort(destination);

  if (usingPorts ) {
    let sa = source.agent
    let da = destination.agent

    let c = new class Connection implements IConnection<typeof name, typeof source['agent'], typeof destination['agent'], typeof source['agent']['ports'][typeof source.name], typeof source['agent']['ports'][typeof source.name]> {
      name = name;

      source = sa
      sourcePort = sa['ports'][source.name]

      destination = da
      destinationPort = da['ports'][destination.name]
    }

    return Object.seal(c)
  }

  const usingAgents = isAgent(source) && isAgent(destination)

  if (usingAgents) {
    let s = source
    let d = destination
    let c = new class Connection implements IConnection<typeof name, typeof source, typeof destination> {
      name = name;

      source = s 
      sourcePort = s.ports.main 

      destination = d
      destinationPort = d.ports.main
    }

    return Object.seal(c)
  }

  throw new Error('Invalid arguments')
}

