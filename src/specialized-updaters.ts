/**
 * Specialized Updaters for Complex Data Structures
 */
import { Agent, IAgent, AgentName } from "./agent";
import { INetwork } from "./network";
import { Port } from "./port";
import { ActionRule, IActionRule } from "./rule";
import { UpdateOperation, Updater, UpdaterValue, Updates, applyUpdate } from "./updater";

// ========== Type Definitions ==========

export type DataType = 'map' | 'list' | 'text' | 'counter';

export interface SpecializedUpdaterValue<TValue = any, TOpType = any> extends UpdaterValue<TValue> {
  dataType: DataType;
  operationType: TOpType;
  vectorClock?: Record<string, number>;
  crdtMetadata?: any;
  metadata?: Record<string, any>;
}

export interface MapOperationDescriptor<V = any> {
  type: 'set' | 'delete' | 'merge';
  key: string; // Key for 'set' and 'delete'
  value?: V | Partial<Record<string, V>>; // Value for 'set' (type V), or object for 'merge' (type Partial<Record<string,V>>)
}

export interface ListOperationDescriptor<T = any> {
  type: 'insert' | 'delete' | 'set' | 'push' | 'pop';
  index?: number;
  value?: T | T[];
}

export interface TextOperationDescriptor {
  type: 'insert' | 'delete' | 'replace' | 'set';
  position: number;
  text?: string;
  length?: number;
}

export interface CounterOperationDescriptor {
  type: 'increment' | 'decrement' | 'set';
  value: number;
}

// ========== Specialized Updater Agent Factories ==========
export function MapUpdater<V = any>(
  descriptor: MapOperationDescriptor<V>,
  targetPath: string[] = [], // Path to the map object itself
  metadata?: Record<string, any>
): IAgent<"Updater", SpecializedUpdaterValue<Record<string, V>, MapOperationDescriptor['type']>> {
  let operationForAgent: UpdateOperation<Record<string, V>>;
  // pathForApplyUpdate will be the targetPath for custom/merge, or targetPath + key for generic set/delete if used.
  // Since we use custom for set/delete to make operation be UpdateOperation<Record<string,V>>,
  // pathForApplyUpdate will always be targetPath.
  const pathForApplyUpdate = [...targetPath];

  switch (descriptor.type) {
    case 'set':
      if (descriptor.value === undefined) throw new Error("Map 'set' operation requires a value.");
      operationForAgent = Updates.custom<Record<string, V>>((currentMap) => {
        const mapToUpdate = (typeof currentMap === 'object' && currentMap !== null) ? currentMap : {};
        return {
          ...(mapToUpdate as Record<string, V>),
          [descriptor.key]: descriptor.value as V, // Value is of type V
        };
      });
      break;
    case 'delete':
      operationForAgent = Updates.custom<Record<string, V>>((currentMap) => {
        if (typeof currentMap !== 'object' || currentMap === null) return currentMap; // Or return {}
        const { [descriptor.key]: _, ...rest } = currentMap as Record<string, V>;
        return rest as Record<string, V>;
      });
      break;
    case 'merge':
      if (descriptor.value === undefined || typeof descriptor.value !== 'object') throw new Error("Map 'merge' operation requires an object value.");
      operationForAgent = Updates.merge(descriptor.value as Partial<Record<string, V>>);
      break;
    default:
      const exhaustiveCheckSet: never = descriptor.type;
      throw new Error(`Unknown map operation type: ${exhaustiveCheckSet}`);
  }

  const agentValue: SpecializedUpdaterValue<Record<string, V>, MapOperationDescriptor['type']> = {
    targetPath: pathForApplyUpdate,
    operation: operationForAgent,
    timestamp: Date.now(),
    source: metadata?.source,
    dataType: 'map',
    operationType: descriptor.type,
    metadata,
  };

  return Agent("Updater", agentValue, { main: Port("main", "main") });
}

