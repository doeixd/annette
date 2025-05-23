import { Agent, Network, ActionRule, RewriteRule, Port } from "../src";

/**
 * This example demonstrates the dynamic typing system in Annette.
 * It shows how:
 * 1. Agent values can have rich type information
 * 2. The object-based API preserves type information
 * 3. Different port configurations can be used
 * 4. Values are preserved through transformations
 */

// Network for orchestrating interactions
const net = Network("dynamic-typing-example");

// Example 1: Simple Counter with record type
interface CounterData {
  count: number;
  history: number[];
  lastOperation?: string;
}

// Create a counter agent with typed value
const counter = Agent<"Counter", CounterData>(
  "Counter", 
  { count: 0, history: [] }
);

// Example 2: Operation agents with different port configurations
interface Operation {
  type: string;
  amount: number;
}

// Create increment with an array of ports
const increment = Agent<"Increment", Operation>(
  "Increment",
  { type: "add", amount: 5 },
  [
    Port("main", "main"),
    Port("secondary", "aux"),
    Port("debug", "aux")
  ]
);

// Create decrement with an object definition of ports
const decrement = Agent<"Decrement", Operation>(
  "Decrement",
  { type: "subtract", amount: 3 },
  { 
    main: "main",
    secondary: "aux"
  }
);

// Create multiply with a map of ports
const multiply = Agent<"Multiply", Operation>(
  "Multiply",
  { type: "multiply", amount: 2 },
  {
    main: Port("main", "main"),
    factor: Port("factor", "aux")
  }
);

// Example 3: Reporter agent for displaying results
interface Reporter {
  prefix: string;
  logs: string[];
}

const reporter = Agent<"Reporter", Reporter>(
  "Reporter",
  { prefix: "STATUS", logs: [] }
);

// Add all agents to the network
net.addAgent(counter);
net.addAgent(increment);
net.addAgent(decrement);
net.addAgent(multiply);
net.addAgent(reporter);

// Define rules that demonstrate object-based API and type preservation

// Rule 1: Counter + Increment rule
const incrementRule = ActionRule(
  "counter-increment",
  counter.ports.main,
  increment.ports.main,
  (counter, increment, _network) => {
    // Fully typed operation
    const { count, history } = counter.value;
    const { amount, type } = increment.value;
    
    // Update the counter with typed values
    counter.value = {
      count: count + amount,
      history: [...history, count],
      lastOperation: type
    };
    
    return [counter, increment];
  }
);

// Rule 2: Counter + Decrement rule
const decrementRule = ActionRule(
  "counter-decrement",
  counter.ports.main,
  decrement.ports.main,
  (counter, decrement, _network) => {
    // Fully typed operation
    const { count, history } = counter.value;
    const { amount, type } = decrement.value;
    
    // Update the counter with typed values
    counter.value = {
      count: count - amount,
      history: [...history, count],
      lastOperation: type
    };
    
    return [counter, decrement];
  }
);

// Rule 3: Counter + Multiply rule
const multiplyRule = ActionRule(
  "counter-multiply",
  counter.ports.main,
  multiply.ports.main,
  (counter, multiply, _network) => {
    // Fully typed operation
    const { count, history } = counter.value;
    const { amount, type } = multiply.value;
    
    // Update the counter with typed values
    counter.value = {
      count: count * amount,
      history: [...history, count],
      lastOperation: type
    };
    
    return [counter, multiply];
  }
);

// Rule 4: Counter + Reporter rule
const reportRule = ActionRule(
  "counter-report",
  counter.ports.main,
  reporter.ports.main,
  (counter, reporter, _network) => {
    const { count, lastOperation } = counter.value;
    const { prefix, logs } = reporter.value;
    
    // Generate a report message
    const message = `${prefix}: Count=${count}, Last Op=${lastOperation || 'none'}`;
    
    // Update the reporter with the new log
    reporter.value = {
      ...reporter.value,
      logs: [...logs, message]
    };
    
    // Display the message
    console.log(message);
    
    return [counter, reporter];
  }
);

// Rule 5: Increment + Decrement rewrite rule
// This rule demonstrates replacing two agents with a new one
const combineOperationsRule = RewriteRule(
  "combine-operations",
  increment.ports.secondary,
  decrement.ports.secondary,
  (increment, decrement) => {
    const incAmount = increment.value.amount;
    const decAmount = decrement.value.amount;
    const netAmount = incAmount - decAmount;
    
    // Determine the type based on the net amount
    const netType = netAmount >= 0 ? "add" : "subtract";
    const absAmount = Math.abs(netAmount);
    
    return {
      // Create a new agent with the combined operation
      newAgents: [
        { 
          name: netType === "add" ? "Increment" : "Decrement", 
          initialValue: { 
            type: netType, 
            amount: absAmount 
          }, 
          _templateId: "combinedOp" 
        }
      ],
      internalConnections: [],
      // Map the original ports to the new agent
      portMapAgent1: {
        main: { newAgentTemplateId: "combinedOp", newPortName: "main" },
        debug: null // Drop this connection
      },
      portMapAgent2: {
        main: null // Drop this connection
      }
    };
  }
);

// Add rules to the network
net.addRule(incrementRule);
net.addRule(decrementRule);
net.addRule(multiplyRule);
net.addRule(reportRule);
net.addRule(combineOperationsRule);

// Now run a series of operations to demonstrate the dynamic typing

// First, connect counter to reporter to display initial state
console.log("\n--- Initial State ---");
net.connectPorts(counter.ports.main, reporter.ports.main);
net.step();

// Then connect counter to increment and perform the operation
console.log("\n--- After Increment ---");
net.connectPorts(counter.ports.main, increment.ports.main);
net.step();
net.connectPorts(counter.ports.main, reporter.ports.main);
net.step();

// Then connect counter to decrement and perform the operation
console.log("\n--- After Decrement ---");
net.connectPorts(counter.ports.main, decrement.ports.main);
net.step();
net.connectPorts(counter.ports.main, reporter.ports.main);
net.step();

// Connect counter to multiply and perform the operation
console.log("\n--- After Multiply ---");
net.connectPorts(counter.ports.main, multiply.ports.main);
net.step();
net.connectPorts(counter.ports.main, reporter.ports.main);
net.step();

// Test the rewrite rule
console.log("\n--- Testing Rewrite Rule ---");
console.log("Before rewrite:");
console.log(`- Increment: ${increment.value.type} ${increment.value.amount}`);
console.log(`- Decrement: ${decrement.value.type} ${decrement.value.amount}`);

// Connect the secondary ports to trigger the rewrite rule
net.connectPorts(increment.ports.secondary, decrement.ports.secondary);
net.step();

// Find the resulting agent
console.log("\nAfter rewrite:");
const incs = net.findAgents({ name: "Increment" });
const decs = net.findAgents({ name: "Decrement" });

// Display the results
if (incs.length > 1) {
  // The net result was an increment
  const newInc = incs[incs.length - 1];
  console.log(`- New agent: Increment ${newInc.value.type} ${newInc.value.amount}`);
} else if (decs.length > 1) {
  // The net result was a decrement
  const newDec = decs[decs.length - 1];
  console.log(`- New agent: Decrement ${newDec.value.type} ${newDec.value.amount}`);
}

// Final state of the counter
console.log("\n--- Final Counter State ---");
console.log(`Count: ${counter.value.count}`);
console.log(`History: [${counter.value.history.join(', ')}]`);
console.log(`Last operation: ${counter.value.lastOperation}`);

// Reporter logs
console.log("\n--- Reporter Logs ---");
reporter.value.logs.forEach((log, i) => {
  console.log(`${i+1}. ${log}`);
});