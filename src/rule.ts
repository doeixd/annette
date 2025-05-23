import { AgentName, IAgent, isAgent } from "./agent";
import { IConnection, Connection, isConnection } from "./connection";
import { IBoundPort, PortName, isBoundPort } from "./port";
import { INetwork } from "./network";

// Command types for rule operations
export type RuleAddCommand = {
  type: 'add';
  entity: IAgent | IConnection;
  throwIfExists?: boolean;
};

export type RuleRemoveCommand = {
  type: 'remove';
  entity: IAgent | string; // Can be agent object or agent ID
};

export type RuleCommand = RuleAddCommand | RuleRemoveCommand;

// Common types for both rule types
export type ActionReturn = void | (IAgent | IConnection | RuleCommand)[];
export type RuleType = 'action' | 'rewrite';

// Action Rule System
export type Action<
  Source extends IAgent = IAgent,
  Destination extends IAgent = IAgent,
  TActionReturn extends ActionReturn = ActionReturn,
> = (agent1: Source, agent2: Destination, network: INetwork) => TActionReturn;

export interface IActionRule<
  Name extends string = string,
  AgentName1 extends AgentName = AgentName,
  PortName1 extends PortName = PortName,
  AgentName2 extends AgentName = AgentName,
  PortName2 extends PortName = PortName,
> {
  type: 'action';
  name: Name;
  matchInfo: {
    agentName1: AgentName1;
    portName1: PortName1;
    agentName2: AgentName2;
    portName2: PortName2;
  };
  action: Action<IAgent<AgentName1>, IAgent<AgentName2>>;
}

// Rewrite Rule System
export interface NewAgentDef {
  name: AgentName;
  initialValue?: any;
  _templateId: string;
}

export interface InternalConnectionDef {
  agent1TemplateId: string;
  port1Name: PortName;
  agent2TemplateId: string;
  port2Name: PortName;
  connectionName?: string;
}

export interface PortMapEntry {
  newAgentTemplateId: string;
  newPortName: PortName;
}

export interface ExternalConnectionMap {
  [originalPortName: string]: PortMapEntry | null;
}

export interface Rewrite {
  newAgents: NewAgentDef[];
  internalConnections: InternalConnectionDef[];
  portMapAgent1: ExternalConnectionMap;
  portMapAgent2: ExternalConnectionMap;
}

export type DefineRewriteFn = (agent1: IAgent, agent2: IAgent) => Rewrite;

export interface IRewriteRule<
  Name extends string = string,
  AgentName1 extends AgentName = AgentName,
  PortName1 extends PortName = PortName,
  AgentName2 extends AgentName = AgentName,
  PortName2 extends PortName = PortName,
> {
  type: 'rewrite';
  name: Name;
  matchInfo: {
    agentName1: AgentName1;
    portName1: PortName1;
    agentName2: AgentName2;
    portName2: PortName2;
  };
  rewrite: Rewrite;
}

export type AnyRule = IActionRule | IRewriteRule;

// Generic interface for backward compatibility
export interface IRule<
  Name extends string = string,
  TConnection extends IConnection<any, any, any, any, any> = IConnection,
  TAction extends Action<
    TConnection["source"],
    TConnection["destination"]
  > = Action<TConnection["source"], TConnection["destination"]>,
> {
  name: Name;
  connection: TConnection;
  action: TAction;
}

export function isRule(rule: any): rule is IRule | AnyRule {
  if (typeof rule !== "object") {
    return false;
  } else if ("type" in rule) {
    return (rule.type === 'action' || rule.type === 'rewrite') && 
           "name" in rule && "matchInfo" in rule;
  } else {
    return (
      ("name" in rule && "connection" in rule && "action" in rule) ||
      rule instanceof Rule
    );
  }
}

// ActionRule factory function with ports - name at the end
export function ActionRule<
  A1 extends IAgent,
  P1 extends IBoundPort<A1>,
  A2 extends IAgent,
  P2 extends IBoundPort<A2>
>(
  port1: P1,
  port2: P2,
  action: Action<A1, A2>,
  ruleName?: string
): IActionRule;

// ActionRule factory function with connection - name at the end
export function ActionRule<
  N extends string,
  S extends IAgent,
  D extends IAgent,
  SP extends IBoundPort<S>,
  DP extends IBoundPort<D>