export function ListUpdater<T = any>(
  descriptor: ListOperationDescriptor<T>,
  targetPath: string[] = [],
  metadata?: Record<string, any>
): IAgent<"Updater", SpecializedUpdaterValue<T[], ListOperationDescriptor['type']>> {
  let updateOperation: UpdateOperation<T[]>;

  switch (descriptor.type) {
    case 'insert':
      if (descriptor.index === undefined || descriptor.value === undefined) throw new Error("List 'insert' operation requires index and value.");
      // Updates.insert's value generic should be T (type of item), not T[] (type of list)
      updateOperation = Updates.insert(descriptor.index, descriptor.value as T) as UpdateOperation<T[]>; // Cast needed if Updates.insert returns UpdateOperation<T>
      // A better Updates.insert would return an UpdateOperation<T[]> directly
      // For now, let's use custom to be explicit about T[]
      updateOperation = Updates.custom<T[]>((list: T[]) => {
        if (!Array.isArray(list)) return [];
        const newList = [...list];
        newList.splice(descriptor.index!, 0, descriptor.value as T);
        return newList;
      });
      break;
    case 'delete':
      if (descriptor.index === undefined) throw new Error("List 'delete' operation requires index.");
      updateOperation = Updates.custom<T[]>((list: T[]) => {
        if (!Array.isArray(list)) return list;
        const newList = [...list];
        if (descriptor.index! >= 0 && descriptor.index! < newList.length) {
          newList.splice(descriptor.index!, 1);
        }
        return newList;
      });
      break;
    case 'set':
      if (descriptor.index === undefined || descriptor.value === undefined) throw new Error("List 'set' operation requires index and value.");
      updateOperation = Updates.custom<T[]>((list: T[]) => {
        if (!Array.isArray(list)) return list;
        const newList = [...list];
        if (descriptor.index! >= 0 && descriptor.index! < newList.length) {
          newList[descriptor.index!] = descriptor.value as T;
        }
        return newList;
      });
      break;
    case 'push':
      if (descriptor.value === undefined) throw new Error("List 'push' operation requires value.");
      updateOperation = Updates.custom<T[]>((list: T[]) => {
        if (!Array.isArray(list)) return [];
        const valuesToPush = Array.isArray(descriptor.value) ? descriptor.value : [descriptor.value as T];
        return [...list, ...valuesToPush];
      });
      break;
    case 'pop':
      updateOperation = Updates.custom<T[]>((list: T[]) => {
        if (!Array.isArray(list) || list.length === 0) return list;
        const newList = [...list];
        newList.pop();
        return newList;
      });
      break;
    default:
      const exhaustiveCheckList: never = descriptor.type;
      throw new Error(`Unknown list operation type: ${exhaustiveCheckList}`);
  }
  const agentValue: SpecializedUpdaterValue<T[], ListOperationDescriptor['type']> = {
    targetPath: targetPath,
    operation: updateOperation,
    timestamp: Date.now(),
    source: metadata?.source,
    dataType: 'list',
    operationType: descriptor.type,
    metadata,
  };
  return Agent("Updater", agentValue, { main: Port("main", "main") });
}

export function TextUpdater(
  descriptor: TextOperationDescriptor,
  targetPath: string[] = [],
  metadata?: Record<string, any>
): IAgent<"Updater", SpecializedUpdaterValue<string, TextOperationDescriptor['type']>> {
  let updateOperation: UpdateOperation<string>;
  const pos = descriptor.position;

  switch (descriptor.type) {
    case 'insert':
      if (descriptor.text === undefined) throw new Error("Text 'insert' operation requires text.");
      updateOperation = Updates.custom<string>((currentText: string) => {
        if (typeof currentText !== 'string') return "";
        return currentText.substring(0, pos) + descriptor.text + currentText.substring(pos);
      });
      break;
    case 'delete':
      const len = descriptor.length === undefined ? 1 : descriptor.length;
      if (len < 0) throw new Error("Text 'delete' operation length cannot be negative.");
      updateOperation = Updates.custom<string>((currentText: string) => {
        if (typeof currentText !== 'string') return "";
        return currentText.substring(0, pos) + currentText.substring(pos + len);
      });
      break;
    case 'replace':
      if (descriptor.text === undefined || descriptor.length === undefined) throw new Error("Text 'replace' operation requires text and length.");
      const replaceLen = descriptor.length;
      if (replaceLen < 0) throw new Error("Text 'replace' operation length cannot be negative.");
      updateOperation = Updates.custom<string>((currentText: string) => {
        if (typeof currentText !== 'string') return "";
        return currentText.substring(0, pos) + descriptor.text + currentText.substring(pos + replaceLen);
      });
      break;
    case 'set':
      if (descriptor.text === undefined) throw new Error("Text 'set' operation requires text.");
      updateOperation = Updates.set(descriptor.text);
      break;
    default:
      const exhaustiveCheckText: never = descriptor.type;
      throw new Error(`Unknown text operation type: ${exhaustiveCheckText}`);
  }

  const agentValue: SpecializedUpdaterValue<string, TextOperationDescriptor['type']> = {
    targetPath: targetPath,
    operation: updateOperation,
    timestamp: Date.now(),
    source: metadata?.source,
    dataType: 'text',
    operationType: descriptor.type,
    crdtMetadata: metadata?.crdtOpId ? { opId: metadata.crdtOpId, textOperation: descriptor, ...metadata } : undefined,
    metadata: { ...metadata, textOperation: descriptor }, // Store original descriptor for CRDT rule
  };
  return Agent("Updater", agentValue, { main: Port("main", "main") });
}

