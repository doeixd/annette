import { ActionRule } from "../rule";
import { Connection } from "../connection";
import { Port, type IBoundPort } from "../port";
import { Agent, type IAgent } from "../agent";
import { type ScopedNetwork, type AgentFactory, type PortsDefinition } from "../scoped-network";
import { type INetwork } from "../network";

export type ObserverPortNames = {
  channelNext?: string;
  listenerPrev?: string;
  listenerNext?: string;
  listenerVisitor?: string;
  terminatorPrev?: string;
  terminatorVisitor?: string;
  pulseMain?: string;
};

export type ObserverEmitOptions = {
  mode?: "step" | "reduce";
  maxSteps?: number;
};

export type EventChannel<Payload> = IAgent<
  "Channel",
  { name: string },
  "event",
  { next: ReturnType<typeof Port.aux> }
> & { __payload?: Payload };

export type EventListener<Payload> = IAgent<
  "Listener",
  { callback: (payload: Payload) => void },
  "event",
  { prev: ReturnType<typeof Port.aux>; next: ReturnType<typeof Port.aux>; visitor: ReturnType<typeof Port.main> }
>;

export type EventSystem = {
  createEvent: <Payload>(name: string) => EventChannel<Payload>;
  listen: <Payload>(channel: EventChannel<Payload>, callback: (payload: Payload) => void) => EventListener<Payload>;
  emit: <Payload>(channel: EventChannel<Payload>, payload: Payload, options?: ObserverEmitOptions) => boolean;
  getListeners: <Payload>(channel: EventChannel<Payload>) => IAgent[];
};

const resolvePortNames = (base: Required<ObserverPortNames>, overrides?: ObserverPortNames) => ({
  channelNext: overrides?.channelNext ?? base.channelNext,
  listenerPrev: overrides?.listenerPrev ?? base.listenerPrev,
  listenerNext: overrides?.listenerNext ?? base.listenerNext,
  listenerVisitor: overrides?.listenerVisitor ?? base.listenerVisitor,
  terminatorPrev: overrides?.terminatorPrev ?? base.terminatorPrev,
  terminatorVisitor: overrides?.terminatorVisitor ?? base.terminatorVisitor,
  pulseMain: overrides?.pulseMain ?? base.pulseMain
});

const getBoundPort = (agent: IAgent, portName: string, label: string): IBoundPort => {
  const port = agent.ports[portName as keyof typeof agent.ports] as IBoundPort | undefined;
  if (!port) {
    throw new Error(`${label} port "${portName}" was not found on ${agent.name}`);
  }
  return port;
};

const createTemplateAgent = <
  Name extends string,
  Value,
  Type extends string,
  P extends PortsDefinition
>(
  factory: AgentFactory<Name, Value, Type, P>
): IAgent<Name, Value, Type, P> => {
  return Agent(factory.__agentName as Name, undefined as Value, factory.__ports, factory.__type as Type) as IAgent<Name, Value, Type, P>;
};

const findSingleConnection = (network: INetwork, port: IBoundPort): { otherPort: IBoundPort } | null => {
  const connections = network.findConnections({ from: port }).concat(network.findConnections({ to: port }));

  if (connections.length === 0) {
    return null;
  }

  const connection = connections[0];
  const otherPort = connection.sourcePort === port ? connection.destinationPort : connection.sourcePort;

  return { otherPort };
};

/**
 * Creates a linked-list event system where pulses traverse listener agents.
 */
