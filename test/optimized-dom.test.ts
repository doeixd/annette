import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createNetwork, createOptimizedDomSystem } from "../src";

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

describe("optimized dom system", () => {
  let originalDocument: typeof globalThis.document | undefined;

  beforeEach(() => {
    originalDocument = globalThis.document;
    globalThis.document = {
      createElement: (tag: string) => createElement(tag)
    } as unknown as Document;
  });

  afterEach(() => {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete (globalThis as { document?: Document }).document;
    }
  });

  it("patches blocks and handles selection", () => {
    const scope = createNetwork("optimized-dom-test");
    const dom = createOptimizedDomSystem(scope);

    const container = createElement("div");

    const selectionManager = dom.SelectionManager({ selectedClass: "selected" });

    const blockFactory = (item: { id: string; data: { label: string } }) => {
      const root = createElement("div");
      const label = createElement("span");
      root.appendChild(label);

      return dom.Block({
        id: item.id,
        root: root as unknown as HTMLElement,
        edits: { label: label as unknown as Node },
        selectionManager
      });
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
    const label = firstBlock?.value.edits.label as unknown as FakeElement;
    expect(label.textContent).toBe("Alpha");

    if (firstBlock) {
      dom.selectBlock(firstBlock);
      scope.reduce();
      expect((firstBlock.value.root as unknown as FakeElement).classList.contains("selected")).toBe(true);
    }

    dom.updateList(manager, [{ id: "2", data: { label: "Beta" } }]);
    expect(container.children).toHaveLength(1);
  });
});
