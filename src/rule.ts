import { IConnection } from "./connection";
import { TAgent } from "./agent";

export type ActionReturn = void | (TAgent | IConnection)[]

export type Action<
  Source extends TAgent = TAgent, 
  Destination extends TAgent = TAgent
> = 
  ((connection: IConnection<string, Source, Destination>) => ActionReturn) 
  | ((source: Source, destination: Destination) => ActionReturn)
  | ((sourceName: Source['name'], destinationName: Destination['name']) => ActionReturn)

export interface Rule<
  Name extends string = string, 
  TConnection extends IConnection<string, any, any, any, any> = IConnection,
  TAction extends Action = Action
> {
  name: Name;
  connection: TConnection;
  action: TAction
}

export type CreateRuleFn = 
  <Name extends string, Source extends TAgent, Destination extends TAgent, TAction extends Action, TConnection extends IConnection<string, Source, Destination>>(name: Name, connection: TConnection, action: Action<Source, Destination>) => Rule<Name, TConnection, TAction> 
  | ((name: Name, connection: [source: string, destination: string], action: TAction) => Rule<Name, TConnection, TAction>)


export function isRule(rule: any): rule is Rule {
  if (typeof rule !== 'object') {
    return false
  } else {
    return ('name' in rule && 'connection' in rule && 'action' in rule) || rule instanceof Rule
  }
}

export function Rule (name: string, connection: IConnection, action: Action) {
  const rule =  new class Rule {
    name = name
    connection = connection  
    action = action
  } as Rule<typeof name, typeof connection, typeof action>

  Object.defineProperties(rule, {
    name: {
      value: name,
      writable: false,
      configurable: false
    },
    connection: {
      value: connection,
      writable: false,
      configurable: false
    },
    action: {
      value: action,
      writable: false,
      configurable: false
    },
    [Symbol.toStringTag]: {
      value: `Rule ${name}`,
      writable: false,
      enumerable: false,
      configurable: false
    }
  })

}

Object.defineProperty(Rule, Symbol.hasInstance, {
  value: function (instance: any) {
    return isRule(instance)
  },
  writable: false,
  configurable: false,
  enumerable: false
})



// const createRule: CreateRuleFn = <AgentOne extends Agent<string, any>, AgentTwo extends Agent<string, any>, Action extends (AgentOne, AgentTwo) => any = (AgentOne, AgentTwo) => any, Name extends string = ''>(name: Name, agentOne: AgentOne, agentTwo: AgentTwo, action: Action) => {
//   return {
//     name,
//     action
//   } as Rule<AgentOne, AgentTwo, Action, Name>
// }