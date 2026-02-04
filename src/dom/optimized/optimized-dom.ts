import { ActionRule, type RuleCommand } from "../../rule";
import { Port, type IBoundPort } from "../../port";
import { Agent, type IAgent } from "../../agent";
import { type ScopedNetwork, type AgentFactory, type PortsDefinition } from "../../scoped-network";
import { type INetwork } from "../../network";

export type BlockEdits = Record<string, Node>;

export type BlockValue = {
  id: string;
  root: HTMLElement;
  edits: BlockEdits;
  selectionManager?: IAgent<"SelectionManager", SelectionManagerValue>;
};

export type UpdateValue = {
  key: string;
  value: unknown;
  type: "text" | "attr" | "class";
};

export type UpdateSpec = UpdateValue;

export type ListItem<T> = {
  id: string;
  data: T;
};

export type ListManagerValue<T> = {
  container: HTMLElement;
  blockFactory: (item: ListItem<T>) => IAgent<"Block", BlockValue>;
  activeBlocks: Map<string, IAgent<"Block", BlockValue>>;
  selectionManager?: IAgent<"SelectionManager", SelectionManagerValue>;
  getUpdates?: (item: ListItem<T>, block: IAgent<"Block", BlockValue>) => UpdateSpec[];
};

export type ListDataValue<T> = {
  items: Array<ListItem<T>>;
};

export type SelectionManagerValue = {
  selectedClass?: string;
};

export type OptimizedDomSystem = {
  Block: AgentFactory<
    "Block",
    BlockValue,
    "dom",
    {
      main: ReturnType<typeof Port.main>;
      selection: ReturnType<typeof Port.aux>;
    }
  >;
  Update: AgentFactory<"Update", UpdateValue, "dom", { main: ReturnType<typeof Port.main> }>;
  SelectIntent: AgentFactory<"SelectIntent", null, "dom", { main: ReturnType<typeof Port.main> }>;
  SelectionManager: AgentFactory<
    "SelectionManager",
    SelectionManagerValue,
    "dom",
    { active: ReturnType<typeof Port.aux> }
  >;
  ListManager: AgentFactory<
    "ListManager",
    ListManagerValue<unknown>,
    "dom",
    { main: ReturnType<typeof Port.main> }
  >;
  ListData: AgentFactory<"ListData", ListDataValue<unknown>, "dom", { main: ReturnType<typeof Port.main> }>;
  createBlockTemplate: <T>(
    templateHtml: string,
    getEdits: (root: HTMLElement, item: ListItem<T>) => BlockEdits
  ) => (item: ListItem<T>) => IAgent<"Block", BlockValue>;
  createListManager: <T>(options: ListManagerValue<T>) => IAgent<"ListManager", ListManagerValue<T>>;
  updateList: <T>(manager: IAgent<"ListManager", ListManagerValue<T>>, items: Array<ListItem<T>>) => boolean;
  applyUpdates: (block: IAgent<"Block", BlockValue>, updates: UpdateSpec[]) => void;
  selectBlock: (block: IAgent<"Block", BlockValue>) => void;
};

const getBoundPort = (agent: IAgent, portName: string, label: string): IBoundPort => {
  const port = agent.ports[portName as keyof typeof agent.ports] as IBoundPort | undefined;
  if (!port) {
    throw new Error(`${label} port "${portName}" was not found on ${agent.name}`);
  }
  return port;
};

const createTemplateAgent = <
  Name extends string,
  Value,
  Type extends string,
  P extends PortsDefinition
>(
  factory: AgentFactory<Name, Value, Type, P>
): IAgent<Name, Value, Type, P> => {
  return Agent(factory.__agentName as Name, undefined as Value, factory.__ports, factory.__type as Type) as IAgent<
    Name,
    Value,
    Type,
    P
  >;
};

