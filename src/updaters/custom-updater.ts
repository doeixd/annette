/**
 * Custom Updater API
 * 
 * This module provides an API for defining custom updaters and
 * making updaters more composable for complex nested updates.
 */
import { Agent, IAgent } from '../agent';
import { Port } from '../port';
import { Updater, UpdaterValue, UpdateOperation } from '../updater';

/**
 * Registry of custom updaters
 */
const registeredUpdaters = new Map<string, UpdaterDefinition<any>>();

/**
 * Interface for updater definition
 */
export interface UpdaterDefinition<T> {
  /** Updater type */
  type: string;
  
  /** Apply an operation to a value */
  apply: (value: T, operation: any) => T;
  
  /** Merge two operations */
  merge: (op1: any, op2: any) => any;
  
  /** Invert an operation */
  invert: (op: any) => any;
  
  /** Check if an operation is valid */
  validate?: (operation: any) => boolean;
  
  /** Get a string representation of an operation */
  toString?: (operation: any) => string;
}

/**
 * Interface for an updater
 */
export interface IUpdater<T = any> {
  /** Apply an update to a value */
  apply: (value: T) => T;
  
  /** Get the updater operation */
  getOperation: () => any;
  
  /** Get the updater type */
  getType: () => string;
  
  /** Get the updater path */
  getPath: () => string[];
  
  /** Create an inverted updater */
  invert: () => IUpdater<T>;
  
  /** Merge with another updater */
  merge: (other: IUpdater<T>) => IUpdater<T>;
}

/**
 * Define a custom updater
 * @param definition Updater definition
 * @returns Updater factory function
 */
export function defineUpdater<T>(definition: UpdaterDefinition<T>) {
  // Register the updater
  registeredUpdaters.set(definition.type, definition);
  
  // Return a factory function
  return (operation: any, parentPath: string[] = []): IAgent<'Updater', UpdaterValue> => {
    // Validate the operation if a validator is provided
    if (definition.validate && !definition.validate(operation)) {
      throw new Error(`Invalid operation for ${definition.type} updater: ${JSON.stringify(operation)}`);
    }
    
    // Create an updater
    return Updater(
      parentPath,
      { 
        type: definition.type, 
        data: operation,
        metadata: { dataType: definition.type }
      },
      []
    );
  };
}

/**
 * Get a registered updater definition
 * @param type Updater type
 * @returns Updater definition
 */
export function getUpdaterDefinition<T>(type: string): UpdaterDefinition<T> | undefined {
  return registeredUpdaters.get(type);
}

/**
 * Create a custom updater
 * @param type Updater type
 * @param operation Updater operation
 * @param path Property path
 * @returns Updater
 */
export function createCustomUpdater<T>(
  type: string,
  operation: any,
  path: string[] = []
): IAgent<'Updater', UpdaterValue> {
  // Check if the updater is registered
  const definition = registeredUpdaters.get(type);
  if (!definition) {
    throw new Error(`Updater type "${type}" is not registered`);
  }
  
  // Validate the operation if a validator is provided
  if (definition.validate && !definition.validate(operation)) {
    throw new Error(`Invalid operation for ${type} updater: ${JSON.stringify(operation)}`);
  }
  
  // Create an updater
  return Updater(
    path,
    { 
      type, 
      data: operation,
      metadata: { dataType: type }
    },
    []
  );
}

/**
 * Create a custom updater with agent interface
 * @param type Updater type
 * @param operation Updater operation
 * @param path Property path
 * @returns Updater agent
 */
export function CustomUpdater<T>(
  type: string,
  operation: any,
  path: string[] = []
): IAgent<'Updater', UpdaterValue> {
  return createCustomUpdater(type, operation, path);
}

/**
 * Compose multiple updaters into a single updater
 * @param updaters Updaters to compose
 * @returns Composed updater
 */
