import { Agent as BaseAgent, IAgent, AgentName, createAgentFactory, createAgentFactoryFrom, isAgent } from './agent';
import { Network, INetwork } from './network';
import { ActionRule, ActionReturn, AnyRule, RuleCommand, Rule, RuleFactory } from './rule';
import { Connection, IConnection } from './connection';
import { IBoundPort, isBoundPort, Port, PortArray, PortsDefObj, PortsMap, PortFactory } from './port';
import { registerSyncRules, collectSyncOperations, applyRemoteOperations, SyncAgent } from './sync';
import { SerializationOptions, deserializeValue, serializeValue } from './serialization';

export type PortsDefinition = PortArray | PortsDefObj | PortsMap;

export type RunMode = 'step' | 'reduce' | 'manual';

export type ConnectionMethod<TAgent extends IAgent = IAgent, Args extends any[] = any[]> = (
  subject: TAgent,
  ...args: Args
) => ActionReturn | void;

export type MethodSpec<TAgent extends IAgent = IAgent, Args extends any[] = any[]> = {
  run?: RunMode;
  fn: ConnectionMethod<TAgent, Args>;
};

export type RuleSide = 'left' | 'right' | 'both';

export type RuleOutcome = {
  keep?: IAgent[];
  destroy?: IAgent[];
  spawn?: IAgent[];
  connect?: IConnection[];
};

export type ReplaceMapping = Record<string, { agent: IAgent; port: string } | null>;

export type ReplaceOutcome = {
  agents: IAgent[];
  connections?: IConnection[];
  portMap?: {
    left?: ReplaceMapping;
    right?: ReplaceMapping;
  };
};

export type RuleHandler<TLeft extends IAgent = IAgent, TRight extends IAgent = IAgent, Args extends any[] = any[]> = (
  left: TLeft,
  right: TRight,
  ...args: Args
) => void | RuleOutcome | ReplaceOutcome | IAgent | IAgent[] | RuleCommand[];

export type RuleHandlerWrapper<TLeft extends IAgent = IAgent, TRight extends IAgent = IAgent, Args extends any[] = any[]> = {
  kind: 'consume' | 'spawn' | 'transform' | 'when';
  side?: RuleSide;
  guard?: (left: TLeft, right: TRight, ...args: Args) => boolean;
  handler: RuleHandler<TLeft, TRight, Args>;
};

export type PairMethodSpec<Subject extends IAgent = IAgent, Other extends IAgent = IAgent, Args extends any[] = any[]> = {
  other: AgentFactory | IAgent;
  ports?: { left?: string; right?: string };
  run?: RunMode;
  fn: RuleHandler<Subject, Other, Args> | RuleHandlerWrapper<Subject, Other, Args>;
};

export type MethodDefinitions<TAgent extends IAgent = IAgent> = Record<
  string,
  | ConnectionMethod<TAgent, any[]>
  | MethodSpec<TAgent, any[]>
  | PairMethodSpec<TAgent, IAgent, any[]>
  | RuleHandlerWrapper<TAgent, IAgent, any[]>
>;

export type MethodArgs<TAgent extends IAgent, Def> = Def extends PairMethodSpec<TAgent, infer Other, infer Args>
  ? [Other, ...Args]
  : Def extends { fn: infer Fn }
    ? Fn extends (subject: TAgent, ...args: infer Args) => any
      ? Args
      : never
    : Def extends (subject: TAgent, ...args: infer Args) => any
      ? Args
      : never;

export type MethodBindings<TAgent extends IAgent, Methods extends MethodDefinitions<TAgent>> = {
  [K in keyof Methods]: (...args: MethodArgs<TAgent, Methods[K]>) => TAgent;
};

export type AgentWithMethods<TAgent extends IAgent, Methods extends MethodDefinitions<TAgent>> =
  TAgent & MethodBindings<TAgent, Methods>;

export type WithConnectionsOptions = {
  autoDisconnectMain?: boolean;
};

export type AgentFactory<Name extends string = string, Value = any, Type extends string = string, P extends PortsDefinition = PortsDefinition> =
  ((value: Value, portsOverride?: P) => IAgent<Name, Value, Type, P>) & {
    __agentName: Name;
    __ports?: P;
    __type?: Type;
  };

export type AgentFactoryWithMethods<
  Name extends string,
  Value,
  Type extends string,
  P extends PortsDefinition,
  Methods extends MethodDefinitions<IAgent<Name, Value, Type, P>>
> = ((value: Value, portsOverride?: P) => AgentWithMethods<IAgent<Name, Value, Type, P>, Methods>) &
  AgentFactory<Name, Value, Type, P>;

export type RuleMetadata = {
  name: string;
  left: string;
  right: string;
  leftPort: string;
  rightPort: string;
  outcome: string;
  symmetric: boolean;
};

export type RulesRegistry = {
  when: <
    LName extends string,
    LValue,
    LType extends string,
    LPorts extends PortsDefinition,
    RName extends string,
    RValue,
    RType extends string,
    RPorts extends PortsDefinition
  >(
    left: AgentFactory<LName, LValue, LType, LPorts> | IAgent<LName, LValue, LType, LPorts>,
    right: AgentFactory<RName, RValue, RType, RPorts> | IAgent<RName, RValue, RType, RPorts>
  ) => RuleBuilder<IAgent<LName, LValue, LType, LPorts>, IAgent<RName, RValue, RType, RPorts>>;
  list: (options?: { includeSymmetric?: boolean }) => RuleMetadata[];
  canInteract: (
    left: AgentFactory | IAgent,
    right: AgentFactory | IAgent
  ) => boolean;
  for: (
    left: AgentFactory | IAgent,
    right: AgentFactory | IAgent
  ) => RuleMetadata | undefined;
  toMermaid: () => string;
};

