import { IAgent, isAgent } from "./agent"; // Assuming IAgent is the refactored version
import { PortName, PortType } from "../types";

/**
 * Represents an unbound port, defining its name and type.
 * Properties are readonly to ensure immutability of port definitions.
 */
export interface IPort {
  readonly name: PortName;
  readonly type: PortType;
}

/**
 * Represents a port that is bound to a specific agent instance.
 * Extends IPort and adds a readonly reference to the agent.
 */
export interface IBoundPort extends IPort {
  readonly agent: IAgent; // Should be the refactored IAgent
}

/**
 * Factory function to create an IPort object.
 * Ensures that the created port object has readonly properties by freezing it.
 * @param name The name of the port.
 * @param type The type of the port ('main' or 'auxiliary').
 * @returns An IPort object.
 */
export function Port(name: PortName, type: PortType): IPort {
  return Object.freeze({
    name,
    type,
  });
}

/**
 * Factory function to create an IBoundPort object.
 * Binds an IPort to an IAgent instance.
 * Ensures that the created bound port object has readonly properties by freezing it.
 * @param agent The agent to bind the port to.
 * @param port The port definition (IPort).
 * @returns An IBoundPort object.
 */
export function BoundPort(agent: IAgent, port: IPort): IBoundPort {
  return Object.freeze({
    name: port.name,
    type: port.type,
    agent,
  });
}

/**
 * Type guard to check if an object is an IPort.
 * @param p The object to check.
 * @returns True if the object is an IPort, false otherwise.
 */
export function isPort(p: any): p is IPort {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof p.name === "string" &&
    typeof p.type === "string" &&
    (p.type === "main" || p.type === "auxiliary") // Updated to use 'auxiliary' as per PortType
  );
}

/**
 * Type guard to check if an object is an IBoundPort.
 * @param p The object to check.
 * @returns True if the object is an IBoundPort, false otherwise.
 */
export function isBoundPort(p: any): p is IBoundPort {
  // Explicitly check for p.agent after isPort, and then isAgent(p.agent)
  return isPort(p) && "agent" in p && p.agent !== undefined && isAgent(p.agent);
}

/**
 * Defines the structure for defining multiple ports as an object map (PortName to PortType).
 * Example: `{ main: 'main', input: 'auxiliary' }`
 */
export type PortsDefObj = Record<PortName, PortType>;

/**
 * Defines the structure for defining multiple ports as an array of IPort objects.
 * Example: `[Port('main', 'main'), Port('input', 'auxiliary')]`
 */
export type PortArray = IPort[];

/**
 * Represents the map of bound ports on an agent instance.
 * Keyed by PortName, with IBoundPort as values. This is the type for `IAgent.ports`.
 */
export type AgentPortsMap = Record<PortName, IBoundPort>;


/**
 * Creates a map of bound ports (AgentPortsMap) for an agent from a port definition object or array.
 * Ensures a 'main' port is present, adding a default one if necessary.
 * @param agent The agent for which to create bound ports.
 * @param portsDef The definition of ports, either as an object or an array. Can be undefined for default ports.
 * @returns An AgentPortsMap containing all bound ports for the agent.
 */
export function createBoundPortsMap(
  agent: IAgent, // Uses the refactored IAgent
  portsDef?: PortsDefObj | PortArray, // Optional for default behavior
): AgentPortsMap {
  const boundPorts: AgentPortsMap = {};

  const effectivePortsDef = portsDef || { main: 'main' as PortType }; // Default to one main port if undefined

  if (Array.isArray(effectivePortsDef)) { // PortArray
    effectivePortsDef.forEach((portDesc) => {
      if (!isPort(portDesc)) { // Ensure it's a valid IPort object
        throw new Error(`Invalid port descriptor in PortArray: ${JSON.stringify(portDesc)}`);
      }
      boundPorts[portDesc.name] = BoundPort(agent, portDesc);
    });
  } else { // PortsDefObj
    for (const portName in effectivePortsDef) {
      if (Object.prototype.hasOwnProperty.call(effectivePortsDef, portName)) {
        const portType = effectivePortsDef[portName];
        const portDesc = Port(portName as PortName, portType);
        boundPorts[portName as PortName] = BoundPort(agent, portDesc);
      }
    }
  }

  // Ensure a 'main' port exists of type 'main'
  let mainPortProperlyDefined = false;
  if (boundPorts['main'] && boundPorts['main'].type === 'main') {
    mainPortProperlyDefined = true;
  }

  if (!mainPortProperlyDefined) {
    if (boundPorts['main']) {
      // A port named 'main' exists but is not of type 'main'. This is a configuration error.
      // Overwrite it to ensure correctness, or throw an error.
      // For now, let's log a warning and overwrite.
      console.warn(`Agent ${agent.name} has a port named 'main' which is not of type 'main'. It will be overridden.`);
    }
    const defaultMainPort = Port('main', 'main');
    boundPorts['main'] = BoundPort(agent, defaultMainPort);
  }
  
  return boundPorts;
}