>(
  connection: IConnection<N, S, D, SP, DP>,
  action: Action<S, D>,
  ruleName?: string
): IActionRule;

// Implementation
export function ActionRule(
  portOrConnection: IBoundPort | IConnection,
  portOrAction: IBoundPort | Action,
  actionOrName?: Action | string,
  ruleName?: string
): IActionRule {
  // Case 1: Using two ports
  if (isBoundPort(portOrConnection) && isBoundPort(portOrAction) && typeof actionOrName === 'function') {
    const port1 = portOrConnection;
    const port2 = portOrAction;
    const action = actionOrName;
    const name = ruleName || `${port1.agent.name}.${port1.name}-to-${port2.agent.name}.${port2.name}`;
    
    return {
      type: 'action',
      name,
      matchInfo: {
        agentName1: port1.agent.name,
        portName1: port1.name,
        agentName2: port2.agent.name,
        portName2: port2.name
      },
      action
    };
  }
  
  // Case 2: Using a connection
  if (isConnection(portOrConnection) && typeof portOrAction === 'function') {
    const connection = portOrConnection;
    const action = portOrAction;
    
    // If third parameter is string, it's the rule name, otherwise use default
    const name = typeof actionOrName === 'string' ? actionOrName : `rule-for-${connection.name}`;
    
    return {
      type: 'action',
      name,
      matchInfo: {
        agentName1: connection.source.name,
        portName1: connection.sourcePort.name,
        agentName2: connection.destination.name,
        portName2: connection.destinationPort.name
      },
      action
    };
  }
  
  throw new Error("Invalid arguments provided to ActionRule. Must use port objects or a connection object.");
}

// RewriteRule factory function with ports - name at the end
export function RewriteRule<
  A1 extends IAgent,
  P1 extends IBoundPort<A1>,
  A2 extends IAgent,
  P2 extends IBoundPort<A2>
>(
  port1: P1,
  port2: P2,
  definition: DefineRewriteFn | Rewrite,
  ruleName?: string
): IRewriteRule;

// RewriteRule factory function with connection - name at the end
export function RewriteRule<
  N extends string,
  S extends IAgent,
  D extends IAgent,
  SP extends IBoundPort<S>,
  DP extends IBoundPort<D>
>(
  connection: IConnection<N, S, D, SP, DP>,
  definition: DefineRewriteFn | Rewrite,
  ruleName?: string
): IRewriteRule;

// Implementation
export function RewriteRule(
  portOrConnection: IBoundPort | IConnection,
  portOrDefinition: IBoundPort | DefineRewriteFn | Rewrite,
  definitionOrName?: DefineRewriteFn | Rewrite | string,
  ruleName?: string
): IRewriteRule {
  // Case 1: Using two ports
  if (isBoundPort(portOrConnection) && isBoundPort(portOrDefinition) && 
      (typeof definitionOrName === 'function' || typeof definitionOrName === 'object') && 
      !(typeof definitionOrName === 'string')) {
    const port1 = portOrConnection;
    const port2 = portOrDefinition;
    const definition = definitionOrName as DefineRewriteFn | Rewrite;
    
    // Generate rule name if not provided
    const name = ruleName || `rewrite-${port1.agent.name}.${port1.name}-to-${port2.agent.name}.${port2.name}`;
    
    return {
      type: 'rewrite',
      name,
      matchInfo: {
        agentName1: port1.agent.name,
        portName1: port1.name,
        agentName2: port2.agent.name,
        portName2: port2.name
      },
      // Store the definition with optimization metadata
      rewrite: typeof definition === 'function' 
        ? { 
            _isDeferredFn: true,
            _fn: definition,
            // Default empty structure in case we need to access properties
            newAgents: [],
            internalConnections: [],
            portMapAgent1: {},
            portMapAgent2: {},
            // Optimization flags
            _optimized: false,
            _cachedPlans: new Map() // Cache for optimized rewrites based on agent values
          } as any
        : {
            // For static rewrites, add optimization metadata
            ...definition,
            _optimized: true,
            _staticRewrite: true
          }
    };
  }
  
  // Case 2: Using a connection
  if (isConnection(portOrConnection) && (typeof portOrDefinition === 'function' || typeof portOrDefinition === 'object')) {
    const connection = portOrConnection;
    const definition = portOrDefinition as DefineRewriteFn | Rewrite;
    
    // If third parameter is string, it's the rule name, otherwise use default
    const name = typeof definitionOrName === 'string' ? definitionOrName : `rewrite-for-${connection.name}`;
    
    return {
      type: 'rewrite',
      name,
      matchInfo: {
        agentName1: connection.source.name,
        portName1: connection.sourcePort.name,
        agentName2: connection.destination.name,
        portName2: connection.destinationPort.name
      },
      // Store the definition with optimization metadata
      rewrite: typeof definition === 'function' 
        ? { 
            _isDeferredFn: true,
            _fn: definition,
            // Default empty structure in case we need to access properties
            newAgents: [],
            internalConnections: [],
            portMapAgent1: {},
            portMapAgent2: {},
            // Optimization flags
            _optimized: false,
            _cachedPlans: new Map() // Cache for optimized rewrites based on agent values
          } as any
        : {
            // For static rewrites, add optimization metadata
            ...definition,
            _optimized: true,
            _staticRewrite: true
          }
    };
  }
  
  throw new Error("Invalid arguments provided to RewriteRule. Must use port objects or a connection object.");
}