export type RuleBuilder<TLeft extends IAgent, TRight extends IAgent> = {
  on: (leftPort: keyof TLeft['ports'] & string, rightPort: keyof TRight['ports'] & string) => RuleBuilder<TLeft, TRight>;
  where: (guard: (left: TLeft, right: TRight) => boolean) => RuleBuilder<TLeft, TRight>;
  symmetric: () => RuleBuilder<TLeft, TRight>;
  mutate: (handler: RuleHandler<TLeft, TRight>) => RuleMetadata;
  consume: (handlerOrSide: RuleSide | RuleHandler<TLeft, TRight>, handler?: RuleHandler<TLeft, TRight>) => RuleMetadata;
  spawn: (handler: RuleHandler<TLeft, TRight>) => RuleMetadata;
  transform: (handler: RuleHandler<TLeft, TRight>) => RuleMetadata;
  replace: (handler: RuleHandler<TLeft, TRight>) => RuleMetadata;
};

export type StorylineStep =
  | {
      type: 'method';
      targetId: string;
      method: string;
      args: StorylineArg[];
    }
  | {
      type: 'spawn';
      id: string;
      factoryName: string;
      value: any;
      ports?: PortsDefinition;
    };

export type StorylineArg =
  | { type: 'value'; value: any }
  | { type: 'ref'; id: string };

export type StorylineSerializeOptions = {
  format?: 'json' | 'seroval';
  serialization?: SerializationOptions;
};

export type StorylineContext = {
  spawn: (
    factory: AgentFactory,
    value: any,
    ports?: PortsDefinition
  ) => Generator<StorylineStep, StoryAgent, void>;
};

export type StoryAgent<Name extends string = string> = {
  __storyId: string;
  __agentName: Name;
} & Record<string, (...args: any[]) => Generator<StorylineStep, StoryAgent<Name>, void>>;

export type StorylineDefinition<Name extends string = string> = {
  steps: StorylineStep[];
  apply: (subject: IAgent) => IAgent;
  replay: (subject: IAgent) => IAgent;
  stepper: (subject: IAgent) => StorylineStepper;
  serialize: (options?: StorylineSerializeOptions) => string;
  subjectName: Name;
  subjectId: string;
};

export type StorylinePayload = {
  subjectName: string;
  subjectId: string;
  steps: StorylineStep[];
};

export type StorylineDeserialize = (
  serialized: string,
  options?: StorylineSerializeOptions
) => StorylineDefinition & { deserialize: StorylineDeserialize };

export type StorylineStepper = {
  next: () => IAgent;
  back: () => IAgent;
  current: IAgent;
  index: number;
};

type RegisteredMethod = {
  name: string;
  opName: string;
  run: RunMode;
  fn: ConnectionMethod;
  mode: 'self' | 'pair';
  ports?: { left?: string; right?: string };
  autoDisconnectMain?: boolean;
  rule?: AnyRule;
};

type ScopeMode = 'defer' | 'step' | 'reduce' | 'manual';

type ScopeContext = {
  mode: ScopeMode;
  pending: boolean;
  tracking: 'enabled' | 'disabled';
};

export type NetworkScope = {
  (callback: () => void): void;
  step: (callback: () => void) => void;
  reduce: (callback: () => void) => void;
  manual: <T>(callback: (net: ScopedNetwork) => T) => T;
};

export type BatchScope = {
  (callback: () => void): void;
  step: (callback: () => void) => void;
  reduce: (callback: () => void) => void;
  manual: <T>(callback: (net: ScopedNetwork) => T) => T;
};

export type UntrackScope = {
  (callback: () => void): void;
  manual: <T>(callback: (net: ScopedNetwork) => T) => T;
};

export type ScopedNetwork = {
  network: INetwork;
  Agent: typeof BaseAgent & { factory: typeof createAgentFactory };
  Port: PortFactory;
  Rule: RuleFactory;
  Connection: typeof Connection;
  rules: RulesRegistry;
  withConnections: <Name extends string, Value, Type extends string, P extends PortsDefinition, Methods extends MethodDefinitions<IAgent<Name, Value, Type, P>>>(
    factory: AgentFactory<Name, Value, Type, P>,
    methods: Methods,
    options?: WithConnectionsOptions
  ) => AgentFactoryWithMethods<Name, Value, Type, P, Methods>;
  fnAgent: <
    SubjectName extends string,
    SubjectValue,
    SubjectType extends string,
    SubjectPorts extends PortsDefinition,
    Name extends string,
    Value
  >(
    subject: AgentFactory<SubjectName, SubjectValue, SubjectType, SubjectPorts> | IAgent<SubjectName, SubjectValue, SubjectType, SubjectPorts>,
    name: Name,
    handler: RuleHandler<IAgent<SubjectName, SubjectValue, SubjectType, SubjectPorts>, IAgent<Name, Value>> | RuleHandlerWrapper<IAgent<SubjectName, SubjectValue, SubjectType, SubjectPorts>, IAgent<Name, Value>>
  ) => AgentFactory<Name, Value>;
  connect: (...args: any[]) => IConnection | undefined;
  scope: NetworkScope;
  batch: BatchScope;
  untrack: UntrackScope;
  derived: <N extends string, V, T extends string = string, P extends PortsDefinition = PortsDefinition>(
    factory: AgentFactory<N, V, T, P>,
    compute: (agent: IAgent<N, V, T, P>) => any
  ) => (source: IAgent<N, V, T, P>) => IAgent;
  storyline: (
    factory: AgentFactory,
    generator: (subject: StoryAgent, ctx: StorylineContext) => Generator<StorylineStep, any, any>
  ) => StorylineDefinition & { deserialize: StorylineDeserialize };
  sync: (
    agent: IAgent,
    transport: {
      send: (payload: SyncPayload) => void;
      onMessage: (handler: (payload: SyncPayload) => void) => void;
    },
    options?: SyncOptions
  ) => { stop: () => void };
  step: () => boolean;
  reduce: (maxSteps?: number) => number;
};

export type SyncPayload = {
  operations: ReturnType<typeof collectSyncOperations>;
  sourceId: string;
};

export type SyncOptions = {
  sourceId?: string;
  intervalMs?: number;
};

const DEFAULT_RUN_MODE: RunMode = 'step';

let storyIdCounter = 0;
const nextStoryId = () => `story-${storyIdCounter++}`;