export function composeUpdaters(...updaters: IAgent<'Updater', UpdaterValue>[]): IAgent<'Updater', UpdaterValue> {
  // Create a composite updater
  const compositeUpdater = Agent<'CompositeUpdater', { updaters: IAgent<'Updater', UpdaterValue>[] }>(
    'CompositeUpdater',
    { updaters },
    {
      main: Port('main', 'main'),
      apply: Port('apply', 'aux')
    }
  );
  
  // Return a wrapper updater
  return Updater(
    [],
    { 
      type: 'composite', 
      data: {
        updaters: updaters.map(u => ({
          type: u.value.type,
          data: u.value.data,
          path: u.value.path
        }))
      },
      metadata: { 
        dataType: 'composite',
        compositeUpdater: compositeUpdater._agentId
      }
    },
    []
  );
}

/**
 * Apply a composed updater to a value
 * @param value Value to update
 * @param updater Composed updater
 * @returns Updated value
 */
export function applyComposedUpdate<T>(value: T, updater: IAgent<'Updater', UpdaterValue>): T {
  // Check if this is a composite updater
  if (updater.value.type === 'composite' && updater.value.metadata?.compositeUpdater) {
    const compositeUpdaterId = updater.value.metadata.compositeUpdater;
    
    // TODO: Look up the composite updater and apply its updaters in sequence
    // This would require access to the network
    
    // For now, just apply the updaters sequentially based on the data
    const updaters = updater.value.data.updaters;
    
    return updaters.reduce((result, updaterData) => {
      const singleUpdater = createCustomUpdater(
        updaterData.type,
        updaterData.data,
        updaterData.path
      );
      
      return applyUpdate(result, singleUpdater);
    }, value);
  }
  
  // For regular updaters, apply normally
  return applyUpdate(value, updater);
}

/**
 * Apply an updater to a value
 * @param value Value to update
 * @param updater Updater
 * @returns Updated value
 */
export function applyUpdate<T>(value: T, updater: IAgent<'Updater', UpdaterValue>): T {
  // Get the updater definition
  const definition = registeredUpdaters.get(updater.value.type);
  
  if (!definition) {
    throw new Error(`Updater type "${updater.value.type}" is not registered`);
  }
  
  // Extract path and operation
  const path = updater.value.path || [];
  const operation = updater.value.data;
  
  // If no path, apply directly
  if (path.length === 0) {
    return definition.apply(value, operation);
  }
  
  // Apply to nested path
  const result = JSON.parse(JSON.stringify(value)); // Deep clone
  let current = result;
  
  // Navigate to the target object
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    
    if (current[key] === undefined) {
      current[key] = {};
    }
    
    current = current[key];
  }
  
  // Apply the update
  const lastKey = path[path.length - 1];
  current[lastKey] = definition.apply(current[lastKey], operation);
  
  return result;
}

// ========== Standard Updater Definitions ==========

/**
 * Set updater definition
 */
export const SetUpdaterDefinition: UpdaterDefinition<any> = {
  type: 'set',
  
  apply: (value, operation) => {
    return operation.value;
  },
  
  merge: (op1, op2) => {
    // Last write wins
    return op2;
  },
  
  invert: (op) => {
    // To invert a set, we need the original value
    return {
      previousValue: op.previousValue
    };
  },
  
  validate: (operation) => {
    return operation && 'value' in operation;
  },
  
  toString: (operation) => {
    return `set ${JSON.stringify(operation.value)}`;
  }
};

/**
 * Merge updater definition
 */
export const MergeUpdaterDefinition: UpdaterDefinition<any> = {
  type: 'merge',
  
  apply: (value, operation) => {
    if (typeof value !== 'object' || value === null) {
      return operation.value;
    }
    
    return { ...value, ...operation.value };
  },
  
  merge: (op1, op2) => {
    return {
      value: { ...op1.value, ...op2.value }
    };
  },
  
  invert: (op) => {
    // To invert a merge, we need the original value for each key
    const inverse: Record<string, any> = {};
    
    for (const key in op.value) {
      if (op.previousValue && key in op.previousValue) {
        inverse[key] = op.previousValue[key];
      } else {
        // If key didn't exist before, delete it
        inverse[key] = undefined;
      }
    }
    
    return {
      value: inverse,
      isDelete: true
    };
  },
  
  validate: (operation) => {
    return operation && typeof operation.value === 'object' && operation.value !== null;
  },
  
  toString: (operation) => {
    return `merge ${JSON.stringify(operation.value)}`;
  }
};

/**
 * Delete updater definition
 */
