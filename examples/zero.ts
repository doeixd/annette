import { zero } from "../src";

const zeroNetwork = zero.createNetwork();

const Counter = zeroNetwork.Agent("Counter", (initial: number) => {
  let value = initial;

  const main = zeroNetwork.createPort<number>((delta) => {
    value += delta;
  });

  const read = () => value;

  return { main, read };
});

const Incrementer = zeroNetwork.Agent("Incrementer", (amount: number) => {
  const main = zeroNetwork.createPort<number>(() => {
    // no-op, just acknowledges
  });

  const trigger = () => {
    main(amount);
  };

  return { main, trigger };
});

zeroNetwork.run(() => {
  const counter = Counter(0);
  const incrementer = Incrementer(5);

  zeroNetwork.connect(counter.main, incrementer.main);

  incrementer.trigger();
  console.log("Counter value:", counter.read());
});
