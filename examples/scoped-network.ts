import { createNetwork } from 'annette';

const { Agent, withConnections, derived, scope, storyline, batch, untrack, network } = createNetwork('scoped-example');

const Counter = withConnections(Agent.factory<'Counter', number>('Counter'), {
  add: (counter) => {
    counter.value += 1;
  },
  reset: {
    run: 'reduce',
    fn: (counter) => {
      counter.value = 0;
    }
  }
}, { autoDisconnectMain: true });

scope.reduce(() => {
  const counter = Counter(0);
  counter.add();
  counter.add();
  console.log('Scoped value:', counter.value);
});

const batched = Counter(0);
batch(() => {
  batched.add();
  batched.add();
  console.log('Batch inside:', batched.value);
});
console.log('Batch after:', batched.value);

const beforeUntrack = network.getAllAgents().length;
const untrackedCount = untrack.manual((net) => {
  const temp = Counter(5);
  console.log('Untracked agent:', temp._agentId);
  return net.network.getAllAgents().length;
});
console.log('Agent count:', beforeUntrack, untrackedCount, network.getAllAgents().length);

const Doubled = derived(Counter, (counter) => counter.value * 2);
const counter = Counter(1);
const doubled = Doubled(counter);

counter.add();
console.log('Derived value:', doubled.value);

const story = storyline(Counter, function* (subject) {
  yield* subject.add();
  yield* subject.add();
  return subject;
});

const replay = Counter(0);
story.apply(replay);
console.log('Storyline replay:', replay.value);
