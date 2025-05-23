/**
 * Specialized Updaters for Complex Data Structures
 * 
 * This module provides:
 * 1. Specialized UpdateAgent types for different data structures (map, list, text, counter)
 * 2. Specialized rules for efficient updates to complex data structures
 * 3. Helper functions for creating shared data structures
 * 4. CRDT-like operations for collaborative editing
 */
import { Agent, IAgent } from "./agent";
import { INetwork } from "./network";
import { Port } from "./port";
import { ActionRule } from "./rule";
import { UpdateOperation, Updater, UpdaterValue, Updates, applyUpdate } from "./updater";

// Specialized updater types
export type DataType = 'map' | 'list' | 'text' | 'counter';

export interface SpecializedUpdaterValue<T = any> extends UpdaterValue<T> {
  dataType: DataType;
  parentPath?: string[];
  vectorClock?: Record<string, number>;
}

// Map operations
export interface MapOperation<T = any> {
  type: 'set' | 'delete' | 'merge';
  key: string;
  value?: T;
}

// List operations
export interface ListOperation<T = any> {
  type: 'insert' | 'delete' | 'set';
  index: number;
  value?: T;
}

// Text operations
export interface TextOperation {
  type: 'insert' | 'delete';
  position: number;
  value?: string;
  length?: number;
  id?: string;
}

// Counter operations
export interface CounterOperation {
  type: 'increment' | 'decrement' | 'set';
  value: number;
}

/**
 * Create a specialized updater agent for maps
 * 
 * @param operation The map operation to perform
 * @param parentPath Path to the parent object (empty for root)
 * @param metadata Optional metadata
 * @returns A specialized updater agent for maps
 */
export function MapUpdater<T = any>(
  operation: MapOperation<T>,
  parentPath: string[] = [],
  metadata?: Record<string, any>
): IAgent<"Updater", SpecializedUpdaterValue<T>> {
  // Convert to standard update operation
  let updateOperation: UpdateOperation<T>;
  
  switch (operation.type) {
    case 'set':
      updateOperation = Updates.set(operation.value as T);
      break;
    case 'delete':
      updateOperation = Updates.delete(operation.key);
      break;
    case 'merge':
      updateOperation = Updates.merge(operation.value as any);
      break;
  }
  
  // Calculate target path
  const targetPath = [...parentPath, operation.key];
  
  return Agent("Updater", {
    targetPath,
    operation: updateOperation,
    timestamp: Date.now(),
    source: metadata?.source,
    dataType: 'map',
    parentPath,
    metadata
  }, {
    main: Port("main", "main"),
    // Additional ports for specialized operations
    out1: Port("out1", "aux"),
    out2: Port("out2", "aux")
  });
}

/**
 * Create a specialized updater agent for lists
 * 
 * @param operation The list operation to perform
 * @param parentPath Path to the parent object (empty for root)
 * @param metadata Optional metadata
 * @returns A specialized updater agent for lists
 */
export function ListUpdater<T = any>(
  operation: ListOperation<T>,
  parentPath: string[] = [],
  metadata?: Record<string, any>
): IAgent<"Updater", SpecializedUpdaterValue<T>> {
  // Convert to standard update operation
  let updateOperation: UpdateOperation<T>;
  
  switch (operation.type) {
    case 'insert':
      updateOperation = Updates.insert(operation.index, operation.value as any);
      break;
    case 'delete':
      // For delete, we create a custom operation that removes an item at a specific index
      updateOperation = Updates.custom((list: any[]) => {
        const newList = [...list];
        newList.splice(operation.index, 1);
        return newList;
      });
      break;
    case 'set':
      // For set, we create a custom operation that sets an item at a specific index
      updateOperation = Updates.custom((list: any[]) => {
        const newList = [...list];
        newList[operation.index] = operation.value;
        return newList;
      });
      break;
  }
  
  return Agent("Updater", {
    targetPath: parentPath,
    operation: updateOperation,
    timestamp: Date.now(),
    source: metadata?.source,
    dataType: 'list',
    parentPath,
    metadata
  }, {
    main: Port("main", "main"),
    // Additional ports for specialized operations
    out1: Port("out1", "aux"),
    out2: Port("out2", "aux")
  });
}