export function createEventSystem(scoped: ScopedNetwork, ports: ObserverPortNames = {}): EventSystem {
  const basePorts: Required<ObserverPortNames> = {
    channelNext: ports.channelNext ?? "next",
    listenerPrev: ports.listenerPrev ?? "prev",
    listenerNext: ports.listenerNext ?? "next",
    listenerVisitor: ports.listenerVisitor ?? "visitor",
    terminatorPrev: ports.terminatorPrev ?? "prev",
    terminatorVisitor: ports.terminatorVisitor ?? "visitor",
    pulseMain: ports.pulseMain ?? "main"
  };

  const Channel = scoped.Agent.factory<{ name: string }, "Channel", "event", { next: ReturnType<typeof Port.aux> }>("Channel", {
    type: "event",
    ports: {
      next: Port.aux(basePorts.channelNext)
    }
  });

  const Listener = scoped.Agent.factory<
    { callback: (payload: unknown) => void },
    "Listener",
    "event",
    {
      prev: ReturnType<typeof Port.aux>;
      next: ReturnType<typeof Port.aux>;
      visitor: ReturnType<typeof Port.main>;
    }
  >("Listener", {
    type: "event",
    ports: {
      prev: Port.aux(basePorts.listenerPrev),
      next: Port.aux(basePorts.listenerNext),
      visitor: Port.main(basePorts.listenerVisitor)
    }
  });

  const Terminator = scoped.Agent.factory<
    null,
    "Terminator",
    "event",
    { prev: ReturnType<typeof Port.aux>; visitor: ReturnType<typeof Port.main> }
  >("Terminator", {
    type: "event",
    ports: {
      prev: Port.aux(basePorts.terminatorPrev),
      visitor: Port.main(basePorts.terminatorVisitor)
    }
  });

  const Pulse = scoped.Agent.factory<{ payload: unknown }, "Pulse", "event", { main: ReturnType<typeof Port.main> }>(
    "Pulse",
    {
      type: "event",
      ports: {
        main: Port.main(basePorts.pulseMain)
      }
    }
  );

  const listenerTemplate = createTemplateAgent(Listener);
  const pulseTemplate = createTemplateAgent(Pulse);
  const terminatorTemplate = createTemplateAgent(Terminator);

  const listenerVisitorPort = getBoundPort(listenerTemplate, basePorts.listenerVisitor, "Listener visitor");
  const pulseMainPort = getBoundPort(pulseTemplate, basePorts.pulseMain, "Pulse");
  const terminatorVisitorPort = getBoundPort(terminatorTemplate, basePorts.terminatorVisitor, "Terminator visitor");

  const pulseVisitRule = ActionRule(
    listenerVisitorPort,
    pulseMainPort,
    (listener, pulse, network) => {
      const visitor = getBoundPort(listener, basePorts.listenerVisitor, "Listener visitor");
      const listenerNext = getBoundPort(listener, basePorts.listenerNext, "Listener next");
      const pulsePort = getBoundPort(pulse, basePorts.pulseMain, "Pulse");

      (listener.value.callback as (payload: unknown) => void)(pulse.value.payload);

      const nextConnection = findSingleConnection(network, listenerNext);
      if (!nextConnection) {
        return [{ type: "remove", entity: pulse }];
      }

      const nextAgent = nextConnection.otherPort.agent;
      const nextVisitorName = nextAgent.name === "Listener" ? basePorts.listenerVisitor : basePorts.terminatorVisitor;
      const nextVisitor = getBoundPort(nextAgent, nextVisitorName, "Next visitor");

      if (network.isPortConnected(pulsePort)) {
        network.disconnectPorts(visitor, pulsePort);
      }

      network.connectPorts(nextVisitor, pulsePort);
      return [];
    }
  );

  const pulseTerminateRule = ActionRule(
    terminatorVisitorPort,
    pulseMainPort,
    (_terminator, pulse) => [{ type: "remove", entity: pulse }]
  );

  scoped.network.addRule(pulseVisitRule);
  scoped.network.addRule(pulseTerminateRule);

  const createEvent = <Payload,>(name: string): EventChannel<Payload> => {
    const channel = Channel({ name }) as EventChannel<Payload>;
    const terminator = Terminator(null);

    const channelNext = getBoundPort(channel, basePorts.channelNext, "Channel next");
    const terminatorPrev = getBoundPort(terminator, basePorts.terminatorPrev, "Terminator prev");

    scoped.network.connectPorts(channelNext, terminatorPrev);
    return channel;
  };

  const listen = <Payload,>(
    channel: EventChannel<Payload>,
    callback: (payload: Payload) => void
  ): EventListener<Payload> => {
    const listener = Listener({ callback: callback as (payload: unknown) => void }) as EventListener<Payload>;
    const channelNext = getBoundPort(channel, basePorts.channelNext, "Channel next");
    const currentHead = findSingleConnection(scoped.network, channelNext);

    if (!currentHead) {
      throw new Error("Event channel has no terminator connection");
    }

    const listenerPrev = getBoundPort(listener, basePorts.listenerPrev, "Listener prev");
    const listenerNext = getBoundPort(listener, basePorts.listenerNext, "Listener next");

    scoped.network.disconnectPorts(channelNext, currentHead.otherPort);
    scoped.network.connectPorts(channelNext, listenerPrev);
    scoped.network.connectPorts(listenerNext, currentHead.otherPort);

    return listener;
  };

  const emit = <Payload,>(
    channel: EventChannel<Payload>,
    payload: Payload,
    options?: ObserverEmitOptions
  ): boolean => {
    const channelNext = getBoundPort(channel, basePorts.channelNext, "Channel next");
    const headConnection = findSingleConnection(scoped.network, channelNext);

    if (!headConnection) {
      return false;
    }

    const headAgent = headConnection.otherPort.agent;
    const headVisitorName = headAgent.name === "Listener" ? basePorts.listenerVisitor : basePorts.terminatorVisitor;
    const headVisitor = getBoundPort(headAgent, headVisitorName, "Head visitor");
    const pulse = Pulse({ payload: payload as unknown });
    const pulsePort = getBoundPort(pulse, basePorts.pulseMain, "Pulse");

    scoped.network.connectPorts(headVisitor, pulsePort);

    if (options?.mode === "step") {
      return scoped.step();
    }

    scoped.reduce(options?.maxSteps);
    return true;
  };

  const getListeners = <Payload,>(channel: EventChannel<Payload>): IAgent[] => {
    const listeners: IAgent[] = [];
    const channelNext = getBoundPort(channel, basePorts.channelNext, "Channel next");
    let current = findSingleConnection(scoped.network, channelNext);

    while (current) {
      const agent = current.otherPort.agent as IAgent;
      listeners.push(agent);

      if (agent.name === "Terminator") {
        break;
      }

      const nextPortName = agent.name === "Listener" ? basePorts.listenerNext : basePorts.terminatorPrev;
      const nextPort = getBoundPort(agent, nextPortName, "Next");
      const next = findSingleConnection(scoped.network, nextPort);

      if (!next) {
        break;
      }

      current = next;
    }

    return listeners;
  };

  return { createEvent, listen, emit, getListeners };
}
