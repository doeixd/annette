/**
 * Rule Executor Worker
 * 
 * This worker script handles parallel execution of rules and effect handlers
 * for the Annette interaction nets library.
 */

// Import serialization utilities (making sure this is compatible with web workers)
importScripts('../serialization.js');

// Store registered rule implementations
const registeredRules = new Map();
const registeredEffectHandlers = new Map();

/**
 * Simple agent implementation for worker context
 */
class Agent {
  constructor(id, name, value, ports) {
    this._agentId = id;
    this.name = name;
    this.value = value;
    this.ports = {};
    
    // Initialize ports
    for (const portInfo of ports) {
      this.ports[portInfo.name] = {
        name: portInfo.name,
        type: portInfo.type,
        agent: this,
        agentId: id,
        connected: false
      };
    }
  }
  
  setValue(newValue) {
    this.value = newValue;
    return this;
  }
  
  // Other methods as needed
}

/**
 * Simple connection implementation for worker context
 */
class Connection {
  constructor(sourceAgentId, sourcePortName, destinationAgentId, destinationPortName) {
    this.id = `${sourceAgentId}:${sourcePortName}-${destinationAgentId}:${destinationPortName}`;
    this.sourceAgentId = sourceAgentId;
    this.sourcePortName = sourcePortName;
    this.destinationAgentId = destinationAgentId;
    this.destinationPortName = destinationPortName;
  }
}

/**
 * Simple network implementation for worker context
 */
class WorkerNetwork {
  constructor(agents, connections) {
    this.agents = new Map();
    this.connections = new Map();
    this.changes = {
      newAgents: [],
      removedAgentIds: [],
      newConnections: [],
      removedConnections: []
    };
    
    // Initialize agents
    for (const [id, agentData] of Object.entries(agents)) {
      const agent = new Agent(
        id, 
        agentData.name, 
        agentData.value,
        Object.values(agentData.ports)
      );
      this.agents.set(id, agent);
    }
    
    // Initialize connections
    for (const conn of connections) {
      const connection = new Connection(
        conn.sourceAgentId,
        conn.sourcePortName,
        conn.destinationAgentId,
        conn.destinationPortName
      );
      this.connections.set(connection.id, connection);
      
      // Mark ports as connected
      const sourceAgent = this.agents.get(conn.sourceAgentId);
      const destAgent = this.agents.get(conn.destinationAgentId);
      
      if (sourceAgent && sourceAgent.ports[conn.sourcePortName]) {
        sourceAgent.ports[conn.sourcePortName].connected = true;
      }
      
      if (destAgent && destAgent.ports[conn.destinationPortName]) {
        destAgent.ports[conn.destinationPortName].connected = true;
      }
    }
  }
  
  // Get agent by ID
  getAgent(id) {
    return this.agents.get(id);
  }
  
  // Get all agents
  getAgents() {
    return Array.from(this.agents.values());
  }
  
  // Get connection between two ports
  getConnection(agent1Id, port1Name, agent2Id, port2Name) {
    const id1 = `${agent1Id}:${port1Name}-${agent2Id}:${port2Name}`;
    const id2 = `${agent2Id}:${port2Name}-${agent1Id}:${port1Name}`;
    
    return this.connections.get(id1) || this.connections.get(id2);
  }
  
  // Get all connections
  getConnections() {
    return Array.from(this.connections.values());
  }
  
  // Add a new agent
  addAgent(agent) {
    if (!agent._agentId) {
      agent._agentId = generateId();
    }
    
    this.agents.set(agent._agentId, agent);
    this.changes.newAgents.push({
      id: agent._agentId,
      name: agent.name,
      value: agent.value,
      ports: Object.fromEntries(
        Object.entries(agent.ports).map(([name, port]) => [
          name, 
          { name: port.name, type: port.type }
        ])
      )
    });
    
    return agent;
  }
  
