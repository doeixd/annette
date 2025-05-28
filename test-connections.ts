// Test file to demonstrate the new connection exposure functionality
import { Core } from './src/core';

// Create a simple network
const network = Core.createNetwork('test-network');

// Create some agents
const agent1 = Core.createAgent('Agent1', { data: 'hello' });
const agent2 = Core.createAgent('Agent2', { data: 'world' });

// Add agents to network
network.addAgent(agent1);
network.addAgent(agent2);

// Connect them
const connection = network.connectPorts(agent1.ports.main, agent2.ports.main);

// Now we can access connections through the new methods!
console.log('All connections:', network.getAllConnections());
console.log('Connections from agent1.main:', network.findConnections({ from: agent1.ports.main }));

// This shows the connection object structure
const allConnections = network.getAllConnections();
if (allConnections.length > 0) {
    const conn = allConnections[0];
    console.log('Connection details:');
    console.log('- Name:', conn.name);
    console.log('- Source agent:', conn.source.name);
    console.log('- Source port:', conn.sourcePort.name);
    console.log('- Destination agent:', conn.destination.name);
    console.log('- Destination port:', conn.destinationPort.name);
}