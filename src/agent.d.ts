import { Connections } from "./connection";
import { BoundPortsMap, IPort, PortsHasMainPort, PortsDefObj, PortArray, PortsMap } from "./port";
export declare type AgentId = string;
export declare type AgentName = string;
/**
 * Core Agent interface with generic type parameters
 *
 * @template Name - The agent's name/type for rule matching
 * @template Value - The type of the agent's value
 * @template Type - The agent's subtype/category
 * @template P - Port definition format (array, object, or map)
 */
export interface IAgent<Name extends string = string, Value = any, Type extends string = string, P extends PortArray | PortsDefObj | PortsMap = PortArray | PortsDefObj | PortsMap> {
    /** The agent's name/type for rule matching */
    name: Name;
    /** The agent's mutable state */
    value: Value;
    /** Map of ports for connections with other agents */
    ports: BoundPortsMap<IAgent<Name, Value, Type>, P> & PortsHasMainPort<BoundPortsMap<IAgent<Name, Value, Type>, P>>;
    /** Optional subtype/category */
    type: Type;
    /** Active connections to other agents */
    connections: Connections<IAgent<Name, Value, Type>>;
    /** Unique identifier for this agent instance */
    _agentId: AgentId;
}
/**
 * Create an agent with typed state and ports
 *
 * @template Name - The agent name/type for rule matching
 * @template Value - The type of the agent's value
 * @template Type - Optional subtype (defaults to 'agent')
 * @template P - Port definitions format
 *
 * @param name - The agent's name
 * @param value - The agent's initial value
 * @param ports - Optional port definitions (defaults to a single main port)
 * @param type - Optional subtype
 * @returns A new agent instance
 */
export declare function Agent<Name extends string, Value = any, Type extends string = string, P extends PortArray | PortsDefObj | PortsMap = PortArray | PortsDefObj | PortsMap>(name: Name, value: Value, ports?: P, type?: Type): IAgent<Name, Value, "agent" | Type, PortsMap<IPort<string, import("./port").PortTypes>[]> | P>;
/**
 * Type guard to check if an object is an Agent
 * Note: This keeps the original dynamism and doesn't require _agentId for backward compatibility
 */
export declare function isAgent(agent: any): agent is IAgent;
export default Agent;
//# sourceMappingURL=agent.d.ts.map