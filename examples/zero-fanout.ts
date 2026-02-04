import { zero } from "../src";

const zeroNetwork = zero.createNetwork();

zeroNetwork.run(() => {
  const fanout = zero.createFanout<string>(zeroNetwork);

  const a = zeroNetwork.createPort<string>((msg) => {
    console.log("A:", msg);
  });

  const b = zeroNetwork.createPort<string>((msg) => {
    console.log("B:", msg);
  });

  fanout.add(a);
  fanout.add(b);

  fanout.input("hello");
});
