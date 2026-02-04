# Proposal: Zero-Cost Topology (Annette V2)

## Summary

This proposal outlines a V2 architecture that treats interaction nets as direct call graphs. Ports become function references, connections become pointer swaps, and the JavaScript call stack becomes the scheduler. The design emphasizes zero-cost dispatch while preserving the core Annette mental model of agents, ports, and rewiring.

## Related Proposals

- `docs/proposals/fast-dispatch-runtime.md`

## Goals

- Make interaction dispatch as fast as native function calls.
- Keep topology as first-class state (rewiring remains the core primitive).
- Allow opt-in kernel interception for time travel, sync, and observability.
- Provide a migration path from V1 patterns to V2 style agents.

## Non-Goals

- Replacing current V1 modules immediately.
- Guaranteed serialization of full call stacks (requires explicit boundaries).
- Removing all scheduling or rule abstractions from the project.

## Conceptual Shift

- **V1**: Central scheduler reduces active pairs.
- **V2**: Ports are mutable function references; interaction is a direct call.

### Mapping

| Concept | V1 | V2 |
| --- | --- | --- |
| Port | Object + metadata | Function reference + handler |
| Connection | Connection record | Pointer assignment |
| Interaction | Scheduler step | Direct call |
| Rewrite | Port reassignment | Port reassignment |

## API Compatibility

V2 keeps the V1-facing factory/port style, but rewires the internals to use function dispatch. Rules become inline port handlers rather than centrally registered actions.

## Minimal Runtime (API-Compatible Sketch)

```typescript
export type Port<T = any> = {
  (data: T): void;
  _handler: (data: T) => void;
  _peer: ((data: T) => void) | null;
};

export const Port = <T>(handler: (data: T, source?: Port<any>) => void = () => {}) => {
  const port = ((data: T) => {
    if (port._peer) {
      port._peer(data);
    }
  }) as Port<T>;

  port._handler = handler;
  port._peer = null;

  return port;
};

export const connect = <T>(a: Port<T>, b: Port<T>) => {
  a._peer = b._handler;
  b._peer = a._handler;
};

export const Agent = <T, P>(name: string, factory: (initial: T) => P) => {
  return (initialState: T) => ({ name, ...factory(initialState) });
};
```

## Core Primitives

### Port as Wire

Ports store a handler and a mutable peer. `send` is a direct call to peer handler.

```typescript
export interface IPort<In, Out> {
  send(data: Out): void;
  receive(data: In): void;
  wireTo(peer: IPort<Out, In>): void;
}

export class Port<In, Out> implements IPort<In, Out> {
  private peer: ((data: Out) => void) | null = null;

  constructor(private handler: (data: In) => void) {}

  send(data: Out) {
    if (this.peer) {
      this.peer(data);
    }
  }

  receive(data: In) {
    this.handler(data);
  }

  wireTo(peer: IPort<Out, In>) {
    this.peer = peer.receive.bind(peer);
    (peer as Port<Out, In>).setPeer(this.receive.bind(this));
  }

  private setPeer(fn: (data: Out) => void) {
    this.peer = fn;
  }
}
```

### Agent as Logic Container

An agent exposes handlers through ports. The rule logic is inline in the handler.

## Interaction Patterns

### Counter Example

```typescript
const Counter = Agent("Counter", (initialValue: number) => {
  let value = initialValue;

  const main = Port<number>((input) => {
    value += input;
    console.log(`[Counter] Value is now: ${value}`);
  });

  return { main };
});

const Incrementer = Agent("Incrementer", (amount: number) => {
  const main = Port<number>(() => {
    console.log("[Incrementer] Ack");
  });

  const trigger = () => {
    console.log(`[Incrementer] Sending ${amount}...`);
    main(amount);
  };

  return { main, trigger };
});

const count = Counter(0);
const inc = Incrementer(5);

connect(count.main, inc.main);

inc.trigger();
```

### Todo Interaction

```typescript
class TodoAgent {
  state = { text: "", done: false };
  main = new Port<null, TodoAgent>(() => {
    this.state.done = !this.state.done;
    this.main.send(this);
  });

  constructor(text: string) {
    this.state.text = text;
  }
}

class ToggleCommand {
  main = new Port<TodoAgent, null>((todo) => {
    console.log(`Ack: ${todo.state.text}`);
  });

  fire() {
    this.main.send(null);
  }
}

const milk = new TodoAgent("Buy Milk");
const toggle = new ToggleCommand();

toggle.main.wireTo(milk.main);

toggle.fire();
```

### Pass-Through Rewiring

```typescript
class Router {
  input = new Port<{ data: unknown; replyTo: IPort<unknown, unknown> }, unknown>((msg) => {
    const worker = this.getWorker();
    msg.replyTo.wireTo(worker.input);
    worker.input.send(msg.data);
  });

  getWorker() {
    return new Worker();
  }
}
```

### DOM Optimization (V2 Style)

```typescript
const Block = Agent("Block", (template: HTMLTemplateElement) => {
  const fragment = template.content.firstElementChild?.cloneNode(true) as HTMLElement;
  const label = fragment.querySelector("span");

  const updateText = Port<string>((text) => {
    if (label) {
      label.textContent = text;
    }
  });

  return { root: fragment, updateText };
});

const template = document.createElement("template");
template.innerHTML = "<span></span>";

const block = Block(template);

document.body.append(block.root);
block.updateText("Fast update");
```

## Kernel Interceptors

To regain time travel, sync, or tracing, ports can route through interceptors:

```typescript
class V2Network {
  history: Array<{ ts: number; data: unknown }> = [];

  connect<In, Out>(portA: Port<In, Out>, portB: Port<Out, In>) {
    const interceptor = (data: Out) => {
      this.history.push({ ts: Date.now(), data });
      portB.receive(data);
    };

    (portA as any).setPeer(interceptor);
    (portB as any).setPeer((data: In) => portA.receive(data));
  }
}
```

## Sync and Distributed Boundaries

Because the call stack is not serializable, explicit boundary ports are required for sync.

- `SyncPort` serializes payloads before forwarding.
- Use boundary agents at UI events or IO handlers.

```typescript
class SyncPort<In, Out> extends Port<In, Out> {
  send(data: Out) {
    socket.emit("interaction", JSON.stringify(data));
    super.send(data);
  }
}
```

## Migration Strategy

1. Introduce a `fast-runtime` module with V2 primitives.
2. Adapt a single subsystem (observer chain or DOM updates).
3. Add adapters that allow V1 agents to target V2 ports.
4. Incrementally broaden to more domains (effects, selection).

## Risks

- Loss of built-in replay unless every boundary is intercepted.
- Debugging shifts to call stack; no global scheduler introspection.
- Rewiring requires careful handling to avoid stale references.

## Open Questions

- Should V2 be a separate package or a mode flag?
- How to support time travel across hybrid V1/V2 graphs?
- What tooling is needed to visualize call-graph topology?

## Suggested Next Steps

- Implement a minimal prototype under `src/fast-runtime`.
- Add a microbenchmark comparing scheduler vs V2 ports.
- Define boundaries for sync and time travel integration.
