import { zero } from "../src";

const zeroNetwork = zero.createNetwork();
const recorder = zero.middleware.createRecorder();

const Counter = zeroNetwork.Agent("Counter", (initial: number) => {
  let value = initial;
  const main = zeroNetwork.createPort<number>((delta) => {
    value += delta;
  });
  const read = () => value;
  return { main, read };
});

zeroNetwork.run(() => {
  const counter = Counter(0);
  const sender = zeroNetwork.createPort<number>(() => {
    // noop
  });

  recorder.connect(counter.main, sender);
  sender(2);

  console.log("Counter:", counter.read());
});
