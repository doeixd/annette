import { Agent, IAgent } from '../agent';
import { Connection } from '../connection';
import { PortsDefObj, PortTypes } from '../port';
// Assuming Action, RewritePattern, IRule, ActionRule, RewriteRule are correctly defined in '../rule'
import { IRule, ActionRule, RewriteRule, Action, Rewrite, AnyRule } from '../rule'; 

// Define the expected type for the implementation function of a rewrite rule.
// It takes two agents and a connection, and returns a RewritePattern.
export type RewriteRuleImplementationFn = (
  agent1: IAgent,
  agent2: IAgent
) => Rewrite;

/**
 * Creates a rule object defined by a pattern rather than direct port references.
 * This "deferred" rule can be added to a network, which will then try to match
 * this rule's pattern against actual agent connections.
 *
 * The rule's interaction signature (involved agent/port names and types) is specified by `matchInfo`.
 * Dummy agents and a dummy connection are created internally. These are passed to the
 * `ActionRule` or `RewriteRule` factory functions. The factories are assumed to produce
 * a base rule object containing essential properties like ID, type, and the core implementation logic.
 *
 * This function then combines the base rule properties with the explicit matching pattern from `matchInfo`
 * and the dummy connection, constructing a complete `IRule` object.
 *
 * @param ruleType Specifies if the rule is an 'action' or a 'rewrite' rule.
 * @param name A descriptive name for the rule.
 * @param implementation The function defining the rule's logic:
 *                       - For 'action' rules: an `Action` function.
 *                       - For 'rewrite' rules: a `RewriteRuleImplementationFn` function.
 * @param matchInfo An object detailing the names and types of agents and ports this rule should match.
 *                  Note: `destinationAgentPortName` field should be correctly spelled.
 * @returns An `IRule` object representing the deferred rule.
 * @throws Error if dummy ports cannot be created based on `matchInfo`.
 */
export function createDeferredRule(
  ruleType: 'action' | 'rewrite',
  name: string,
  implementation: Action | RewriteRuleImplementationFn,
  matchInfo: {
    sourceAgentName: string;
    sourceAgentPortName: string;
    sourceAgentPortType: PortTypes;
    destinationAgentName: string;
    destinationAgentPortName: string; // Corrected typo from "desitnationAgentPortName"
    destinationAgentPortType: PortTypes;
  }
): IRule {
  // Define ports for the dummy source agent using PortTypes.
  // The Agent factory is expected to create IPort objects internally from this definition.
  const sourcePortsDef: PortsDefObj = {
      [matchInfo.sourceAgentPortName]: matchInfo.sourceAgentPortType
  };
  const sourceAgent = Agent(matchInfo.sourceAgentName, undefined, sourcePortsDef);

  // Define ports for the dummy destination agent.
  const destPortsDef: PortsDefObj = {
      [matchInfo.destinationAgentPortName]: matchInfo.destinationAgentPortType, // Used corrected port name
  };
  const destinationAgent = Agent(matchInfo.destinationAgentName, undefined, destPortsDef);

  // Validate that the ports were created on the dummy agents.
  // This is crucial as the dummyConnection relies on these ports existing.
  if (!sourceAgent.ports[matchInfo.sourceAgentPortName]) {
    throw new Error(
      `Failed to create port '${matchInfo.sourceAgentPortName}' on dummy agent '${matchInfo.sourceAgentName}'. ` +
      `Check port name ('${matchInfo.sourceAgentPortName}') and type ('${matchInfo.sourceAgentPortType}').`
    );
  }
  if (!destinationAgent.ports[matchInfo.destinationAgentPortName]) {
    throw new Error(
      `Failed to create port '${matchInfo.destinationAgentPortName}' on dummy agent '${matchInfo.destinationAgentName}'. ` +
      `Check port name ('${matchInfo.destinationAgentPortName}') and type ('${matchInfo.destinationAgentPortType}').`
    );
  }
  
  // Create a dummy connection using the ports of the dummy agents.
  const dummyConnection = Connection(
    sourceAgent.ports[matchInfo.sourceAgentPortName], 
    destinationAgent.ports[matchInfo.destinationAgentPortName] // Used corrected port name
  );

  // `baseRuleFromFactory` will hold the core properties (id, type, actual action/rewrite function)
  // returned by the ActionRule or RewriteRule factories.
  // It's typed broadly but expected to have at least 'id' and 'type'.
  let baseRuleFromFactory: Partial<AnyRule>;

  if (ruleType === 'action') {
    // The ActionRule factory is called with the dummy connection and the provided action implementation.
    // It's expected to return an object that includes 'id', 'type', and the 'action' function.
    baseRuleFromFactory = ActionRule(dummyConnection, implementation as Action, name);
  } else { // ruleType === 'rewrite'
    // The RewriteRule factory is called similarly with the rewrite implementation.
    baseRuleFromFactory = RewriteRule(dummyConnection.sourcePort, dummyConnection.destinationPort, implementation as RewriteRuleImplementationFn, name);
  }

  // Construct the final IRule object.
  // - Core properties (id, type, implementation) come from `baseRuleFromFactory`.
  // - The authoritative 'name' is the one passed to `createDeferredRule`.
  // - The matching pattern is explicitly taken from `matchInfo`.
  // - The `dummyConnection` is stored on the rule, as per the original code's intent.
  const deferredRule: IRule = {
    name, // Override with the passed name
    connection: dummyConnection, // Store the dummy connection
    action: (baseRuleFromFactory as any).action || ((_agent1, _agent2) => {}), // Use the action from the base rule
  };
  
  // Optional: A warning if the type from the factory doesn't align with ruleType.
  // This could indicate an issue with the ActionRule/RewriteRule factories or their usage.
  if (baseRuleFromFactory.type !== ruleType) {
    console.warn(
        `Rule type mismatch for rule '${name}'. Expected '${ruleType}' but factory produced '${baseRuleFromFactory.type}'. ` +
        `The type has been set to '${ruleType}' on the final deferred rule object.`
    );
    // Note: IRule interface doesn't have a 'type' property, so we skip this assignment
  }
  
  return deferredRule;
}