import { ActionRule, type RuleCommand } from "../rule";
import { Connection } from "../connection";
import { Port, type IBoundPort } from "../port";
import { Agent, type IAgent } from "../agent";
import { type ScopedNetwork, type AgentFactory, type PortsDefinition } from "../scoped-network";
import { type INetwork } from "../network";

export type ReifiedEffectPortNames = {
  effectMain?: string;
  effectReply?: string;
  handlerMain?: string;
  handlerCapability?: string;
  resultMain?: string;
  errorMain?: string;
};

export type EffectEmitOptions = {
  mode?: "step" | "reduce";
  maxSteps?: number;
};

export type EffectValue<Payload> = {
  type: string;
  payload: Payload;
};

export type HandlerValue<Payload, Result> = {
  topic: string;
  fn: (payload: Payload) => Promise<Result>;
};

export type ResultValue<Result> = {
  data: Result;
};

export type ErrorResultValue = {
  reason: string;
};

export type ReifiedEffectSystem = {
  Effect: AgentFactory<"Effect", EffectValue<unknown>, "effect", { main: ReturnType<typeof Port.main>; reply: ReturnType<typeof Port.aux> }>;
  Handler: AgentFactory<
    "Handler",
    HandlerValue<unknown, unknown>,
    "effect",
    { main: ReturnType<typeof Port.main>; capability: ReturnType<typeof Port.aux> }
  >;
  Result: AgentFactory<"Result", ResultValue<unknown>, "effect", { main: ReturnType<typeof Port.main> }>;
  ErrorResult: AgentFactory<"ErrorResult", ErrorResultValue, "effect", { main: ReturnType<typeof Port.main> }>;
  request: <Payload>(
    handler: IAgent | IBoundPort,
    replyPort: IBoundPort,
    type: string,
    payload: Payload,
    options?: EffectEmitOptions
  ) => IAgent;
  requestFrom: <Payload>(
    connectedPort: IBoundPort,
    replyPort: IBoundPort,
    type: string,
    payload: Payload,
    options?: EffectEmitOptions
  ) => IAgent;
};

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
  return Agent(factory.__agentName as Name, undefined as Value, factory.__ports, factory.__type as Type) as IAgent<
    Name,
    Value,
    Type,
    P
  >;
};

