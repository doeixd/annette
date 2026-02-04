import { zero } from "../src";

const zeroNetwork = zero.createNetwork();
const dom = zero.dom.createDomSystem(zeroNetwork);

zeroNetwork.run(() => {
  const container = document.getElementById("app") ?? document.body;

  const Row = dom.createBlockTemplate<{ label: string }>(
    `<div class="row"><span class="label"></span></div>`,
    (root) => ({
      label: root.querySelector(".label") as HTMLElement
    })
  );

  const selectionManager = dom.createSelectionManager("selected");

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
    dom.selectBlock(selectionManager, row1);
  }
});
