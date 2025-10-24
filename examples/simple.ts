import { Agent, Network, ActionRule, RewriteRule, Port } from "../src";

// Create a simple counter example with rich types
// Define types for our agents' values
type CounterValue = number;
type IncrementValue = { amount: number; operation: 'add' };
type DecrementValue = { amount: number; operation: 'subtract' };
type DisplayValue = { current: number; history: number[] };

// Create a network
const net = Network("counter-example");

// Create strongly-typed agents with explicit port definitions
const counter = Agent<"Counter", CounterValue>("Counter", 0);
const increment = Agent<"Increment", IncrementValue>("Increment", { amount: 1, operation: 'add' });
const decrement = Agent<"Decrement", DecrementValue>("Decrement", { amount: 1, operation: 'subtract' });
const display = Agent<"Display", DisplayValue>("Display", { current: 0, history: [] });

// Add agents to the network
net.addAgent(counter);
net.addAgent(increment);
net.addAgent(decrement);
net.addAgent(display);

// Define an ActionRule using the object-based API (direct port references)
// Name is optional - will be auto-generated if omitted
const incrementRule = ActionRule(
  // "increment-counter", // Name can be omitted
  counter.ports.main,
  increment.ports.main,
  (counter, increment, network) => {
    // Strongly-typed access to the agent values
    counter.value += increment.value.amount;
    
    // Return the agents to keep in the network
    return [counter, increment];
  }
);

// Define an ActionRule for Counter<->Decrement interaction
// Using auto-generated name (Counter.main-to-Decrement.main)
const decrementRule = ActionRule(
  counter.ports.main,
  decrement.ports.main,
  (counter, decrement, network) => {
    // Strongly-typed decrement operation
    counter.value -= decrement.value.amount;
    
    // Return the agents to keep in the network
    return [counter, decrement];
  }
);

// Define an ActionRule for Counter<->Display interaction
// Name parameter is optional - shown here with explicit name for comparison
const displayRule = ActionRule(
  counter.ports.main,
  display.ports.main,
  (counter, display, network) => {
    // Update the display value using type-safe operations
    display.value.history.push(display.value.current);
    display.value.current = counter.value;
    console.log(`Display value: ${display.value.current} (history: ${display.value.history.join(', ')})`);
    
    // Return the agents to keep in the network
    return [counter, display];
  }
);

// Create agents with multiple ports for the rewrite rule demonstration
const inc1 = Agent<"Increment", IncrementValue>(
  "Increment", 
  { amount: 2, operation: 'add' },
  { 
    main: Port("main", "main"), 
    aux: Port("aux", "aux") 
  }
);

const inc2 = Agent<"Increment", IncrementValue>(
  "Increment", 
  { amount: 3, operation: 'add' },
  { 
    main: Port("main", "main"), 
    aux: Port("aux", "aux") 
  }
);

// Define a RewriteRule using the object-based API and function-based definition
// Rule name is optional - will be auto-generated with format: rewrite-[agent1].[port1]-to-[agent2].[port2]
const doubleIncrementRule = RewriteRule(
  // Name is optional
  inc1.ports.aux,
  inc2.ports.aux,
  (inc1, inc2) => {
    // Can access strongly-typed values in the rule definition
    const totalAmount = inc1.value.amount + inc2.value.amount;
    
    return {
      newAgents: [
        { 
          name: "Increment", 
          initialValue: { amount: totalAmount, operation: 'add' }, 
          _templateId: "newIncrement" 
        }
      ],
      internalConnections: [],
      portMapAgent1: {
        main: { newAgentTemplateId: "newIncrement", newPortName: "main" },
      },
      portMapAgent2: {
        main: null
      }
    };
  }
);

// Add all rules to the network
net.addRule(incrementRule);
net.addRule(decrementRule);
net.addRule(displayRule);
net.addRule(doubleIncrementRule);

// Add rewrite rule agents to network
net.addAgent(inc1);
net.addAgent(inc2);

// First, connect counter to increment and execute one step
// Connection name is optional - auto-generated as: Counter.main(main)-to-Increment.main(main)
const conn1 = net.connectPorts(counter.ports.main, increment.ports.main);
console.log("Before increment:", counter.value);
net.step();
console.log("After increment:", counter.value);

// Connect counter to display and execute one step
const conn2 = net.connectPorts(counter.ports.main, display.ports.main);
net.step();
console.log("Display current:", display.value.current);

// Connect counter to decrement and execute one step
const conn3 = net.connectPorts(counter.ports.main, decrement.ports.main);
net.step();
console.log("After decrement:", counter.value);

// Connect aux ports to trigger the rewrite rule
const auxConn = net.connectPorts(inc1.ports.aux, inc2.ports.aux);
console.log("Before rewrite:", inc1.value.amount, inc2.value.amount);
net.step();

// Find the new agent
const newIncrements = net.findAgents({ name: "Increment" });
console.log("After rewrite - increments in network:", newIncrements.length);

// Get the newest increment (should be our combined one)
const lastIncrement = newIncrements[newIncrements.length - 1];
console.log("New increment value:", lastIncrement.value.amount);

// Execute all remaining reductions until fixed point
console.log("Total steps performed:", net.reduce());