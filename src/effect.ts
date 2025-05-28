/**
 * Algebraic Effects Implementation for Annette
 * 
 * This module provides:
 * 1. Effect-related agent types (EffectAgent, HandlerAgent, ResultAgent)
 * 2. Specialized ports (wait/hold) for handling asynchronous operations
 * 3. Rules for effect handling and continuation
 */
import { Agent, IAgent } from "./agent";
import { INetwork } from "./network";
import { Port } from "./port";
import { ActionRule } from "./rule";

// Effect-related types
export type EffectDescription = {
  type: string;
  [key: string]: any;
};

export type EffectHandler<T = any> = (effect: EffectDescription, network: INetwork) => Promise<T>;

export type EffectHandlers = {
  [effectType: string]: EffectHandler;
};

export type EffectStatus = 'pending' | 'running' | 'completed' | 'error';

// Effect Agent Types and Values
export type EffectAgentValue = {
  effect: EffectDescription;
  status: EffectStatus;
  timestamp: number;
  metadata?: Record<string, any>;
};

export type HandlerAgentValue = {
  handlers: EffectHandlers;
  metadata?: Record<string, any>;
};

export type ResultAgentValue<T = any> = {
  result: T;
  effectType: string;
  timestamp: number;
  error?: Error;
  metadata?: Record<string, any>;
};

/**
 * Create an Effect Agent
 * 
 * Effect agents represent an intent to perform a side effect. They connect
 * to handlers that know how to perform the actual effect.
 * 
 * @param effect The effect description (e.g., {type: 'fetch', url: '...'})
 * @param metadata Optional metadata about this effect
 * @returns An Effect agent with wait port
 */
export function EffectAgent(
  effect: EffectDescription,
  metadata?: Record<string, any>
): IAgent<"Effect", EffectAgentValue> {
  return Agent("Effect", 
    {
      effect,
      status: 'pending',
      timestamp: Date.now(),
      metadata
    },
    {
      wait: Port("wait", "wait"),
      hold: Port("hold", "hold")
    }
  );
}

/**
 * Create a Handler Agent
 * 
 * Handler agents know how to perform specific effects. They connect to
 * effect agents and execute the requested effects.
 * 
 * @param handlers Map of effect type to handler functions
 * @param metadata Optional metadata
 * @returns A Handler agent with hold port
 */
export function HandlerAgent(
  handlers: EffectHandlers,
  metadata?: Record<string, any>
): IAgent<"Handler", HandlerAgentValue> {
  return Agent("Handler", 
    {
      handlers,
      metadata
    },
    {
      hold: Port("hold", "hold")
    }
  );
}

/**
 * Create a Result Agent
 * 
 * Result agents represent the completed result of an effect. They connect
 * to the original agent that requested the effect.
 * 
 * @param result The result of the effect
 * @param effectType The type of effect that was performed
 * @param metadata Optional metadata
 * @returns A Result agent
 */
export function ResultAgent<T = any>(
  result: T,
  effectType: string,
  metadata?: Record<string, any>
): IAgent<"Result", ResultAgentValue<T>> {
  return Agent("Result", 
    {
      result,
      effectType,
      timestamp: Date.now(),
      metadata
    },
    {
      wait: Port("wait", "wait")
    }
  );
}

/**
 * Create an Error Result Agent
 * 
 * Error result agents represent a failed effect. They connect to the
 * original agent that requested the effect.
 * 
 * @param error The error that occurred
 * @param effectType The type of effect that failed
 * @param metadata Optional metadata
 * @returns A Result agent with error information
 */
export function ErrorResultAgent(
  error: Error,
  effectType: string,
  metadata?: Record<string, any>
): IAgent<"Result", ResultAgentValue> {
  return Agent("Result", 
    {
      result: null,
      effectType,
      timestamp: Date.now(),
      error,
      metadata
    },
    {
      wait: Port("wait", "wait")
    }
  );
}

/**
 * Register effect handler rules
 * 
 * This sets up the rules that handle effects, including:
 * 1. The Effect-Handler interaction rule that processes effects
 * 2. The Result-Agent interaction rule that delivers results
 * 
 * @param network The network to register rules with
 */
