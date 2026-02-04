import { createNetwork } from 'annette';

const { Agent, withConnections, derived, scope, storyline } = createNetwork('scoped-example');

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
