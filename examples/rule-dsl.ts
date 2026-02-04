import { createNetwork, consume } from 'annette';

const { Agent, rules, connect, step } = createNetwork('rule-dsl');

const Counter = Agent.factory<'Counter', number>('Counter');
const Incrementer = Agent.factory<'Incrementer', number>('Incrementer');

rules.when(Counter, Incrementer)
  .consume((counter, incrementer) => {
    counter.value += incrementer.value;
  });

const counter = Counter(1);
const incrementer = Incrementer(2);

connect(counter, incrementer);
step();

console.log('Counter value:', counter.value);
