import { zero } from "../../src";

type Row = {
  id: string;
  label: string;
};

type BenchmarkDomApi = {
  run: (count?: number) => void;
  add: (count?: number) => void;
  update: () => void;
  swapRows: () => void;
  clear: () => void;
  select: (id: string) => void;
  remove: (id: string) => void;
};

const zeroNetwork = zero.createNetwork();
const dom = zero.dom.createDomSystem(zeroNetwork);

let rows: Array<zero.dom.ZeroListItem<Row>> = [];
let listManager: zero.dom.ZeroListManager<Row> | null = null;
let selectionManager: zero.dom.ZeroSelectionManager | null = null;

const buildData = (count: number): Array<zero.dom.ZeroListItem<Row>> => {
  const data: Array<zero.dom.ZeroListItem<Row>> = [];
  for (let index = 0; index < count; index += 1) {
    const id = `${rows.length + index + 1}`;
    data.push({ id, data: { id, label: `Item ${rows.length + index + 1}` } });
  }
  return data;
};

zeroNetwork.run(() => {
  const container = document.getElementById("main") ?? document.body;

  const RowBlock = dom.createBlockTemplate<Row>(
    `<tr class="row"><td class="col-id"></td><td class="col-label"></td></tr>`,
    (root, item) => ({
      id: root.querySelector(".col-id") as HTMLElement,
      label: root.querySelector(".col-label") as HTMLElement
    })
  );

  selectionManager = dom.createSelectionManager("selected");

  listManager = dom.createListManager({
    container,
    blockFactory: RowBlock,
    activeBlocks: new Map(),
    selectionManager,
    getUpdates: (item) => [
      { key: "id", value: item.data.id, type: "text" },
      { key: "label", value: item.data.label, type: "text" }
    ]
  });
});

const render = () => {
  if (listManager) {
    dom.updateList(listManager, rows);
  }
};

const api: BenchmarkDomApi = {
  run: (count = 1000) => {
    rows = buildData(count);
    render();
  },
  add: (count = 1000) => {
    rows = rows.concat(buildData(count));
    render();
  },
  update: () => {
    rows = rows.map((row, index) =>
      index % 10 === 0
        ? { ...row, data: { ...row.data, label: `${row.data.label} !!!` } }
        : row
    );
    render();
  },
  swapRows: () => {
    if (rows.length > 998) {
      const next = rows.slice();
      const temp = next[1];
      next[1] = next[998];
      next[998] = temp;
      rows = next;
      render();
    }
  },
  clear: () => {
    rows = [];
    render();
  },
  select: (id: string) => {
    if (selectionManager && listManager) {
      const block = listManager.value.activeBlocks.get(id);
      if (block) {
        dom.selectBlock(selectionManager, block);
      }
    }
  },
  remove: (id: string) => {
    rows = rows.filter((row) => row.id !== id);
    render();
  }
};

export { api as benchmark };

if (typeof window !== "undefined") {
  (window as { benchmarkDom?: BenchmarkDomApi }).benchmarkDom = api;
}