/**
 * Create a specialized updater agent for text
 * 
 * @param operation The text operation to perform
 * @param parentPath Path to the parent object (empty for root)
 * @param metadata Optional metadata
 * @returns A specialized updater agent for text
 */
export function TextUpdater(
  operation: TextOperation,
  parentPath: string[] = [],
  metadata?: Record<string, any>
): IAgent<"Updater", SpecializedUpdaterValue<string>> {
  // Convert to standard update operation
  let updateOperation: UpdateOperation<string>;
  
  switch (operation.type) {
    case 'insert':
      // For insert, we create a custom operation that inserts text at a specific position
      updateOperation = Updates.custom((text: string) => {
        return text.substring(0, operation.position) + 
               (operation.value || '') + 
               text.substring(operation.position);
      });
      break;
    case 'delete':
      // For delete, we create a custom operation that removes text at a specific position
      updateOperation = Updates.custom((text: string) => {
        const length = operation.length || 1;
        return text.substring(0, operation.position) + 
               text.substring(operation.position + length);
      });
      break;
  }
  
  return Agent("Updater", {
    targetPath: parentPath,
    operation: updateOperation,
    timestamp: Date.now(),
    source: metadata?.source,
    dataType: 'text',
    parentPath,
    metadata: {
      ...metadata,
      textOperation: operation
    }
  }, {
    main: Port("main", "main"),
    // Additional ports for specialized operations
    out1: Port("out1", "aux"),
    out2: Port("out2", "aux")
  });
}

/**
 * Create a specialized updater agent for counters
 * 
 * @param operation The counter operation to perform
 * @param parentPath Path to the parent object (empty for root)
 * @param metadata Optional metadata
 * @returns A specialized updater agent for counters
 */
export function CounterUpdater(
  operation: CounterOperation,
  parentPath: string[] = [],
  metadata?: Record<string, any>
): IAgent<"Updater", SpecializedUpdaterValue<number>> {
  // Convert to standard update operation
  let updateOperation: UpdateOperation<number>;
  
  switch (operation.type) {
    case 'increment':
      updateOperation = Updates.increment(operation.value);
      break;
    case 'decrement':
      updateOperation = Updates.increment(-operation.value);
      break;
    case 'set':
      updateOperation = Updates.set(operation.value);
      break;
  }
  
  return Agent("Updater", {
    targetPath: parentPath,
    operation: updateOperation,
    timestamp: Date.now(),
    source: metadata?.source,
    dataType: 'counter',
    parentPath,
    metadata
  }, {
    main: Port("main", "main"),
    // Additional ports for specialized operations
    out1: Port("out1", "aux"),
    out2: Port("out2", "aux")
  });
}

/**
 * Create a shared map agent
 * 
 * @param initialValue Initial map value
 * @param metadata Optional metadata
 * @returns A shared map agent
 */
export function createSharedMap<T extends Record<string, any> = Record<string, any>>(
  initialValue: T,
  metadata?: Record<string, any>
): IAgent<"SharedMap", T & { __metadata?: Record<string, any> }> {
  return Agent("SharedMap", {
    ...initialValue,
    __metadata: metadata
  }, {
    main: Port("main", "main"),
    sync: Port("sync", "sync")
  });
}

/**
 * Create a shared list agent
 * 
 * @param initialValue Initial list value
 * @param metadata Optional metadata
 * @returns A shared list agent
 */
export function createSharedList<T = any>(
  initialValue: T[] = [],
  metadata?: Record<string, any>
): IAgent<"SharedList", { items: T[], __metadata?: Record<string, any> }> {
  return Agent("SharedList", {
    items: initialValue,
    __metadata: metadata
  }, {
    main: Port("main", "main"),
    sync: Port("sync", "sync")
  });
}

