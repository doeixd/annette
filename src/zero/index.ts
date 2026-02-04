export type ZeroPort<T> = {
  (data: T): void;
  _id: string;
  _handler: (data: T, source?: ZeroPort<any>) => void;
  _peer: ((data: T, source?: ZeroPort<any>) => void) | null;
};

export type ZeroAgent<Name extends string, Ports> = Ports & {
  name: Name;
  __agent?: ZeroAgentInstance;
};

export type ZeroConnect = <T>(a: ZeroPort<T>, b: ZeroPort<T>) => void;

export type ZeroRootScope = {
  register: (cleanup: () => void) => void;
  dispose: () => void;
};

export type ZeroAgentInstance = {
  id: string;
  name: string;
  parent: ZeroAgentInstance | null;
  children: Set<ZeroAgentInstance>;
  ports: Set<ZeroPort<any>>;
  cleanups: Set<() => void>;
  dispose: () => void;
};

export type ZeroNetwork = {
  Agent: <Name extends string, State, Ports>(
    name: Name,
    factory: (state: State) => Ports
  ) => (state: State) => ZeroAgent<Name, Ports>;
  createPort: <T>(handler?: (data: T, source?: ZeroPort<any>) => void) => ZeroPort<T>;
  connect: ZeroConnect;
  onCleanup: (cleanup: () => void) => void;
  getCurrentAgent: () => ZeroAgentInstance | null;
  run: <T>(fn: (dispose: () => void) => T) => T;
  dispose: () => void;
  root: ZeroRootScope;
};

const createRootScope = (): ZeroRootScope => {
  const cleanups = new Set<() => void>();

  return {
    register: (cleanup) => {
      cleanups.add(cleanup);
    },
    dispose: () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
      cleanups.clear();
    }
  };
};

const createZeroNetwork = (): ZeroNetwork => {
  const root = createRootScope();
  let currentRoot: ZeroRootScope | null = null;
  let currentAgent: ZeroAgentInstance | null = null;
  let agentIdCounter = 0;
  let portIdCounter = 0;

  const createAgentInstance = (name: string): ZeroAgentInstance => {
    const cleanups = new Set<() => void>();
    const ports = new Set<ZeroPort<any>>();
    const children = new Set<ZeroAgentInstance>();
    const instance: ZeroAgentInstance = {
      id: `zero-${agentIdCounter++}`,
      name,
      parent: currentAgent,
      children,
      ports,
      cleanups,
      dispose: () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
        cleanups.clear();
        ports.clear();
        children.clear();
      }
    };

    if (currentAgent) {
      currentAgent.children.add(instance);
    }

    if (currentRoot) {
      currentRoot.register(instance.dispose);
    }

    return instance;
  };

  const createPort = <T>(
    handler: (data: T, source?: ZeroPort<any>) => void = () => {}
  ): ZeroPort<T> => {
    const port = ((data: T) => {
      if (port._peer) {
        port._peer(data, port);
      }
    }) as ZeroPort<T>;

    port._id = `zero-port-${portIdCounter++}`;
    port._handler = handler;
    port._peer = null;

    if (currentAgent) {
      currentAgent.ports.add(port);
      const cleanup = () => {
        port._peer = null;
        port._handler = () => {};
      };
      currentAgent.cleanups.add(cleanup);
    }

    return port;
  };

  const connect: ZeroConnect = (a, b) => {
    a._peer = b._handler as (data: any, source?: ZeroPort<any>) => void;
    b._peer = a._handler as (data: any, source?: ZeroPort<any>) => void;
  };

  const onCleanup = (cleanup: () => void) => {
    if (currentRoot) {
      currentRoot.register(cleanup);
    }
  };

  const getCurrentAgent = () => currentAgent;

  const run = <T>(fn: (dispose: () => void) => T) => {
    const previousRoot = currentRoot;
    currentRoot = root;

    try {
      return fn(root.dispose);
    } finally {
      currentRoot = previousRoot;
    }
  };

  const Agent = <Name extends string, State, Ports>(
    name: Name,
    factory: (state: State) => Ports
  ) => {
    return (state: State): ZeroAgent<Name, Ports> => {
      const instance = createAgentInstance(name);
      const previousAgent = currentAgent;
      currentAgent = instance;

      try {
        const ports = factory(state);
        const agent = { name, ...ports } as ZeroAgent<Name, Ports>;
        Object.defineProperty(agent, "__agent", {
          value: instance,
          enumerable: false
        });
        return agent;
      } finally {
        currentAgent = previousAgent;
      }
    };
  };

  return {
    Agent,
    createPort,
    connect,
    onCleanup,
    getCurrentAgent,
    run,
    dispose: root.dispose,
    root
  };
};

const defaultNetwork = createZeroNetwork();

export const createNetwork = () => createZeroNetwork();

export const createRoot = defaultNetwork.run;
export const onCleanup = defaultNetwork.onCleanup;
export const getCurrentAgent = defaultNetwork.getCurrentAgent;
export const createPort = defaultNetwork.createPort;
export const connect = defaultNetwork.connect;
export const Agent = defaultNetwork.Agent;

export * as middleware from "./middleware";
export * as dom from "./dom";
export * from "./helpers";