const spawnAgent = <Name extends string, Value, Type extends string, P extends PortsDefinition>(
  factory: AgentFactory<Name, Value, Type, P>,
  value: Value
): IAgent<Name, Value, Type, P> => {
  return Agent(factory.__agentName as Name, value, factory.__ports, factory.__type as Type) as IAgent<Name, Value, Type, P>;
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
 * Creates a reified effect system for async work.
 */
export function createReifiedEffectSystem(
  scoped: ScopedNetwork,
  ports: ReifiedEffectPortNames = {}
): ReifiedEffectSystem {
  const basePorts: Required<ReifiedEffectPortNames> = {
    effectMain: ports.effectMain ?? "main",
    effectReply: ports.effectReply ?? "reply",
    handlerMain: ports.handlerMain ?? "main",
    handlerCapability: ports.handlerCapability ?? "capability",
    resultMain: ports.resultMain ?? "main",
    errorMain: ports.errorMain ?? "main"
  };

  const Effect = scoped.Agent.factory<
    EffectValue<unknown>,
    "Effect",
    "effect",
    { main: ReturnType<typeof Port.main>; reply: ReturnType<typeof Port.aux> }
  >("Effect", {
    type: "effect",
    ports: {
      main: Port.main(basePorts.effectMain),
      reply: Port.aux(basePorts.effectReply)
    }
  });

  const Handler = scoped.Agent.factory<
    HandlerValue<unknown, unknown>,
    "Handler",
    "effect",
    { main: ReturnType<typeof Port.main>; capability: ReturnType<typeof Port.aux> }
  >("Handler", {
    type: "effect",
    ports: {
      main: Port.main(basePorts.handlerMain),
      capability: Port.aux(basePorts.handlerCapability)
    }
  });

  const Result = scoped.Agent.factory<
    ResultValue<unknown>,
    "Result",
    "effect",
    { main: ReturnType<typeof Port.main> }
  >("Result", {
    type: "effect",
    ports: {
      main: Port.main(basePorts.resultMain)
    }
  });

  const ErrorResult = scoped.Agent.factory<
    ErrorResultValue,
    "ErrorResult",
    "effect",
    { main: ReturnType<typeof Port.main> }
  >("ErrorResult", {
    type: "effect",
    ports: {
      main: Port.main(basePorts.errorMain)
    }
  });

  const effectTemplate = createTemplateAgent(Effect);
  const handlerTemplate = createTemplateAgent(Handler);

  const effectMainPort = getBoundPort(effectTemplate, basePorts.effectMain, "Effect main");
  const handlerMainPort = getBoundPort(handlerTemplate, basePorts.handlerMain, "Handler main");

  const effectExecutionRule = ActionRule(
    handlerMainPort,
    effectMainPort,
    (handler, effect, network) => {
      const replyPort = getBoundPort(effect, basePorts.effectReply, "Effect reply");
      const replyConnection = findSingleConnection(network, replyPort);

      if (handler.value.topic !== effect.value.type) {
        const error = spawnAgent(ErrorResult, { reason: `Unhandled effect: ${effect.value.type}` });
        const errorPort = getBoundPort(error, basePorts.errorMain, "ErrorResult main");
        const commands: RuleCommand[] = [{ type: "remove", entity: effect }];

        if (replyConnection) {
          commands.push({ type: "add", entity: error });
          commands.push({ type: "add", entity: Connection(errorPort, replyConnection.otherPort) });
        }

        return commands;
      }

      const removeEffect: RuleCommand = { type: "remove", entity: effect };

      handler.value
        .fn(effect.value.payload)
        .then((data: unknown) => {
          if (!replyConnection) {
            return;
          }

          const result = spawnAgent(Result, { data });
          const resultPort = getBoundPort(result, basePorts.resultMain, "Result main");

          scoped.network.addAgent(result);
          scoped.network.connectPorts(replyConnection.otherPort, resultPort);
          scoped.step();
        })
        .catch((error: unknown) => {
          if (!replyConnection) {
            return;
          }

          const message = error instanceof Error ? error.message : String(error);
          const errorResult = spawnAgent(ErrorResult, { reason: message });
          const errorPort = getBoundPort(errorResult, basePorts.errorMain, "ErrorResult main");

          scoped.network.addAgent(errorResult);
          scoped.network.connectPorts(replyConnection.otherPort, errorPort);
          scoped.step();
        });

      return [removeEffect];
    }
  );

  scoped.network.addRule(effectExecutionRule);

  const resolveHandlerPort = (handler: IAgent | IBoundPort) => {
    if ("agent" in handler) {
      const port = handler as IBoundPort;
      if (port.name !== basePorts.handlerMain) {
        return getBoundPort(port.agent, basePorts.handlerMain, "Handler main");
      }
      return port;
    }
    return getBoundPort(handler, basePorts.handlerMain, "Handler main");
  };

  const request = <Payload,>(
    handler: IAgent | IBoundPort,
    replyPort: IBoundPort,
    type: string,
    payload: Payload,
    options?: EffectEmitOptions
  ) => {
    const effect = Effect({ type, payload }) as IAgent<"Effect", EffectValue<Payload>>;
    const handlerPort = resolveHandlerPort(handler);
    const effectMain = getBoundPort(effect, basePorts.effectMain, "Effect main");
    const effectReply = getBoundPort(effect, basePorts.effectReply, "Effect reply");

    scoped.network.connectPorts(handlerPort, effectMain);
    scoped.network.connectPorts(effectReply, replyPort);

    if (options?.mode === "reduce") {
      scoped.reduce(options.maxSteps);
    } else {
      scoped.step();
    }

    return effect;
  };

  const requestFrom = <Payload,>(
    connectedPort: IBoundPort,
    replyPort: IBoundPort,
    type: string,
    payload: Payload,
    options?: EffectEmitOptions
  ) => {
    const connection = findSingleConnection(scoped.network, connectedPort);
    if (!connection) {
      throw new Error("No handler connected to the provided port");
    }

    return request(connection.otherPort, replyPort, type, payload, options);
  };

  return { Effect, Handler, Result, ErrorResult, request, requestFrom };
}
