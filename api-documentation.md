# Annette API Documentation

This document provides detailed information about the Annette API, organized by abstraction layer and feature area.

## Table of Contents

- [Conventions](#conventions)
- [Semantics & Guarantees](#semantics--guarantees)
- [Core Engine Layer](#core-engine-layer)
  - [Agent System](#agent-system)
  - [Port System](#port-system)
  - [Connection System](#connection-system)
  - [Rule System](#rule-system)
  - [Network System](#network-system)
- [Standard Library Layer](#standard-library-layer)
  - [Time Travel System](#time-travel-system)
  - [Updater System](#updater-system)
  - [Effect System](#effect-system)
  - [Sync System](#sync-system)
  - [Connection History](#connection-history)
  - [Specialized Updaters](#specialized-updaters)
  - [Reactive System](#reactive-system)
  - [Plugin System](#plugin-system)
- [Application Layer](#application-layer)
  - [Module Map](#module-map)
  - [Scoped Network API](#scoped-network-api)
  - [Rule DSL](#rule-dsl)
  - [Storylines](#storylines)
  - [Serialization](#serialization)
  - [Distributed Networks](#distributed-networks)
  - [Vector Clocks](#vector-clocks)
  - [Conflict Resolution](#conflict-resolution)
  - [Fine-grained Reactivity](#fine-grained-reactivity)
  - [Component Model](#component-model)
  - [Custom Updaters](#custom-updaters)
- [Advanced Features](#advanced-features)
  - [Progressive Disclosure](#progressive-disclosure)
  - [Error Handling](#error-handling)
  - [Debugging Tools](#debugging-tools)
  - [Performance Optimizations](#performance-optimizations)


## Conventions

Annette APIs are organized by layer (core → standard library → application). Most examples assume:

- **Agents** are mutable objects; rules mutate agent `value` in-place.
- **Ports** have a `main` role (primary interaction) and optional `aux` roles (secondary links).
- **Factories** capture an agent name and port schema; use them for typed creation.

**Gotchas:**
- Methods declared with `withConnections` create network work; calling them outside a scope can step immediately.
- Connecting the same `main` port twice throws unless `autoDisconnectMain` is enabled.
- Rules that read non-deterministic state (`Date.now()`, `Math.random()`, I/O) break replay and distributed convergence.
- `reduce()` can run indefinitely if your rules keep producing new redexes.

## Semantics & Guarantees

**`step()` selection:** One interaction is chosen from the current active pair set. Internally the network iterates the active-pair set in insertion order and executes the first match. If creation order differs, the chosen pair can differ.

**Determinism:** Given identical agent/connection insertion order and pure rule handlers, reductions are deterministic. Non-deterministic logic or different insertion order can diverge.

**Quiescent state:** A network is quiescent when `step()` returns `false` (no active pair with an applicable rule). In scoped APIs, pending work is executed only when the scope finishes.

**Replayability:** Time travel stores snapshots of agent values and connections (rules are not snapshotted). Sync operations are built from tracked change history. Only `TrackedAction` and updater-based changes are guaranteed to be replayable across replicas.

**Confluence:** For interaction-net-style rewrites that satisfy the usual confluence conditions, reduction order does not affect the normal form. Annette does not enforce these conditions; side effects and external I/O can break convergence.

## Core Engine Layer


The Core Engine layer provides the fundamental interaction net primitives.

```typescript
import { Core } from 'annette';
// or import individual components
import { Agent, Network, ActionRule, Port, Connection } from 'annette';
```

### Agent System

Agents are the fundamental units in Annette, representing nodes in the interaction net.

#### `Agent<N, V, T>`

Creates a new agent with a name, value, and optional port definitions.

```typescript
function Agent<N extends string, V = any, T extends string = string>(
  name: N,
  value: V,
  ports?: PortDefinition,
  type?: T
): IAgent<N, V, T>;
```

**Parameters:**
- `name`: The agent name (acts as its "type" for rule matching)
- `value`: The agent's mutable value
- `ports`: Optional port definitions (defaults to a single 'main' port)
- `type`: Optional agent type for more specific typing

**Returns:** An agent instance

**Example:**
```typescript
// Basic agent with default main port
const counter = Agent("Counter", 0);

// Agent with explicit type parameters
const user = Agent<"User", { name: string, age: number }>("User", { name: "John", age: 30 });

// Agent with custom ports
const processor = Agent("Processor", { status: "idle" }, {
  input: Port("input", "main"),
  output: Port("output", "aux"),
  control: Port("control", "aux")
});

// Factory helper (name inferred from string literal)
const CounterFactory = Agent.factory<number>("Counter");
const instance = CounterFactory(0);

// Factory from existing agent
const cloneFactory = Agent.factoryFrom(instance);
const clone = cloneFactory(1);
```



#### `IAgent<N, V, T>`

Interface representing an agent.

```typescript
interface IAgent<N extends string = string, V = any, T extends string = string> {
  readonly _agentId: AgentId;
  readonly name: N;
  value: V;
  readonly type?: T;
  readonly ports: Record<string, IBoundPort>;
}
```

### Port System

Ports are the connection points of agents, through which they interact.

#### `Port(name, type)`

Creates a new port.

```typescript
function Port(name: string, type: PortTypes = "aux"): IPort;
```

**Parameters:**
- `name`: The port name
- `type`: Port type ('main' or 'aux', defaults to 'aux')

**Returns:** A port instance

**Example:**
```typescript
// Create a main port
const mainPort = Port("main", "main");

// Create an auxiliary port
const auxPort = Port("output", "aux");

// Convenience factories
const mainShortcut = Port.main();
const auxShortcut = Port.aux("output");

// Factory from existing port
const PortCopy = Port.factoryFrom(auxPort);
const clone = PortCopy();
```


#### `IPort`

Interface representing a port.

```typescript
interface IPort {
  readonly name: string;
  readonly type: PortTypes;
}
```

#### `IBoundPort`

Interface representing a port bound to an agent.

```typescript
interface IBoundPort extends IPort {
  readonly agentId: AgentId;
  readonly agent: IAgent;
  readonly isConnected: boolean;
  readonly connectedPort: IBoundPort | null;
}
```

### Connection System

Connections represent links between ports of different agents.

#### `Connection(port1, port2, name?)`

Creates a connection between two ports.

```typescript
function Connection(
  port1: IBoundPort, 
  port2: IBoundPort,
  name?: string
): IConnection;
```

**Parameters:**
- `port1`: The first port to connect
- `port2`: The second port to connect
- `name`: Optional connection name (auto-generated if not provided)

**Returns:** A connection instance

**Example:**
```typescript
// Create a connection between two ports
const conn = Connection(agent1.ports.main, agent2.ports.input);

// Create a connection with an explicit name
const namedConn = Connection(agent1.ports.output, agent2.ports.input, "data-flow");

// Factory from existing connection
const ConnFactory = Connection.factoryFrom(namedConn);
const cloned = ConnFactory(otherSource, otherDest);
```


#### `IConnection`

Interface representing a connection.

```typescript
interface IConnection {
  readonly id: string;
  readonly name: string;
  readonly port1: IBoundPort;
  readonly port2: IBoundPort;
  disconnect(): void;
}
```

### Rule System

Rules define what happens when different agents connect.

#### `ActionRule(port1, port2, action, name?)`

Creates an imperative action rule.

```typescript
function ActionRule<A1 extends IAgent, A2 extends IAgent>(
  port1: IBoundPort | IConnection,
  port2?: IBoundPort,
  action: Action<A1, A2>,
  name?: string
): IActionRule;
```

**Parameters:**
- `port1`: The first port or a connection
- `port2`: The second port (not needed if port1 is a connection)
- `action`: The function to execute when the rule matches
- `name`: Optional rule name (auto-generated if not provided)

**Returns:** An action rule instance

**Example:**
```typescript
// Create an action rule
const incrementRule = ActionRule(
  counter.ports.main,
  increment.ports.main,
  (counter, increment) => {
    counter.value += increment.value;
    return [counter, increment];
  },
  "increment-counter" // Optional name
);

// Create an action rule without explicit name
const decrementRule = ActionRule(
  counter.ports.main,
  decrement.ports.main,
  (counter, decrement) => {
    counter.value -= decrement.value;
    return [counter, decrement];
  }
  // Name auto-generated as: Counter.main-to-Decrement.main
);

// Factory from existing rule
const ruleClone = Rule.factoryFrom(incrementRule);
```


#### `RewriteRule(port1, port2, rewrite, name?)`

Creates a declarative rewrite rule.

```typescript
function RewriteRule<A1 extends IAgent, A2 extends IAgent>(
  port1: IBoundPort | IConnection,
  port2?: IBoundPort,
  rewrite: Rewrite<A1, A2> | RewritePattern,
  name?: string
): IRewriteRule;
```

**Parameters:**
- `port1`: The first port or a connection
- `port2`: The second port (not needed if port1 is a connection)
- `rewrite`: Function or pattern defining how to rewrite the graph
- `name`: Optional rule name (auto-generated if not provided)

**Returns:** A rewrite rule instance

**Example:**
```typescript
// Function-based rewrite rule
const addRule = RewriteRule(
  num1.ports.main,
  num2.ports.main,
  (n1, n2) => {
    const sum = n1.value + n2.value;
    
    return {
      newAgents: [
        { 
          name: "Result", 
          initialValue: sum, 
          _templateId: "sumResult" 
        }
      ],
      internalConnections: [],
      portMapAgent1: {
        aux: { newAgentTemplateId: "sumResult", newPortName: "main" }
      },
      portMapAgent2: {
        aux: null
      }
    };
  }
);

// Static pattern-based rewrite rule
const duplicateRule = RewriteRule(
  original.ports.main,
  duplicator.ports.main,
  {
    newAgents: [
      { name: "Copy", initialValue: null, _templateId: "copy1" },
      { name: "Copy", initialValue: null, _templateId: "copy2" }
    ],
    internalConnections: [],
    portMapAgent1: {
      aux: { newAgentTemplateId: "copy1", newPortName: "main" }
    },
    portMapAgent2: {
      aux: { newAgentTemplateId: "copy2", newPortName: "main" }
    }
  }
);
```

#### `TrackedAction(port1, port2, action, description?)`

Creates an action rule with automatic change tracking.

```typescript
function TrackedAction<A1 extends IAgent, A2 extends IAgent>(
  port1: IBoundPort | IConnection,
  port2?: IBoundPort,
  action: Action<A1, A2>,
  description?: string
): IActionRule;
```

**Parameters:**
- `port1`: The first port or a connection
- `port2`: The second port (not needed if port1 is a connection)
- `action`: The function to execute when the rule matches
- `description`: Optional description for the change history

**Returns:** An action rule instance with change tracking

**Example:**
```typescript
// Create a tracked action rule
const incrementRule = TrackedAction(
  counter.ports.main,
  increment.ports.main,
  (counter, increment) => {
    counter.value += increment.value;
    return [counter, increment];
  },
  "Increment counter" // Optional description
);
```

### Network System

Networks manage agents, connections, and rules, and execute the reduction process.

#### `Network(name, agents?)`

Creates a network.

```typescript
function Network(name: string, agents?: IAgent[]): INetwork;
```

**Parameters:**
- `name`: The network name
- `agents`: Optional array of agents to add initially

**Returns:** A network instance

**Example:**
```typescript
// Create an empty network
const net = Network("counter-example");

// Create a network with initial agents
const net2 = Network("pre-populated", [agent1, agent2, agent3]);
```

**Gotchas:**
- `connectPorts` throws if either port is already connected.
- `step()` returns `false` when no rules apply; `reduce()` returns the count of applied steps.


#### `INetwork`

Interface representing a network.

```typescript
interface INetwork<Name extends string = string, A extends IAgent = IAgent> {
  readonly name: Name;
  readonly id: string;

  // Agent management
  addAgent<T extends A | IAgent>(agent: T): T;
  removeAgent(agentOrId: A | string): boolean;
  getAgent<T extends A | IAgent>(agentId: string): T | undefined;
  findAgents(query: { name?: string }): IAgent[];
  getAllAgents(): IAgent[];

  // Connection management
  connectPorts<P1 extends IBoundPort, P2 extends IBoundPort>(
    port1: P1,
    port2: P2,
    connectionName?: string
  ): IConnection | undefined;
  disconnectPorts<P1 extends IBoundPort, P2 extends IBoundPort>(port1: P1, port2: P2): boolean;
  isPortConnected<P extends IBoundPort>(port: P): boolean;
  getAllConnections(): IConnection[];
  findConnections(query?: { from?: IBoundPort; to?: IBoundPort }): IConnection[];

  // Rule management
  addRule(rule: AnyRule): void;
  removeRule(rule: AnyRule | string): boolean;
  getAllRules(): AnyRule[];
  findRules(query?: { name?: string; type?: string; agentName?: string; portName?: string }): AnyRule[];
  clearRules(): void;

  // Execution
  step(): boolean;
  reduce(maxSteps?: number): number;

  // Change tracking
  getChangeHistory?: () => ChangeHistoryEntry[];
}
```


## Standard Library Layer

The Standard Library layer provides common agents, rules, and patterns built on the Core Engine.

```typescript
import { StdLib } from 'annette';
// or import individual components
import { 
  TimeTravelNetwork, 
  Updater, 
  EffectAgent, 
  SyncAgent 
} from 'annette';
```

### Time Travel System

The Time Travel system enables taking snapshots and rolling back to previous states.

#### `TimeTravelNetwork(name, agents?)`

Creates a network with time travel capabilities.

```typescript
function TimeTravelNetwork(name: string, agents?: IAgent[]): ITimeTravelNetwork;
```

**Parameters:**
- `name`: The network name
- `agents`: Optional array of agents to add initially

**Returns:** A time travel network instance

**Example:**
```typescript
// Create a time travel network
const net = TimeTravelNetwork("counter-with-history");
```

#### `enableTimeTravel(network)`

Adds time travel capabilities to an existing network.

```typescript
function enableTimeTravel(network: INetwork): ITimeTravelNetwork;
```

**Parameters:**
- `network`: The network to enhance

**Returns:** The same network with time travel capabilities

**Example:**
```typescript
// Add time travel to an existing network
const net = Network("my-network");
const travelNet = enableTimeTravel(net);
```

#### `ITimeTravelNetwork`

Interface representing a network with time travel capabilities.

```typescript
interface ITimeTravelNetwork extends INetwork {
  takeSnapshot(description?: string): NetworkSnapshot;
  getSnapshots(): NetworkSnapshot[];
  rollbackTo(snapshotId: string): void;
  compareSnapshots(id1: string, id2: string): SnapshotDiff;
  enableAutoSnapshot(interval: number, description?: string): void;
  disableAutoSnapshot(): void;
}
```

### Updater System

The Updater system provides a way to represent state changes as first-class citizens.

#### `Updater(path, operation, metadata?)`

Creates an updater agent.

```typescript
function Updater(
  path: string[],
  operation: UpdateOperation,
  metadata?: Record<string, any>
): IAgent<"Updater", UpdaterValue>;
```

**Parameters:**
- `path`: Array of property names defining the path to update
- `operation`: The update operation to perform
- `metadata`: Optional metadata about the update

**Returns:** An updater agent

**Example:**
```typescript
// Create an updater to set a value
const setNameUpdater = Updater(
  ["name"],
  Updates.set("New Name")
);

// Create an updater to merge an object
const updatePrefsUpdater = Updater(
  ["preferences"],
  Updates.merge({ theme: "dark" }),
  { source: "user", timestamp: Date.now() }
);
```

#### `Updates`

Namespace with built-in update operations.

```typescript
namespace Updates {
  function set(value: any): UpdateOperation;
  function merge(value: object): UpdateOperation;
  function delete(): UpdateOperation;
  function increment(value: number): UpdateOperation;
  function insert(index: number, value: any): UpdateOperation;
  function custom(fn: (current: any) => any): UpdateOperation;
}
```

**Example:**
```typescript
// Different update operations
const setOp = Updates.set("new value");
const mergeOp = Updates.merge({ a: 1, b: 2 });
const deleteOp = Updates.delete();
const incrementOp = Updates.increment(5);
const insertOp = Updates.insert(2, "new item");
const customOp = Updates.custom(val => val.toString().toUpperCase());
```

#### `registerUpdaterRules(network)`

Registers updater rules in a network.

```typescript
function registerUpdaterRules(
  network: INetwork,
  targetAgentNames?: string[]
): void;
```

**Parameters:**
- `network`: The network to register rules in
- `targetAgentNames`: Optional array of agent names that can be updated

**Example:**
```typescript
// Register updater rules for all agents
registerUpdaterRules(network);

// Register updater rules only for specific agent types
registerUpdaterRules(network, ["Document", "UserProfile"]);
```

### Effect System

The Effect system provides algebraic effects for handling asynchronous operations.

**Effect flow:**
- An `EffectAgent` is introduced with a description payload.
- A `HandlerAgent` matches by effect `type` and returns a value or promise.
- A result (or error) agent is created and connected back.
- `ResultScanner` collects or forwards results.


#### `EffectAgent(description)`

Creates an effect agent.

```typescript
function EffectAgent(
  description: EffectDescription
): IAgent<"Effect", EffectAgentValue>;
```

**Parameters:**
- `description`: Description of the effect to perform

**Returns:** An effect agent

**Example:**
```typescript
// Create a fetch effect
const fetchEffect = EffectAgent({
  type: 'fetch',
  url: 'https://api.example.com/users/1'
});

// Create a storage effect
const storageEffect = EffectAgent({
  type: 'storage',
  operation: 'get',
  key: 'user-preferences'
});
```

#### `HandlerAgent(handlers)`

Creates a handler agent.

```typescript
function HandlerAgent(
  handlers: EffectHandlers
): IAgent<"Handler", HandlerAgentValue>;
```

**Parameters:**
- `handlers`: Map of effect types to handler functions

**Returns:** A handler agent

**Example:**
```typescript
// Create a handler agent for multiple effect types
const effectHandler = HandlerAgent({
  // Fetch handler
  'fetch': async (effect) => {
    const response = await fetch(effect.url);
    return await response.json();
  },
  
  // Storage handler
  'storage': (effect) => {
    if (effect.operation === 'get') {
      return localStorage.getItem(effect.key);
    } else if (effect.operation === 'set') {
      localStorage.setItem(effect.key, effect.value);
      return true;
    }
    return null;
  }
});
```

#### `ResultScanner()`

Creates a result scanner agent.

```typescript
function ResultScanner(): IAgent<"ResultScanner", null>;
```

**Returns:** A result scanner agent

**Example:**
```typescript
// Create a result scanner
const scanner = ResultScanner();
network.addAgent(scanner);
```

#### `registerEffectRules(network)`

Registers effect rules in a network.

```typescript
function registerEffectRules(network: INetwork): void;
```

**Parameters:**
- `network`: The network to register rules in

**Example:**
```typescript
// Register effect rules
registerEffectRules(network);
```

### Sync System

The Sync system enables synchronization across different networks.

#### `SyncAgent(networkId, nodeId)`

Creates a sync agent.

```typescript
function SyncAgent(
  networkId: string,
  nodeId: string
): IAgent<"Sync", SyncAgentValue>;
```

**Parameters:**
- `networkId`: ID of the network this agent belongs to
- `nodeId`: ID of the node (client/server) this agent represents

**Returns:** A sync agent

**Example:**
```typescript
// Create a sync agent
const syncAgent = SyncAgent("client-network", "client-1");
```

#### `RemoteAgent(sourceNetworkId, sourceAgentId, initialValue)`

Creates a remote agent representing an agent from another network.

```typescript
function RemoteAgent(
  sourceNetworkId: string,
  sourceAgentId: string,
  initialValue: any
): IAgent<"Remote", RemoteAgentValue>;
```

**Parameters:**
- `sourceNetworkId`: ID of the source network
- `sourceAgentId`: ID of the source agent
- `initialValue`: Initial value for the remote agent

**Returns:** A remote agent

**Example:**
```typescript
// Create a remote agent
const remoteDoc = RemoteAgent(
  "server-network",
  "doc-123",
  { content: "", metadata: {} }
);
```

#### `SyncNetwork(name, nodeId, agents?)`

Creates a network with synchronization capabilities.

```typescript
function SyncNetwork(
  name: string,
  nodeId: string,
  agents?: IAgent[]
): INetwork & { 
  nodeId: string,
  collectOperations(since?: number): SyncOperation[],
  applyOperations(operations: SyncOperation[]): void
};
```

**Parameters:**
- `name`: The network name
- `nodeId`: ID of the node this network represents
- `agents`: Optional array of agents to add initially

**Returns:** A network with sync capabilities

**Example:**
```typescript
// Create a sync network
const clientNet = SyncNetwork("client-app", "client-123");
```

#### `registerSyncRules(network)`

Registers sync rules in a network.

```typescript
function registerSyncRules(network: INetwork): void;
```

**Parameters:**
- `network`: The network to register rules in

**Example:**
```typescript
// Register sync rules
registerSyncRules(network);
```

### Connection History

The Connection History system tracks all connections with detailed versioning.

#### `enableConnectionHistory(network)`

Adds connection history capabilities to a network.

```typescript
function enableConnectionHistory(network: INetwork): INetwork & {
  takeReductionSnapshot(description?: string): ReductionSnapshot;
  getChangesSince(version: number): VersionedChange[];
  rollbackToVersion(version: number): void;
  applyChanges(changes: VersionedChange[]): void;
};
```

**Parameters:**
- `network`: The network to enhance

**Returns:** The network with connection history capabilities

**Example:**
```typescript
// Add connection history to a network
const net = Network("my-network");
const historyNet = enableConnectionHistory(net);

// Take a snapshot
const snapshot = historyNet.takeReductionSnapshot("Initial state");

// Later, roll back to that version
historyNet.rollbackToVersion(snapshot.version);
```

### Specialized Updaters

Specialized Updaters provide efficient operations for different data types.

#### `createSharedMap(initialValue)`

Creates a map agent with specialized update operations.

```typescript
function createSharedMap<T extends object>(
  initialValue: T
): IAgent<"SharedMap", T>;
```

**Parameters:**
- `initialValue`: Initial map value

**Returns:** A shared map agent

**Example:**
```typescript
// Create a shared map
const userProfile = createSharedMap({
  name: "John",
  preferences: { theme: "light" }
});
```

#### `createSharedList(initialValue)`

Creates a list agent with specialized update operations.

```typescript
function createSharedList<T>(
  initialValue: T[]
): IAgent<"SharedList", T[]>;
```

**Parameters:**
- `initialValue`: Initial list value

**Returns:** A shared list agent

**Example:**
```typescript
// Create a shared list
const todoList = createSharedList([
  "Buy groceries",
  "Walk the dog"
]);
```

#### `createSharedText(initialValue)`

Creates a text agent with specialized update operations.

```typescript
function createSharedText(
  initialValue: string
): IAgent<"SharedText", string>;
```

**Parameters:**
- `initialValue`: Initial text value

**Returns:** A shared text agent

**Example:**
```typescript
// Create a shared text
const document = createSharedText("This is a collaborative document.");
```

#### `createSharedCounter(initialValue)`

Creates a counter agent with specialized update operations.

```typescript
function createSharedCounter(
  initialValue: number
): IAgent<"SharedCounter", number>;
```

**Parameters:**
- `initialValue`: Initial counter value

**Returns:** A shared counter agent

**Example:**
```typescript
// Create a shared counter
const viewCounter = createSharedCounter(0);
```

#### `registerSpecializedUpdaterRules(network)`

Registers specialized updater rules in a network.

```typescript
function registerSpecializedUpdaterRules(network: INetwork): void;
```

**Parameters:**
- `network`: The network to register rules in

**Example:**
```typescript
// Register specialized updater rules
registerSpecializedUpdaterRules(network);
```

### Reactive System

The Reactive system provides automatic dependency tracking for reactive values and derived computations. It includes two APIs:
- **Reactive agent API**: backed by an internal Annette network (`createReactive`, `createComputed`, `createReactiveEffect`).
- **Signal API**: Solid-style signals (`createSignal`, `createMemo`, `createEffect`, `createResource`).

#### `createReactive(initialValue)`

Creates a reactive value.

```typescript
function createReactive<T>(initialValue: T): Reactive<T>;
```

**Parameters:**
- `initialValue`: The initial value

**Returns:** A reactive accessor

**Example:**
```typescript
const count = createReactive(0);
const doubled = createComputed(() => count() * 2);

createEffect(() => {
  console.log(count(), doubled());
});

count(1);
```

#### `createComputed(computation)`

Creates a computed reactive value.

```typescript
function createComputed<T>(computation: () => T): Reactive<T>;
```

**Parameters:**
- `computation`: Function to compute the value

**Returns:** A derived reactive accessor

#### `createReactiveEffect(effect)`

Creates a reactive side effect (reactive agent API).

```typescript
function createReactiveEffect(effect: () => void): void;
```

**Parameters:**
- `effect`: Function to run when dependencies change

**Gotchas:**
- Reactive primitives use a shared internal Annette network; call `initReactiveSystem(network)` to scope them to your own network.
- `batch()` from the reactive agent API batches reactive updates; `createNetwork().batch` batches network steps.
- Use `batch()` to avoid redundant recomputation when multiple values change.

#### Solid-style signals

Signal helpers live in the Solid-style reactive module.

#### `createSignal(initialValue)`

Creates a SolidJS-style signal pair.

```typescript
function createSignal<T>(initialValue: T): [() => T, (value: T | ((prev: T) => T)) => T];
```

**Example:**
```typescript
const [count, setCount] = createSignal(0);
setCount((prev) => prev + 1);
```

#### `createMemo(computation)`

Creates a memoized derived signal.

```typescript
function createMemo<T>(computation: () => T): () => T;
```

#### `createEffect(effect)`

Creates a signal-based side effect.

```typescript
function createEffect(effect: () => void): void;
```

**Gotchas:**
- Signal batching is exported as `solidBatch` to avoid clashing with network `batch()`.


### Plugin System

The Plugin system provides a way to extend Annette with custom functionality.

#### `createPluginNetwork(name)`

Creates a network with plugin support.

```typescript
function createPluginNetwork(name: string): IPluginNetwork;
```

**Parameters:**
- `name`: The network name

**Returns:** A plugin network instance

**Example:**
```typescript
// Create a plugin network
const network = createPluginNetwork("app");
```

#### `BasePlugin`

Base class for creating custom plugins.

```typescript
class BasePlugin implements IPlugin {
  constructor(options?: {
    id?: string;
    name?: string;
    description?: string;
  });
  
  initialize(network: IPluginNetwork): void;
  shutdown(): void;
}
```

**Example:**
```typescript
// Create a custom plugin
class MyPlugin extends BasePlugin {
  constructor() {
    super({
      id: "my-plugin",
      name: "My Custom Plugin",
      description: "Does awesome things"
    });
  }
  
  initialize(network) {
    super.initialize(network);
    console.log("My plugin initialized");
    
    // Add event listeners
    network.addEventListener("agent-added", this.onAgentAdded.bind(this));
  }
  
  onAgentAdded(event) {
    console.log(`Agent added: ${event.data.agent.name}`);
  }
  
  shutdown() {
    console.log("My plugin shut down");
    super.shutdown();
  }
}
```

#### Standard Plugins

Annette includes several standard plugins:

```typescript
// Time Travel plugin
const timeTravelPlugin = new TimeTravelPlugin();

// Reactivity plugin
const reactivityPlugin = new ReactivityPlugin();

// Synchronization plugin
const syncPlugin = new SynchronizationPlugin();

// Effect plugin
const effectPlugin = new EffectPlugin();

// Register plugins
network.registerPlugin(timeTravelPlugin);
network.registerPlugin(reactivityPlugin);
```

## Application Layer

The Application Layer provides domain-specific components and high-level APIs.

#### Module Map

These APIs ship in one package, but map to distinct domains:
- `@annette/scope`: scoped networks, rule DSL, storylines
- `@annette/sync`: sync operations, distributed helpers, vector clocks
- `@annette/reactive`: signals, memos, fine-grained reactivity
- `@annette/ui` (experimental): component model + DOM renderer

These are conceptual groupings; imports currently come from `annette`:

```typescript
import { createNetwork } from 'annette';
import { SyncNetwork } from 'annette';
import { createSignal } from 'annette';
```

### Scoped Network API

The scoped API creates a bound set of helpers for a single network instance. Use it to avoid passing the network around and to define typed factories plus methods in one place.

**Why:** Scopes batch network changes and give you deterministic stepping points for method calls.

#### `createNetwork(name)`

Creates a scoped network with factory helpers and convenience APIs. `withConnections` returns a typed factory that includes the declared methods.

```typescript
function createNetwork(name: string): {
  Agent: typeof Agent & { factory: typeof createAgentFactory };
  Port: PortFactory;
  Rule: RuleFactory;
  Connection: ConnectionFactory;
  withConnections(factory, methods, options?): AgentFactoryWithMethods;
  connect(source, destination, name?): IConnection | undefined;
  scope: {
    (cb: () => void): void;
    step(cb: () => void): void;
    reduce(cb: () => void): void;
    manual<T>(cb: (net) => T): T;
  };
  batch: {
    (cb: () => void): void;
    step(cb: () => void): void;
    reduce(cb: () => void): void;
    manual<T>(cb: (net) => T): T;
  };
  untrack: {
    (cb: () => void): void;
    manual<T>(cb: (net) => T): T;
  };
  derived(factory, compute): (source) => IAgent;
  storyline(factory, generator): StorylineDefinition & { deserialize: StorylineDeserialize };
  sync(agent, transport, options?): { stop(): void };
  fnAgent(subject, name, handler): AgentFactory;
  step(): boolean;
  reduce(maxSteps?): number;
};

withConnections returns a new factory with the declared methods attached.

withConnections supports options:

```typescript
withConnections(Counter, {
  add: (counter) => {
    counter.value += 1;
  }
}, { autoDisconnectMain: true });
```

**Why:** With `autoDisconnectMain`, you can call methods multiple times without manually disconnecting ports.

You can also wrap a scoped network for nested usage:

```typescript
const nested = asNestedNetwork(child);

nested.step();
nested.reduce();
```

Rule listings include symmetric rules by default. Use:

```typescript
rules.list({ includeSymmetric: false });
```

Scope helpers:
- `scope.step()` runs one reduction after the callback.
- `scope.reduce()` runs reductions until quiescent.
- `scope.manual()` disables auto-stepping and returns the callback value.

Batch helpers:
- `batch()` queues work and runs a single step.
- `batch.reduce()` queues work and reduces until quiescent.
- `batch.manual()` queues work without auto-stepping.

`untrack()` runs without registering agents, connections, or rules.

**Gotchas:**
- `scope.manual()` and `batch.manual()` disable auto-stepping; you must call `step()` or `reduce()` yourself.
- Without `{ autoDisconnectMain: true }`, repeated method calls on the same agent can throw if the `main` port is still connected.
- Inside `untrack()`, methods are no-ops and agents are not added to the network.

**Example:**
```typescript
const { Agent, withConnections, scope, batch, untrack } = createNetwork('app');

const Counter = withConnections(Agent.factory<number>('Counter'), {
  add: (counter) => {
    counter.value += 1;
  }
}, { autoDisconnectMain: true });

scope.reduce(() => {
  const counter = Counter(0);
  counter.add();
  counter.add();
});

batch(() => {
  const counter = Counter(0);
  counter.add();
  counter.add();
});

untrack(() => {
  Counter(1); // not added to the network
});
```

### Rule DSL

The rule DSL provides a fluent API for pair interactions and handler wrappers.

Rule chains support:
- `.on(leftPort, rightPort)` to target specific ports
- `.where(guard)` to filter matches
- `.consume()`, `.spawn()`, `.transform()`, `.mutate()` to define outcomes

**Gotchas:**
- Port names in `.on()` must exist on both agents or rule registration throws.
- `rules.list()` includes symmetric rules by default; pass `{ includeSymmetric: false }` to hide mirror rules.
- `consume()` defaults to consuming the right side unless you specify a side.

```typescript
import { createNetwork, consume, pair } from 'annette';

const { Agent, rules, fnAgent, withConnections } = createNetwork('app');

const Counter = Agent.factory<'Counter', number>('Counter');
const Incrementer = Agent.factory<'Incrementer', number>('Incrementer');

rules.when(Counter, Incrementer)
  .consume((counter, incrementer) => {
    counter.value += incrementer.value;
  });

const ruleList = rules.list({ includeSymmetric: false });
// includeSymmetric defaults to true

const FnIncrementer = fnAgent(Counter, 'FnIncrementer', consume((counter, incrementer) => {
  counter.value += incrementer.value;
}));

withConnections(Counter, {
  applyIncrement: pair(Incrementer, (counter, incrementer) => {
    counter.value += incrementer.value;
  })
});
```

#### `consume(handler | side, handler?)`

Wraps a rule handler to consume the left/right agent (or both). Useful for `fnAgent()` and `withConnections()`.

```typescript
const FnIncrementer = fnAgent(Counter, 'FnIncrementer', consume((counter, incrementer) => {
  counter.value += incrementer.value;
}));
```

### Storylines

Storylines record method calls on scoped agents and can be serialized/replayed. Use them for time travel, demos, or deterministic replay in tests.

**Gotchas:**
- Storylines store method calls, not raw mutations; methods must exist on the factory.
- Use `autoDisconnectMain` if your methods connect via `main` ports repeatedly.

```typescript
const { Agent, withConnections, storyline } = createNetwork('app');

const Counter = withConnections(Agent.factory<number>('Counter'), {
  add: (counter) => {
    counter.value += 1;
  }
}, { autoDisconnectMain: true });

const story = storyline(Counter, function* (counter) {
  yield* counter.add();
  yield* counter.add();
  return counter;
});

const counter = Counter(0);
story.apply(counter);

const serialized = story.serialize({ format: 'json' });
const replay = story.deserialize(serialized, { format: 'json' });
replay.apply(counter);
```

### Serialization

The Serialization system enables storing and transmitting Annette structures.

**Gotchas:**
- Use `registerIsomorphicReference` for functions or class instances that need stable identities.
- Choose `format: 'json'` when you need interoperability; default serialization preserves richer types.


#### `serializeValue(value, options?)`

Serializes a value to a string.

```typescript
function serializeValue<T>(
  value: T,
  options?: SerializationOptions
): string;
```

**Parameters:**
- `value`: The value to serialize
- `options`: Optional serialization options

**Returns:** Serialized string

**Example:**
```typescript
// Serialize a complex value
const obj = { name: "Alice", self: null };
obj.self = obj; // Circular reference

const serialized = serializeValue(obj);
```

#### `deserializeValue(serialized, options?)`

Deserializes a value from a string.

```typescript
function deserializeValue<T>(
  serialized: string,
  options?: SerializationOptions
): T;
```

**Parameters:**
- `serialized`: The serialized string
- `options`: Optional deserialization options

**Returns:** Deserialized value

**Example:**
```typescript
// Deserialize a value
const deserialized = deserializeValue(serialized);
console.log(deserialized.self === deserialized); // true
```

#### `registerIsomorphicReference(id, value)`

Registers a value as an isomorphic reference.

```typescript
function registerIsomorphicReference<T>(
  id: string,
  value: T
): T;
```

**Parameters:**
- `id`: Unique ID for the reference
- `value`: The value to reference

**Returns:** The isomorphic reference

**Example:**
```typescript
// Register a function as an isomorphic reference
const calculate = registerIsomorphicReference(
  'calculate-total',
  (items) => items.reduce((sum, item) => sum + item.price, 0)
);
```

#### `deepClone(value, options?)`

Creates a deep clone of a value.

```typescript
function deepClone<T>(
  value: T,
  options?: SerializationOptions
): T;
```

**Parameters:**
- `value`: The value to clone
- `options`: Optional cloning options

**Returns:** Deep clone of the value

**Example:**
```typescript
// Deep clone a complex object
const obj = { complex: { nested: [1, 2, 3] }, circular: null };
obj.circular = obj;

const clone = deepClone(obj);
console.log(clone.circular === clone); // true
console.log(clone !== obj); // true
```

### Distributed Networks

The Distributed Networks system enables communication between separate networks using operation logs derived from change history.

**Why:** Share agents across processes while preserving deterministic reduction where possible.

**What is a SyncOperation?**

```typescript
type SyncOperation = {
  type: 'agent-update' | 'agent-create' | 'agent-delete' | 'connection-create' | 'connection-delete' | 'snapshot';
  data: any;
  source: string;
  timestamp: number;
  version: number;
  id: string;
};
```

**Convergence boundaries:**
- Operations are built from `getChangeHistory()` entries (tracked rules and updater-based changes).
- Shared updater agents (`createSharedMap/List/Text/Counter`) are designed for convergence.
- Arbitrary `ActionRule` side effects or non-deterministic logic can diverge across replicas.

**Gotchas:**
- Both ends must register sync rules (`registerSyncRules`) before applying operations.
- Use consistent `source` values per client to avoid replaying local operations.
- If transports reorder operations, rely on vector clocks + conflict resolver to reconcile.
- Vector clocks live at a higher layer than `SyncOperation` (they are not embedded in the operation payload).
- `version` on `SyncOperation` is a schema version (currently `1`). Sequence-style APIs like `collectOperations(since)` or `getChangesSince(version)` refer to change-history indices, not this field.

#### `createDistributedNetworkServer(options)`


Creates a distributed network server.

```typescript
function createDistributedNetworkServer(
  options: DistributedNetworkOptions
): DistributedNetwork;
```

**Parameters:**
- `options`: Server options

**Returns:** A distributed network

**Example:**
```typescript
// Create a network server
const server = createDistributedNetworkServer({
  serverUrl: 'ws://localhost:3000'
});
```

See [examples/distributed-network-example.ts](./examples/distributed-network-example.ts) for a complete flow.


#### `createDistributedNetworkClient(serverUrl, options?)`

Creates a distributed network client.

```typescript
function createDistributedNetworkClient(
  serverUrl: string,
  options?: DistributedNetworkOptions
): DistributedNetwork;
```

**Parameters:**
- `serverUrl`: URL of the server to connect to
- `options`: Optional client options

**Returns:** A distributed network

**Example:**
```typescript
// Create a distributed network client
const client = createDistributedNetworkClient('ws://localhost:3000');
```

### Vector Clocks

The Vector Clocks system enables tracking causality in distributed systems.

#### `VectorClock`

Class for managing vector clocks.

```typescript
class VectorClock {
  constructor(initialState?: Record<string, number>);
  
  increment(nodeId: string): this;
  merge(other: VectorClock): this;
  clone(): VectorClock;
  
  isBefore(other: VectorClock): boolean;
  isAfter(other: VectorClock): boolean;
  isConcurrentWith(other: VectorClock): boolean;
  isEqual(other: VectorClock): boolean;
}
```

**Example:**
```typescript
// Create vector clocks
const clockA = new VectorClock();
const clockB = new VectorClock();

// Update clocks
clockA.increment("nodeA");
clockB.increment("nodeB");

// Check causality
console.log(clockA.isConcurrentWith(clockB)); // true
```

#### `VersionedData<T>`

Class for storing data with a vector clock.

```typescript
class VersionedData<T> {
  constructor(value: T, vectorClock: VectorClock);
  
  value: T;
  vectorClock: VectorClock;
}
```

**Example:**
```typescript
// Create versioned data
const data = new VersionedData(
  { text: "Hello" },
  new VectorClock().increment("node1")
);
```

### Conflict Resolution

The Conflict Resolution system provides strategies for resolving conflicts.

#### `ConflictResolver`

Class for resolving conflicts between concurrent updates.

```typescript
class ConflictResolver {
  constructor();
  
  registerStrategy(strategy: ConflictResolutionStrategy): void;
  resolve<T>(
    local: T,
    remote: T,
    metadata: ConflictMetadata,
    strategyName?: string
  ): T;
}
```

**Example:**
```typescript
// Create a conflict resolver
const resolver = new ConflictResolver();

// Resolve a conflict
const result = resolver.resolve(
  "Local value",
  "Remote value",
  {
    localTimestamp: Date.now() - 1000,
    remoteTimestamp: Date.now(),
    localNodeId: "client1",
    remoteNodeId: "server",
    path: ["content"],
    localClock: new VectorClock().increment("client1"),
    remoteClock: new VectorClock().increment("server")
  },
  "lastWriteWins"
);
```

#### Built-in Conflict Resolution Strategies

```typescript
namespace conflictStrategies {
  function lastWriteWins<T>(local: T, remote: T, meta: ConflictMetadata): T;
  function firstWriteWins<T>(local: T, remote: T, meta: ConflictMetadata): T;
  function localWins<T>(local: T, remote: T, meta: ConflictMetadata): T;
  function remoteWins<T>(local: T, remote: T, meta: ConflictMetadata): T;
  function highestValue<T>(local: T, remote: T, meta: ConflictMetadata): T;
  function lowestValue<T>(local: T, remote: T, meta: ConflictMetadata): T;
  function customStrategy<T>(
    name: string,
    fn: (local: T, remote: T, meta: ConflictMetadata) => T
  ): ConflictResolutionStrategy;
}
```

### Fine-grained Reactivity (Experimental)

The Fine-grained Reactivity system tracks dependencies at the property level. It is built on reactive proxies rather than interaction-net reductions.

**Gotchas:**
- Proxy-based reactivity only tracks property access/mutation on the proxy object.
- Use this for local UI state; it does not participate in network reductions.


#### `ReactiveProxy`

Class for creating reactive proxies with property-level reactivity.

```typescript
class ReactiveProxy {
  constructor();
  
  createProxy<T extends object>(target: T): T;
  subscribe<T>(
    path: string,
    callback: (newValue: T, oldValue: T) => void
  ): Subscription;
}
```

**Example:**
```typescript
// Create a reactive proxy
const proxy = new ReactiveProxy();

// Create a reactive object
const user = proxy.createProxy({
  name: "John",
  age: 30,
  address: {
    city: "Anytown"
  }
});

// Subscribe to a property
const nameSub = proxy.subscribe("name", (newVal, oldVal) => {
  console.log(`Name changed from ${oldVal} to ${newVal}`);
});

// Subscribe to a nested property
const citySub = proxy.subscribe("address.city", (newVal, oldVal) => {
  console.log(`City changed from ${oldVal} to ${newVal}`);
});

// Update properties
user.name = "Jane"; // Triggers name subscription
user.address.city = "New City"; // Triggers city subscription
```

#### `createReactiveStore()`

Creates a reactive store for managing complex state.

```typescript
function createReactiveStore(): {
  createReactive<T>(initialValue: T): T;
  createComputed<T>(computation: () => T): T;
  createEffect(effect: () => void): void;
};
```

**Returns:** A reactive store

**Example:**
```typescript
// Create a reactive store
const store = createReactiveStore();

// Create reactive objects
const counter = store.createReactive({ count: 0 });
const user = store.createReactive({ name: "John" });

// Create computed values
const greeting = store.createComputed(() => 
  `Hello, ${user.name}! Count: ${counter.count}`
);

// Create effects
store.createEffect(() => {
  console.log(greeting);
});

// Update values
counter.count++;
user.name = "Jane";
```

#### `computed(computation)`

Creates a standalone computed value.

```typescript
function computed<T>(computation: () => T): () => T;
```

**Parameters:**
- `computation`: Function that computes the value

**Returns:** A function that returns the computed value

**Example:**
```typescript
// Create a computed value
const fullName = computed(() => `${firstName} ${lastName}`);

// Get the computed value
console.log(fullName());
```

### Component Model (Experimental)

The Component Model provides a lightweight UI helper built on the fine-grained reactive store. It is not a full UI framework; the renderer targets the DOM.

**Gotchas:**
- `render` expects a browser `HTMLElement` container; it is not server-side compatible.
- Component state is local to the reactive store and does not sync through networks.


#### `createComponent(options)`

Creates a component with lifecycle hooks.

```typescript
function createComponent<P, S>(
  options: ComponentOptions<P, S>
): (props: P) => S;
```

**Parameters:**
- `options`: Component options

**Returns:** A component factory function

**Example:**
```typescript
// Create a counter component
const Counter = createComponent({
  name: "Counter",
  props: {
    initialCount: 0,
    step: 1
  },
  setup(context) {
    const { props, emit, onCleanup } = context;
    let count = props.initialCount;
    
    onCleanup(() => {
      console.log("Counter component cleanup");
    });
    
    return {
      count,
      increment: () => {
        count += props.step;
        emit("increment", count);
      },
      reset: () => {
        count = props.initialCount;
      }
    };
  },
  hooks: {
    onMounted: () => console.log("Counter mounted"),
    onUpdated: () => console.log("Counter updated")
  }
});
```

#### `defineComponent(options)`

Defines a component with rendering capabilities.

```typescript
function defineComponent<P, S>(
  options: {
    name: string;
    props?: Record<string, any>;
    setup?: (context: ComponentContext<P>) => S;
    render?: (state: S, props: P) => any;
  }
): (props: P) => any;
```

**Parameters:**
- `options`: Component options

**Returns:** A component factory function

**Example:**
```typescript
// Define a todo item component
const TodoItem = defineComponent({
  name: "TodoItem",
  props: {
    text: String,
    completed: Boolean,
    onToggle: Function
  },
  setup(context) {
    return {
      toggle: () => context.props.onToggle()
    };
  },
  render(state, props) {
    return createElement(
      "li",
      { 
        className: props.completed ? "completed" : "",
        onClick: state.toggle
      },
      props.text
    );
  }
});
```

#### `render(element, container)`

Renders a component to a DOM container.

```typescript
function render(element: any, container: HTMLElement): void;
```

**Parameters:**
- `element`: The element to render
- `container`: The DOM container

**Example:**
```typescript
// Render a component
render(
  createElement(Counter, { initialCount: 5 }),
  document.getElementById("app")
);
```

### Custom Updaters

The Custom Updaters system enables defining domain-specific updaters.

#### `defineUpdater(definition)`

Defines a custom updater.

```typescript
function defineUpdater(
  definition: UpdaterDefinition
): (operation: any, path?: string[]) => IUpdater;
```

**Parameters:**
- `definition`: The updater definition

**Returns:** A function for creating updater instances

**Example:**
```typescript
// Define a toggle updater
const toggleDefinition = {
  type: "toggle",
  
  apply: (value) => !value,
  
  merge: (op1, op2) => ({
    toggleCount: (op1.toggleCount || 1) + (op2.toggleCount || 1)
  }),
  
  invert: (op) => op
};

const ToggleUpdater = defineUpdater(toggleDefinition);

// Use the custom updater
const toggleDarkMode = ToggleUpdater({}, ["darkMode"]);
```

#### `composeUpdaters(...updaters)`

Composes multiple updaters into a single updater.

```typescript
function composeUpdaters(...updaters: IUpdater[]): IUpdater;
```

**Parameters:**
- `updaters`: The updaters to compose

**Returns:** A composite updater

**Example:**
```typescript
// Compose multiple updaters
const compositeUpdater = composeUpdaters(
  SetUpdater({ value: "Jane" }, ["name"]),
  IncrementUpdater({ value: 1 }, ["age"]),
  ToggleUpdater({}, ["active"])
);
```

#### `applyUpdate(value, updater)`

Applies an updater to a value.

```typescript
function applyUpdate<T>(value: T, updater: IUpdater): T;
```

**Parameters:**
- `value`: The value to update
- `updater`: The updater to apply

**Returns:** The updated value

**Example:**
```typescript
// Apply an updater
let user = { name: "John", age: 30, active: false };

user = applyUpdate(user, SetUpdater({ value: "Jane" }, ["name"]));
user = applyUpdate(user, IncrementUpdater({ value: 1 }, ["age"]));
user = applyUpdate(user, ToggleUpdater({}, ["active"]));

console.log(user); // { name: "Jane", age: 31, active: true }
```

## Advanced Features (Experimental)

### Progressive Disclosure

The Progressive Disclosure APIs provide different levels of abstraction for different use cases. These helpers are convenience wrappers and may change.


#### `Simple`

Namespace with simplified APIs for common use cases.

```typescript
namespace Simple {
  function createNetwork(name: string): INetwork;
  function createAgent(name: string, value: any): IAgent;
  function createRule(agent1: string, agent2: string, action: Function): IRule;
  // ...
}
```

**Example:**
```typescript
// Use the Simple API
const net = Simple.createNetwork("simple-app");
const counter = Simple.createAgent("Counter", 0);
const increment = Simple.createAgent("Increment", 1);

Simple.addRule(net, "Counter", "Increment", (counter, increment) => {
  counter.value += increment.value;
  return [counter, increment];
});

Simple.connect(net, counter, increment);
Simple.run(net);
```

#### `Advanced`

Namespace with advanced APIs for complex use cases.

```typescript
namespace Advanced {
  function createOptimizedNetwork(name: string, options?: NetworkOptions): INetwork;
  function createPluginNetwork(name: string, plugins?: IPlugin[]): IPluginNetwork;
  // ...
}
```

**Example:**
```typescript
// Use the Advanced API
const net = Advanced.createPluginNetwork("advanced-app", [
  new TimeTravelPlugin(),
  new ReactivityPlugin()
]);

const counter = Advanced.createReactiveAgent("Counter", 0);
// ...
```

### Error Handling

#### `AnnetteError`

Base class for Annette errors.

```typescript
class AnnetteError extends Error {
  constructor(message: string, details?: any);
}
```

**Example:**
```typescript
try {
  // Some Annette operation
} catch (error) {
  if (error instanceof AnnetteError) {
    console.error(`Annette error: ${error.message}`, error.details);
  } else {
    throw error;
  }
}
```

#### `ErrorReporter`

Class for reporting and handling errors.

```typescript
class ErrorReporter {
  static report(error: Error, context?: any): void;
  static setHandler(handler: (error: Error, context?: any) => void): void;
}
```

**Example:**
```typescript
// Set a custom error handler
ErrorReporter.setHandler((error, context) => {
  console.error("Annette error:", error);
  sendToErrorService(error, context);
});

// Report an error
try {
  // Some operation
} catch (error) {
  ErrorReporter.report(error, { component: "Counter" });
}
```

### Debugging Tools

#### `DebugTools`

Namespace with debugging utilities.

```typescript
namespace DebugTools {
  function enableLogging(level?: DebugLevel): void;
  function disableLogging(): void;
  function visualizeNetwork(network: INetwork): string;
  function exportNetworkState(network: INetwork): any;
  function importNetworkState(network: INetwork, state: any): void;
}
```

**Example:**
```typescript
// Enable debug logging
DebugTools.enableLogging("verbose");

// Visualize a network
const dot = DebugTools.visualizeNetwork(network);
console.log(dot); // DOT format for GraphViz

// Export network state
const state = DebugTools.exportNetworkState(network);
localStorage.setItem("network-state", JSON.stringify(state));

// Import network state
const savedState = JSON.parse(localStorage.getItem("network-state"));
DebugTools.importNetworkState(network, savedState);
```

### Performance Optimizations (Experimental)

These utilities live in `src/optimization.ts` and are best-effort performance aids.

#### `RuleIndex`


Class for optimizing rule lookups.

```typescript
class RuleIndex {
  constructor();
  
  addRule(rule: IRule): void;
  removeRule(rule: IRule): void;
  findMatchingRules(agent1: IAgent, port1: string, agent2: IAgent, port2: string): IRule[];
}
```

#### `StructuralSharing`

Namespace with utilities for structural sharing.

```typescript
namespace StructuralSharing {
  function update<T>(obj: T, path: string[], updater: (value: any) => any): T;
  function merge<T extends object>(obj: T, changes: Partial<T>): T;
  function patch<T>(obj: T, patches: Array<{ path: string[], value: any }>): T;
}
```

**Example:**
```typescript
// Update with structural sharing
const obj = { a: 1, b: { c: 2, d: 3 } };

const updated = StructuralSharing.update(
  obj, 
  ["b", "c"], 
  value => value + 1
);

console.log(updated); // { a: 1, b: { c: 3, d: 3 } }
console.log(updated !== obj); // true
console.log(updated.b !== obj.b); // true
console.log(updated.a === obj.a); // true (unchanged, shared)
```

#### `createOptimizedNetwork(name, options?)`

Creates a network with performance optimizations.

```typescript
function createOptimizedNetwork(
  network: INetwork,
  options?: {
    enableRuleIndexing?: boolean;
    enableLazyEvaluation?: boolean;
    enableStructuralSharing?: boolean;
    enableMemoryManagement?: boolean;
    enableParallelProcessing?: boolean;
    numWorkers?: number;
    workerScriptUrl?: string;
  }
): INetwork;

// Convenience wrapper
Advanced.createOptimizedNetwork(name: string, options?: AnnetteOptions): INetwork;
```

**Parameters:**
- `name`: The network name
- `options`: Performance optimization options

**Returns:** An optimized network

**Example:**
```typescript
// Create an optimized network
const net = createOptimizedNetwork(network, {
  enableRuleIndexing: true,
  enableStructuralSharing: true,
  enableMemoryManagement: true,
  enableParallelProcessing: false
});
```

**Gotchas:**
- Parallel processing requires a worker script URL and is best-effort; it is not a deterministic reduction guarantee.
- Lazy evaluation can change the observable order of reductions; do not assume stable ordering.
- These optimizations are optional; validate performance impact for your workload.
