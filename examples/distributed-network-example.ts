/**
 * Distributed Network Example
 * 
 * This example demonstrates how to use distributed networks in Annette:
 * 1. Server-client architecture
 * 2. Network serialization with rules
 * 3. Real-time synchronization
 */
import {
  Network, Agent, Port, ActionRule,
  DistributedNetwork, createDistributedNetworkServer, createDistributedNetworkClient
} from '../src/index';

// To run this example in a browser or Node.js environment with WebSocket support

/**
 * Start a distributed network server
 */
function startServer() {
  console.log("Starting distributed network server...");
  
  // Create the base network
  const network = Network("counter-server");
  
  // Create a counter agent
  const counter = Agent("Counter", { value: 0 }, {
    main: Port("main", "main"),
    increment: Port("increment", "aux"),
    decrement: Port("decrement", "aux")
  });
  
  // Add the counter to the network
  network.addAgent(counter);
  
  // Create an incrementer agent
  const incrementer = Agent("Incrementer", { amount: 1 }, {
    main: Port("main", "main")
  });
  
  // Add the incrementer to the network
  network.addAgent(incrementer);
  
  // Define increment rule
  const incrementRule = ActionRule(
    { name: "Increment", type: "action" },
    { 
      agentName1: "Counter", 
      portName1: "increment", 
      agentName2: "Incrementer", 
      portName2: "main" 
    },
    (counter, incrementer) => {
      counter.value.value += incrementer.value.amount;
      console.log(`Server counter incremented to: ${counter.value.value}`);
      return [counter, incrementer];
    }
  );
  
  // Add the rule to the network
  network.addRule(incrementRule);
  
  // Create a distributed network server
  const server = createDistributedNetworkServer({
    serverUrl: 'ws://localhost:3000',
    transportOptions: {
      // In a real implementation, you would set up a WebSocket server here
      // For this example, we'll use a custom transport to simulate the server
      connect: ({ peerId, onMessage, onConnect, onDisconnect }) => {
        console.log(`Server ${peerId} started`);
        onConnect();
        
        return {
          send: (message) => {
            console.log(`Server sending message: ${message.type}`);
            // In a real implementation, this would send to connected clients
            
            // For demo purposes, we'll simulate receiving this in the client
            if (typeof simulateClientReceiveMessage === 'function') {
              setTimeout(() => {
                simulateClientReceiveMessage(message);
              }, 100);
            }
          },
          
          close: () => {
            console.log('Server connection closed');
            onDisconnect();
          }
        };
      }
    }
  });
  
  // Set up connection status listener
  server.onConnectionChange((status) => {
    console.log(`Server connection status: ${status}`);
  });
  
  // Make the server available globally for the demo
  (global as any).demoServer = server;
  
  return server;
}

// Variable to hold the simulated message handler
let simulateClientReceiveMessage: ((message: any) => void) | null = null;

/**
 * Start a distributed network client
 */
function startClient() {
  console.log("Starting distributed network client...");
  
  // Create the base network
  const network = Network("counter-client");
  
  // Create a counter view agent
  const counterView = Agent("CounterView", { value: 0 }, {
    main: Port("main", "main"),
    update: Port("update", "aux")
  });
  
  // Add the counter view to the network
  network.addAgent(counterView);
  
  // Create a distributed network client
  const client = createDistributedNetworkClient('ws://localhost:3000', {
    transportOptions: {
      // In a real implementation, you would set up a WebSocket client here
      // For this example, we'll use a custom transport to simulate the client
      connect: ({ peerId, onMessage, onConnect, onDisconnect }) => {
        console.log(`Client ${peerId} started`);
        
        // Store the message handler for simulation
        simulateClientReceiveMessage = onMessage;
        
        onConnect();
        
        return {
          send: (message) => {
            console.log(`Client sending message: ${message.type}`);
            // In a real implementation, this would send to the server
            
            // For demo purposes, we'll simulate receiving this in the server
            if ((global as any).demoServer) {
              setTimeout(() => {
                (global as any).demoServer.handleMessage(message);
              }, 100);
            }
          },
          
          close: () => {
            console.log('Client connection closed');
            onDisconnect();
          }
        };
      }
    }
  });
  
  // Set up connection status listener
  client.onConnectionChange((status) => {
    console.log(`Client connection status: ${status}`);
  });
  
  // Return the client for further interaction
  return client;
}

/**
 * Run the example
 */
async function runExample() {
  console.log("Running distributed network example...");
  
  // Start the server
  const server = startServer();
  
  // Wait a moment for the server to initialize
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Start the client
  const client = startClient();
  
  // Wait for connection and synchronization
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Demonstrate accessing the server's network
  const serverNetwork = server.getNetwork();
  const counterAgents = serverNetwork.findAgents({ name: "Counter" });
  
  if (counterAgents.length > 0) {
    const counter = counterAgents[0];
    console.log(`Server counter value: ${counter.value.value}`);
    
    // Increment the counter
    const incrementerAgents = serverNetwork.findAgents({ name: "Incrementer" });
    
    if (incrementerAgents.length > 0) {
      const incrementer = incrementerAgents[0];
      
      // Connect counter to incrementer
      console.log("Connecting counter to incrementer...");
      serverNetwork.connectPorts(counter.ports.increment, incrementer.ports.main);
      
      // Reduce the network to apply the rule
      serverNetwork.reduce();
      
      console.log(`Server counter value after increment: ${counter.value.value}`);
    }
  }
  
  // Wait for synchronization
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check the client's view of the counter
  const clientNetwork = client.getNetwork();
  const counterViews = clientNetwork.findAgents({ name: "CounterView" });
  
  if (counterViews.length > 0) {
    const counterView = counterViews[0];
    console.log(`Client counter view value: ${counterView.value.value}`);
  }
  
  // Serialize the entire network
  console.log("\nSerializing the network...");
  const serialized = server.serialize();
  console.log("Serialized network:", JSON.stringify(serialized, null, 2).substring(0, 500) + "...");
  
  // In a real application, you could now:
  // 1. Save the serialized network to a file or database
  // 2. Load it in another environment
  // 3. Create multiple connected clients
  // 4. Implement real-time collaborative features
  
  // Clean up
  setTimeout(() => {
    console.log("\nCleaning up...");
    server.disconnect();
    client.disconnect();
    console.log("Example completed!");
  }, 2000);
}

// Run the example
runExample().catch(console.error);