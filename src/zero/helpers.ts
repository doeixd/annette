import type { ZeroNetwork, ZeroPort } from "./index";

export type ZeroFanout<T> = {
  input: ZeroPort<T>;
  add: ZeroPort<ZeroPort<T>>;
  remove: ZeroPort<ZeroPort<T>>;
  clear: () => void;
  size: () => number;
  targets: () => ZeroPort<T>[];
};

export type ZeroRouter<T> = {
  input: ZeroPort<T>;
  setTarget: ZeroPort<ZeroPort<T> | null>;
  getTarget: () => ZeroPort<T> | null;
};

export const createFanout = <T>(network: ZeroNetwork): ZeroFanout<T> => {
  const targets = new Set<ZeroPort<T>>();

  const input = network.createPort<T>((payload) => {
    for (const target of targets) {
      target(payload);
    }
  });

  const add = network.createPort<ZeroPort<T>>((target) => {
    targets.add(target);
  });

  const remove = network.createPort<ZeroPort<T>>((target) => {
    targets.delete(target);
  });

  const clear = () => {
    targets.clear();
  };

  const size = () => targets.size;

  const listTargets = () => Array.from(targets);

  return { input, add, remove, clear, size, targets: listTargets };
};

export const createRouter = <T>(network: ZeroNetwork): ZeroRouter<T> => {
  let current: ZeroPort<T> | null = null;

  const input = network.createPort<T>((payload) => {
    if (current) {
      current(payload);
    }
  });

  const setTarget = network.createPort<ZeroPort<T> | null>((target) => {
    current = target;
  });

  const getTarget = () => current;

  return { input, setTarget, getTarget };
};

export const connectMany = <T>(
  network: ZeroNetwork,
  source: ZeroPort<T>,
  targets: Iterable<ZeroPort<T>>
): ZeroFanout<T> => {
  const fanout = createFanout<T>(network);

  network.connect(source, fanout.input);

  for (const target of targets) {
    fanout.add(target);
  }

  return fanout;
};