export function CounterUpdater(
  descriptor: CounterOperationDescriptor,
  targetPath: string[] = [],
  metadata?: Record<string, any>
): IAgent<"Updater", SpecializedUpdaterValue<number, CounterOperationDescriptor['type']>> {
  let updateOperation: UpdateOperation<number>;

  switch (descriptor.type) {
    case 'increment':
      updateOperation = Updates.increment(descriptor.value);
      break;
    case 'decrement':
      updateOperation = Updates.increment(-descriptor.value);
      break;
    case 'set':
      updateOperation = Updates.set(descriptor.value);
      break;
    default:
      const exhaustiveCheckCounter: never = descriptor.type;
      throw new Error(`Unknown counter operation type: ${exhaustiveCheckCounter}`);
  }
  const agentValue: SpecializedUpdaterValue<number, CounterOperationDescriptor['type']> = {
    targetPath: targetPath,
    operation: updateOperation,
    timestamp: Date.now(),
    source: metadata?.source,
    dataType: 'counter',
    operationType: descriptor.type,
    metadata,
  };
  return Agent("Updater", agentValue, { main: Port("main", "main") });
}
// ========== Shared Data Agent Factories ==========

export interface SharedDataMetadata {
  sourceNetworkId?: string;
  lastUpdateFrom?: string;
  vectorClock?: Record<string, number>;
}

export type AgentValueWithMetadata<Data, Meta = SharedDataMetadata> = Data & {
  __metadata?: Meta;
};

export function createSharedMap<V = any>(
  name: "SharedMap",
  initialValue: Record<string, V> = {},
  metadata?: SharedDataMetadata
): IAgent<"SharedMap", AgentValueWithMetadata<Record<string, V>>> {
  const agentValue = {
    ...(initialValue),
    __metadata: metadata || {}
  } as AgentValueWithMetadata<Record<string, V>>;

  return Agent(name, agentValue, {
    main: Port("main", "main"),
    sync: Port("sync", "sync")
  });
}

export function createSharedList<T = any>(
  name: "SharedList",
  initialValue: T[] = [],
  metadata?: SharedDataMetadata
): IAgent<"SharedList", AgentValueWithMetadata<{ items: T[] }>> {
  const agentValue: AgentValueWithMetadata<{ items: T[] }> = {
    items: initialValue,
    __metadata: metadata || {}
  };
  return Agent(name, agentValue, {
    main: Port("main", "main"),
    sync: Port("sync", "sync")
  });
}

export function createSharedText(
  name: "SharedText",
  initialValue: string = "",
  metadata?: SharedDataMetadata
): IAgent<"SharedText", AgentValueWithMetadata<{ text: string }>> {
  const agentValue: AgentValueWithMetadata<{ text: string }> = {
    text: initialValue,
    __metadata: metadata || {}
  };
  return Agent(name, agentValue, {
    main: Port("main", "main"),
    sync: Port("sync", "sync")
  });
}

export function createSharedCounter(
  name: "SharedCounter",
  initialValue: number = 0,
  metadata?: SharedDataMetadata
): IAgent<"SharedCounter", AgentValueWithMetadata<{ value: number }>> {
  const agentValue: AgentValueWithMetadata<{ value: number }> = {
    value: initialValue,
    __metadata: metadata || {}
  };
  return Agent(name, agentValue, {
    main: Port("main", "main"),
    sync: Port("sync", "sync")
  });
}

// ========== Rule Registration ==========

