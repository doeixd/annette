/**
 * Annette Core - The fundamental interaction net engine
 * 
 * This module represents the core abstraction layer of Annette,
 * providing the fundamental interaction net primitives without
 * any higher-level abstractions or extensions.
 */
import { Agent, IAgent, AgentId, AgentName } from './agent';
import { 
  Port, IPort, IBoundPort, BoundPort,
  PortTypes, PortName, PortInstanceKey, getPortInstanceKey
} from './port';
import { Connection, IConnection, ConnectionKey } from './connection';
import { 
  ActionRule, RewriteRule, Rule, IRule, 
  IActionRule, IRewriteRule, AnyRule, 
  Action, ActionReturn, Rewrite
} from './rule';
import { Network, INetwork } from './network';

/**
 * Core namespace containing the fundamental interaction net primitives
 */
export const Core = {
  // Agent system
  Agent,
  
  // Port system
  Port,
  BoundPort,
  getPortInstanceKey,
  
  // Connection system
  Connection,
  
  // Rule system
  Rule,
  ActionRule,
  RewriteRule,
  
  // Network system
  Network,
  
  /**
   * Create a new agent
   */
  createAgent<N extends string, V = any, T extends string = string>(
    name: N,
    value: V,
    ports?: any,
    type?: T
  ): IAgent<N, V, T> {
    return Agent(name, value, ports, type);
  },
  
  /**
   * Create a new port
   */
  createPort(name: string, type: PortTypes = 'aux'): IPort {
    return Port(name, type);
  },
  
  /**
   * Create a new connection between ports
   */
  createConnection(port1: IBoundPort, port2: IBoundPort): IConnection {
    return Connection(port1, port2);
  },
  
  /**
   * Create a new action rule
   */
  createActionRule(
    name: { name: string, type: 'action' },
    pattern: { agentName1: string, portName1: string, agentName2: string, portName2: string },
    action: Action
  ): IActionRule {
    return ActionRule(name, pattern, action);
  },
  
  /**
   * Create a new rewrite rule
   */
  createRewriteRule(
    name: { name: string, type: 'rewrite' },
    pattern: { agentName1: string, portName1: string, agentName2: string, portName2: string },
    rewrite: Rewrite
  ): IRewriteRule {
    return RewriteRule(name, pattern, rewrite);
  },
  
  /**
   * Create a new network
   */
  createNetwork(name: string): INetwork {
    return Network(name);
  }
};

/**
 * Type definitions for the core module
 */
export type {
  // Agent types
  IAgent,
  AgentId,
  AgentName,
  
  // Port types
  IPort,
  IBoundPort,
  PortTypes,
  PortName,
  PortInstanceKey,
  
  // Connection types
  IConnection,
  ConnectionKey,
  
  // Rule types
  IRule,
  IActionRule,
  IRewriteRule,
  AnyRule,
  Action,
  ActionReturn,
  Rewrite,
  
  // Network types
  INetwork
};

export default Core;