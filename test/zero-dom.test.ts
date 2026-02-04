import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { zero } from "../src";

type FakeClassList = {
  add: (name: string) => void;
  remove: (name: string) => void;
  toggle: (name: string, enabled?: boolean) => void;
  contains: (name: string) => boolean;
};

type FakeElement = {
  tagName: string;
  textContent: string | null;
  parent: FakeElement | null;
  children: FakeElement[];
  classList: FakeClassList;
  appendChild: (child: FakeElement) => void;
  remove: () => void;
  setAttribute: (name: string, value: string) => void;
};

const createClassList = (): { list: Set<string> } & FakeClassList => {
  const list = new Set<string>();
  return {
    list,
    add: (name: string) => list.add(name),
    remove: (name: string) => list.delete(name),
    toggle: (name: string, enabled?: boolean) => {
      if (enabled === undefined) {
        if (list.has(name)) {
          list.delete(name);
        } else {
          list.add(name);
        }
      } else if (enabled) {
        list.add(name);
      } else {
        list.delete(name);
      }
    },
    contains: (name: string) => list.has(name)
  };
};

const createElement = (tagName: string): FakeElement => {
  const classList = createClassList();
  const element: FakeElement = {
    tagName,
    textContent: null,
    parent: null,
    children: [],
    classList,
    appendChild(child) {
      child.parent = element;
      element.children.push(child);
    },
    remove() {
      if (!element.parent) return;
      const index = element.parent.children.indexOf(element);
      if (index >= 0) {
        element.parent.children.splice(index, 1);
      }
      element.parent = null;
    },
    setAttribute(name: string, value: string) {
      if (name === "class") {
        value.split(" ").forEach((cls) => classList.add(cls));
      }
    }
  };

  return element;
};

describe("zero dom system", () => {
  let originalDocument: typeof globalThis.document | undefined;

  beforeEach(() => {
    originalDocument = globalThis.document;
    globalThis.document = {
      createElement: (tag: string) => createElement(tag),
      createTextNode: (text: string) => ({ textContent: text })
    } as unknown as Document;
  });

  afterEach(() => {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete (globalThis as { document?: Document }).document;
    }
  });

  it("updates blocks and selections", () => {
    const zeroNetwork = zero.createNetwork();
    const dom = zero.dom.createDomSystem(zeroNetwork);

    const container = createElement("div");

    zeroNetwork.run(() => {
      const selectionManager = dom.createSelectionManager("selected");

      const blockFactory = (item: { id: string; data: { label: string } }) => {
        const root = createElement("div");
        const label = createElement("span");
        root.appendChild(label);

        return zeroNetwork.Agent("Block", (_state: void) => {
          const update = zeroNetwork.createPort<zero.dom.ZeroUpdateSpec>((patch) => {
            if (patch.key === "label") {
              label.textContent = String(patch.value ?? "");
            }
          });

          return {
            id: item.id,
            root: root as unknown as HTMLElement,
            edits: { label: label as unknown as Node },
            update
          };
        })(undefined);
      };

      const manager = dom.createListManager({
        container: container as unknown as HTMLElement,
        blockFactory,
        activeBlocks: new Map(),
        selectionManager,
        getUpdates: (item) => [{ key: "label", value: item.data.label, type: "text" }]
      });

      dom.updateList(manager, [
        { id: "1", data: { label: "Alpha" } },
        { id: "2", data: { label: "Beta" } }
      ]);

      expect(container.children).toHaveLength(2);
      const firstBlock = manager.value.activeBlocks.get("1");
      const label = firstBlock?.edits.label as unknown as FakeElement;
      expect(label.textContent).toBe("Alpha");

      if (firstBlock) {
        dom.selectBlock(selectionManager, firstBlock);
        expect((firstBlock.root as unknown as FakeElement).classList.contains("selected")).toBe(true);
      }
    });
  });

  it("renders keyed list ops", () => {
    const zeroNetwork = zero.createNetwork();
    const dom = zero.dom.createDomSystem(zeroNetwork);
    const container = createElement("div");

    zeroNetwork.run(() => {
      const labels = new Map<string, FakeElement>();
      const renderer = dom.createListRenderer<{ label: string }>(
        container as unknown as HTMLElement,
        (item) => {
        const root = createElement("div");
        const label = createElement("span");
        root.appendChild(label);
        labels.set(String(item.key), label);
        label.textContent = String(item.value.label ?? "");

        const update = zeroNetwork.createPort<{ label: string }>((value) => {
          label.textContent = String(value.label ?? "");
        });

        return {
          key: item.key,
          node: root as unknown as Node,
          update,
          dispose: () => {
            labels.delete(String(item.key));
          }
        };
        }
      );

      renderer.ops({
        type: "set",
        items: [
          { key: "1", value: { label: "Alpha" } },
          { key: "2", value: { label: "Beta" } }
        ]
      });

      expect(container.children).toHaveLength(2);
      expect(labels.get("1")?.textContent).toBe("Alpha");

      renderer.ops({ type: "upsert", item: { key: "1", value: { label: "Gamma" } } });
      expect(labels.get("1")?.textContent).toBe("Gamma");

      renderer.ops({ type: "remove", key: "2" });
      expect(container.children).toHaveLength(1);
      expect(labels.has("2")).toBe(false);

      renderer.ops({ type: "clear" });
      expect(container.children).toHaveLength(0);
    });
  });
});