export function registerEffectRules(network: INetwork): void {
  // Create sample agents to get their bound ports for rule creation
  const sampleEffect = EffectAgent({ type: "sample" });
  const sampleHandler = HandlerAgent({});
  const sampleResult = ResultAgent(null, "sample");
  const sampleScanner = ResultScanner();

  // Rule for Effect-Handler interaction
  network.addRule(ActionRule(
    sampleEffect.ports.hold,
    sampleHandler.ports.hold,
    (effect, handler, network) => {
      // Get the effect description and handler
      const effectDesc = effect.value.effect;
      const handlers = handler.value.handlers;
      
      // Check if this handler can handle this effect type
      if (!handlers[effectDesc.type]) {
        console.warn(`No handler found for effect type: ${effectDesc.type}`);
        
        // Create an error result
        const errorResult = ErrorResultAgent(
          new Error(`No handler found for effect type: ${effectDesc.type}`),
          effectDesc.type
        );
        
        // Add it to the network
        network.addAgent(errorResult);
        
        // We don't connect it yet because we need to find the waiting agent
        
        // Mark the effect as error
        effect.value.status = 'error';
        
        // Return all agents and an error result
        return [
          effect,
          handler,
          { type: 'add', entity: errorResult, throwIfExists: false }
        ];
      }
      
      try {
        // Mark the effect as running
        effect.value.status = 'running';
        
        // Execute the handler asynchronously
        const resultPromise = handlers[effectDesc.type](effectDesc, network);
        
        // If it's a promise, handle it async and queue the result
        if (resultPromise && typeof resultPromise.then === 'function') {
          resultPromise.then((result: any) => {
            // Create a result agent
            const resultAgent = ResultAgent(result, effectDesc.type);
            
            // Add the result agent to the network
            network.addAgent(resultAgent);
            
            // Mark the effect as completed
            effect.value.status = 'completed';
          }).catch((error: any) => {
            // Create an error result
            const errorResult = ErrorResultAgent(
              error instanceof Error ? error : new Error(String(error)),
              effectDesc.type
            );
            
            // Add it to the network
            network.addAgent(errorResult);
            
            // Mark the effect as error
            effect.value.status = 'error';
          });
        } else {
          // Synchronous result
          const resultAgent = ResultAgent(resultPromise, effectDesc.type);
          network.addAgent(resultAgent);
          effect.value.status = 'completed';
          
          return [
            effect,
            handler,
            { type: 'add', entity: resultAgent, throwIfExists: false }
          ];
        }
        
        // Return agents for now (async results will be added later)
        return [effect, handler];
        
      } catch (error) {
        // Create an error result
        const errorResult = ErrorResultAgent(
          error instanceof Error ? error : new Error(String(error)),
          effectDesc.type
        );
        
        // Add it to the network
        network.addAgent(errorResult);
        
        // Mark the effect as error
        effect.value.status = 'error';
        
        // Return all agents and an error result
        return [
          effect,
          handler,
          { type: 'add', entity: errorResult, throwIfExists: false }
        ];
      }
    }
  ));
  
  // Rule for connecting Result agents to waiting agents
  network.addRule(ActionRule(
    sampleResult.ports.wait,
    sampleEffect.ports.wait,
    (result, effect, _network) => {
      console.log(`Delivering result for effect type: ${result.value.effectType}`);
      
      // Return both agents to keep them in the network
      return [result, effect];
    }
  ));
  
  // Rule for scanning the network to connect results to waiters
  network.addRule(ActionRule(
    sampleResult.ports.wait,
    sampleScanner.ports.main,
    (result, scanner, network) => {
      // Find effects with wait ports
      const effects = network.findAgents({ name: "Effect" });
      
      // For effects that match this result's type, connect the result
      for (const effect of effects) {
        if (effect.value.effect.type === result.value.effectType) {
          // If this effect has a wait port that's not connected
          const waitPort = effect.ports.wait;
          
          // Check if wait port exists and isn't connected
          if (waitPort && !network.isPortConnected(waitPort)) {
            // Connect the result to the waiting effect
            network.connectPorts(result.ports.wait, waitPort);
            break; // Only connect to one effect
          }
        }
      }
      
      // Return both agents
      return [result, scanner];
    }
  ));
}

/**
 * Create a ResultScanner agent
 * 
 * This helper agent scans for result agents and connects them to
 * waiting effects.
 * 
 * @returns A ResultScanner agent
 */
export function ResultScanner(): IAgent<"ResultScanner", any> {
  return Agent("ResultScanner", {}, { main: Port("main", "main") });
}

/**
 * Create a Constructor agent with a wait port
 * 
 * Constructor agents represent components that can perform effects.
 * They use wait ports to suspend execution while waiting for effects.
 * 
 * @param value The agent's value
 * @returns A Constructor agent with a wait port
 */
export function Constructor<T = any>(value: T): IAgent<"Constructor", T> {
  return Agent("Constructor", value, {
    main: Port("main", "main"),
    wait: Port("wait", "wait")
  });
}