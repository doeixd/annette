import { describe, it, expect, beforeEach } from 'vitest';
import { Network, Agent, ActionRule, Port } from '../src';


 describe('Annette Library - Core Functionality', () => {
   let network: ReturnType<typeof Network>;

   beforeEach(() => {
     network = Network('test-network');
   });

   describe('Network Creation and Basic Operations', () => {
     it('can create a basic network', () => {
       expect(network).toBeDefined();
       expect(network.name).toBe('test-network');
       expect(network.id).toBeDefined();
       expect(typeof network.id).toBe('string');
     });

     it('starts with no agents', () => {
       const agents = network.getAllAgents();
       expect(agents).toBeDefined();
       expect(Array.isArray(agents)).toBe(true);
       expect(agents.length).toBe(0);
     });

     it('starts with no connections', () => {
       const connections = network.getAllConnections();
       expect(connections).toBeDefined();
       expect(Array.isArray(connections)).toBe(true);
       expect(connections.length).toBe(0);
     });

     it('starts with no rules', () => {
       const rules = network.getAllRules();
       expect(rules).toBeDefined();
       expect(Array.isArray(rules)).toBe(true);
       expect(rules.length).toBe(0);
     });
   });

   describe('Agent Creation and Management', () => {
     it('can create agents with different configurations', () => {
       const agent1 = Agent('counter', { count: 0 });
       const agent2 = Agent('adder', { value: 5 });

       expect(agent1).toBeDefined();
       expect(agent1.name).toBe('counter');
       expect(agent1.value).toEqual({ count: 0 });

       expect(agent2).toBeDefined();
       expect(agent2.name).toBe('adder');
       expect(agent2.value).toEqual({ value: 5 });
     });

     it('can add agents to network', () => {
       const agent = Agent('test-agent', { data: 'test' });
       const addedAgent = network.addAgent(agent);

       expect(addedAgent).toBe(agent);
       expect(network.getAllAgents()).toHaveLength(1);
       expect(network.getAgent(agent._agentId)).toBe(agent);
     });

     it('can remove agents from network', () => {
       const agent = Agent('test-agent', { data: 'test' });
       network.addAgent(agent);

       expect(network.getAllAgents()).toHaveLength(1);

       const removed = network.removeAgent(agent._agentId);
       expect(removed).toBe(true);
       expect(network.getAllAgents()).toHaveLength(0);
       expect(network.getAgent(agent._agentId)).toBeUndefined();
     });

     it('can find agents by criteria', () => {
       const agent1 = Agent('counter', { type: 'math' });
       const agent2 = Agent('adder', { type: 'math' });
       const agent3 = Agent('display', { type: 'ui' });

       network.addAgent(agent1);
       network.addAgent(agent2);
       network.addAgent(agent3);

       const allAgents = network.getAllAgents();
       expect(allAgents).toHaveLength(3);

       // Test that we can retrieve agents by ID
       expect(network.getAgent(agent1._agentId)).toBe(agent1);
       expect(network.getAgent(agent2._agentId)).toBe(agent2);
       expect(network.getAgent(agent3._agentId)).toBe(agent3);
     });
   });

    describe('Network Reduction and Stepping', () => {
      it('can perform network steps', async () => {
        const agent = Agent('test-agent', { value: 0 });
        network.addAgent(agent);

        // Perform a step - this should not throw even if no rules are defined
        const hasMoreSteps = await network.step();
        expect(typeof hasMoreSteps).toBe('boolean');
        // Should return false when no reductions are possible
        expect(hasMoreSteps).toBe(false);
      });

      it('can perform network reduction', async () => {
        const agent = Agent('test-agent', { value: 0 });
        network.addAgent(agent);

        // Reduce until no more reductions possible
        const totalReductions = await network.reduce();
        expect(typeof totalReductions).toBe('number');
        expect(totalReductions).toBeGreaterThanOrEqual(0);
      });
    });

    describe('Connections and Rules', () => {
      it('connects and disconnects ports', () => {
        const left = Agent('Left', { value: 1 });
        const right = Agent('Right', { value: 2 });

        network.addAgent(left);
        network.addAgent(right);

        const connection = network.connectPorts(left.ports.main, right.ports.main);
        expect(connection).toBeDefined();
        expect(network.isPortConnected(left.ports.main)).toBe(true);

        const found = network.findConnections({ from: left.ports.main });
        expect(found.length).toBe(1);

        const disconnected = network.disconnectPorts(left.ports.main, right.ports.main);
        expect(disconnected).toBe(true);
        expect(network.isPortConnected(left.ports.main)).toBe(false);
      });

      it('executes action rules on connection', () => {
        const counter = Agent('Counter', { value: 0 });
        const incrementer = Agent('Incrementer', { value: 2 });

        network.addAgent(counter);
        network.addAgent(incrementer);

        const rule = ActionRule(counter.ports.main, incrementer.ports.main, (leftAgent, rightAgent) => {
          leftAgent.value.value += rightAgent.value.value;
          return [leftAgent, rightAgent];
        });

        network.addRule(rule);
        network.connectPorts(counter.ports.main, incrementer.ports.main);

        const progressed = network.step();
        expect(progressed).toBe(true);
        expect(counter.value.value).toBe(2);
      });

      it('creates custom port definitions', () => {
        const custom = Agent('Custom', { value: 'ok' }, {
          main: Port.main(),
          extra: Port.aux('extra')
        });

        network.addAgent(custom);
        expect(custom.ports.extra.type).toBe('aux');
      });
    });

    describe('Change History', () => {

     it('tracks changes in network', () => {
       const agent = Agent('test', { value: 0 });
       network.addAgent(agent);

       const history = network.getChangeHistory?.();
       expect(Array.isArray(history)).toBe(true);
       expect(history).toBeDefined();
     });
   });

   describe('Error Handling', () => {
     it('handles invalid agent operations', () => {
       expect(() => {
         network.getAgent('non-existent-id');
       }).not.toThrow();

       const result = network.getAgent('non-existent-id');
       expect(result).toBeUndefined();
     });

     it('handles agent removal gracefully', () => {
       const agent = Agent('test-agent', { data: 'test' });
       network.addAgent(agent);

       expect(network.getAllAgents()).toHaveLength(1);

       // Remove non-existent agent
       const removed = network.removeAgent('non-existent-id');
       expect(removed).toBe(false);

       // Remove existing agent
       const removed2 = network.removeAgent(agent._agentId);
       expect(removed2).toBe(true);
     });
   });

   describe('Integration Tests', () => {
     it('can create a complete interaction net system', () => {
       // Create a simple system with multiple agents
       const counter = Agent('counter', { count: 0 });
       const adder = Agent('adder', { value: 5 });
       const result = Agent('result', { value: null });

       // Add agents to network
       network.addAgent(counter);
       network.addAgent(adder);
       network.addAgent(result);

       // Verify setup
       expect(network.getAllAgents()).toHaveLength(3);
       expect(network.getAllConnections()).toHaveLength(0);
       expect(network.getAllRules()).toHaveLength(0);

       // Verify agents have expected properties
       expect(counter.name).toBe('counter');
       expect(adder.name).toBe('adder');
       expect(result.name).toBe('result');
       expect(counter.value.count).toBe(0);
       expect(adder.value.value).toBe(5);
       expect(result.value.value).toBe(null);
     });

     it('can clear all network state', () => {
       // Add some agents
       const agent1 = Agent('test1', { data: 'test1' });
       const agent2 = Agent('test2', { data: 'test2' });

       network.addAgent(agent1);
       network.addAgent(agent2);

       expect(network.getAllAgents()).toHaveLength(2);

       // Remove agents
       network.removeAgent(agent1._agentId);
       network.removeAgent(agent2._agentId);

       expect(network.getAllAgents()).toHaveLength(0);
     });
   });
 });
