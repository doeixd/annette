import { ActionRule, type RuleCommand } from "../rule";
import { Connection } from "../connection";
import { type IBoundPort } from "../port";
import { Agent, type IAgent } from "../agent";
import { type ScopedNetwork, type AgentFactory } from "../scoped-network";
import { type INetwork } from "../network";

export type TopologyPortNames = {
  machinePort?: string;
  statePort?: string;
  stateEventPort?: string;
  eventPort?: string;
};

export type TopologyTransitionOptions<EventValue, StateValue, NextStateValue> = TopologyPortNames & {
  mapValue?: (eventValue: EventValue, stateValue: StateValue) => NextStateValue;
  ruleName?: string;
};

export type TopologyStateMachine = {
  transition: <
    StateName extends string,
    StateValue,
    EventName extends string,
    EventValue,
    NextStateName extends string,
    NextStateValue
  >(
    fromState: AgentFactory<StateName, StateValue>,
    event: AgentFactory<EventName, EventValue>,
    toState: AgentFactory<NextStateName, NextStateValue>,
    options?: TopologyTransitionOptions<EventValue, StateValue, NextStateValue>
  ) => ReturnType<typeof ActionRule>;
  dispatch: (machine: IAgent, event: IAgent, overrides?: TopologyPortNames) => boolean;
  getState: (machine: IAgent, overrides?: TopologyPortNames) => IAgent | null;
};

const resolvePortNames = (base: Required<TopologyPortNames>, overrides?: TopologyPortNames) => ({
  machinePort: overrides?.machinePort ?? base.machinePort,
  statePort: overrides?.statePort ?? base.statePort,
  stateEventPort: overrides?.stateEventPort ?? base.stateEventPort,
  eventPort: overrides?.eventPort ?? base.eventPort
});

const createTemplateAgent = <Name extends string, Value>(factory: AgentFactory<Name, Value>): IAgent<Name, Value> => {
  return Agent(factory.__agentName as Name, undefined as Value, factory.__ports, factory.__type);
};

const getBoundPort = (agent: IAgent, portName: string, label: string): IBoundPort => {
  const port = agent.ports[portName as keyof typeof agent.ports] as IBoundPort | undefined;
  if (!port) {
    throw new Error(`${label} port "${portName}" was not found on ${agent.name}`);
  }
  return port;
};

const findSingleConnection = (network: INetwork, port: IBoundPort): { connectionPort: IBoundPort; otherPort: IBoundPort } | null => {
  const connections = network.findConnections({ from: port }).concat(network.findConnections({ to: port }));

  if (connections.length === 0) {
    return null;
  }

  const connection = connections[0];
  const connectionPort = connection.sourcePort === port ? connection.sourcePort : connection.destinationPort;
  const otherPort = connection.sourcePort === port ? connection.destinationPort : connection.sourcePort;

  return { connectionPort, otherPort };
};

/**
 * Creates a helper for topology-based state machines.
 * State transitions are expressed as ActionRules that replace the active state agent.
 */
export function createTopologyStateMachine(
  scoped: ScopedNetwork,
  ports: TopologyPortNames = {}
): TopologyStateMachine {
  const basePorts: Required<TopologyPortNames> = {
    machinePort: ports.machinePort ?? "aux",
    statePort: ports.statePort ?? "aux",
    stateEventPort: ports.stateEventPort ?? "main",
    eventPort: ports.eventPort ?? "main"
  };

  const transition: TopologyStateMachine["transition"] = (
    fromState,
    event,
    toState,
    options
  ) => {
    const resolvedPorts = resolvePortNames(basePorts, options);
    const fromTemplate = createTemplateAgent(fromState);
    const eventTemplate = createTemplateAgent(event);

    const stateEventPort = getBoundPort(fromTemplate, resolvedPorts.stateEventPort, "State event");
    const eventPort = getBoundPort(eventTemplate, resolvedPorts.eventPort, "Event");

    const rule = ActionRule(
      stateEventPort,
      eventPort,
      (stateAgent, eventAgent, network) => {
        const statePort = getBoundPort(stateAgent, resolvedPorts.statePort, "State machine");
        const stateConnection = findSingleConnection(network, statePort);

        if (!stateConnection) {
          network.removeAgent(eventAgent._agentId);
          return [];
        }

        const nextValue = options?.mapValue
          ? options.mapValue(eventAgent.value as any, stateAgent.value as any)
          : undefined;

        const nextState = toState(nextValue as any);
        const nextStatePort = getBoundPort(nextState, resolvedPorts.statePort, "Next state machine");

        network.removeAgent(stateAgent._agentId);
        network.removeAgent(eventAgent._agentId);

        const commands: RuleCommand[] = [
          { type: "add", entity: nextState },
          { type: "add", entity: Connection(stateConnection.otherPort, nextStatePort) }
        ];

        return commands;
      },
      options?.ruleName
    );

    scoped.network.addRule(rule);
    return rule;
  };

  const getState = (machine: IAgent, overrides?: TopologyPortNames) => {
    const resolvedPorts = resolvePortNames(basePorts, overrides);
    const machinePort = getBoundPort(machine, resolvedPorts.machinePort, "Machine");
    const connection = findSingleConnection(scoped.network, machinePort);

    if (!connection) {
      return null;
    }

    return connection.otherPort.agent;
  };

  const dispatch = (machine: IAgent, event: IAgent, overrides?: TopologyPortNames) => {
    const resolvedPorts = resolvePortNames(basePorts, overrides);
    const currentState = getState(machine, resolvedPorts);

    if (!currentState) {
      throw new Error("Topology machine has no active state");
    }

    const stateEventPort = getBoundPort(currentState, resolvedPorts.stateEventPort, "State event");
    const eventPort = getBoundPort(event, resolvedPorts.eventPort, "Event");

    if (!scoped.network.getAgent(event._agentId)) {
      scoped.network.addAgent(event);
    }
    scoped.network.connectPorts(stateEventPort, eventPort);

    const progressed = scoped.step();

    const remainingEvents = scoped.network.findAgents({ name: event.name });
    for (const remaining of remainingEvents) {
      scoped.network.removeAgent(remaining);
    }

    return progressed;
  };

  return { transition, dispatch, getState };
}