const findSingleConnection = (network: INetwork, port: IBoundPort): { otherPort: IBoundPort } | null => {
  const connections = network.findConnections({ from: port }).concat(network.findConnections({ to: port }));

  if (connections.length === 0) {
    return null;
  }

  const connection = connections[0];
  const otherPort = connection.sourcePort === port ? connection.destinationPort : connection.sourcePort;

  return { otherPort };
};

/**
 * Creates a DOM optimization system with block updates, list diffing, and selection.
 */
export function createOptimizedDomSystem(scoped: ScopedNetwork): OptimizedDomSystem {
  const Block = scoped.Agent.factory<
    BlockValue,
    "Block",
    "dom",
    {
      main: ReturnType<typeof Port.main>;
      selection: ReturnType<typeof Port.aux>;
    }
  >("Block", {
    type: "dom",
    ports: {
      main: Port.main("main"),
      selection: Port.aux("selection")
    }
  });

  const Update = scoped.Agent.factory<UpdateValue, "Update", "dom", { main: ReturnType<typeof Port.main> }>("Update", {
    type: "dom",
    ports: {
      main: Port.main("main")
    }
  });

  const SelectIntent = scoped.Agent.factory<null, "SelectIntent", "dom", { main: ReturnType<typeof Port.main> }>(
    "SelectIntent",
    {
      type: "dom",
      ports: {
        main: Port.main("main")
      }
    }
  );

  const SelectionManager = scoped.Agent.factory<
    SelectionManagerValue,
    "SelectionManager",
    "dom",
    { active: ReturnType<typeof Port.aux> }
  >("SelectionManager", {
    type: "dom",
    ports: {
      active: Port.aux("active")
    }
  });

  const ListManager = scoped.Agent.factory<
    ListManagerValue<unknown>,
    "ListManager",
    "dom",
    { main: ReturnType<typeof Port.main> }
  >("ListManager", {
    type: "dom",
    ports: {
      main: Port.main("main")
    }
  });

  const ListData = scoped.Agent.factory<ListDataValue<unknown>, "ListData", "dom", { main: ReturnType<typeof Port.main> }>(
    "ListData",
    {
      type: "dom",
      ports: {
        main: Port.main("main")
      }
    }
  );

  const blockTemplate = createTemplateAgent(Block);
  const updateTemplate = createTemplateAgent(Update);
  const selectIntentTemplate = createTemplateAgent(SelectIntent);
  const listManagerTemplate = createTemplateAgent(ListManager);
  const listDataTemplate = createTemplateAgent(ListData);

  const blockMainPort = getBoundPort(blockTemplate, "main", "Block main");
  const updateMainPort = getBoundPort(updateTemplate, "main", "Update main");
  const blockSelectionPort = getBoundPort(blockTemplate, "selection", "Block selection");
  const selectIntentPort = getBoundPort(selectIntentTemplate, "main", "Select intent main");
  const listManagerPort = getBoundPort(listManagerTemplate, "main", "ListManager main");
  const listDataPort = getBoundPort(listDataTemplate, "main", "ListData main");

  const applyUpdate = (block: IAgent<"Block", BlockValue>, update: UpdateValue) => {
    const target = block.value.edits[update.key] as HTMLElement | undefined;

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

  const blockUpdateRule = ActionRule(
    blockMainPort as any,
    updateMainPort as any,
    (block: IAgent<"Block", BlockValue>, update: IAgent<"Update", UpdateValue>) => {
    applyUpdate(block, update.value);

    const commands: RuleCommand[] = [{ type: "remove", entity: update }];
    return commands;
  });

  const selectionRule = ActionRule(
    blockSelectionPort as any,
    selectIntentPort as any,
    (block: IAgent<"Block", BlockValue>, intent: IAgent<"SelectIntent", null>, network: INetwork) => {
    const manager = block.value.selectionManager;
    if (!manager) {
      return [{ type: "remove", entity: intent }];
    }

    const activePort = getBoundPort(manager, "active", "Selection active");
    const activeConnection = findSingleConnection(network, activePort);

    if (activeConnection?.otherPort.agent === block) {
      return [{ type: "remove", entity: intent }];
    }

    const selectedClass = manager.value.selectedClass ?? "selected";

    if (activeConnection) {
      const currentBlock = activeConnection.otherPort.agent as IAgent<"Block", BlockValue>;
      currentBlock.value.root.classList.remove(selectedClass);
      network.disconnectPorts(activePort, activeConnection.otherPort);
    }

    const intentPort = getBoundPort(intent, "main", "Select intent main");
    if (network.isPortConnected(block.ports.selection)) {
      network.disconnectPorts(block.ports.selection, intentPort);
    }

    block.value.root.classList.add(selectedClass);
    network.connectPorts(activePort, block.ports.selection);

    return [{ type: "remove", entity: intent }];
  });

  const listDiffRule = ActionRule(
    listManagerPort as any,
    listDataPort as any,
    (
      manager: IAgent<"ListManager", ListManagerValue<unknown>>,
      data: IAgent<"ListData", ListDataValue<unknown>>,
      network: INetwork
    ) => {
    const items = data.value.items as Array<ListItem<unknown>>;
    const activeBlocks = manager.value.activeBlocks;
    const nextIds = new Set(items.map((item) => item.id));

    for (const [id, block] of activeBlocks.entries()) {
      if (!nextIds.has(id)) {
        block.value.root.remove();
        activeBlocks.delete(id);
        network.removeAgent(block);
      }
    }

    items.forEach((item) => {
      let block = activeBlocks.get(item.id);

      if (!block) {
        block = manager.value.blockFactory(item as ListItem<any>);
        block.value.selectionManager = manager.value.selectionManager;
        activeBlocks.set(item.id, block);
        manager.value.container.appendChild(block.value.root);
      }

      const updates = manager.value.getUpdates?.(item as ListItem<any>, block) ?? [];
      updates.forEach((update: UpdateSpec) => {
        applyUpdate(block, update);
      });
    });

    return [{ type: "remove", entity: data }];
  });

  scoped.network.addRule(blockUpdateRule);
  scoped.network.addRule(selectionRule);
  scoped.network.addRule(listDiffRule);

  const createBlockTemplate = <T,>(
    templateHtml: string,
    getEdits: (root: HTMLElement, item: ListItem<T>) => BlockEdits
  ) => {
    const template = document.createElement("template");
    template.innerHTML = templateHtml.trim();

    return (item: ListItem<T>) => {
      const element = template.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
      if (!element) {
        throw new Error("Block template must include a root element");
      }

      return Block({
        id: item.id,
        root: element,
        edits: getEdits(element, item)
      });
    };
  };

  const createListManager = <T,>(options: ListManagerValue<T>) => {
    return ListManager(options as ListManagerValue<unknown>) as IAgent<"ListManager", ListManagerValue<T>>;
  };

  const applyUpdates = (block: IAgent<"Block", BlockValue>, updates: UpdateSpec[]) => {
    updates.forEach((update) => {
      applyUpdate(block, update);
    });
  };

  const updateList = <T,>(manager: IAgent<"ListManager", ListManagerValue<T>>, items: Array<ListItem<T>>) => {
    const listData = ListData({ items } as ListDataValue<unknown>);
    scoped.network.connectPorts(manager.ports.main, listData.ports.main);
    const steps = scoped.reduce();
    return steps > 0;
  };

  const selectBlock = (block: IAgent<"Block", BlockValue>) => {
    const intent = SelectIntent(null);
    scoped.network.connectPorts(block.ports.selection, intent.ports.main);
  };

  return {
    Block,
    Update,
    SelectIntent,
    SelectionManager,
    ListManager,
    ListData,
    createBlockTemplate,
    createListManager,
    updateList,
    applyUpdates,
    selectBlock
  };
}