function normalizeMethodSpec<TAgent extends IAgent>(
  method: ConnectionMethod<TAgent> | MethodSpec<TAgent>
): MethodSpec<TAgent> {
  if (typeof method === 'function') {
    return { fn: method, run: DEFAULT_RUN_MODE };
  }
  return {
    fn: method.fn,
    run: method.run ?? DEFAULT_RUN_MODE
  };
}

export const consume = <TLeft extends IAgent, TRight extends IAgent, Args extends any[]>(
  handlerOrSide: RuleSide | RuleHandler<TLeft, TRight, Args>,
  maybeHandler?: RuleHandler<TLeft, TRight, Args>
): RuleHandlerWrapper<TLeft, TRight, Args> => {
  const handler = typeof handlerOrSide === 'function' ? handlerOrSide : maybeHandler;
  const side = typeof handlerOrSide === 'string' ? handlerOrSide : 'right';

  if (!handler) {
    throw new Error('consume requires a handler');
  }

  return {
    kind: 'consume',
    side,
    handler
  };
};

export const spawn = <TLeft extends IAgent, TRight extends IAgent, Args extends any[]>(
  handler: RuleHandler<TLeft, TRight, Args>
): RuleHandlerWrapper<TLeft, TRight, Args> => ({
  kind: 'spawn',
  handler
});

export const transform = <TLeft extends IAgent, TRight extends IAgent, Args extends any[]>(
  handler: RuleHandler<TLeft, TRight, Args>
): RuleHandlerWrapper<TLeft, TRight, Args> => ({
  kind: 'transform',
  handler
});

export const when = <TLeft extends IAgent, TRight extends IAgent, Args extends any[]>(
  guard: (left: TLeft, right: TRight, ...args: Args) => boolean,
  handler: RuleHandler<TLeft, TRight, Args> | RuleHandlerWrapper<TLeft, TRight, Args>
): RuleHandlerWrapper<TLeft, TRight, Args> => ({
  kind: 'when',
  guard,
  handler: handler as RuleHandler<TLeft, TRight, Args>
});

export const pair = <TLeft extends IAgent, TRight extends IAgent, Args extends any[]>(
  other: AgentFactory | IAgent,
  handler: RuleHandler<TLeft, TRight, Args> | RuleHandlerWrapper<TLeft, TRight, Args>,
  options?: { run?: RunMode; ports?: { left?: string; right?: string } }
): PairMethodSpec<TLeft, TRight, Args> => ({
  other,
  fn: handler,
  run: options?.run,
  ports: options?.ports
});

function normalizeFactoryOptions<P extends PortsDefinition, T extends string>(
  portsOrOptions?: P | { ports?: P; type?: T }
): { ports?: P; type?: T } {
  if (portsOrOptions && typeof portsOrOptions === 'object' && ('ports' in portsOrOptions || 'type' in portsOrOptions)) {
    return portsOrOptions as { ports?: P; type?: T };
  }
  return { ports: portsOrOptions as P | undefined };
}

function serializeStoryArg(arg: any): StorylineArg {
  if (arg && typeof arg === 'object' && '__storyId' in arg) {
    return { type: 'ref', id: (arg as StoryAgent).__storyId };
  }
  return { type: 'value', value: arg };
}

function resolveStoryArg(arg: StorylineArg, agentMap: Map<string, IAgent>): any {
  if (arg.type === 'ref') {
    const agent = agentMap.get(arg.id);
    if (!agent) {
      throw new Error(`Storyline reference ${arg.id} not found`);
    }
    return agent;
  }
  return arg.value;
}

export type NestedNetworkHelper = {
  step: () => boolean;
  reduce: (maxSteps?: number) => number;
};

export const asNestedNetwork = (network: ScopedNetwork): NestedNetworkHelper => ({
  step: () => network.step(),
  reduce: (maxSteps?: number) => network.reduce(maxSteps)
});

