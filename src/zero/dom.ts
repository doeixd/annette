import type { ZeroAgent, ZeroNetwork, ZeroPort } from "./index";

export type ZeroGraphTemplate = {
  tag: string;
  attrs?: Record<string, unknown>;
  children?: ZeroGraphTemplate[];
  text?: string;
};

export type ZeroDomElement = ZeroAgent<
  "Element",
  {
    tagName: string;
    ref: HTMLElement | null;
    parent: ZeroPort<ZeroDomNode>;
    firstChild: ZeroPort<ZeroDomNode>;
    attrs: ZeroPort<ZeroDomAttribute>;
  }
>;

export type ZeroDomText = ZeroAgent<
  "TextNode",
  {
    content: string;
    ref: Text | null;
    parent: ZeroPort<ZeroDomNode>;
  }
>;

export type ZeroDomAttribute = ZeroAgent<
  "Attribute",
  {
    key: string;
    value: string;
    attrs: ZeroPort<ZeroDomAttribute>;
  }
>;

export type ZeroDomNode = ZeroDomElement | ZeroDomText;

export type ZeroBlockEdits = Record<string, Node>;

export type ZeroBlockValue = {
  id: string;
  root: HTMLElement;
  edits: ZeroBlockEdits;
};

export type ZeroBlock = ZeroAgent<
  "Block",
  {
    id: string;
    root: HTMLElement;
    edits: ZeroBlockEdits;
    update: ZeroPort<ZeroUpdateSpec>;
  }
>;

export type ZeroUpdateSpec = {
  key: string;
  value: unknown;
  type: "text" | "attr" | "class";
};

export type ZeroListItem<T> = {
  id: string;
  data: T;
};

export type ZeroKey = string | number;

export type ZeroKeyed<T> = {
  key: ZeroKey;
  value: T;
};

export type ZeroListOp<T> =
  | { type: "set"; items: Array<ZeroKeyed<T>> }
  | { type: "upsert"; item: ZeroKeyed<T> }
  | { type: "remove"; key: ZeroKey }
  | { type: "clear" };

export type ZeroRowInstance<T> = {
  key: ZeroKey;
  node: Node;
  update: ZeroPort<T>;
  dispose?: () => void;
};

export type ZeroRowFactory<T> = (item: ZeroKeyed<T>) => ZeroRowInstance<T>;

export type ZeroListRenderer<T> = {
  container: HTMLElement;
  ops: ZeroPort<ZeroListOp<T>>;
  dispose: () => void;
};

export type ZeroSelectionManager = ZeroAgent<
  "SelectionManager",
  {
    selectedClass?: string;
    select: ZeroPort<ZeroBlock>;
  }
>;

export type ZeroListManagerValue<T> = {
  container: HTMLElement;
  blockFactory: (item: ZeroListItem<T>) => ZeroBlock;
  activeBlocks: Map<string, ZeroBlock>;
  selectionManager?: ZeroSelectionManager;
  getUpdates?: (item: ZeroListItem<T>, block: ZeroBlock) => ZeroUpdateSpec[];
};

export type ZeroListManager<T> = ZeroAgent<
  "ListManager",
  {
    value: ZeroListManagerValue<T>;
    update: ZeroPort<Array<ZeroListItem<T>>>;
  }
>;

export type ZeroDomSystem = {
  renderToGraph: (template: ZeroGraphTemplate, parent?: ZeroDomElement | null) => ZeroDomNode;
  createBlockTemplate: <T>(
    templateHtml: string,
    getEdits: (root: HTMLElement, item: ZeroListItem<T>) => ZeroBlockEdits
  ) => (item: ZeroListItem<T>) => ZeroBlock;
  createSelectionManager: (selectedClass?: string) => ZeroSelectionManager;
  selectBlock: (manager: ZeroSelectionManager, block: ZeroBlock) => void;
  createListManager: <T>(options: ZeroListManagerValue<T>) => ZeroListManager<T>;
  updateList: <T>(manager: ZeroListManager<T>, items: Array<ZeroListItem<T>>) => void;
  createListRenderer: <T>(container: HTMLElement, makeRow: ZeroRowFactory<T>) => ZeroListRenderer<T>;
  applyUpdates: (block: ZeroBlock, updates: ZeroUpdateSpec[]) => void;
};

const applyUpdateToEdits = (edits: ZeroBlockEdits, update: ZeroUpdateSpec) => {
  const target = edits[update.key] as HTMLElement | undefined;

  if (!target) {
    return;
  }

  if (update.type === "text") {
    target.textContent = String(update.value ?? "");
  } else if (update.type === "attr") {
    target.setAttribute(update.key, String(update.value ?? ""));
  } else if (update.type === "class") {
    if (typeof update.value === "boolean") {
      target.classList.toggle(update.key, update.value);
    } else if (typeof update.value === "string") {
      target.className = update.value;
    }
  }
};

const applyUpdate = (block: ZeroBlock, update: ZeroUpdateSpec) => {
  applyUpdateToEdits(block.edits, update);
};

const detachNode = (node: Node) => {
  const removable = node as Node & { remove?: () => void };
  if (typeof removable.remove === "function") {
    removable.remove();
    return;
  }

  if (node.parentNode) {
    node.parentNode.removeChild(node);
  }
};