// Updated Rule function using objects only - simplified API
export function Rule<
  S extends IBoundPort,
  D extends IBoundPort<any, S["name"], S["type"]>,
>(sourcePort: S, destPort: D): IRule;

export function Rule<
  S extends IAgent,
  D extends IAgent,
  A extends Action<S, D> & { name?: string },
>(
  source: S,
  destination: D,
  action?: A,
): IRule;

export function Rule<
  C extends IConnection<any, any, any>,
  A extends Action<C["source"], C["destination"]>,
  N extends string = string
>(connection: C, action?: A, ruleName?: N): IRule;

export function Rule<
  S extends IAgent | IBoundPort | IConnection<any, any, any>,
  D extends IAgent | IBoundPort | Action<any, any>,
  A extends Action<any, any> | string = Action<any, any>
>(
  sourceOrConnection: S,
  destOrAction?: D,
  actionOrName?: A | string,
): IRule<any, any, any> | IActionRule {
  // Case 1: sourcePort and destPort
  if (isBoundPort(sourceOrConnection) && isBoundPort(destOrAction)) {
    const sourcePort = sourceOrConnection;
    const destPort = destOrAction;
    
    // Create a connection from the ports
    const connection = Connection(sourcePort, destPort);
    
    // Create a default rule for these ports
    return {
      name: connection.name,
      connection: connection,
      action: (_a, _b, _network) => {}
    } as IRule;
  }
  
  // Case 2: source agent and destination agent
  if (isAgent(sourceOrConnection) && isAgent(destOrAction)) {
    const source = sourceOrConnection;
    const destination = destOrAction;
    
    // If no action is provided, create a default ActionRule
    if (!actionOrName) {
      return ActionRule(
        source.ports.main,
        destination.ports.main,
        (_a, _b, _network) => {}
      );
    }
    
    // Create the connection with port objects
    const connection = Connection(source.ports.main, destination.ports.main);
    
    // Generate rule name based on connection and action name
    const action = actionOrName as Action<any, any>;
    const ruleName = (action as any).name ? 
      `${connection.name}:${(action as any).name}` : 
      connection.name;

    return Rule(connection, action, ruleName);
  }

  // Case 3: connection object, action, and optional name
  if (isConnection(sourceOrConnection)) {
    const connection = sourceOrConnection as IConnection<any, any, any>;
    const action = destOrAction as Action<any, any>;
    const ruleName = typeof actionOrName === 'string' ? actionOrName : `rule-for-${connection.name}`;

    // For backward compatibility, if no action, create a default one
    if (!action) {
      return ActionRule(
        connection.sourcePort,
        connection.destinationPort,
        (_a, _b, _network) => {},
        ruleName
      );
    }

    const rule = new (class Rule {
      name = ruleName;
      connection = connection;
      action = action;
    })() as IRule<typeof ruleName, typeof connection, typeof action>;

    Object.defineProperties(rule, {
      name: {
        value: ruleName,
        writable: false,
        configurable: false,
      },
      connection: {
        value: connection,
        writable: false,
        configurable: false,
      },
      action: {
        value: action,
        writable: false,
        configurable: false,
      },
      [Symbol.toStringTag]: {
        value: `Rule ${ruleName}`,
        writable: false,
        enumerable: false,
        configurable: false,
      },
    });

    return rule;
  }

  throw new Error("Invalid arguments provided to Rule. Must use agent or port objects directly.");
}

