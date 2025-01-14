import { TAgent } from "./agent";
import { BoundPort, IPort } from "./port";

export interface Connection <Name extends string = string, Source extends TAgent<string, any> = TAgent, Destination extends TAgent<string, any> = TAgent, SourcePort extends Source['ports'][keyof Source['ports']] = Source['ports'][keyof Source['ports']], DestinationPort extends Destination['ports'][keyof Destination['ports']] = Destination['ports'][keyof Destination['ports']]> {
  name: Name;

  source: Source;
  sourcePort: SourcePort;

  destination: Destination;
  destinationPort: DestinationPort;
}

export type ConnectionKey <ConnectionName extends string, AgentOne extends string, AgentTwo extends string, AgentOnePort extends string, AgentTwoPort extends string> = 
  `${AgentOne}.${AgentOnePort} -> ${AgentTwo}.${AgentTwoPort} (${ConnectionName})` | `${AgentTwo}.${AgentTwoPort} -> ${AgentOne}.${AgentOnePort} (${ConnectionName})`


export type Connections<Source extends TAgent, C extends Connection<string, Source, TAgent>[] = []> = {
  [K in C[number]['name']]: C[number]
}

export type ConnectFn = (
  ((sourcePort: BoundPort, destinationPort: BoundPort, name: string) => (
    typeof sourcePort extends BoundPort<infer SA, infer SN, infer ST> 
    ? typeof destinationPort extends BoundPort<infer DA, infer DN, infer DT>
    ? Connection<typeof name, SA, DA, Extract<SA['ports'][keyof SA['ports']], BoundPort<SA, SN>>, Extract<DA['ports'][keyof DA['ports']], BoundPort<DA, DN>>>
    : never
    : never
  )) 
  | (<Source extends TAgent, Destination extends TAgent, Name extends string = string>(source: Source, destination: Destination, name: Name) => Connection<Name, Source, Destination>)
  | (<Source extends string = string, Destination extends string = string, Name extends string = string>(source: Source, destination: Destination, name: string) => Connection<Name, TAgent<Source>, TAgent<Destination>>)
);


export type DisconnectFn = (
  ((sourcePort: BoundPort, destinationPort: BoundPort) => (
    typeof sourcePort extends BoundPort<infer SA, infer SN, infer ST> 
    ? typeof destinationPort extends BoundPort<infer DA, infer DN, infer DT>
    ? void
    : never
    : never
  )) 
  | (<Source extends TAgent, Destination extends TAgent, Name extends string = string>(source: Source, destination: Destination) => void)
);