export const DeleteUpdaterDefinition: UpdaterDefinition<any> = {
  type: 'delete',
  
  apply: (value, operation) => {
    if (typeof value !== 'object' || value === null) {
      return value;
    }
    
    if (Array.isArray(value)) {
      // For arrays, remove the item at the specified index
      if ('index' in operation) {
        const index = operation.index;
        return [...value.slice(0, index), ...value.slice(index + 1)];
      }
      
      return value;
    }
    
    // For objects, remove the specified key
    if ('key' in operation) {
      const result = { ...value };
      delete result[operation.key];
      return result;
    }
    
    return value;
  },
  
  merge: (op1, op2) => {
    // For delete operations, the most recent one wins
    return op2;
  },
  
  invert: (op) => {
    // To invert a delete, we need the original value
    if ('key' in op && op.previousValue) {
      return {
        key: op.key,
        value: op.previousValue[op.key]
      };
    }
    
    if ('index' in op && op.previousValue) {
      return {
        index: op.index,
        value: op.previousValue[op.index]
      };
    }
    
    return op;
  },
  
  validate: (operation) => {
    return operation && ('key' in operation || 'index' in operation);
  },
  
  toString: (operation) => {
    if ('key' in operation) {
      return `delete key ${operation.key}`;
    }
    
    if ('index' in operation) {
      return `delete index ${operation.index}`;
    }
    
    return `delete`;
  }
};

/**
 * Increment updater definition
 */
export const IncrementUpdaterDefinition: UpdaterDefinition<number> = {
  type: 'increment',
  
  apply: (value, operation) => {
    if (typeof value !== 'number') {
      return operation.value || 0;
    }
    
    return value + (operation.value || 1);
  },
  
  merge: (op1, op2) => {
    return {
      value: (op1.value || 1) + (op2.value || 1)
    };
  },
  
  invert: (op) => {
    return {
      value: -(op.value || 1)
    };
  },
  
  validate: (operation) => {
    return operation && (typeof operation.value === 'undefined' || typeof operation.value === 'number');
  },
  
  toString: (operation) => {
    return `increment by ${operation.value || 1}`;
  }
};

/**
 * Array insert updater definition
 */
export const ArrayInsertUpdaterDefinition: UpdaterDefinition<any[]> = {
  type: 'insert',
  
  apply: (value, operation) => {
    if (!Array.isArray(value)) {
      return [operation.value];
    }
    
    const index = 'index' in operation ? operation.index : value.length;
    return [
      ...value.slice(0, index),
      operation.value,
      ...value.slice(index)
    ];
  },
  
  merge: (op1, op2) => {
    // For insert operations, order matters
    // This is a simplified merge that doesn't handle all cases
    return op2;
  },
  
  invert: (op) => {
    return {
      index: op.index
    };
  },
  
  validate: (operation) => {
    return operation && 'value' in operation && (typeof operation.index === 'undefined' || typeof operation.index === 'number');
  },
  
  toString: (operation) => {
    return `insert ${JSON.stringify(operation.value)} at ${operation.index || 'end'}`;
  }
};

/**
 * Set updater factory
 */
export const SetUpdater = defineUpdater(SetUpdaterDefinition);

/**
 * Merge updater factory
 */
export const MergeUpdater = defineUpdater(MergeUpdaterDefinition);

/**
 * Delete updater factory
 */
export const DeleteUpdater = defineUpdater(DeleteUpdaterDefinition);

/**
 * Increment updater factory
 */
export const IncrementUpdater = defineUpdater(IncrementUpdaterDefinition);

/**
 * Array insert updater factory
 */
export const ArrayInsertUpdater = defineUpdater(ArrayInsertUpdaterDefinition);

/**
 * Register all standard updater definitions
 */
export function registerStandardUpdaters(): void {
  registeredUpdaters.set('set', SetUpdaterDefinition);
  registeredUpdaters.set('merge', MergeUpdaterDefinition);
  registeredUpdaters.set('delete', DeleteUpdaterDefinition);
  registeredUpdaters.set('increment', IncrementUpdaterDefinition);
  registeredUpdaters.set('insert', ArrayInsertUpdaterDefinition);
}

// Register standard updaters
registerStandardUpdaters();