Object.defineProperty(Rule, Symbol.hasInstance, {
  value: function (instance: any) {
    return isRule(instance)
  },
  writable: false,
  configurable: false,
  enumerable: false
});

// TrackedAction - Action rule with change tracking
export interface ChangeHistoryEntry {
  timestamp: number;
  ruleName: string;
  targetId: string;
  targetName: string;
  updaterId: string;
  updaterName: string;
  previousState: any;
  newState: any;
  description: string;
}

// TrackedAction factory function with ports - description at the end
export function TrackedAction<
  A1 extends IAgent,
  P1 extends IBoundPort<A1>,
  A2 extends IAgent,
  P2 extends IBoundPort<A2>
>(
  port1: P1,
  port2: P2,
  action: Action<A1, A2>,
  description?: string
): IActionRule;

// TrackedAction factory function with connection - description at the end
export function TrackedAction<
  N extends string,
  S extends IAgent,
  D extends IAgent,
  SP extends IBoundPort<S>,
  DP extends IBoundPort<D>
>(
  connection: IConnection<N, S, D, SP, DP>,
  action: Action<S, D>,
  description?: string
): IActionRule;

// Implementation
export function TrackedAction(
  portOrConnection: IBoundPort | IConnection,
  portOrAction: IBoundPort | Action,
  actionOrDescription?: Action | string,
  description?: string
): IActionRule {
  // Case 1: Using two ports
  if (isBoundPort(portOrConnection) && isBoundPort(portOrAction) && typeof actionOrDescription === 'function') {
    const port1 = portOrConnection;
    const port2 = portOrAction;
    const originalAction = actionOrDescription;
    const desc = description;
    
    // Create a tracking wrapper around the original action
    const trackingAction: Action = (agent1, agent2, network) => {
      // Capture previous state
      const previousState = {...agent1.value};
      
      // Execute the original action
      const result = originalAction(agent1, agent2, network);
      
      // Capture new state
      const newState = {...agent1.value};
      
      // Access the change history via the method if available
      if (network.getChangeHistory) {
        // Get the change history array
        const changeHistory = network.getChangeHistory();
        
        // Add to the history
        changeHistory.push({
          timestamp: Date.now(),
          ruleName: `${port1.agent.name}.${port1.name}-update-from-${port2.agent.name}.${port2.name}`,
          targetId: agent1._agentId,
          targetName: agent1.name,
          updaterId: agent2._agentId,
          updaterName: agent2.name,
          previousState,
          newState,
          description: desc || `Updated ${agent1.name} from ${agent2.name}`
        });
      }
      
      return result;
    };
    
    // Create ActionRule with the tracking wrapper
    return ActionRule(
      port1,
      port2,
      trackingAction,
      `tracked-${port1.agent.name}.${port1.name}-update-from-${port2.agent.name}.${port2.name}`
    );
  }
  
  // Case 2: Using a connection
  if (isConnection(portOrConnection) && typeof portOrAction === 'function') {
    const connection = portOrConnection;
    const originalAction = portOrAction;
    const desc = typeof actionOrDescription === 'string' ? actionOrDescription : undefined;
    
    // Create a tracking wrapper around the original action
    const trackingAction: Action = (agent1, agent2, network) => {
      // Capture previous state
      const previousState = {...agent1.value};
      
      // Execute the original action
      const result = originalAction(agent1, agent2, network);
      
      // Capture new state
      const newState = {...agent1.value};
      
      // Access the change history via the method if available
      if (network.getChangeHistory) {
        // Get the change history array
        const changeHistory = network.getChangeHistory();
        
        // Add to the history
        changeHistory.push({
          timestamp: Date.now(),
          ruleName: `tracked-${connection.name}`,
          targetId: agent1._agentId,
          targetName: agent1.name,
          updaterId: agent2._agentId,
          updaterName: agent2.name,
          previousState,
          newState,
          description: desc || `Updated ${agent1.name} from ${agent2.name}`
        });
      }
      
      return result;
    };
    
    // Create ActionRule with the tracking wrapper
    return ActionRule(
      connection,
      trackingAction,
      `tracked-${connection.name}`
    );
  }
  
  throw new Error("Invalid arguments provided to TrackedAction. Must use port objects or a connection object.");
}