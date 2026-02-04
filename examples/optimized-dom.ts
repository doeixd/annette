import { createNetwork, createOptimizedDomSystem } from "../src";

const scope = createNetwork("optimized-dom");
const dom = createOptimizedDomSystem(scope);

const container = document.getElementById("app") ?? document.body;

const Row = dom.createBlockTemplate<{ label: string }>(
  `<div class="row"><span class="label"></span></div>`,
  (root) => ({
    label: root.querySelector(".label") as HTMLElement
  })
);

const selectionManager = dom.SelectionManager({ selectedClass: "selected" });

const listManager = dom.createListManager({
  container,
  blockFactory: Row,
  activeBlocks: new Map(),
  selectionManager,
  getUpdates: (item) => [{ key: "label", value: item.data.label, type: "text" }]
});

dom.updateList(listManager, [
  { id: "1", data: { label: "Buy Milk" } },
  { id: "2", data: { label: "Walk Dog" } }
]);

const row1 = listManager.value.activeBlocks.get("1");
if (row1) {
  dom.selectBlock(row1);
  scope.reduce();
}
