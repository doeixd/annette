import { zero } from "../../src";

type Row = {
  id: string;
  label: string;
};

type BenchmarkApi = {
  run: (count?: number) => void;
  add: (count?: number) => void;
  update: () => void;
  swapRows: () => void;
  clear: () => void;
  select: (id: string) => void;
  remove: (id: string) => void;
  getRows: () => Row[];
};

const zeroNetwork = zero.createNetwork();
let rows: Row[] = [];
let selectedId: string | null = null;

const buildData = (count: number): Row[] => {
  const data: Row[] = [];
  for (let index = 0; index < count; index += 1) {
    data.push({ id: `${rows.length + index + 1}`, label: `Item ${rows.length + index + 1}` });
  }
  return data;
};

const Store = zeroNetwork.Agent("Store", (initial: Row[]) => {
  let value = initial;
  const update = zeroNetwork.createPort<Row[]>((next) => {
    value = next;
  });
  const read = () => value;
  return { update, read };
});

const Selection = zeroNetwork.Agent("Selection", (initial: string | null) => {
  let current = initial;
  const select = zeroNetwork.createPort<string | null>((next) => {
    current = next;
  });
  const read = () => current;
  return { select, read };
});

let store: ReturnType<typeof Store> | null = null;
let selection: ReturnType<typeof Selection> | null = null;

zeroNetwork.run(() => {
  store = Store([]);
  selection = Selection(null);
});

const api: BenchmarkApi = {
  run: (count = 1000) => {
    rows = buildData(count);
    store?.update(rows);
  },
  add: (count = 1000) => {
    rows = rows.concat(buildData(count));
    store?.update(rows);
  },
  update: () => {
    rows = rows.map((row, index) =>
      index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row
    );
    store?.update(rows);
  },
  swapRows: () => {
    if (rows.length > 998) {
      const next = rows.slice();
      const temp = next[1];
      next[1] = next[998];
      next[998] = temp;
      rows = next;
      store?.update(rows);
    }
  },
  clear: () => {
    rows = [];
    store?.update(rows);
  },
  select: (id: string) => {
    selectedId = id;
    selection?.select(id);
  },
  remove: (id: string) => {
    rows = rows.filter((row) => row.id !== id);
    store?.update(rows);
  },
  getRows: () => rows
};

export { api as benchmark };

if (typeof window !== "undefined") {
  (window as { benchmark?: BenchmarkApi }).benchmark = api;
}
