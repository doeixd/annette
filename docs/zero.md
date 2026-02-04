# Annette Zero: Zero-Cost Topology

**Annette** is a TypeScript library for building **Interaction Nets** that run at the speed of plain JavaScript function calls. Interaction Nets are graphs of small, isolated agents that communicate only through explicit connections.

It builds systems where components (**Agents**) are isolated closures, connected by direct function pointers (**Ports**). Unlike Event Emitters or Observables, Annette treats **topology**—the shape of the graph—as a first-class primitive. That enables self-optimizing networks, capability-based security, and JIT-friendly call paths.

- **Zero dispatch overhead at interaction time:** no scheduler, no event loop, no “active set” arrays.
- **Native speed:** ~100M ops/sec in a tight local benchmark—interactions are just function calls.
- **Bidirectional:** ports are symmetric; wiring A ↔ B connects both directions automatically.
- **Dynamic topology:** pass “wires” through other wires to rewire the app at runtime.

## Installation

```bash
npm install annette
```

## The mental model

Forget “listeners” and “broadcasting.” Think **hardware**:

1. **Agents** are chips: closures with private state.
2. **Ports** are pins: function references used to send/receive signals.
3. **Connections** are soldered wires: direct pointer assignments.

## Quick start

Let’s build a system where a `Trigger` increments a `Counter`.

```ts
import { zero } from "annette";

const zeroNetwork = zero.createNetwork();

// 1) Define the Counter (the chip)
const Counter = zeroNetwork.Agent("Counter", (initial: number) => {
  let count = initial;

  const input = zeroNetwork.createPort<number>((delta) => {
    count += delta;
    console.log(`[Counter] Value: ${count}`);
  });

  return { input };
});

// 2) Define the Trigger (the remote)
const Trigger = zeroNetwork.Agent("Trigger", (amount: number) => {
  const output = zeroNetwork.createPort<number>();

  const fire = () => {
    console.log(`[Trigger] Firing ${amount}...`);
    output(amount); // No-op until wired.
  };

  return { output, fire };
});

// 3) Instantiate and wire
zeroNetwork.run(() => {
  const myCounter = Counter(0);
  const myTrigger = Trigger(5);

  zeroNetwork.connect(myTrigger.output, myCounter.input);

  myTrigger.fire();
});
```

## How it works (the “zero-cost” trick)

In most libraries, “emit an event” usually means:

1. Look up an event name in a `Map`.
2. Iterate a list of listeners.
3. Invoke callbacks (often guarded by extra machinery).

In **Annette Zero**, `connect(A, B)` does a **pointer swap**: it rewires `A` so its internal function reference points directly at `B`’s handler (and vice versa).

So when you run `myTrigger.output(5)`, the VM effectively executes:

```ts
myTrigger.fire()
  -> calls myTrigger.output(5)
    -> calls myCounter.input(5)
```

There’s no scheduler and no dispatch layer involved at interaction time. **The topology is the call stack.**

## Key features

### 1) Symmetric interaction (bidirectionality)

Most event systems are one-way. In Annette, a connection is a two-way street: every handler can access its `source`, the port that initiated this interaction.

```ts
const Ping = zeroNetwork.Agent("Ping", () => {
  const port = zeroNetwork.createPort<string>((msg, source) => {
    console.log("Received:", msg);
    source?.("Pong!");
  });

  return { port };
});
```

### 2) First-class topology (passing wires)

You can send a `Port` as data, so one agent can introduce two strangers and let them talk directly. This lets you rewire the graph at runtime without a middleman.

```ts
const Switchboard = zeroNetwork.Agent("Switch", () => {
  const mainLine = zeroNetwork.createPort<string>();

  const plugIn = zeroNetwork.createPort<zero.ZeroPort<string>>((newTarget) => {
    zeroNetwork.connect(mainLine, newTarget);
  });

  return { mainLine, plugIn };
});

const Speaker = zeroNetwork.Agent("Speaker", (label: string) => {
  const input = zeroNetwork.createPort<string>((msg) => {
    console.log(`${label}: ${msg}`);
  });
  return { input };
});

zeroNetwork.run(() => {
  const board = Switchboard(undefined);
  const a = Speaker("A");
  const b = Speaker("B");

  board.plugIn(a.input);
  board.mainLine("Hello A");

  board.plugIn(b.input);
  board.mainLine("Hello B");
});
```

### 3) Middleware & capabilities

Because connections are just function assignments, they’re easy to wrap. Annette can add debugging, syncing, time travel, etc., without changing your core logic path. Middleware adds overhead only on the wrapped connections; the default path stays a direct call.

```ts
const recorder = zero.middleware.createRecorder();

recorder.connect(ui.button, logic.increment);
```

### 4) Fanout and routers

For 1-to-many dispatch, use the helpers instead of connecting multiple peers manually.

```ts
const fanout = zero.createFanout<string>(zeroNetwork);

const a = zeroNetwork.createPort<string>((msg) => console.log("A", msg));
const b = zeroNetwork.createPort<string>((msg) => console.log("B", msg));

fanout.add(a);
fanout.add(b);

fanout.input("hello");
```

For fast rewiring, use a router.

```ts
const router = zero.createRouter<string>(zeroNetwork);
const target = zeroNetwork.createPort<string>((msg) => console.log("Target", msg));

router.setTarget(target);
router.input("ping");
```

## Comparison: Annette Zero vs. event emitters

| Concept | Event Emitter (radio) | Annette Zero (telephone) |
| --- | --- | --- |
| **Connection** | Broadcast | Direct line |
| **Addressing** | Strings | Object references |
| **Reply** | Another channel | Built-in |
| **Performance** | Dispatch overhead | Native function calls |
| **State** | Shared or external | Private closures |
| **Best for** | UI pipelines | Topology-driven systems |

## API reference

### `zero.createNetwork()`

Creates a scoped zero-cost network with lifecycle tracking.

### `Agent(name, factory)`

Creates an agent factory. `factory` initializes closure state and returns ports.

### `createPort<T>(handler?)`

Creates a communication pin. Calling the port sends data to its peer.

### `connect(portA, portB)`

Wires two ports together. Connections are symmetric.

### `run(callback)`

Runs setup in a scoped lifecycle. Agents created inside are tracked for cleanup.

## License

MIT
