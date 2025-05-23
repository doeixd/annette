import { Agent, IAgent } from "./agent";
import { INetwork } from "./network";
import { ActionRule } from "./rule";

/**
 * Update operations that can be applied to values
 */
export type UpdateOperation<T = any> = 
  | { type: 'set'; value: T }
  | { type: 'merge'; value: Partial<T> }
  | { type: 'delete'; key?: string }
  | { type: 'insert'; index: number; value: any }
  | { type: 'increment'; value: number }
  | { type: 'custom'; apply: (current: T) => T };

/**
 * Updater agent value structure
 */
export interface UpdaterValue<T = any> {
  targetPath: string[];
  operation: UpdateOperation<T>;
  timestamp: number;
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * Create an Updater agent
 * 
 * Updater agents represent an intent to change a value. When connected
 * to another agent, they apply their operation to that agent's value.
 * 
 * @param targetPath Path to the target property (empty array for root)
 * @param operation The update operation to perform
 * @param metadata Optional metadata about this update
 * @returns An Updater agent
 */
export function Updater<T>(
  targetPath: string[] = [],
  operation: UpdateOperation<T>,
  metadata?: Record<string, any>
): IAgent<"Updater", UpdaterValue<T>> {
  return Agent("Updater", {
    targetPath,
    operation,
    timestamp: Date.now(),
    source: undefined,
    metadata
  });
}

/**
 * Helper functions to create common update operations
 */
export const Updates = {
  set: <T>(value: T) => ({ type: 'set' as const, value }),
  merge: <T>(value: Partial<T>) => ({ type: 'merge' as const, value }),
  delete: (key?: string) => ({ type: 'delete' as const, key }),
  insert: <T>(index: number, value: T) => ({ type: 'insert' as const, index, value }),
  increment: (value: number = 1) => ({ type: 'increment' as const, value }),
  custom: <T>(apply: (current: T) => T) => ({ type: 'custom' as const, apply })
};

/**
 * Apply an update operation to a value
 * 
 * @param target The target object to update
 * @param path Path to the property to update
 * @param operation The update operation to apply
 * @returns The updated value
 */
export function applyUpdate<T>(target: any, path: string[], operation: UpdateOperation<T>): any {
  // Handle root updates
  if (path.length === 0) {
    return applyOperation(target, operation);
  }
  
  // Handle nested updates
  const result = structuredClone(target);
  let current = result;
  
  // Navigate to the parent of the target property
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    current = current[key];
  }
  
  // Get the final property key
  const finalKey = path[path.length - 1];
  
  // Apply the operation to the target property
  if (operation.type === 'delete' && operation.key === undefined) {
    // Special case: delete the entire property
    delete current[finalKey];
  } else {
    // Update the property value
    current[finalKey] = applyOperation(current[finalKey], operation);
  }
  
  return result;
}

/**
 * Apply an operation to a specific value
 * 
 * @param current The current value
 * @param operation The operation to apply
 * @returns The new value
 */
function applyOperation<T>(current: T, operation: UpdateOperation<T>): any {
  switch (operation.type) {
    case 'set':
      return operation.value;
      
    case 'merge':
      if (typeof current === 'object' && current !== null) {
        return { ...current, ...operation.value };
      }
      return operation.value;
      
    case 'delete':
      if (typeof current === 'object' && current !== null && operation.key) {
        const result = structuredClone(current) as Record<string, any>;
        delete result[operation.key];
        return result;
      }
      return undefined;
      
    case 'insert':
      if (Array.isArray(current)) {
        const result = [...current];
        result.splice(operation.index, 0, operation.value);
        return result;
      }
      return [operation.value];
      
    case 'increment':
      if (typeof current === 'number') {
        return current + operation.value;
      }
      return operation.value;
      
    case 'custom':
      return operation.apply(current);
      
    default:
      return current;
  }
}

/**
 * Register updater rules for the given target types
 */
export function registerUpdaterRules(network: INetwork, targetTypes: string[] = ["Value"]) {
  // Register updater rules for each target type
  for (const targetType of targetTypes) {
    network.addRule({
      type: 'action',
      name: `Updater-${targetType}`,
      matchInfo: {
        agentName1: "Updater",
        portName1: "main",
        agentName2: targetType,
        portName2: "main"
      },
      action: (updater, target, network) => {
        // Apply the update operation to the target value
        const updaterValue = updater.value as UpdaterValue;
        target.value = applyUpdate(target.value, updaterValue.targetPath, updaterValue.operation);
        
        // Record update in change history if available
        if (network.getChangeHistory) {
          const history = network.getChangeHistory();
          history.push({
            timestamp: updaterValue.timestamp,
            ruleName: `Updater-${targetType}`,
            targetId: target._agentId,
            targetName: target.name,
            updaterId: updater._agentId,
            updaterName: updater.name,
            previousState: target.value, // Note: This is the updated value; we don't have the previous
            newState: target.value,
            description: updaterValue.metadata?.description || `Updated ${targetType} via Updater`
          });
        }
        
        // Return only the target - updater is consumed
        return [target];
      }
    });
  }
  
  // Add the duplication rule
  network.addRule({
    type: 'action',
    name: "Updater-Duplication",
    matchInfo: {
      agentName1: "Updater",
      portName1: "main",
      agentName2: "Duplicator",
      portName2: "main"
    },
    action: (updater, duplicator, network) => {
      // Get the updater value
      const updaterValue = updater.value as UpdaterValue;
      
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
      
      // Find auxiliary ports to connect to
      const auxPorts = Object.values(duplicator.ports).filter(port => 
        port !== duplicator.ports.main && port.type !== 'main'
      );
      
      if (auxPorts.length >= 2) {
        // Connect updaters to the duplicator's auxiliary ports
        network.connectPorts(updater1.ports.main, auxPorts[0]);
        network.connectPorts(updater2.ports.main, auxPorts[1]);
      }
      
      // Return all agents to keep them in the network
      return [duplicator, updater1, updater2];
    }
  });
}