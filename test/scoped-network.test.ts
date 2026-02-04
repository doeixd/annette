import { describe, it, expect } from 'vitest';
import { createNetwork, ActionRule, Rule, Connection, Port, consume, pair, asNestedNetwork } from '../src';

describe('Scoped Network API', () => {
  it('creates agent factories with ports', () => {
    const { Agent, network, Port } = createNetwork('scoped-factory');
    const Counter = Agent.factory<'Counter', number>('Counter', {
      ports: {
        main: Port.main(),
        extra: Port.aux('extra')
      }
    });

    const counter = Counter(0);

    expect(counter.name).toBe('Counter');
    expect(counter.ports.main.type).toBe('main');
    expect(counter.ports.extra.type).toBe('aux');
    expect(network.getAllAgents()).toHaveLength(1);
  });

  it('runs withConnections methods by default step', () => {
    const { Agent, withConnections } = createNetwork('scoped-methods');
    const Counter = withConnections(Agent.factory<'Counter', number>('Counter'), {
      add: (counter) => {
        counter.value += 1;
      }
    }, { autoDisconnectMain: true });

    const counter = Counter(0);
    counter.add();
    counter.add();

    expect(counter.value).toBe(2);
  });

  it('supports scope.step and scope.reduce', () => {
    const { Agent, withConnections, scope } = createNetwork('scoped-scope');
    const Counter = withConnections(Agent.factory<'Counter', number>('Counter'), {
      add: (counter) => {
        counter.value += 1;
      }
    }, { autoDisconnectMain: true });

    const counter = Counter(0);

    scope.step(() => {
      counter.add();
    });

    expect(counter.value).toBe(1);

    scope.reduce(() => {
      counter.add();
      counter.add();
      counter.add();
    });

    expect(counter.value).toBe(2);
  });

  it('updates derived agents after every step', () => {
    const { Agent, withConnections, derived } = createNetwork('scoped-derived');
    const Counter = withConnections(Agent.factory<'Counter', number>('Counter'), {
      add: (counter) => {
        counter.value += 1;
      }
    }, { autoDisconnectMain: true });

    const counter = Counter(1);
    const Doubled = derived(Counter, (c) => c.value * 2);
    const doubled = Doubled(counter);

    expect(doubled.value).toBe(2);

    counter.add();
    expect(doubled.value).toBe(4);
  });

  it('serializes and replays storylines', () => {
    const { Agent, withConnections, storyline } = createNetwork('scoped-storyline');
    const Counter = withConnections(Agent.factory<'Counter', number>('Counter'), {
      add: (counter) => {
        counter.value += 1;
      }
    }, { autoDisconnectMain: true });

    const story = storyline(Counter, function* (counter) {
      yield* counter.add();
      yield* counter.add();
      return counter;
    });

    const counter = Counter(0);
    story.apply(counter);
    expect(counter.value).toBe(2);

    const json = story.serialize({ format: 'json' });
    const loaded = story.deserialize(json, { format: 'json' });
    const counter2 = Counter(1);
    loaded.apply(counter2);
    expect(counter2.value).toBe(3);

    const seroval = story.serialize();
    const loadedSeroval = story.deserialize(seroval);
    const counter3 = Counter(2);
    loadedSeroval.apply(counter3);
    expect(counter3.value).toBe(4);
  });

  it('exposes Port, Rule, and Connection factories', () => {
    const mainPort = Port.main();
    const auxPort = Port.aux('extra');

    expect(mainPort.type).toBe('main');
    expect(auxPort.name).toBe('extra');
    expect(Port.factory).toBe(Port);
    expect(Rule.action).toBe(ActionRule);
    expect(Connection.factory).toBe(Connection);
  });

  it('registers pair rules with rules.when', () => {
    const { Agent, rules, connect, step, network } = createNetwork('rules-when');
    const Counter = Agent.factory<'Counter', number>('Counter');
    const Incrementer = Agent.factory<'Incrementer', number>('Incrementer');

    rules.when(Counter, Incrementer).consume((counter, incrementer) => {
      counter.value += incrementer.value;
    });

    const counter = Counter(1);
    const incrementer = Incrementer(2);

    connect(counter, incrementer);
    step();

    expect(counter.value).toBe(3);
    expect(network.getAllAgents().length).toBe(1);
  });

  it('creates function agents bound to rules', () => {
    const { Agent, fnAgent, connect, step } = createNetwork('fn-agent');
    const Counter = Agent.factory<'Counter', number>('Counter');

    const Incrementer = fnAgent(Counter, 'Incrementer', consume((counter, incrementer) => {
      counter.value += incrementer.value;
    }));

    const counter = Counter(1);
    const incrementer = Incrementer(4);

    connect(counter, incrementer);
    step();

    expect(counter.value).toBe(5);
  });

  it('creates factories from agent instances', () => {
    const { Agent } = createNetwork('factory-from');
    const base = Agent<'Base', { count: number }>('Base', { count: 1 }, {
      main: Port.main(),
      extra: Port.aux('extra')
    });

    const BaseFactory = Agent.factoryFrom(base);
    const clone = BaseFactory({ count: 2 });

    expect(clone.name).toBe('Base');
    expect(clone.ports.main.type).toBe('main');
    expect(clone.ports.extra.type).toBe('aux');
    expect(clone.value.count).toBe(2);
  });

  it('creates factories from ports, rules, and connections', () => {
    const { Agent, network } = createNetwork('factory-from-base');
    const port = Port.aux('signal');
    const portFactory = Port.factoryFrom(port);
    const clonedPort = portFactory();

    expect(clonedPort.name).toBe('signal');
    expect(clonedPort.type).toBe('aux');

    const a = Agent<'A', number>('A', 1);
    const b = Agent<'B', number>('B', 2);
    network.addAgent(a);
    network.addAgent(b);

    const conn = Connection(a.ports.main, b.ports.main, 'a-to-b');
    const connFactory = Connection.factoryFrom(conn);
    const newConn = connFactory(a, b);

    expect(newConn.name).toBe('a-to-b');

    const rule = ActionRule(a.ports.main, b.ports.main, () => []);
    const clonedRule = Rule.factoryFrom(rule);

    expect(clonedRule.type).toBe('action');
    expect(clonedRule.matchInfo.agentName1).toBe('A');
  });

  it('supports pair helpers in withConnections', () => {
    const { Agent, withConnections, rules, connect, step } = createNetwork('pair-helper');
    const Counter = Agent.factory<'Counter', number>('Counter');
    const Incrementer = Agent.factory<'Incrementer', number>('Incrementer');

    const CounterWithPairs = withConnections(Counter, {
      applyIncrement: pair(Incrementer, (counter, incrementer) => {
        counter.value += incrementer.value;
      })
    }, { autoDisconnectMain: true });

    expect(rules.list().length).toBe(1);

    const counter = CounterWithPairs(1);
    const incrementer = Incrementer(3);

    connect(counter, incrementer);
    step();

    expect(counter.value).toBe(4);
  });

  it('supports pair helpers with explicit ports', () => {
    const { Agent, withConnections, network, step } = createNetwork('pair-ports');

    const Source = Agent.factory<'Source', number>('Source', {
      ports: {
        out: Port.aux('out')
      }
    });

    const Sink = Agent.factory<'Sink', number>('Sink', {
      ports: {
        input: Port.aux('input')
      }
    });

    const SourceWithPairs = withConnections(Source, {
      apply: pair(Sink, (source, sink) => {
        sink.value += source.value;
      }, { ports: { left: 'out', right: 'input' } })
    }, { autoDisconnectMain: true });

    const source = SourceWithPairs(2);
    const sink = Sink(1);

    network.connectPorts(source.ports.out, sink.ports.input);
    step();

    expect(sink.value).toBe(3);
  });

  it('respects rule guards', () => {
    const { Agent, rules, connect, step, network } = createNetwork('rule-guard');
    const A = Agent.factory<'A', number>('A');
    const B = Agent.factory<'B', number>('B');

    rules.when(A, B)
      .where((a) => a.value > 10)
      .consume((a, b) => {
        b.value += a.value;
      });

    const a = A(1);
    const b = B(2);

    connect(a, b);
    step();

    expect(b.value).toBe(2);
    expect(network.getAllAgents().length).toBe(2);
  });

  it('exposes rule metadata and mermaid output', () => {
    const { Agent, rules } = createNetwork('rule-meta');
    const A = Agent.factory<'A', number>('A');
    const B = Agent.factory<'B', number>('B');

    rules.when(A, B).mutate((a, b) => {
      a.value += b.value;
    });

    const list = rules.list();
    const mermaid = rules.toMermaid();

    expect(list.length).toBe(1);
    expect(list[0].left).toBe('A');
    expect(mermaid).toContain('A -->|mutate| B');
  });

  it('supports nested networks as agent values', () => {
    const child = createNetwork('child-test');
    const { Agent: ChildAgent, withConnections: childConnections } = child;

    const Counter = childConnections(ChildAgent.factory<'Counter', number>('Counter'), {
      add: (counter) => {
        counter.value += 1;
      }
    });

    const parent = createNetwork('parent-test');
    const { Agent, withConnections } = parent;

    type ChildNetwork = typeof child;

    const Host = withConnections(Agent.factory<'Host', ChildNetwork>('Host'), {
      stepInner: (host) => {
        host.value.step();
      },
      reduceInner: (host) => {
        host.value.reduce();
      }
    }, { autoDisconnectMain: true });

    const host = Host(child);
    const counter = Counter(0);

    counter.add();
    host.stepInner();

    counter.add();
    host.reduceInner();

    expect(counter.value).toBe(2);
  });

  it('supports consume on the left side', () => {
    const { Agent, rules, connect, step, network } = createNetwork('consume-left');
    const Left = Agent.factory<'Left', number>('Left');
    const Right = Agent.factory<'Right', number>('Right');

    rules.when(Left, Right).consume('left', (left, right) => {
      right.value += left.value;
    });

    const left = Left(2);
    const right = Right(3);

    connect(left, right);
    step();

    expect(right.value).toBe(5);
    expect(network.getAllAgents().length).toBe(1);
  });

  it('exposes rule metadata via canInteract and for', () => {
    const { Agent, rules } = createNetwork('rule-meta-access');
    const A = Agent.factory<'A', number>('A');
    const B = Agent.factory<'B', number>('B');
    const C = Agent.factory<'C', number>('C');

    rules.when(A, B).mutate((a, b) => {
      a.value += b.value;
    });

    expect(rules.canInteract(A, B)).toBe(true);
    expect(rules.canInteract(A, C)).toBe(false);

    const metadata = rules.for(A, B);
    expect(metadata?.left).toBe('A');
    expect(metadata?.right).toBe('B');
  });

  it('registers symmetric rules', () => {
    const { Agent, rules } = createNetwork('rule-symmetric');
    const A = Agent.factory<'A', number>('A');
    const B = Agent.factory<'B', number>('B');

    rules.when(A, B)
      .symmetric()
      .mutate((a, b) => {
        a.value += b.value;
      });

    const list = rules.list();
    const baseList = rules.list({ includeSymmetric: false });
    expect(list.length).toBe(2);
    expect(baseList.length).toBe(1);
    expect(rules.canInteract(B, A)).toBe(true);
  });

  it('allows single operations without autoDisconnectMain', () => {
    const { Agent, withConnections } = createNetwork('auto-disconnect');
    const Counter = withConnections(Agent.factory<'Counter', number>('Counter'), {
      add: (counter) => {
        counter.value += 1;
      }
    });

    const counter = Counter(0);
    counter.add();

    expect(counter.value).toBe(1);
  });

  it('rejects non-agent arguments for pair methods', () => {
    const { Agent, withConnections } = createNetwork('pair-arg-guard');
    const Counter = Agent.factory<'Counter', number>('Counter');
    const Incrementer = Agent.factory<'Incrementer', number>('Incrementer');

    const CounterWithPairs = withConnections(Counter, {
      applyIncrement: pair(Incrementer, (counter, incrementer) => {
        counter.value += incrementer.value;
      })
    }, { autoDisconnectMain: true });

    const counter = CounterWithPairs(1);
    expect(() => {
      (counter as any).applyIncrement('bad');
    }).toThrow('expects an agent');
  });

  it('supports consume on both sides', () => {
    const { Agent, rules, connect, step, network } = createNetwork('consume-both');
    const A = Agent.factory<'A', number>('A');
    const B = Agent.factory<'B', number>('B');

    rules.when(A, B).consume('both', (a, b) => {
      a.value += b.value;
    });

    const a = A(1);
    const b = B(2);

    connect(a, b);
    step();

    expect(network.getAllAgents().length).toBe(0);
  });

  it('wraps nested networks with asNestedNetwork', () => {
    const { Agent, withConnections } = createNetwork('nested-helper');
    const child = createNetwork('nested-child');

    const Counter = child.withConnections(child.Agent.factory<'Counter', number>('Counter'), {
      add: (counter) => {
        counter.value += 1;
      }
    }, { autoDisconnectMain: true });

    const nested = asNestedNetwork(child);
    const Host = withConnections(Agent.factory<'Host', typeof child>('Host'), {
      stepInner: () => {
        nested.step();
      }
    }, { autoDisconnectMain: true });

    const host = Host(child);
    const counter = Counter(0);

    counter.add();
    host.stepInner();

    expect(counter.value).toBe(1);
  });
});