  // Remove an agent
  removeAgent(agentOrId) {
    const id = typeof agentOrId === 'string' ? agentOrId : agentOrId._agentId;
    const agent = this.agents.get(id);
    
    if (agent) {
      // Remove all connections involving this agent
      for (const [connId, conn] of this.connections.entries()) {
        if (conn.sourceAgentId === id || conn.destinationAgentId === id) {
          this.connections.delete(connId);
          this.changes.removedConnections.push({
            sourceAgentId: conn.sourceAgentId,
            sourcePortName: conn.sourcePortName,
            destinationAgentId: conn.destinationAgentId,
            destinationPortName: conn.destinationPortName
          });
        }
      }
      
      // Remove the agent
      this.agents.delete(id);
      this.changes.removedAgentIds.push(id);
      return true;
    }
    
    return false;
  }
  
  // Connect two agents
  connect(agent1Id, port1Name, agent2Id, port2Name) {
    const agent1 = this.agents.get(agent1Id);
    const agent2 = this.agents.get(agent2Id);
    
    if (!agent1 || !agent2) {
      throw new Error(`Cannot connect: agent not found`);
    }
    
    if (!agent1.ports[port1Name] || !agent2.ports[port2Name]) {
      throw new Error(`Cannot connect: port not found`);
    }
    
    // Check if connection already exists
    const existingConn = this.getConnection(agent1Id, port1Name, agent2Id, port2Name);
    if (existingConn) {
      return existingConn;
    }
    
    // Create new connection
    const connection = new Connection(
      agent1Id,
      port1Name,
      agent2Id,
      port2Name
    );
    
    this.connections.set(connection.id, connection);
    
    // Mark ports as connected
    agent1.ports[port1Name].connected = true;
    agent2.ports[port2Name].connected = true;
    
    this.changes.newConnections.push({
      sourceAgentId: agent1Id,
      sourcePortName: port1Name,
      destinationAgentId: agent2Id,
      destinationPortName: port2Name
    });
    
    return connection;
  }
  
  // Disconnect two agents
  disconnect(agent1Id, port1Name, agent2Id, port2Name) {
    const connection = this.getConnection(agent1Id, port1Name, agent2Id, port2Name);
    
    if (connection) {
      this.connections.delete(connection.id);
      
      // Mark ports as disconnected
      const agent1 = this.agents.get(agent1Id);
      const agent2 = this.agents.get(agent2Id);
      
      if (agent1 && agent1.ports[port1Name]) {
        agent1.ports[port1Name].connected = false;
      }
      
      if (agent2 && agent2.ports[port2Name]) {
        agent2.ports[port2Name].connected = false;
      }
      
      this.changes.removedConnections.push({
        sourceAgentId: connection.sourceAgentId,
        sourcePortName: connection.sourcePortName,
        destinationAgentId: connection.destinationAgentId,
        destinationPortName: connection.destinationPortName
      });
      
      return true;
    }
    
    return false;
  }
  
  // Process commands returned from rule actions
  processCommands(commands) {
    if (!commands || !Array.isArray(commands)) {
      return;
    }
    
    for (const command of commands) {
      if (command.type === 'add') {
        if (isAgent(command.entity)) {
          this.addAgent(command.entity);
        } else if (isConnection(command.entity)) {
          this.connect(
            command.entity.sourceAgentId,
            command.entity.sourcePortName,
            command.entity.destinationAgentId,
            command.entity.destinationPortName
          );
        }
      } else if (command.type === 'remove') {
        this.removeAgent(command.entity);
      }
    }
  }
}

/**
 * Utility function to check if an object is an agent
 */
function isAgent(obj) {
  return obj && 
    typeof obj === 'object' && 
    obj._agentId !== undefined && 
    obj.name !== undefined && 
    obj.ports !== undefined;
}

/**
 * Utility function to check if an object is a connection
 */
function isConnection(obj) {
  return obj && 
    typeof obj === 'object' && 
    obj.sourceAgentId !== undefined && 
    obj.sourcePortName !== undefined && 
    obj.destinationAgentId !== undefined && 
    obj.destinationPortName !== undefined;
}

