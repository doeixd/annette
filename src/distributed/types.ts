// Type Aliases
export type AgentId = string;
export type AgentName = string;
export type PortName = string;
export type Hash = string;

// IVectorClock Interface
export interface IVectorClock {
  clock: Record<string, number> | Map<string, number>;
  increment(nodeId: string): void;
  get(nodeId: string): number;
  set(nodeId: string, value: number): void;
  merge(other: IVectorClock): void;
  isBefore(other: IVectorClock): boolean;
  isAfter(other: IVectorClock): boolean;
  isConcurrentWith(other: IVectorClock): boolean;
  equals(other: IVectorClock): boolean;
  clone(): IVectorClock;
  toString(): string;
  toObject(): Record<string, number>;
}

// AgentStateSnapshot Interface
export interface AgentStateSnapshot {
  id: AgentId;
  name: AgentName;
  serializedValue: string;
  valueHash: Hash;
  portConnections: Record<PortName, { connectedToAgentId: AgentId, connectedToPortName: PortName } | null>;
  structureHash: Hash;
  vectorClock: Record<string, number>;
  originNodeIdIfConflictResolution?: string;
}

// InteractionEvent Interface
export interface InteractionEvent {
  eventId: string;
  ruleName: string;
  ruleType: 'action' | 'deterministic_action' | 'rewrite';
  agent1Id: AgentId;
  port1Name: PortName;
  agent2Id: AgentId;
  port2Name: PortName;
  ruleArgs?: any;
  eventVC: Record<string, number>;
  originNodeId: string;
  timestamp: number;
  createdAgentSnapshots?: AgentStateSnapshot[];
}

// IAgentDefinition and IConnectionDefinition Interfaces
import { IPort } from '../port';

export interface IAgentDefinition {
  _isAgentDef: true;
  name: AgentName;
  value: any;
  ports: Record<PortName, IPort>;
  idSuggestion?: AgentId;
}

export interface IConnectionDefinition {
  _isConnectionDef: true;
  agent1Id: AgentId;
  port1Name: PortName;
  agent2Id: AgentId;
  port2Name: PortName;
  name?: string;
}

// NetworkSyncPayload Union Type and Messages
export interface BroadcastEvent {
  type: "BroadcastEvent";
  event: InteractionEvent;
}

export interface RequestAgentStates {
  type: "RequestAgentStates";
  agentIds: AgentId[];
  fromNodeId: string;
  replyToEventId?: string;
}

export interface RespondAgentStates {
  type: "RespondAgentStates";
  snapshots: AgentStateSnapshot[];
  toNodeId: string;
  forEventId?: string;
}

export type NetworkSyncPayload = BroadcastEvent | RequestAgentStates | RespondAgentStates;

// DistributedAgentState Interface
// IVectorClock is already defined in this file, so no import is needed.
export interface DistributedAgentState {
  vectorClock: IVectorClock;
  valueHash: Hash;
  structureHash: Hash;
  portConnections: Record<PortName, { connectedToAgentId: AgentId, connectedToPortName: PortName } | null>;
}