export const createDomSystem = (network: ZeroNetwork): ZeroDomSystem => {
  const Element = network.Agent("Element", (state: { tagName: string; ref: HTMLElement | null }) => {
    const parent = network.createPort<ZeroDomNode>();
    const firstChild = network.createPort<ZeroDomNode>();
    const attrs = network.createPort<ZeroDomAttribute>();
    return { ...state, parent, firstChild, attrs };
  });

  const TextNode = network.Agent("TextNode", (state: { content: string; ref: Text | null }) => {
    const parent = network.createPort<ZeroDomNode>();
    return { ...state, parent };
  });

  const Attribute = network.Agent("Attribute", (state: { key: string; value: string }) => {
    const attrs = network.createPort<ZeroDomAttribute>();
    return { ...state, attrs };
  });

  const Block = network.Agent("Block", (state: ZeroBlockValue) => {
    const update = network.createPort<ZeroUpdateSpec>((patch) => {
      applyUpdateToEdits(state.edits, patch);
    });
    return { ...state, update };
  });

  const renderToGraph = (template: ZeroGraphTemplate, parent: ZeroDomElement | null = null): ZeroDomNode => {
    let current: ZeroDomNode;

    if (template.tag === "text") {
      const content = template.text ?? "";
      current = TextNode({ content, ref: document.createTextNode(content) });
    } else {
      current = Element({ tagName: template.tag, ref: document.createElement(template.tag) });
    }

    if (parent) {
      network.connect(parent.firstChild, current.parent);

      if (parent.ref && current.ref) {
        parent.ref.appendChild(current.ref);
      }
    }

    if (template.attrs && current.name === "Element") {
      Object.entries(template.attrs).forEach(([key, value]) => {
        const attr = Attribute({ key, value: String(value) });
        network.connect(current.attrs, attr.attrs);
      });
    }

    if (template.children && current.name === "Element") {
      template.children.forEach((child) => {
        renderToGraph(child, current);
      });
    }

    return current;
  };

  const createBlockTemplate = <T,>(
    templateHtml: string,
    getEdits: (root: HTMLElement, item: ZeroListItem<T>) => ZeroBlockEdits
  ) => {
    const template = document.createElement("template");
    template.innerHTML = templateHtml.trim();

    return (item: ZeroListItem<T>): ZeroBlock => {
      const root = template.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
      if (!root) {
        throw new Error("Block template must include a root element");
      }

      return Block({ id: item.id, root, edits: getEdits(root, item) });
    };
  };

  const createSelectionManager = (selectedClass?: string): ZeroSelectionManager => {
    const manager = network.Agent("SelectionManager", (state: { selectedClass?: string }) => {
      let current: ZeroBlock | null = null;
      const select = network.createPort<ZeroBlock>((block) => {
        if (current && current !== block) {
          current.root.classList.remove(state.selectedClass ?? "selected");
        }

        if (current !== block) {
          block.root.classList.add(state.selectedClass ?? "selected");
          current = block;
        }
      });

      return { ...state, select };
    });

    return manager({ selectedClass });
  };

  const selectBlock = (manager: ZeroSelectionManager, block: ZeroBlock) => {
    manager.select(block);
  };

  const createListManager = <T,>(options: ZeroListManagerValue<T>): ZeroListManager<T> => {
    const manager = network.Agent("ListManager", (state: ZeroListManagerValue<T>) => {
      const update = network.createPort<Array<ZeroListItem<T>>>((items) => {
        const active = state.activeBlocks;
        const nextIds = new Set(items.map((item) => item.id));

        for (const [id, block] of active.entries()) {
          if (!nextIds.has(id)) {
            block.root.remove();
            active.delete(id);
          }
        }

        items.forEach((item) => {
          let block = active.get(item.id);
          if (!block) {
            block = state.blockFactory(item);
            active.set(item.id, block);
            state.container.appendChild(block.root);
          }

          const updates = state.getUpdates?.(item, block) ?? [];
          updates.forEach((patch) => applyUpdate(block, patch));
        });
      });

      return { value: state, update };
    });

    return manager(options);
  };

  const updateList = <T,>(manager: ZeroListManager<T>, items: Array<ZeroListItem<T>>) => {
    manager.update(items);
  };

  const createListRenderer = <T,>(container: HTMLElement, makeRow: ZeroRowFactory<T>): ZeroListRenderer<T> => {
    const byKey = new Map<ZeroKey, ZeroRowInstance<T>>();
    const order: ZeroKey[] = [];

    const mountRow = (item: ZeroKeyed<T>) => {
      const row = makeRow(item);
      byKey.set(item.key, row);
      order.push(item.key);
      container.appendChild(row.node);
    };

    const removeRow = (key: ZeroKey) => {
      const row = byKey.get(key);
      if (!row) return;

      byKey.delete(key);
      const idx = order.indexOf(key);
      if (idx >= 0) order.splice(idx, 1);

      detachNode(row.node);
      row.dispose?.();
    };

    const clearAll = () => {
      while (order.length > 0) {
        removeRow(order[order.length - 1]!);
      }
    };

    const setAll = (items: Array<ZeroKeyed<T>>) => {
      clearAll();
      for (let i = 0; i < items.length; i++) {
        mountRow(items[i]!);
      }
    };

    const upsertOne = (item: ZeroKeyed<T>) => {
      const existing = byKey.get(item.key);
      if (!existing) {
        mountRow(item);
        return;
      }

      existing.update(item.value);
    };

    const ops = network.createPort<ZeroListOp<T>>((op) => {
      switch (op.type) {
        case "set":
          setAll(op.items);
          break;
        case "upsert":
          upsertOne(op.item);
          break;
        case "remove":
          removeRow(op.key);
          break;
        case "clear":
          clearAll();
          break;
      }
    });

    const dispose = () => {
      clearAll();
    };

    network.onCleanup(dispose);

    return { container, ops, dispose };
  };

  const applyUpdates = (block: ZeroBlock, updates: ZeroUpdateSpec[]) => {
    updates.forEach((patch) => applyUpdate(block, patch));
  };

  return {
    renderToGraph,
    createBlockTemplate,
    createSelectionManager,
    selectBlock,
    createListManager,
    updateList,
    createListRenderer,
    applyUpdates
  };
};
