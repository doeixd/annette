import { Agent, IAgent, IPort, Port } from '../src/agent';
import { Network, INetwork } from '../src/network';
import { ActionRule, IActionRule } from '../src/rule'; // Assuming ActionRule is sufficient for a simple example
import { DistributedEventSyncNetwork } from '../src/distributed/event-sync-network';
import { NetworkSyncPayload, InteractionEvent } from '../src/distributed/types';
import { VectorClock } from '../src/distributed/vector-clock';

// Helper function to log with context
const log = (nodeId: string, ...args: any[]) => console.log(`[${nodeId}]`, ...args);

async function main() {
    log("MainExample", "Setting up distributed interaction net example...");

    // 1. Create base networks for two nodes
    const baseNet1: INetwork = Network("BaseNetNode1");
    const baseNet2: INetwork = Network("BaseNetNode2");

    // 2. Create DistributedEventSyncNetwork instances for two nodes
    const node1Id = "Node1";
    const node2Id = "Node2";
    const distNet1 = new DistributedEventSyncNetwork(baseNet1, node1Id);
    const distNet2 = new DistributedEventSyncNetwork(baseNet2, node2Id);

    // Store outgoing messages for simulation
    const messagesNode1: NetworkSyncPayload[] = [];
    const messagesNode2: NetworkSyncPayload[] = [];

    // 3. Setup outgoing message callbacks to simulate a transport layer
    distNet1.setOutgoingMessageCallback(payload => {
        log(node1Id, "Outgoing message:", payload.type, JSON.stringify(payload, null, 2));
        // Simulate sending to Node2
        messagesNode1.push(payload); 
    });

    distNet2.setOutgoingMessageCallback(payload => {
        log(node2Id, "Outgoing message:", payload.type, JSON.stringify(payload, null, 2));
        // Simulate sending to Node1
        messagesNode2.push(payload);
    });
    
    log("MainExample", "Distributed networks initialized.");

    // 4. Create agents on Node1
    log(node1Id, "Creating agents...");
    const agentA_DefPorts: Record<string, IPort> = { main: Port({ name: 'main', type: 'main' }) };
    const agentA_Node1 = await distNet1.createAgent("TypeA", { count: 0 }, agentA_DefPorts, "agentA");
    const agentB_Node1 = await distNet1.createAgent("TypeB", { value: "hello" }, { main: Port({ name: 'main', type: 'main' }) }, "agentB");
    log(node1Id, `Agent A created: ${agentA_Node1._agentId}, Agent B created: ${agentB_Node1._agentId}`);

    // Simulate Node1 broadcasting its new agents (via RespondAgentStates with BROADCAST_ALL)
    // And Node2 receiving them.
    // In a real system, a discovery mechanism or explicit broadcast would handle this.
    // Here, we manually simulate message passing for these creations.
    log("MainExample", "Simulating broadcast of Node1's new agents and reception by Node2...");
    while(messagesNode1.length > 0) {
        const msg = messagesNode1.shift();
        if (msg && msg.type === "RespondAgentStates" && msg.toNodeId === "BROADCAST_ALL") { // Our placeholder for broadcast
            log(node2Id, "Receiving agent snapshots from Node1 via simulated broadcast...");
            // Craft a message as if it's specifically for Node2
            await distNet2.receiveMessage({ ...msg, toNodeId: node2Id });
        }
    }
    
    const agentA_Node2 = await distNet2.getAgent("agentA");
    const agentB_Node2 = await distNet2.getAgent("agentB");
    log(node2Id, `Agent A on Node2: ${agentA_Node2?._agentId}, Agent B on Node2: ${agentB_Node2?._agentId}`);
    if (!agentA_Node2 || !agentB_Node2) {
        log("MainExample", "Error: Agents from Node1 did not replicate to Node2 correctly.");
        return;
    }

    // 5. Define a simple rule (e.g., TypeA interacts with TypeB)
    log("MainExample", "Defining and adding a rule on both nodes...");
    const simpleRule: IActionRule = ActionRule(
        agentA_Node1.ports.main, // Use agent from Node1 for definition structure, names matter
        agentB_Node1.ports.main,
        (agent1, agent2, network) => {
            log("RuleFire", `Rule fired between ${agent1.name} (${agent1._agentId}) and ${agent2.name} (${agent2._agentId})`);
            agent1.value.count = (agent1.value.count || 0) + 1;
            log("RuleFire", `Updated ${agent1.name} count to: ${agent1.value.count}`);
        },
        "SimpleIncrementRule"
    );
    // Rules are typically defined statically and assumed to be consistent across nodes
    await distNet1.addRule(simpleRule);
    await distNet2.addRule(simpleRule); // Add to both for local processing if interaction occurs there

    // 6. Connect agents on Node1
    log(node1Id, "Connecting agents AgentA and AgentB...");
    const conn1_Node1 = await distNet1.connectPorts(agentA_Node1.ports.main, agentB_Node1.ports.main, "connAB");
    if (conn1_Node1) {
        log(node1Id, `Connected AgentA and AgentB. Connection name: ${conn1_Node1.name}`);
    } else {
        log(node1Id, "Failed to connect agents.");
        return;
    }
    
    // Simulate Node1 broadcasting connection changes (snapshots of agentA, agentB)
    // and Node2 receiving them.
    log("MainExample", "Simulating broadcast of Node1's connection changes and reception by Node2...");
    while(messagesNode1.length > 0) {
        const msg = messagesNode1.shift();
        if (msg && msg.type === "RespondAgentStates" && msg.toNodeId === "BROADCAST_ALL") {
             log(node2Id, "Receiving agent snapshots from Node1 (due to connection) via simulated broadcast...");
            await distNet2.receiveMessage({ ...msg, toNodeId: node2Id });
        }
    }
    // Verify connection on Node2 by checking portConnections in distState (indirectly, if possible)
    // For this example, we'll assume it replicated if snapshots were processed.

    // 7. Run reduce on Node1 to trigger the interaction
    log(node1Id, "Running reduce on Node1...");
    const stepsTakenNode1 = await distNet1.reduce();
    log(node1Id, `Reduction steps taken: ${stepsTakenNode1}. Agent A value: ${JSON.stringify(agentA_Node1.value)}`);

    // 8. Simulate message transport: Node1 sends BroadcastEvent to Node2
    log("MainExample", "Simulating message transport from Node1 to Node2...");
    let eventFromNode1: InteractionEvent | null = null;
    while(messagesNode1.length > 0) {
        const msg = messagesNode1.shift();
        if (msg && msg.type === "BroadcastEvent") {
            log(node2Id, "Receiving BroadcastEvent from Node1...");
            await distNet2.receiveMessage(msg); // Node2 processes the event
            eventFromNode1 = msg.event;
        } else if (msg && msg.type === "RespondAgentStates" && msg.toNodeId === "BROADCAST_ALL") {
            // Snapshots of agents changed by the rule might also be broadcast
            log(node2Id, "Receiving agent snapshots from Node1 (post-rule) via simulated broadcast...");
            await distNet2.receiveMessage({ ...msg, toNodeId: node2Id });
        }
    }

    if (eventFromNode1) {
        log(node2Id, `Processed event ${eventFromNode1.eventId}. Agent A value on Node2: ${JSON.stringify(agentA_Node2.value)}`);
        if (agentA_Node1.value.count === agentA_Node2.value.count) {
            log("MainExample", "SUCCESS: Agent A's state is synchronized on both nodes!");
        } else {
            log("MainExample", `FAILURE: Agent A's state mismatch! Node1: ${agentA_Node1.value.count}, Node2: ${agentA_Node2.value.count}`);
        }
    } else {
        log("MainExample", "FAILURE: No InteractionEvent was broadcast from Node1 after reduce.");
    }

    // 9. Further test: Interaction originating on Node2
    log(node2Id, "Connecting agents AgentA and AgentB on Node2 (if not already effectively connected by snapshot)...");
    // Note: _applyAgentStateSnapshot should handle connection syncing.
    // We can try to run reduce on Node2. If the rule is general enough, it might fire again or not.
    // For this example, let's assume the previous sync was enough.
    // Let's modify agentB on Node2 and see if Node1 gets it.
    
    log(node2Id, "Modifying agentB on Node2 directly (simulating a local-only change for test)...");
    agentB_Node2.value.updateTime = Date.now(); 
    // Manually trigger a refresh and broadcast for agentB on Node2
    const distStateB_Node2 = await (distNet2 as any)._getOrInitDistributedState(agentB_Node2); // Accessing private for example
    if (await (distNet2 as any)._refreshAgentStateHashes(agentB_Node2, distStateB_Node2, true)) {
        log(node2Id, "Refreshed agentB on Node2, broadcasting snapshot...");
        distNet2.setOutgoingMessageCallback(payload => { // Temporarily change callback for clarity
             log(node2Id, "Node2 outgoing for agentB update:", payload.type, JSON.stringify(payload));
             messagesNode2.push(payload);
        });
        (distNet2 as any).onOutgoingMessageCallback({ 
            type: "RespondAgentStates", 
            snapshots: [await (distNet2 as any)._getAgentSnapshot(agentB_Node2)], 
            toNodeId: "BROADCAST_ALL",
            forEventId: "agentB-modified-node2"
        });
    }

    log("MainExample", "Simulating message transport from Node2 to Node1...");
    while(messagesNode2.length > 0) {
        const msg = messagesNode2.shift();
        if (msg && msg.type === "RespondAgentStates") { // Expecting snapshot of agentB
            log(node1Id, "Receiving RespondAgentStates from Node2 (agentB update)...");
            await distNet1.receiveMessage({...msg, toNodeId: node1Id});
        }
    }
    log(node1Id, `Agent B value on Node1 after Node2's update: ${JSON.stringify(agentB_Node1.value)}`);
    if (agentB_Node1.value.updateTime === agentB_Node2.value.updateTime) {
        log("MainExample", "SUCCESS: Agent B's direct modification on Node2 synced to Node1!");
    } else {
        log("MainExample", "FAILURE: Agent B's modification did not sync.");
    }

    log("MainExample", "Example finished.");
}

main().catch(error => console.error("Example failed with error:", error));
