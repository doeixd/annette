import { describe, it, expect } from 'vitest';
import { Network, Agent, Rule } from '../src';
import type { IAgent, IConnection, IBoundPort } from '../src';

describe('Network', () => {
  describe('addRule', () => {
    it('should store a valid rule', () => {
      const network = Network('TestNetwork');
      const agentA = Agent('agentA', { value: 'A' });
      const agentB = Agent('agentB', { value: 'B' });
      
      // Add agents to network's agent map, if not done by Agent factory/network constructor
      network.agents.set(agentA.name, agentA);
      network.agents.set(agentB.name, agentB);

      const connName = `${agentA.name}-to-${agentB.name}`;
      const conn = network.connect(agentA, agentB, connName);
      
      const ruleAction = (src: IAgent, dest: IAgent) => {};
      const rule = Rule('TestRule', conn, ruleAction);
      
      network.addRule(rule);

      // Accessing private `rulesMap` is not ideal for testing.
      // This is a white-box test. A black-box test would be to see if `reduce` or `step` applies the rule.
      // For now, let's assume this internal structure for demonstration.
      const sourceRules = (network.rules as any).get(agentA);
      expect(sourceRules).toBeDefined();
      expect(sourceRules.get(agentB)).toBe(rule);
    });

    it('should throw an error if rule connection has no source agent', () => {
      const network = Network('TestNetwork');
      const agentB = Agent('agentB', 'B');
      
      // Manually creating a connection-like object that is faulty
      const faultyConnection = {
        name: 'faultyConn',
        source: null, // Invalid source
        destination: agentB,
        sourcePort: agentB.ports.main, // Dummy port
        destinationPort: agentB.ports.main, // Dummy port
      } as unknown as IConnection;

      const faultyRule = Rule('FaultyRule', faultyConnection, () => {});
      
      expect(() => network.addRule(faultyRule)).toThrowError(
        'Rule must have a valid source agent in its connection.'
      );
    });

    it('should throw an error if rule connection has no destination agent', () => {
      const network = Network('TestNetwork');
      const agentA = Agent('agentA', 'A');

      const faultyConnection = {
        name: 'faultyConn',
        source: agentA,
        destination: null, // Invalid destination
        sourcePort: agentA.ports.main,
        destinationPort: agentA.ports.main, // Dummy, not strictly needed for this test path
      } as unknown as IConnection;
      
      const faultyRule = Rule('FaultyRule', faultyConnection, () => {});

      expect(() => network.addRule(faultyRule)).toThrowError(
        'Rule must have a valid destination agent in its connection.'
      );
    });
  });

  describe('disconnect', () => {
    it('should remove a connection between two agents', () => {
      const network = Network('TestNetwork');
      const agentA = Agent('agentA', 'A');
      const agentB = Agent('agentB', 'B');
      network.agents.set(agentA.name, agentA);
      network.agents.set(agentB.name, agentB);

      const conn = network.connect(agentA, agentB, 'AtoB');
      expect(network.connections.get(agentA)?.some(c => c === conn)).toBe(true);

      network.disconnect(agentA, agentB, 'AtoB');
      
      const connectionsFromA = network.connections.get(agentA);
      expect(connectionsFromA === undefined || connectionsFromA.length === 0 || !connectionsFromA.some(c => c.name === 'AtoB')).toBe(true);
    });

    it('should return true when a connection is removed, false otherwise', () => {
      const network = Network('TestNetwork');
      const agentA = Agent('agentA', 'A');
      const agentB = Agent('agentB', 'B');
      network.agents.set(agentA.name, agentA);
      network.agents.set(agentB.name, agentB);

      network.connect(agentA, agentB, 'AtoB');
      
      expect(network.disconnect(agentA, agentB, 'AtoB')).toBe(true);
      expect(network.disconnect(agentA, agentB, 'AtoB')).toBe(false); // Attempting to disconnect again
    });

     it('should remove a connection specified by IConnection object', () => {
      const network = Network('TestNetwork');
      const agentA = Agent('agentA', 'A');
      const agentB = Agent('agentB', 'B');
      network.agents.set(agentA.name, agentA);
      network.agents.set(agentB.name, agentB);

      const conn = network.connect(agentA, agentB, 'AtoB');
      expect(network.connections.get(agentA)?.some(c => c === conn)).toBe(true);

      expect(network.disconnect(conn)).toBe(true);
      
      const connectionsFromA = network.connections.get(agentA);
      expect(connectionsFromA === undefined || connectionsFromA.length === 0 || !connectionsFromA.some(c => c.name === 'AtoB')).toBe(true);
       expect(network.disconnect(conn)).toBe(false); // Attempting to disconnect again
    });
  });

  describe('reduce', () => {
    it('should execute a simple interaction rule and update agent state', () => {
      const network = Network('TestNetwork');
      // Agent value needs to be mutable for this test
      const agentA = Agent('agentA', { data: 10 }); 
      const agentB = Agent('agentB', { data: 5 });
      network.agents.set(agentA.name, agentA);
      network.agents.set(agentB.name, agentB);

      const conn = network.connect(agentA, agentB, 'DataTransfer');
      
      const ruleAction = (src: IAgent<{data: number}>, dest: IAgent<{data: number}>): IAgent[] | void => {
        if (src.value && dest.value) { // Type guard for value
            dest.value.data += src.value.data;
        }
        return [dest]; // Agent B is preserved
      };
      
      // The Rule factory infers the name if action has a name, or use the specific overload
      const rule = Rule('SumRule', conn, ruleAction);
      network.addRule(rule);
      network.reduce();

      // Agent A should be consumed
      expect(network.agents.has('agentA')).toBe(false); 
      // Agent B should still be present and its value updated
      expect(network.agents.has('agentB')).toBe(true);
      const finalAgentB = network.agents.get('agentB');
      expect(finalAgentB?.value.data).toBe(15);

      // Connections involving agentA should be gone
      expect(network.connections.has(agentA)).toBe(false);
      // Check if any connections still point to agentA as destination
      let agentAIsDestination = false;
      for(const [,connectionsList] of network.connections.entries()){
        if(connectionsList.some(c => c.destination === agentA)){
          agentAIsDestination = true;
          break;
        }
      }
      expect(agentAIsDestination).toBe(false);
    });
  });
});
