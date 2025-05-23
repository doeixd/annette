// Example demonstrating the fully typed object-based API

import { Agent, Network, ActionRule, RewriteRule, Port, BoundPort } from '../src';

// Create a network for our typed example
const net = Network("typed-network");

// Create agents with specific types
interface CounterState {
  count: number;
}

// You can use specific types for your agents
const counter = Agent<"Counter", CounterState>("Counter", { count: 0 });
const incrementer = Agent<"Incrementer", { amount: number }>("Incrementer", { amount: 5 });
const display = Agent<"Display", { output: string }>("Display", { output: "" });

// Add agents to the network
net.addAgent(counter);
net.addAgent(incrementer);
net.addAgent(display);

// Define a strongly typed action rule that works directly with port objects
const incrementRule = ActionRule(
  "increment-counter",
  counter.ports.main,
  incrementer.ports.main,
  (counter, incrementer, _network) => {
    // TypeScript knows the type of counter and incrementer
    counter.value.count += incrementer.value.amount;
    
    // Return the agents to keep in the network
    return [counter, incrementer];
  }
);

// Add another port to counter for display connection
counter.ports.output = BoundPort(Port("output", "aux"), counter);
display.ports.input = BoundPort(Port("input", "aux"), display);

// Define a display rule
const displayRule = ActionRule(
  "update-display",
  counter.ports.output,
  display.ports.input,
  (counter, display, _network) => {
    // TypeScript knows the types here too
    display.value.output = `Current count: ${counter.value.count}`;
    return [counter, display];
  }
);

// Add rules to the network
net.addRule(incrementRule);
net.addRule(displayRule);

// Connect agents - typescript knows the types
net.connectPorts(counter.ports.main, incrementer.ports.main);
net.connectPorts(counter.ports.output, display.ports.input);

// Execute the reduction and log the result
console.log("Before reduction:", counter.value, display.value);
const steps = net.reduce();
console.log("After reduction:", counter.value, display.value);
console.log("Steps performed:", steps);

// Create a rule using the object-based RewriteRule
// First create some simple numeric agents
const num1 = Agent<"Number", number>("Number", 10);
const num2 = Agent<"Number", number>("Number", 15);
net.addAgent(num1);
net.addAgent(num2);

// Create a rewrite rule for adding two numbers
const addRule = RewriteRule(
  "add-numbers",
  num1.ports.main,
  num2.ports.main,
  (n1, n2) => {
    // Type-safe access to agent values
    const sum = n1.value + n2.value;
    
    return {
      newAgents: [
        { name: "Result", initialValue: sum, _templateId: "sumResult" }
      ],
      internalConnections: [],
      portMapAgent1: {
        main: null // Main port connection is consumed
      },
      portMapAgent2: {
        main: null // Main port connection is consumed
      }
    };
  }
);

// Add rule and connect
net.addRule(addRule);
net.connectPorts(num1.ports.main, num2.ports.main);

// Execute and check result
console.log("\nBefore number addition:", num1.value, "+", num2.value);
const moreSteps = net.reduce();
console.log("Addition steps performed:", moreSteps);

// Find result agents
const resultAgents = net.findAgents({ name: "Result" });
console.log("Result of addition:", resultAgents[0].value);