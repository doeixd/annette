import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Network, renderToGraph } from "../src";

type FakeNode = {
  nodeType: "element" | "text";
  tagName?: string;
  textContent?: string;
  children: FakeNode[];
  appendChild: (child: FakeNode) => void;
};

const createFakeNode = (data: Omit<FakeNode, "children" | "appendChild">): FakeNode => {
  const node: FakeNode = {
    ...data,
    children: [],
    appendChild(child: FakeNode) {
      this.children.push(child);
    },
  };

  return node;
};

const createFakeDocument = () => ({
  createElement: (tagName: string) => createFakeNode({ nodeType: "element", tagName }),
  createTextNode: (textContent: string) => createFakeNode({ nodeType: "text", textContent }),
});

describe("renderToGraph", () => {
  let originalDocument: typeof globalThis.document | undefined;

  beforeEach(() => {
    originalDocument = globalThis.document;
    globalThis.document = createFakeDocument() as unknown as Document;
  });

  afterEach(() => {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete (globalThis as { document?: Document }).document;
    }
  });

  it("creates agents and DOM nodes", () => {
    const network = Network("dom-graph");
    const template = {
      tag: "div",
      attrs: { id: "root" },
      children: [
        {
          tag: "span",
          attrs: { class: "label" },
          children: [{ tag: "text", text: "Hello" }],
        },
      ],
    };

    const rootAgent = renderToGraph(network, template);
    const rootRef = rootAgent.value.ref as unknown as FakeNode;

    expect(rootAgent.name).toBe("Element");
    expect(network.getAllAgents()).toHaveLength(5);
    expect(network.getAllConnections()).toHaveLength(4);
    expect(rootRef.children).toHaveLength(1);
    expect(rootRef.children[0].children).toHaveLength(1);
    expect(rootRef.children[0].children[0].textContent).toBe("Hello");
  });
});