/**
 * Utility function to generate a unique ID
 */
function generateId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Execute a rewrite rule
 */
function executeRewrite(rule, agent1, agent2, network) {
  try {
    // Get the rewrite definition
    let rewrite = rule.ruleDefinition;
    
    // If the rewrite is a function, call it to get the actual rewrite
    if (rewrite._isDeferredFn) {
      rewrite = rewrite._fn(agent1, agent2);
    }
    
    // Create new agents
    const templateIdToAgentMap = new Map();
    
    for (const newAgentDef of rewrite.newAgents) {
      const agent = new Agent(
        generateId(),
        newAgentDef.name,
        newAgentDef.initialValue || {},
        // Create basic port definitions
        Object.keys(agent1.ports).map(name => ({ name, type: 'default' }))
      );
      
      network.addAgent(agent);
      templateIdToAgentMap.set(newAgentDef._templateId, agent);
    }
    
    // Create internal connections
    for (const connDef of rewrite.internalConnections) {
      const agent1 = templateIdToAgentMap.get(connDef.agent1TemplateId);
      const agent2 = templateIdToAgentMap.get(connDef.agent2TemplateId);
      
      if (agent1 && agent2) {
        network.connect(
          agent1._agentId,
          connDef.port1Name,
          agent2._agentId,
          connDef.port2Name
        );
      }
    }
    
    // Handle external connections for agent1
    for (const [originalPortName, entry] of Object.entries(rewrite.portMapAgent1)) {
      if (!entry) continue; // Skip null entries (disconnected ports)
      
      const newAgent = templateIdToAgentMap.get(entry.newAgentTemplateId);
      if (newAgent) {
        // Find all connections to the original port
        const connectionsToMove = [];
        
        for (const conn of network.getConnections()) {
          if ((conn.sourceAgentId === agent1._agentId && conn.sourcePortName === originalPortName) ||
              (conn.destinationAgentId === agent1._agentId && conn.destinationPortName === originalPortName)) {
            connectionsToMove.push(conn);
          }
        }
        
        // Recreate these connections with the new agent
        for (const conn of connectionsToMove) {
          const isSource = conn.sourceAgentId === agent1._agentId && conn.sourcePortName === originalPortName;
          
          // Remove the old connection
          network.disconnect(
            conn.sourceAgentId,
            conn.sourcePortName,
            conn.destinationAgentId,
            conn.destinationPortName
          );
          
          // Create the new connection
          if (isSource) {
            network.connect(
              newAgent._agentId,
              entry.newPortName,
              conn.destinationAgentId,
              conn.destinationPortName
            );
          } else {
            network.connect(
              conn.sourceAgentId,
              conn.sourcePortName,
              newAgent._agentId,
              entry.newPortName
            );
          }
        }
      }
    }
    
    // Handle external connections for agent2
    for (const [originalPortName, entry] of Object.entries(rewrite.portMapAgent2)) {
      if (!entry) continue; // Skip null entries (disconnected ports)
      
      const newAgent = templateIdToAgentMap.get(entry.newAgentTemplateId);
      if (newAgent) {
        // Find all connections to the original port
        const connectionsToMove = [];
        
        for (const conn of network.getConnections()) {
          if ((conn.sourceAgentId === agent2._agentId && conn.sourcePortName === originalPortName) ||
              (conn.destinationAgentId === agent2._agentId && conn.destinationPortName === originalPortName)) {
            connectionsToMove.push(conn);
          }
        }
        
        // Recreate these connections with the new agent
        for (const conn of connectionsToMove) {
          const isSource = conn.sourceAgentId === agent2._agentId && conn.sourcePortName === originalPortName;
          
          // Remove the old connection
          network.disconnect(
            conn.sourceAgentId,
            conn.sourcePortName,
            conn.destinationAgentId,
            conn.destinationPortName
          );
          
          // Create the new connection
          if (isSource) {
            network.connect(
              newAgent._agentId,
              entry.newPortName,
              conn.destinationAgentId,
              conn.destinationPortName
            );
          } else {
            network.connect(
              conn.sourceAgentId,
              conn.sourcePortName,
              newAgent._agentId,
              entry.newPortName
            );
          }
        }
      }
    }
    
    // Remove the original agents
    network.removeAgent(agent1);
    network.removeAgent(agent2);
    
    return true;
  } catch (error) {
    console.error('Error executing rewrite rule:', error);
    return false;
  }
}

