import type { ZeroPort, ZeroConnect, ZeroAgent } from "./index";

export type ZeroRecorderEvent<T = unknown> = {
  ts: number;
  from: string;
  to: string;
  data: T;
};

export type ZeroRecorder = {
  tape: ZeroRecorderEvent[];
  connect: ZeroConnect;
  replay: (resolvePort: (id: string) => ZeroPort<any> | undefined) => void;
  reset: () => void;
};

export type ZeroSyncSocket = {
  send: (payload: string) => void;
  addEventListener: (event: "message", handler: (event: { data: string }) => void) => void;
  removeEventListener?: (event: "message", handler: (event: { data: string }) => void) => void;
};

export type ZeroSyncLayer = {
  connectRemote: <T>(port: ZeroPort<T>, topic: string) => () => void;
};

export type ZeroSerializerSnapshot = Record<string, unknown>;

export type ZeroSerializablePort = ZeroPort<any> & {
  __serialize?: () => { id: string; value: unknown };
};

export type ZeroSerializer = {
  trackPort: (port: ZeroSerializablePort) => void;
  trackAgent: (agent: ZeroAgent<string, Record<string, unknown>>) => void;
  snapshot: () => ZeroSerializerSnapshot;
  reset: () => void;
};

export type ZeroDebugEvent = {
  label?: string;
  from: string;
  to: string;
  data: unknown;
};

export const createRecorder = (): ZeroRecorder => {
  const tape: ZeroRecorderEvent[] = [];
  let isReplaying = false;

  const connect: ZeroConnect = (a, b) => {
    const aHandler = a._handler;
    const bHandler = b._handler;

    a._peer = (data) => {
      if (!isReplaying) {
        tape.push({ ts: Date.now(), from: a._id, to: b._id, data });
      }
      bHandler(data, a);
    };

    b._peer = (data) => {
      if (!isReplaying) {
        tape.push({ ts: Date.now(), from: b._id, to: a._id, data });
      }
      aHandler(data, b);
    };
  };

  const replay = (resolvePort: (id: string) => ZeroPort<any> | undefined) => {
    isReplaying = true;

    try {
      for (const event of tape) {
        const port = resolvePort(event.to);
        if (port) {
          port._handler(event.data);
        }
      }
    } finally {
      isReplaying = false;
    }
  };

  const reset = () => {
    tape.length = 0;
  };

  return { tape, connect, replay, reset };
};

export const createSyncLayer = (socket: ZeroSyncSocket): ZeroSyncLayer => {
  const connectRemote = <T>(port: ZeroPort<T>, topic: string) => {
    const handler = (event: { data: string }) => {
      const message = JSON.parse(event.data) as { topic: string; payload: T };
      if (message.topic === topic) {
        port._handler(message.payload);
      }
    };

    socket.addEventListener("message", handler);

    port._peer = (data) => {
      socket.send(JSON.stringify({ topic, payload: data }));
    };

    return () => {
      socket.removeEventListener?.("message", handler);
      port._peer = null;
    };
  };

  return { connectRemote };
};

export const createSerializer = (): ZeroSerializer => {
  const tracked = new Set<ZeroSerializablePort>();

  const trackPort = (port: ZeroSerializablePort) => {
    if (port.__serialize) {
      tracked.add(port);
    }
  };

  const trackAgent = (agent: ZeroAgent<string, Record<string, unknown>>) => {
    for (const value of Object.values(agent)) {
      const port = value as ZeroSerializablePort;
      if (port && typeof port === "function") {
        trackPort(port);
      }
    }
  };

  const snapshot = (): ZeroSerializerSnapshot => {
    const state: ZeroSerializerSnapshot = {};
    for (const port of tracked) {
      if (port.__serialize) {
        const data = port.__serialize();
        state[data.id] = data.value;
      }
    }
    return state;
  };

  const reset = () => {
    tracked.clear();
  };

  return { trackPort, trackAgent, snapshot, reset };
};

export const connectDebug = <T>(
  a: ZeroPort<T>,
  b: ZeroPort<T>,
  emit: (event: ZeroDebugEvent) => void,
  label?: string
): void => {
  const aHandler = a._handler;
  const bHandler = b._handler;

  a._peer = (data) => {
    emit({ label, from: a._id, to: b._id, data });
    bHandler(data, a);
  };

  b._peer = (data) => {
    emit({ label, from: b._id, to: a._id, data });
    aHandler(data, b);
  };
};