export function registerSpecializedUpdaterRules(network: INetwork): void {

  const createDummySharedAgent = <
    Name extends "SharedMap" | "SharedList" | "SharedText" | "SharedCounter",
    V = any
  >(
    name: Name,
    initialDataForDummy?:
      Name extends "SharedMap" ? Record<string, V> :
      Name extends "SharedList" ? { items: V[] } :
      Name extends "SharedText" ? { text: string } :
      Name extends "SharedCounter" ? { value: number } :
      any
  ): IAgent<Name, AgentValueWithMetadata<
    Name extends "SharedMap" ? Record<string, V> :
    Name extends "SharedList" ? { items: V[] } :
    Name extends "SharedText" ? { text: string } :
    Name extends "SharedCounter" ? { value: number } :
    any
  >> => {
    let dataContentPart: any;

    if (name === "SharedMap") {
      dataContentPart = initialDataForDummy || ({} as Record<string, V>);
    } else if (name === "SharedList") {
      dataContentPart = { items: (initialDataForDummy as { items: V[] } | undefined)?.items || [] };
    } else if (name === "SharedText") {
      dataContentPart = { text: (initialDataForDummy as { text: string } | undefined)?.text || "" };
    } else if (name === "SharedCounter") {
      dataContentPart = { value: (initialDataForDummy as { value: number } | undefined)?.value || 0 };
    } else {
      const exhaustiveNameCheck: never = name;
      throw new Error(`Unhandled agent name in createDummySharedAgent: ${exhaustiveNameCheck}`);
    }

    const agentValueForFactory: AgentValueWithMetadata<typeof dataContentPart> = {
      ...(dataContentPart as object),
      __metadata: {}
    };
    
    return Agent(name, agentValueForFactory as AgentValueWithMetadata<
      Name extends "SharedMap" ? Record<string, V> :
      Name extends "SharedList" ? { items: V[] } :
      Name extends "SharedText" ? { text: string } :
      Name extends "SharedCounter" ? { value: number } :
      any
    >, { main: Port("main", "main"), sync: Port("sync", "sync") });
  };

  const dummyUpdaterForRules = Updater(targetPath, {} as any) as IAgent<"Updater", SpecializedUpdaterValue<any,any>>;


  const createSpecializedRule = <
    SharedAgentName extends "SharedMap" | "SharedList" | "SharedText" | "SharedCounter"
  >(
    sharedAgentName: SharedAgentName,
    expectedDataType: DataType,
    dataPathWithinAgentValue: string[]
  ): IActionRule => {

    type ActionSharedAgentParam =
      SharedAgentName extends "SharedMap" ? IAgent<"SharedMap", AgentValueWithMetadata<Record<string, any>>> :
      SharedAgentName extends "SharedList" ? IAgent<"SharedList", AgentValueWithMetadata<{ items: any[] }>> :
      SharedAgentName extends "SharedText" ? IAgent<"SharedText", AgentValueWithMetadata<{ text: string }>> :
      SharedAgentName extends "SharedCounter" ? IAgent<"SharedCounter", AgentValueWithMetadata<{ value: number }>> :
      IAgent<SharedAgentName, any>;

    const dummyShared = (sharedAgentName === "SharedMap")
      ? createDummySharedAgent("SharedMap", {} as Record<string, any>)
      : createDummySharedAgent(sharedAgentName);

    return ActionRule(
      dummyUpdaterForRules.ports.main,
      dummyShared.ports.main,
      (updater, sharedAgentUnTyped, _net) => {
        const sharedAgent = sharedAgentUnTyped as ActionSharedAgentParam;
        const updaterValueFromAgent = updater.value as SpecializedUpdaterValue<any, any>;

        if (updater.name !== "Updater" || sharedAgent.name !== sharedAgentName || updaterValueFromAgent.dataType !== expectedDataType) {
          return undefined;
        }

        const fullPathToData = dataPathWithinAgentValue.length === 0
          ? updaterValueFromAgent.targetPath
          : [...dataPathWithinAgentValue, ...updaterValueFromAgent.targetPath];

        try {
          if (sharedAgent.value === undefined || sharedAgent.value === null) {
            console.error(`Rule ${sharedAgentName}Updater: Target agent value is undefined/null.`);
            return [sharedAgent];
          }
          const newRootAgentValue = applyUpdate(sharedAgent.value, fullPathToData, updaterValueFromAgent.operation);
          sharedAgent.value = newRootAgentValue;

          if (updaterValueFromAgent.vectorClock && sharedAgent.value?.__metadata) {
            console.log("Vector clock update would happen here for:", sharedAgentName);
          }

        } catch (error) {
          console.error(`Error applying update in rule ${sharedAgentName}Updater:`, error,
            "\nUpdater:", updaterValueFromAgent, "\nTarget:", sharedAgent.value, "\nPath:", fullPathToData);
          return [sharedAgent];
        }

        return [sharedAgent];
      },
      `SpecializedUpdater-${sharedAgentName}`
    );
  };

  network.addRule(createSpecializedRule("SharedMap", 'map', []));
  network.addRule(createSpecializedRule("SharedList", 'list', ['items']));
  network.addRule(createSpecializedRule("SharedText", 'text', ['text']));
  network.addRule(createSpecializedRule("SharedCounter", 'counter', ['value']));

  const dummyDuplicator = Agent("Duplicator" as AgentName, {}, { main: Port("main", "main"), out1: Port("out1", "aux"), out2: Port("out2", "aux") });
  network.addRule(ActionRule(
    dummyUpdaterForRules.ports.main,
    dummyDuplicator.ports.main,
    (updater, duplicator, net) => {
      if (updater.name !== "Updater" || duplicator.name !== "Duplicator") return undefined;

      const updaterValueFromAgent = updater.value as UpdaterValue<any>;

      const newUpdater1 = Updater(
        updaterValueFromAgent.targetPath,
        updaterValueFromAgent.operation,
        updaterValueFromAgent.metadata
      );
      const newUpdater2 = Updater(
        updaterValueFromAgent.targetPath,
        updaterValueFromAgent.operation,
        updaterValueFromAgent.metadata
      );

      net.addAgent(newUpdater1);
      net.addAgent(newUpdater2);

      if (duplicator.ports.out1 && duplicator.ports.out2) {
        net.connectPorts(newUpdater1.ports.main, duplicator.ports.out1);
        net.connectPorts(newUpdater2.ports.main, duplicator.ports.out2);
      } else {
        console.warn("Duplicator agent missing out1 or out2 ports for Updater-Duplicator rule.");
      }

      return [duplicator, newUpdater1, newUpdater2];
    },
    "Updater-Duplicator"
  ));

  const originalTextOpForDummyCRDT: TextOperationDescriptor = { type: 'insert', position: 0, text: '' };
  const dummyUpdaterForCRDT = TextUpdater(originalTextOpForDummyCRDT, [], { crdtOpId: "dummyID", textOperation: originalTextOpForDummyCRDT });
  const dummySharedTextForCRDT = createSharedText("SharedText", "");

  network.addRule(ActionRule(
    dummyUpdaterForCRDT.ports.main,
    dummySharedTextForCRDT.ports.main,
    (updater, sharedTextUntyped, _net) => {
      const sharedText = sharedTextUntyped as IAgent<"SharedText", AgentValueWithMetadata<{ text: string }>>;
      const updaterValueFromAgent = updater.value as SpecializedUpdaterValue<string, TextOperationDescriptor['type']>;

      if (updater.name !== "Updater" ||
        sharedText.name !== "SharedText" ||
        updaterValueFromAgent.dataType !== 'text' ||
        !updaterValueFromAgent.crdtMetadata ||
        !updaterValueFromAgent.crdtMetadata.opId) {
        return undefined;
      }

      const crdtOpInfo = updaterValueFromAgent.crdtMetadata;
      const textOpDesc = updaterValueFromAgent.metadata?.textOperation as TextOperationDescriptor | undefined;

      console.log(`CRDT Text operation ${crdtOpInfo.opId} received for SharedText '${sharedText._agentId}'. Current text: "${sharedText.value?.text ?? ''}". OpDesc:`, textOpDesc);

      if (textOpDesc && sharedText.value) {
        let newTextValue = sharedText.value.text;
        // This is a simplified application, real CRDT merge is more complex
        if (textOpDesc.type === 'insert' && textOpDesc.text !== undefined) {
          newTextValue = newTextValue.substring(0, textOpDesc.position) + textOpDesc.text + newTextValue.substring(textOpDesc.position);
        } else if (textOpDesc.type === 'delete' && textOpDesc.length !== undefined && textOpDesc.length >= 0) {
          newTextValue = newTextValue.substring(0, textOpDesc.position) + newTextValue.substring(textOpDesc.position + textOpDesc.length);
        } else if (textOpDesc.type === 'replace' && textOpDesc.text !== undefined && textOpDesc.length !== undefined && textOpDesc.length >= 0) {
          newTextValue = newTextValue.substring(0, textOpDesc.position) + textOpDesc.text + newTextValue.substring(textOpDesc.position + textOpDesc.length);
        } else if (textOpDesc.type === 'set' && textOpDesc.text !== undefined) {
          newTextValue = textOpDesc.text;
        }
        sharedText.value.text = newTextValue;
      }

      return [sharedText];
    },
    "TextCRDT-Processing"
  ));
}

// ========== CRDT Helper ==========

export function createTextCRDTOperation(
  type: TextOperationDescriptor['type'],
  position: number,
  text?: string,
  length?: number,
  siteId: string = `site-${Math.random().toString(36).substring(2, 9)}`
): { descriptor: TextOperationDescriptor, crdtOpId: string } {
  const opId = `${siteId}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  return {
    descriptor: { type, position, text, length },
    crdtOpId: opId
  };
}

// Helper: Path to the generic Updater agent for its operation target
const targetPath: string[] = [];