export function createNetwork(name: string): ScopedNetwork {
  const network = Network(name);
  const methodRegistry = new Map<string, Map<string, RegisteredMethod>>();
  const factoryRegistry = new Map<string, AgentFactory>();
  const derivedRegistry = new Set<{ agent: IAgent; source: IAgent; compute: (agent: IAgent) => any }>();
  const scopeStack: ScopeContext[] = [];
  const ruleMetadata: RuleMetadata[] = [];

  const updateDerived = () => {
    for (const entry of derivedRegistry) {
      entry.agent.value = entry.compute(entry.source);
    }
  };

  const scopedStep = () => {
    const progressed = network.step();
    if (progressed) {
      updateDerived();
    }
    return progressed;
  };

  const scopedReduce = (maxSteps?: number) => {
    const limit = maxSteps ?? 10000;
    let steps = 0;
    let progressed = true;

    while (progressed && steps < limit) {
      progressed = network.step();
      if (progressed) {
        steps += 1;
        updateDerived();
      }
    }

    return steps;
  };

  const resolveAgentInfo = (input: AgentFactory<any, any, any, any> | IAgent) => {
    if (isAgent(input)) {
      return {
        name: input.name,
        ports: input.ports,
        template: input
      };
    }

    const template = BaseAgent(input.__agentName as AgentName, null as any, input.__ports, input.__type);
    return {
      name: input.__agentName,
      ports: template.ports,
      template
    };
  };

  const getDefaultPortName = (ports: Record<string, IBoundPort>) => {
    if ('main' in ports) {
      return 'main';
    }
    const keys = Object.keys(ports);
    return keys[0] ?? 'main';
  };

  type NormalizedHandler<TLeft extends IAgent, TRight extends IAgent> = {
    kind: 'mutate' | 'consume' | 'spawn' | 'transform' | 'when';
    side?: RuleSide;
    guard?: (left: TLeft, right: TRight, ...args: any[]) => boolean;
    handler: RuleHandler<TLeft, TRight>;
  };

  const normalizeHandlerWrapper = <TLeft extends IAgent, TRight extends IAgent>(
    handler: RuleHandler<TLeft, TRight> | RuleHandlerWrapper<TLeft, TRight>
  ): NormalizedHandler<TLeft, TRight> => {
    if (typeof handler === 'function') {
      return { handler, kind: 'mutate' };
    }

    if (handler.kind === 'when') {
      const inner = normalizeHandlerWrapper(handler.handler as RuleHandler<TLeft, TRight> | RuleHandlerWrapper<TLeft, TRight>);
      return {
        ...inner,
        guard: handler.guard ?? inner.guard
      };
    }

    return {
      kind: handler.kind,
      side: handler.side,
      handler: handler.handler
    };
  };

  const resolveOutcome = (
    left: IAgent,
    right: IAgent,
    normalized: NormalizedHandler<IAgent, IAgent>,
    result: unknown
  ): RuleOutcome => {
    if (Array.isArray(result)) {
      return { spawn: result.filter(isAgent) as IAgent[] };
    }

    if (isAgent(result)) {
      return { spawn: [result] };
    }

    const defaultOutcome: RuleOutcome = {};

    if (normalized.kind === 'consume') {
      const side = normalized.side ?? 'right';
      defaultOutcome.destroy = side === 'left' ? [left] : side === 'right' ? [right] : [left, right];
    }

    if (normalized.kind === 'transform') {
      defaultOutcome.destroy = [left, right];
    }

    if (normalized.kind === 'spawn') {
      defaultOutcome.spawn = [];
    }

    if (result && typeof result === 'object') {
      const outcome = result as RuleOutcome;
      if ('keep' in outcome || 'destroy' in outcome || 'spawn' in outcome || 'connect' in outcome) {
        return {
          keep: outcome.keep ?? defaultOutcome.keep,
          destroy: outcome.destroy ?? defaultOutcome.destroy,
          spawn: outcome.spawn ?? defaultOutcome.spawn,
          connect: outcome.connect ?? defaultOutcome.connect
        };
      }

      const replaceOutcome = result as ReplaceOutcome;
      if ('agents' in replaceOutcome) {
        return {
          destroy: defaultOutcome.destroy,
          spawn: replaceOutcome.agents,
          connect: replaceOutcome.connections
        };
      }
    }

    return defaultOutcome;
  };

  const toRuleCommands = (outcome: RuleOutcome) => {
    const commands: RuleCommand[] = [];

    for (const agent of outcome.destroy ?? []) {
      commands.push({ type: 'remove', entity: agent });
    }

    for (const agent of outcome.spawn ?? []) {
      commands.push({ type: 'add', entity: agent });
    }

    for (const connection of outcome.connect ?? []) {
      commands.push({ type: 'add', entity: connection });
    }

    return commands;
  };

  const runInScope = (mode: ScopeMode, callback: () => void, tracking: ScopeContext['tracking'] = 'enabled') => {
    const context: ScopeContext = { mode, pending: false, tracking };
    scopeStack.push(context);
    try {
      callback();
    } finally {
      scopeStack.pop();
      if (context.pending && context.tracking === 'enabled') {
        if (context.mode === 'step') {
          scopedStep();
        } else if (context.mode === 'reduce') {
          scopedReduce();
        }
      }
    }
  };

  const getScope = () => scopeStack[scopeStack.length - 1];

  const isTrackingEnabled = () => getScope()?.tracking !== 'disabled';

  const attachMethods = (agent: IAgent) => {
    const methods = methodRegistry.get(agent.name);
    if (!methods) return;

    for (const [methodName, definition] of methods.entries()) {
      if (methodName in agent) continue;

      Object.defineProperty(agent, methodName, {
        value: (...args: any[]) => {
          if (!isTrackingEnabled()) {
            return agent;
          }

          if (definition.mode === 'pair') {
            const [otherAgent, ...rest] = args;

            if (!isAgent(otherAgent)) {
              throw new Error(`Method ${methodName} expects an agent as the first argument.`);
            }

            if (rest.length > 0) {
              throw new Error(`Method ${methodName} does not accept additional arguments for pair interactions.`);
            }

            const leftPortName = definition.ports?.left ?? 'main';
            const rightPortName = definition.ports?.right ?? 'main';
            const leftPort = agent.ports[leftPortName];
            const rightPort = otherAgent.ports[rightPortName];

            if (!leftPort || !rightPort) {
              throw new Error(`Invalid port selection for ${methodName}.`);
            }

            if (isTrackingEnabled()) {
              network.connectPorts(leftPort, rightPort);
            }
          } else {
            const opAgent = BaseAgent(definition.opName as AgentName, { args });
            if (isTrackingEnabled()) {
              network.addAgent(opAgent);
            }

            if (isTrackingEnabled() && definition.autoDisconnectMain && network.isPortConnected(agent.ports.main)) {
              const connections = network.findConnections({ from: agent.ports.main }).concat(
                network.findConnections({ to: agent.ports.main })
              );
              for (const connection of connections) {
                const otherPort = connection.sourcePort === agent.ports.main
                  ? connection.destinationPort
                  : connection.sourcePort;
                network.disconnectPorts(agent.ports.main, otherPort);
              }
            }

            if (isTrackingEnabled()) {
              network.connectPorts(agent.ports.main, opAgent.ports.main);
            }
          }

          const scope = getScope();
          if (scope && scope.mode !== 'manual' && scope.mode !== 'defer') {
            scope.pending = true;
          }

          if (!scope) {
            if (definition.run === 'step') {
              scopedStep();
            } else if (definition.run === 'reduce') {
              scopedReduce();
            }
          }

          return agent;
        },
        enumerable: false
      });
    }
  };

  const registerRuleMetadata = (metadata: RuleMetadata) => {
    ruleMetadata.push(metadata);
  };

  const registerActionRule = (
    leftInfo: ReturnType<typeof resolveAgentInfo>,
    rightInfo: ReturnType<typeof resolveAgentInfo>,
    leftPortName: string,
    rightPortName: string,
    handler: RuleHandler<IAgent, IAgent> | RuleHandlerWrapper<IAgent, IAgent>,
    outcomeLabel: string,
    symmetric: boolean
  ) => {
    const normalized = normalizeHandlerWrapper(handler);
    const ruleName = `${leftInfo.name}.${leftPortName}-to-${rightInfo.name}.${rightPortName}:${outcomeLabel}`;

    const action = (left: IAgent, right: IAgent) => {
      if (normalized.guard && !normalized.guard(left, right)) {
        return;
      }

      const result = normalized.handler(left, right);

      if (Array.isArray(result)) {
        return result as ActionReturn;
      }

      const outcome = resolveOutcome(left, right, normalized as NormalizedHandler<IAgent, IAgent>, result);
      return toRuleCommands(outcome);
    };

    const leftPort = leftInfo.template.ports[leftPortName];
    const rightPort = rightInfo.template.ports[rightPortName];

    if (!leftPort || !rightPort) {
      throw new Error(`Invalid ports for rule ${ruleName}`);
    }

    const rule = ActionRule(leftPort, rightPort, action, ruleName);
    network.addRule(rule);
    const metadata: RuleMetadata = {
      name: ruleName,
      left: leftInfo.name,
      right: rightInfo.name,
      leftPort: leftPortName,
      rightPort: rightPortName,
      outcome: outcomeLabel,
      symmetric: false
    };

    registerRuleMetadata(metadata);

    if (symmetric && leftInfo.name !== rightInfo.name) {
      const reverseRule = ActionRule(rightPort, leftPort, action, `${ruleName}:symmetric`);
      network.addRule(reverseRule);
      registerRuleMetadata({
        name: `${ruleName}:symmetric`,
        left: rightInfo.name,
        right: leftInfo.name,
        leftPort: rightPortName,
        rightPort: leftPortName,
        outcome: outcomeLabel,
        symmetric
      });
    }

    return metadata;
  };

  const registerReplaceRule = (
    leftInfo: ReturnType<typeof resolveAgentInfo>,
    rightInfo: ReturnType<typeof resolveAgentInfo>,
    leftPortName: string,
    rightPortName: string,
    handler: RuleHandler<IAgent, IAgent> | RuleHandlerWrapper<IAgent, IAgent>,
    symmetric: boolean
  ) => {
    const normalized = normalizeHandlerWrapper(handler);
    const ruleName = `${leftInfo.name}.${leftPortName}-to-${rightInfo.name}.${rightPortName}:replace`;

    const action = (left: IAgent, right: IAgent, net: INetwork) => {
      if (normalized.guard && !normalized.guard(left, right)) {
        return;
      }

      const result = normalized.handler(left, right);
      const replaceOutcome = ((): ReplaceOutcome => {
        if (result && typeof result === 'object') {
          if ('agents' in (result as ReplaceOutcome)) {
            return result as ReplaceOutcome;
          }
        }
        if (Array.isArray(result)) {
          return { agents: result.filter(isAgent) as IAgent[] };
        }
        if (isAgent(result)) {
          return { agents: [result] };
        }
        return { agents: [] };
      })();

      const outcome = resolveOutcome(left, right, normalized as NormalizedHandler<IAgent, IAgent>, replaceOutcome);
      if (!outcome.destroy || outcome.destroy.length === 0) {
        outcome.destroy = [left, right];
      }
      const commands = toRuleCommands(outcome);

      if (replaceOutcome.portMap) {
        const remapConnections = (
          source: IAgent,
          mapping: ReplaceMapping | undefined,
          skipPort: string
        ) => {
          if (!mapping) return;

          for (const [portName, entry] of Object.entries(mapping)) {
            if (portName === skipPort) continue;
            const port = source.ports[portName];
            if (!port) continue;

            const connections = net.findConnections({ from: port }).concat(net.findConnections({ to: port }));
            for (const connection of connections) {
              const otherPort = connection.sourcePort === port ? connection.destinationPort : connection.sourcePort;
              net.disconnectPorts(port, otherPort);
              if (entry) {
                const newPort = entry.agent.ports[entry.port];
                if (newPort) {
                  net.connectPorts(newPort, otherPort);
                }
              }
            }
          }
        };

        remapConnections(left, replaceOutcome.portMap.left, leftPortName);
        remapConnections(right, replaceOutcome.portMap.right, rightPortName);
      }

      return commands;
    };

    const leftPort = leftInfo.template.ports[leftPortName];
    const rightPort = rightInfo.template.ports[rightPortName];

    if (!leftPort || !rightPort) {
      throw new Error(`Invalid ports for rule ${ruleName}`);
    }

    const rule = ActionRule(leftPort, rightPort, action, ruleName);
    network.addRule(rule);
    const metadata: RuleMetadata = {
      name: ruleName,
      left: leftInfo.name,
      right: rightInfo.name,
      leftPort: leftPortName,
      rightPort: rightPortName,
      outcome: 'replace',
      symmetric: false
    };

    registerRuleMetadata(metadata);

    if (symmetric && leftInfo.name !== rightInfo.name) {
      const reverseRule = ActionRule(rightPort, leftPort, action, `${ruleName}:symmetric`);
      network.addRule(reverseRule);
      registerRuleMetadata({
        name: `${ruleName}:symmetric`,
        left: rightInfo.name,
        right: leftInfo.name,
        leftPort: rightPortName,
        rightPort: leftPortName,
        outcome: 'replace',
        symmetric
      });
    }

    return metadata;
  };

  const rules: RulesRegistry = {
    when: (left, right) => {
      const leftInfo = resolveAgentInfo(left);
      const rightInfo = resolveAgentInfo(right);
      let leftPort = getDefaultPortName(leftInfo.ports);
      let rightPort = getDefaultPortName(rightInfo.ports);
      let guard: ((l: IAgent, r: IAgent) => boolean) | undefined;
      let symmetric = false;

      const builder: RuleBuilder<IAgent, IAgent> = {
        on: (leftPortName, rightPortName) => {
          leftPort = leftPortName;
          rightPort = rightPortName;
          return builder;
        },
        where: (guardFn) => {
          guard = guardFn as (l: IAgent, r: IAgent) => boolean;
          return builder;
        },
        symmetric: () => {
          symmetric = true;
          return builder;
        },
        mutate: (handler) => {
          const wrapped = guard ? when(guard, handler) : handler;
          return registerActionRule(leftInfo, rightInfo, leftPort, rightPort, wrapped as unknown as RuleHandler, 'mutate', symmetric);
        },
        consume: (handlerOrSide, handler) => {
          const wrapped = consume(handlerOrSide as any, handler as any);
          const withGuard = guard ? when(guard, wrapped) : wrapped;
          return registerActionRule(leftInfo, rightInfo, leftPort, rightPort, withGuard as unknown as RuleHandler, 'consume', symmetric);
        },
        spawn: (handler) => {
          const wrapped = spawn(handler);
          const withGuard = guard ? when(guard, wrapped) : wrapped;
          return registerActionRule(leftInfo, rightInfo, leftPort, rightPort, withGuard as unknown as RuleHandler, 'spawn', symmetric);
        },
        transform: (handler) => {
          const wrapped = transform(handler);
          const withGuard = guard ? when(guard, wrapped) : wrapped;
          return registerActionRule(leftInfo, rightInfo, leftPort, rightPort, withGuard as unknown as RuleHandler, 'transform', symmetric);
        },
        replace: (handler) => {
          const wrapped = guard ? when(guard, handler) : handler;
          return registerReplaceRule(leftInfo, rightInfo, leftPort, rightPort, wrapped as unknown as RuleHandler, symmetric);
        }
      };

      return builder as RuleBuilder<any, any>;
    },
    list: (options) => {
      const includeSymmetric = options?.includeSymmetric ?? true;
      return includeSymmetric ? [...ruleMetadata] : ruleMetadata.filter((rule) => !rule.symmetric);
    },
    canInteract: (left, right) => {
      const leftName = resolveAgentInfo(left).name;
      const rightName = resolveAgentInfo(right).name;
      return ruleMetadata.some((rule) => rule.left === leftName && rule.right === rightName);
    },
    for: (left, right) => {
      const leftName = resolveAgentInfo(left).name;
      const rightName = resolveAgentInfo(right).name;
      return ruleMetadata.find((rule) => rule.left === leftName && rule.right === rightName);
    },
    toMermaid: () => {
      const lines = ruleMetadata.map(
        (rule) => `  ${rule.left} -->|${rule.outcome}| ${rule.right}`
      );
      return `graph LR\n${lines.join('\n')}`;
    }
  };

  const ensureFactory = <N extends string, V, T extends string, P extends PortsDefinition>(
    name: N,
    options?: { ports?: P; type?: T }
  ) => {
    const factory = ((value: V, portsOverride?: P) => {
      const agent = BaseAgent(name, value, portsOverride ?? options?.ports, options?.type);
      if (isTrackingEnabled()) {
        network.addAgent(agent);
      }
      attachMethods(agent);
      return agent;



    }) as AgentFactory<N, V, T, P>;

    factory.__agentName = name;
    factory.__ports = options?.ports;
    factory.__type = options?.type;

    factoryRegistry.set(name, factory as AgentFactory);
    return factory;
  };

  const scopedAgent = Object.assign(
    (<N extends string, V, T extends string = string, P extends PortsDefinition = PortsDefinition>(
      name: N,
      value: V,
      ports?: P,
      type?: T
    ) => {
      const agent = BaseAgent(name, value, ports, type);
      network.addAgent(agent);
      attachMethods(agent);
      return agent;
    }) as typeof BaseAgent,
    {
      factory: <V, N extends string, T extends string = string, P extends PortsDefinition = PortsDefinition>(
        name: N,
        portsOrOptions?: P | { ports?: P; type?: T }
      ) => {
        const options = normalizeFactoryOptions<P, T>(portsOrOptions);
        return ensureFactory<N, V, T, P>(name, options);
      }
    }
  );

  const withConnections = <
    Name extends string,
    Value,
    Type extends string = string,
    P extends PortsDefinition = PortsDefinition,
    Methods extends MethodDefinitions<IAgent<Name, Value, Type, P>> = MethodDefinitions<IAgent<Name, Value, Type, P>>
  >(
    factory: AgentFactory<Name, Value, Type, P>,
    methods: Methods,
    options?: WithConnectionsOptions
  ) => {
    if (!isTrackingEnabled()) {
      return factory as AgentFactoryWithMethods<Name, Value, Type, P, Methods>;
    }

    const agentName = factory.__agentName;
    const registered = methodRegistry.get(agentName) ?? new Map<string, RegisteredMethod>();

    for (const [methodName, method] of Object.entries(methods)) {
      if (registered.has(methodName)) {
        continue;
      }

      const opName = `${agentName}.${methodName}`;

      if (typeof method === 'object' && method !== null && 'other' in method) {
        const spec = method as PairMethodSpec<IAgent<Name, Value, Type, P>, IAgent>;
        const definition: RegisteredMethod = {
          name: methodName,
          opName,
          run: spec.run ?? DEFAULT_RUN_MODE,
          fn: (() => undefined) as ConnectionMethod,
          mode: 'pair',
          ports: spec.ports,
          autoDisconnectMain: options?.autoDisconnectMain
        };

        const builder = rules.when(factory as AgentFactory, spec.other as AgentFactory | IAgent);
        if (spec.ports?.left || spec.ports?.right) {
          builder.on((spec.ports?.left ?? 'main') as any, (spec.ports?.right ?? 'main') as any);
        }

        const normalized = normalizeHandlerWrapper(spec.fn as RuleHandler<IAgent, IAgent> | RuleHandlerWrapper<IAgent, IAgent>);
        const handler = normalized.guard ? when(normalized.guard, normalized.handler) : normalized.handler;

        if (normalized.kind === 'consume') {
          builder.consume(normalized.side ?? 'right', handler as unknown as RuleHandler);
        } else if (normalized.kind === 'spawn') {
          builder.spawn(handler as unknown as RuleHandler);
        } else if (normalized.kind === 'transform') {
          builder.transform(handler as unknown as RuleHandler);
        } else {
          builder.mutate(handler as unknown as RuleHandler);
        }

        registered.set(methodName, definition);
        continue;
      }

      const isWrapper = typeof method === 'object' && method !== null && 'kind' in method;
      const spec = isWrapper
        ? ({ fn: method as unknown as ConnectionMethod<IAgent<Name, Value, Type, P>>, run: DEFAULT_RUN_MODE } as MethodSpec<IAgent<Name, Value, Type, P>>)
        : normalizeMethodSpec(method as ConnectionMethod<IAgent<Name, Value, Type, P>> | MethodSpec<IAgent<Name, Value, Type, P>>);

      const definition: RegisteredMethod = {
        name: methodName,
        opName,
        run: spec.run ?? DEFAULT_RUN_MODE,
        fn: spec.fn as ConnectionMethod,
        mode: 'self',
        autoDisconnectMain: options?.autoDisconnectMain
      };

      const templateSubject = BaseAgent(agentName, null as any, factory.__ports, factory.__type);
      const templateOp = BaseAgent(opName as AgentName, null as any);

      definition.rule = ActionRule(templateSubject.ports.main, templateOp.ports.main, (subject, op) => {
        const args = (op.value as { args?: any[] })?.args ?? [];
        const wrapped = normalizeHandlerWrapper(spec.fn as RuleHandler<IAgent, IAgent> | RuleHandlerWrapper<IAgent, IAgent>);

        if (wrapped.guard && !wrapped.guard(subject, op, ...args)) {
          return [{ type: 'remove', entity: op }];
        }

        const result = wrapped.handler(subject, op, ...args);
        if (Array.isArray(result)) {
          return [...result, { type: 'remove', entity: op }];
        }

        const outcome = resolveOutcome(subject, op, wrapped as NormalizedHandler<IAgent, IAgent>, result);
        const commands = toRuleCommands(outcome);
        return [...commands, { type: 'remove', entity: op }];
      });

      network.addRule(definition.rule);
      registered.set(methodName, definition);
    }

    methodRegistry.set(agentName, registered);

    for (const agent of network.getAllAgents()) {
      if (agent.name === agentName) {
        attachMethods(agent);
      }
    }

    return factory as AgentFactoryWithMethods<Name, Value, Type, P, Methods>;
  };

  const connect = (source: IAgent | IBoundPort, destination: IAgent | IBoundPort, name?: string) => {
    if (!isTrackingEnabled()) {
      return undefined;
    }
    if (isBoundPort(source) && isBoundPort(destination)) {
      return network.connectPorts(source, destination, name);
    }
    if (!isBoundPort(source) && !isBoundPort(destination)) {
      return network.connectPorts(source.ports.main, destination.ports.main, name);
    }
    throw new Error('connect requires either two agents or two bound ports');
  };

  const fnAgent: ScopedNetwork['fnAgent'] = (
    subject,
    name,
    handler
  ) => {
    const factory = ensureFactory(name, {} as { ports?: PortsDefinition; type?: string });
    const builder = rules.when(subject as AgentFactory | IAgent, factory as AgentFactory | IAgent);
    const normalized = normalizeHandlerWrapper(handler as RuleHandler<IAgent, IAgent> | RuleHandlerWrapper<IAgent, IAgent>);
    const wrapped = normalized.guard ? when(normalized.guard, normalized.handler) : normalized.handler;

    if (normalized.kind === 'consume') {
      builder.consume(normalized.side ?? 'right', wrapped as unknown as RuleHandler);
    } else if (normalized.kind === 'spawn') {
      builder.spawn(wrapped as unknown as RuleHandler);
    } else if (normalized.kind === 'transform') {
      builder.transform(wrapped as unknown as RuleHandler);
    } else {
      builder.mutate(wrapped as unknown as RuleHandler);
    }

    return factory as AgentFactory<any, any>;
  };

  const scope: NetworkScope = Object.assign(
    (callback: () => void) => runInScope('defer', callback),
    {
      step: (callback: () => void) => runInScope('step', callback),
      reduce: (callback: () => void) => runInScope('reduce', callback),
      manual: <T>(callback: (net: ScopedNetwork) => T) => {
        let result: T;
        runInScope('manual', () => {
          result = callback(scopedNetwork);
        });
        return result!;
      }
    }
  );

  const batch: BatchScope = Object.assign(
    (callback: () => void) => runInScope('step', callback),
    {
      step: (callback: () => void) => runInScope('step', callback),
      reduce: (callback: () => void) => runInScope('reduce', callback),
      manual: <T>(callback: (net: ScopedNetwork) => T) => {
        let result: T;
        runInScope('manual', () => {
          result = callback(scopedNetwork);
        });
        return result!;
      }
    }
  );

  const untrack: UntrackScope = Object.assign(
    (callback: () => void) => runInScope('defer', callback, 'disabled'),
    {
      manual: <T>(callback: (net: ScopedNetwork) => T) => {
        let result: T;
        runInScope('manual', () => {
          result = callback(scopedNetwork);
        }, 'disabled');
        return result!;
      }
    }
  );

  const derived = <N extends string, V, T extends string = string, P extends PortsDefinition = PortsDefinition>(
    factory: AgentFactory<N, V, T, P>,
    compute: (agent: IAgent<N, V, T, P>) => any
  ) => {
    const derivedName = `Derived:${factory.__agentName}`;

    return (source: IAgent<N, V, T, P>) => {
      const agent = BaseAgent(derivedName, compute(source));
      network.addAgent(agent);
      derivedRegistry.add({ agent, source, compute: compute as (agent: IAgent) => any });
      return agent;
    };
  };

  const createStoryAgent = <N extends string>(
    factory: AgentFactory<N, any, string, PortsDefinition>,
    id: string
  ): StoryAgent<N> => {
    const agent: StoryAgent<N> = {
      __storyId: id,
      __agentName: factory.__agentName
    } as StoryAgent<N>;

    const methods = methodRegistry.get(factory.__agentName);
    if (methods) {
      for (const methodName of methods.keys()) {
        agent[methodName] = function* (...args: any[]) {
          const step: StorylineStep = {
            type: 'method',
            targetId: id,
            method: methodName,
            args: args.map(serializeStoryArg)
          };
          yield step;
          return agent;
        };
      }
    }

    return agent;
  };

  const storylineDeserialize = (serialized: string, options?: StorylineSerializeOptions) => {
    const format = options?.format ?? 'seroval';
    const payload = format === 'json'
      ? JSON.parse(serialized)
      : deserializeValue(serialized, options?.serialization);

    return createStorylineFromPayload(payload as StorylinePayload);
  };

  const createStorylineFromPayload = (payload: StorylinePayload) => {
    const story: StorylineDefinition = {
      steps: payload.steps,
      subjectName: payload.subjectName,
      subjectId: payload.subjectId,
      apply: (subject: IAgent) => applyStory(payload.subjectId, story.steps, subject),
      replay: (subject: IAgent) => applyStory(payload.subjectId, story.steps, subject),
      stepper: (subject: IAgent) => createStepper(payload.subjectId, story.steps, subject),
      serialize: (options?: StorylineSerializeOptions) => {
        const format = options?.format ?? 'seroval';
        const data: StorylinePayload = { subjectName: payload.subjectName, subjectId: payload.subjectId, steps: payload.steps };
        if (format === 'json') {
          return JSON.stringify(data);
        }
        return serializeValue(data, options?.serialization);
      }
    } as StorylineDefinition;

    return Object.assign(story, { deserialize: storylineDeserialize });
  };

  const storyline = (
    factory: AgentFactory,
    generator: (subject: StoryAgent, ctx: StorylineContext) => Generator<StorylineStep, any, any>
  ) => {
    const steps: StorylineStep[] = [];
    const subjectId = nextStoryId();

    const ctx: StorylineContext = {
      spawn: function* (spawnFactory, value, ports) {
        const id = nextStoryId();
        const step: StorylineStep = {
          type: 'spawn',
          id,
          factoryName: spawnFactory.__agentName,
          value,
          ports
        };
        yield step;
        const agent = createStoryAgent(spawnFactory as AgentFactory<string, any, string, PortsDefinition>, id);
        return agent;
      }
    };

    const subject = createStoryAgent(factory as AgentFactory<string, any, string, PortsDefinition>, subjectId);
    const iterator = generator(subject, ctx);

    let result = iterator.next();
    while (!result.done) {
      if (result.value) {
        steps.push(result.value as StorylineStep);
      }
      result = iterator.next();
    }

    return createStorylineFromPayload({ subjectName: factory.__agentName, subjectId, steps }) as StorylineDefinition & {
      deserialize: typeof storylineDeserialize;
    };
  };

  const applyStory = (subjectId: string, steps: StorylineStep[], subject: IAgent) => {
    const agentMap = new Map<string, IAgent>();
    agentMap.set(subjectId, subject);

    for (const step of steps) {
      if (step.type === 'spawn') {
        const factory = factoryRegistry.get(step.factoryName);
        if (!factory) {
          throw new Error(`Unknown factory ${step.factoryName} in storyline`);
        }
        const agent = factory(step.value, step.ports as any);
        agentMap.set(step.id, agent);
        continue;
      }

      if (step.type === 'method') {
        const target = agentMap.get(step.targetId);
        if (!target) {
          throw new Error(`Storyline target ${step.targetId} not found`);
        }
        const method = (target as any)[step.method];
        if (typeof method !== 'function') {
          throw new Error(`Method ${step.method} is not defined on agent ${target.name}`);
        }
        const args = step.args.map((arg) => resolveStoryArg(arg, agentMap));
        method(...args);
      }
    }

    return subject;
  };

  const createStepper = (subjectId: string, steps: StorylineStep[], subject: IAgent): StorylineStepper => {
    const baseValue = serializeValue(subject.value);
    let index = 0;

    const reset = () => {
      subject.value = deserializeValue(baseValue);
    };

    const stepper: StorylineStepper = {
      next: () => {
        if (index < steps.length) {
          applyStory(subjectId, [steps[index]], subject);
          index += 1;
        }
        stepper.index = index;
        return subject;
      },
      back: () => {
        if (index > 0) {
          index -= 1;
          reset();
          applyStory(subjectId, steps.slice(0, index), subject);
        }
        stepper.index = index;
        return subject;
      },
      current: subject,
      index
    };

    return stepper;
  };

  const sync = (
    agent: IAgent,
    transport: {
      send: (payload: SyncPayload) => void;
      onMessage: (handler: (payload: SyncPayload) => void) => void;
    },
    options?: SyncOptions
  ) => {
    const sourceId = options?.sourceId ?? `source-${agent._agentId}`;
    const intervalMs = options?.intervalMs ?? 1000;

    const syncAgent = SyncAgent(network.id, sourceId);
    network.addAgent(syncAgent);
    registerSyncRules(network);

    const sendOperations = () => {
      const operations = collectSyncOperations(network, sourceId, syncAgent.value.lastSyncTimestamp);
      if (operations.length > 0) {
        transport.send({ operations, sourceId });
        syncAgent.value.lastSyncTimestamp = Date.now();
      }
    };

    const handler = (payload: SyncPayload) => {
      if (payload.sourceId === sourceId) return;
      applyRemoteOperations(network, payload.operations);
    };

    transport.onMessage(handler);
    const timer = (globalThis as any).setInterval
      ? (globalThis as any).setInterval(sendOperations, intervalMs)
      : 0;

    return {
      stop: () => {
        if ((globalThis as any).clearInterval) {
          (globalThis as any).clearInterval(timer);
        }
      }
    };
  };

  const scopedNetwork: ScopedNetwork = {
    network,
    Agent: Object.assign(scopedAgent, { factoryFrom: createAgentFactoryFrom }) as ScopedNetwork['Agent'],
    Port,
    Rule: Rule as RuleFactory,
    Connection,
    rules,
    withConnections,
    fnAgent,
    connect,
    scope,
    batch,
    untrack,
    derived,
    storyline,
    sync,
    step: scopedStep,
    reduce: scopedReduce
  };

  return scopedNetwork;
}
