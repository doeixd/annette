import { describe, it, expect } from "vitest";
import { zero } from "../src";

describe("zero module", () => {
  it("connects ports with direct dispatch", () => {
    const zeroNetwork = zero.createNetwork();

    const Counter = zeroNetwork.Agent("Counter", (initial: number) => {
      let value = initial;
      const main = zeroNetwork.createPort<number>((delta) => {
        value += delta;
      });
      const read = () => value;
      return { main, read };
    });

    const Trigger = zeroNetwork.Agent("Trigger", (amount: number) => {
      const main = zeroNetwork.createPort<number>(() => {
        // ack
      });
      const fire = () => main(amount);
      return { main, fire };
    });

    zeroNetwork.run(() => {
      const counter = Counter(1);
      const trigger = Trigger(4);

      zeroNetwork.connect(counter.main, trigger.main);
      trigger.fire();

      expect(counter.read()).toBe(5);
    });
  });

  it("tracks hierarchy and cleanups", () => {
    let cleaned = false;
    const zeroNetwork = zero.createNetwork();

    const Logger = zeroNetwork.Agent("Logger", (_state: void) => {
      const log = zeroNetwork.createPort<string>(() => {
        // noop
      });
      zeroNetwork.onCleanup(() => {
        cleaned = true;
      });
      return { log };
    });

    const Counter = zeroNetwork.Agent("Counter", (_state: void) => {
      const main = zeroNetwork.createPort<number>(() => {
        // noop
      });
      const logger = Logger(undefined);
      return { main, logger };
    });

    zeroNetwork.run((dispose) => {
      const counter = Counter(undefined);
      expect(counter.__agent?.children.size).toBe(1);
      expect(counter.__agent?.ports.size).toBe(1);
      dispose();
    });

    expect(cleaned).toBe(true);
  });

  it("records and replays interactions", () => {
    const zeroNetwork = zero.createNetwork();
    const recorder = zero.middleware.createRecorder();

    const Counter = zeroNetwork.Agent("Counter", (_state: void) => {
      let value = 0;
      const main = zeroNetwork.createPort<number>((delta) => {
        value += delta;
      });
      const read = () => value;
      return { main, read };
    });

    zeroNetwork.run(() => {
      const counter = Counter(undefined);
      const sender = zeroNetwork.createPort<number>(() => {
        // noop
      });

      recorder.connect(counter.main, sender);
      sender(3);

      expect(counter.read()).toBe(3);

      const portLookup = new Map<string, typeof sender>([
        [counter.main._id, counter.main],
        [sender._id, sender]
      ]);

      recorder.replay((id) => portLookup.get(id));
      expect(counter.read()).toBe(6);
    });
  });

  it("serializes tracked ports", () => {
    const serializer = zero.middleware.createSerializer();
    const zeroNetwork = zero.createNetwork();

    zeroNetwork.run(() => {
      const Store = zeroNetwork.Agent("Store", (initial: number) => {
        let value = initial;
        const input = zeroNetwork.createPort<number>((next) => {
          value = next;
        }) as zero.middleware.ZeroSerializablePort;

        input.__serialize = () => ({ id: "store", value });

        serializer.trackPort(input);

        return { input };
      });

      const store = Store(1);
      const sender = zeroNetwork.createPort<number>(() => {
        // noop
      });

      zeroNetwork.connect(sender, store.input);
      sender(5);

      expect(serializer.snapshot()).toEqual({ store: 5 });
    });
  });

  it("emits debug events", () => {
    const zeroNetwork = zero.createNetwork();
    const events: Array<{ from: string; to: string; data: number }> = [];

    zeroNetwork.run(() => {
      const a = zeroNetwork.createPort<number>(() => {
        // noop
      });
      const b = zeroNetwork.createPort<number>(() => {
        // noop
      });

      zero.middleware.connectDebug(a, b, (event) => {
        events.push({ from: event.from, to: event.to, data: event.data as number });
      });

      a(2);
    });

    expect(events).toHaveLength(1);
  });

  it("supports fanout and routers", () => {
    const zeroNetwork = zero.createNetwork();

    zeroNetwork.run(() => {
      const fanout = zero.createFanout<number>(zeroNetwork);
      const router = zero.createRouter<number>(zeroNetwork);

      let a = 0;
      let b = 0;

      const portA = zeroNetwork.createPort<number>((value) => {
        a += value;
      });
      const portB = zeroNetwork.createPort<number>((value) => {
        b += value;
      });

      fanout.add(portA);
      fanout.add(portB);
      fanout.input(2);

      expect(a).toBe(2);
      expect(b).toBe(2);

      router.setTarget(portA);
      router.input(3);

      expect(a).toBe(5);
    });
  });

  it("pipes linear agents", () => {
    const zeroNetwork = zero.createNetwork();

    zeroNetwork.run(() => {
      const Source = zeroNetwork.Agent("Source", (value: number) => {
        const output = zeroNetwork.createPort<number>(() => {
          // noop
        });
        const input = zeroNetwork.createPort<number>((next) => {
          output(next);
        });
        const emit = () => input(value);
        return { input, output, emit };
      });

      const Double = zeroNetwork.Agent("Double", (_state: void) => {
        const output = zeroNetwork.createPort<number>(() => {
          // noop
        });
        const input = zeroNetwork.createPort<number>((value) => {
          output(value * 2);
        });
        return { input, output };
      });

      const Sink = zeroNetwork.Agent("Sink", (_state: void) => {
        let last = 0;
        const output = zeroNetwork.createPort<number>(() => {
          // noop
        });
        const input = zeroNetwork.createPort<number>((value) => {
          last = value;
          output(value);
        });
        const read = () => last;
        return { input, output, read };
      });

      const source = Source(3);
      const double = Double(undefined);
      const sink = Sink(undefined);

      zeroNetwork.pipe(source, double, sink);
      source.emit();

      expect(sink.read()).toBe(6);
    });
  });

  it("provides and resolves context values", () => {
    const zeroNetwork = zero.createNetwork();
    const DbContext = zeroNetwork.createContext<zero.ZeroPort<string>>();

    zeroNetwork.run(() => {
      let received: string | null = null;
      const dbQuery = zeroNetwork.createPort<string>((query) => {
        received = query;
      });

      const UserList = zeroNetwork.Agent("UserList", (_state: void) => {
        const query = zeroNetwork.useContext(DbContext);
        const refresh = () => query("SELECT * FROM users");
        return { refresh };
      });

      zeroNetwork.provide(DbContext, dbQuery, () => {
        const list = UserList(undefined);
        list.refresh();
      });

      expect(received).toBe("SELECT * FROM users");
    });
  });

  it("connects many targets", () => {
    const zeroNetwork = zero.createNetwork();

    zeroNetwork.run(() => {
      const source = zeroNetwork.createPort<number>(() => {
        // noop
      });
      let total = 0;

      const one = zeroNetwork.createPort<number>((value) => {
        total += value;
      });
      const two = zeroNetwork.createPort<number>((value) => {
        total += value;
      });

      zero.connectMany(zeroNetwork, source, [one, two]);

      source(4);

      expect(total).toBe(8);
    });
  });
});
