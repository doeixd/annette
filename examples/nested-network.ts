import { createNetwork, asNestedNetwork } from 'annette';

const child = createNetwork('child');
const { Agent: ChildAgent, withConnections: childConnections } = child;

const Counter = childConnections(ChildAgent.factory<'Counter', number>('Counter'), {
  add: (counter) => {
    counter.value += 1;
  }
});

const parent = createNetwork('parent');
const { Agent, withConnections, scope } = parent;

type ChildNetwork = typeof child;
const nested = asNestedNetwork(child);

const Host = withConnections(Agent.factory<'Host', ChildNetwork>('Host'), {
  stepInner: (host) => {
    nested.step();
  },
  reduceInner: (host) => {
    nested.reduce();
  }
}, { autoDisconnectMain: true });

scope.reduce(() => {
  const host = Host(child);
  const counter = Counter(0);

  counter.add();
  host.stepInner();

  counter.add();
  host.reduceInner();

  console.log('Nested counter:', counter.value);
});
