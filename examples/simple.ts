import { Agent } from "../src/agent";
import { Network } from "../src/network";
import { MainPortOfAgent } from "../src/port";
import { Rule } from "../src/rule";

const hello = Network("");

const alice = Agent("Alice", "Alice");
const bob = Agent("Bob", "Bob");

var h: MainPortOfAgent<typeof alice.ports>;

// this needs to add the agents if they don't exist
const connection = hello.connect(alice, bob);

const rule = Rule("alice-to-bob" as const, connection, () => {});

hello.addRule(Rule(alice, bob));