/**
 * Create a shared text agent
 * 
 * @param initialValue Initial text value
 * @param metadata Optional metadata
 * @returns A shared text agent
 */
export function createSharedText(
  initialValue: string = "",
  metadata?: Record<string, any>
): IAgent<"SharedText", { text: string, __metadata?: Record<string, any> }> {
  return Agent("SharedText", {
    text: initialValue,
    __metadata: metadata
  }, {
    main: Port("main", "main"),
    sync: Port("sync", "sync")
  });
}

/**
 * Create a shared counter agent
 * 
 * @param initialValue Initial counter value
 * @param metadata Optional metadata
 * @returns A shared counter agent
 */
export function createSharedCounter(
  initialValue: number = 0,
  metadata?: Record<string, any>
): IAgent<"SharedCounter", { value: number, __metadata?: Record<string, any> }> {
  return Agent("SharedCounter", {
    value: initialValue,
    __metadata: metadata
  }, {
    main: Port("main", "main"),
    sync: Port("sync", "sync")
  });
}

/**
 * Register specialized updater rules for efficient updates
 * @param network The network to register rules with
 */
export function registerSpecializedUpdaterRules(network: INetwork): void {
  // Rule for map updaters
  network.addRule(ActionRule(
    { name: "MapUpdater-Map", type: "action" },
    { 
      agentName1: "Updater", 
      portName1: "main", 
      agentName2: "SharedMap", 
      portName2: "main" 
    },
    (updater, map, network) => {
      const updaterValue = updater.value as SpecializedUpdaterValue;
      
      // Only handle if this is a map updater
      if (updaterValue.dataType !== 'map') {
        return undefined; // Let another rule handle it
      }
      
      // Apply the update
      const newValue = applyUpdate(map.value, updaterValue.targetPath, updaterValue.operation);
      map.value = newValue;
      
      // Create sub-updaters for nested properties if needed
      if (updaterValue.operation.type === 'merge') {
        const mergeValue = updaterValue.operation.value;
        
        // For each property in the merge, create a sub-updater
        for (const [key, value] of Object.entries(mergeValue)) {
          if (typeof value === 'object' && value !== null) {
            // Create a sub-updater for this nested property
            const subUpdater = MapUpdater(
              { type: 'set', key, value },
              updaterValue.targetPath,
              { ...updaterValue.metadata, parentUpdate: updaterValue }
            );
            
            network.addAgent(subUpdater);
            
            // If map has auxiliary ports, connect the sub-updater
            if (map.ports.out1) {
              network.connectPorts(subUpdater.ports.main, map.ports.out1);
            }
          }
        }
      }
      
      return [map];
    }
  ));
  
  // Rule for list updaters
  network.addRule(ActionRule(
    { name: "ListUpdater-List", type: "action" },
    { 
      agentName1: "Updater", 
      portName1: "main", 
      agentName2: "SharedList", 
      portName2: "main" 
    },
    (updater, list, network) => {
      const updaterValue = updater.value as SpecializedUpdaterValue;
      
      // Only handle if this is a list updater
      if (updaterValue.dataType !== 'list') {
        return undefined; // Let another rule handle it
      }
      
      // Apply the update
      const newValue = applyUpdate(list.value, updaterValue.targetPath, updaterValue.operation);
      list.value = newValue;
      
      return [list];
    }
  ));
  
  // Rule for text updaters
  network.addRule(ActionRule(
    { name: "TextUpdater-Text", type: "action" },
    { 
      agentName1: "Updater", 
      portName1: "main", 
      agentName2: "SharedText", 
      portName2: "main" 
    },
    (updater, text, network) => {
      const updaterValue = updater.value as SpecializedUpdaterValue;
      
      // Only handle if this is a text updater
      if (updaterValue.dataType !== 'text') {
        return undefined; // Let another rule handle it
      }
      
      // Apply the update
      const newValue = applyUpdate(text.value, updaterValue.targetPath, updaterValue.operation);
      text.value = newValue;
      
      return [text];
    }
  ));
  
  // Rule for counter updaters
  network.addRule(ActionRule(
    { name: "CounterUpdater-Counter", type: "action" },
    { 
      agentName1: "Updater", 
      portName1: "main", 
      agentName2: "SharedCounter", 
      portName2: "main" 
    },
    (updater, counter, network) => {
      const updaterValue = updater.value as SpecializedUpdaterValue;
      
      // Only handle if this is a counter updater
      if (updaterValue.dataType !== 'counter') {
        return undefined; // Let another rule handle it
      }
      
      // Apply the update
      const newValue = applyUpdate(counter.value, updaterValue.targetPath, updaterValue.operation);
      counter.value = newValue;
      
      return [counter];
    }
  ));
  
  // Rule for updater-duplicator interaction
  network.addRule(ActionRule(
    { name: "Updater-Duplicator", type: "action" },
    { 
      agentName1: "Updater", 
      portName1: "main", 
      agentName2: "Duplicator", 
      portName2: "main" 
    },
    (updater, duplicator, network) => {
      const updaterValue = updater.value;
      
      // Create two new updaters with the same operation
      const updater1 = Updater(
        updaterValue.targetPath,
        updaterValue.operation,
        updaterValue.metadata
      );
      
      const updater2 = Updater(
        updaterValue.targetPath,
        updaterValue.operation,
        updaterValue.metadata
      );
      
      // Add the new updaters to the network
      network.addAgent(updater1);
      network.addAgent(updater2);
      
      // Connect updaters to the duplicator's auxiliary ports
      network.connectPorts(updater1.ports.main, duplicator.ports.out1);
      network.connectPorts(updater2.ports.main, duplicator.ports.out2);
      
      return [duplicator, updater1, updater2];
    }
  ));
  
  // Rule for specific text CRDT operations
  network.addRule(ActionRule(
    { name: "TextCRDT-Text", type: "action" },
    { 
      agentName1: "Updater", 
      portName1: "main", 
      agentName2: "SharedText", 
      portName2: "main" 
    },
    (updater, text, network) => {
      const updaterValue = updater.value as SpecializedUpdaterValue;
      
      // Only handle if this is a text updater with CRDT metadata
      if (updaterValue.dataType !== 'text' || !updaterValue.metadata?.textOperation) {
        return undefined; // Let another rule handle it
      }
      
      const textOp = updaterValue.metadata.textOperation as TextOperation;
      
      // If this is a CRDT text operation with an ID
      if (textOp.id) {
        // Apply the update with special CRDT handling
        // This would implement the CRDT logic for text (like Yjs or Automerge)
        // For simplicity, we're using a basic implementation here
        let newText = text.value.text;
        
        if (textOp.type === 'insert') {
          newText = newText.substring(0, textOp.position) + 
                   (textOp.value || '') + 
                   newText.substring(textOp.position);
        } else if (textOp.type === 'delete') {
          const length = textOp.length || 1;
          newText = newText.substring(0, textOp.position) + 
                   newText.substring(textOp.position + length);
        }
        
        text.value.text = newText;
        
        return [text];
      }
      
      return undefined; // Let another rule handle it
    }
  ));
}

/**
 * Create a text CRDT operation for collaborative editing
 * 
 * @param type Operation type (insert or delete)
 * @param position Position in the text
 * @param value Value to insert (for insert operations)
 * @param length Length to delete (for delete operations)
 * @param clientId Client identifier for CRDT
 * @returns A text operation with CRDT properties
 */
export function createTextCRDTOperation(
  type: 'insert' | 'delete',
  position: number,
  value?: string,
  length?: number,
  clientId: string = `client-${Math.random().toString(36).substring(2, 9)}`
): TextOperation {
  return {
    type,
    position,
    value,
    length,
    id: `${clientId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  };
}