/**
 * Execute an action rule
 */
function executeAction(rule, agent1, agent2, network) {
  try {
    const result = rule.ruleDefinition(agent1, agent2, network);
    
    // Process any commands returned by the action
    if (result && Array.isArray(result)) {
      network.processCommands(result);
    }
    
    return true;
  } catch (error) {
    console.error('Error executing action rule:', error);
    return false;
  }
}

/**
 * Execute a set of rules on the network
 */
function executeRules(ruleSet, networkState) {
  // Create worker network with the provided state
  const network = new WorkerNetwork(
    networkState.agents,
    networkState.connections
  );
  
  let steps = 0;
  
  // Execute each rule in the rule set
  for (const rule of ruleSet.rules) {
    const agent1 = network.getAgent(rule.agentId1);
    const agent2 = network.getAgent(rule.agentId2);
    
    if (!agent1 || !agent2) {
      continue; // Skip if agents not found
    }
    
    let success = false;
    
    if (rule.ruleType === 'rewrite') {
      success = executeRewrite(rule, agent1, agent2, network);
    } else if (rule.ruleType === 'action') {
      success = executeAction(rule, agent1, agent2, network);
    }
    
    if (success) {
      steps++;
    }
  }
  
  // Return the execution result
  return {
    steps,
    newAgents: network.changes.newAgents,
    removedAgentIds: network.changes.removedAgentIds,
    newConnections: network.changes.newConnections,
    removedConnections: network.changes.removedConnections
  };
}

/**
 * Execute an effect handler
 */
function executeEffectHandler(effect, handlerType, handlerFn) {
  try {
    // Get the registered handler or evaluate the provided handler function
    let handler;
    
    if (handlerFn.startsWith('function') || handlerFn.includes('=>')) {
      // Evaluate the function string
      handler = eval(`(${handlerFn})`);
    } else {
      // Use a registered handler
      handler = registeredEffectHandlers.get(`${handlerType}:${handlerFn}`);
    }
    
    if (!handler || typeof handler !== 'function') {
      throw new Error(`Handler not found: ${handlerType}:${handlerFn}`);
    }
    
    // Execute the handler
    const result = handler(effect);
    
    return {
      effectId: effect.id || 'unknown',
      result
    };
  } catch (error) {
    return {
      effectId: effect.id || 'unknown',
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Register a rule implementation
 */
function registerRule(id, implementation) {
  registeredRules.set(id, implementation);
}

/**
 * Register an effect handler
 */
function registerEffectHandler(type, name, handler) {
  registeredEffectHandlers.set(`${type}:${name}`, handler);
}

// Initialize the worker and handle messages
self.onmessage = function(event) {
  const { taskId, type, data } = event.data;
  
  try {
    let result;
    
    if (type === 'rule-execution') {
      result = executeRules(data.ruleSet, data.networkState);
    } else if (type === 'effect-handling') {
      result = executeEffectHandler(data.effect, data.handlerType, data.handlerFn);
    } else if (type === 'register-rule') {
      registerRule(data.ruleId, data.implementation);
      result = { registered: true };
    } else if (type === 'register-effect-handler') {
      registerEffectHandler(data.type, data.name, data.handler);
      result = { registered: true };
    } else {
      throw new Error(`Unknown task type: ${type}`);
    }
    
    // Send the result back to the main thread
    self.postMessage({ taskId, result });
  } catch (error) {
    // Send error back to the main thread
    self.postMessage({
      taskId,
      result: {
        error: error.message || 'Unknown error'
      }
    });
  }
};

// Signal that the worker is ready
self.postMessage({ initialized: true });