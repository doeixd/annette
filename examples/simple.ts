import { Agent } from "../src/agent";
import { Network } from "../src/network";
import { Rule } from "../src/rule";

const hello = Network("");

const alice = Agent("Alice", "Alice");
const bob = Agent("Bob", "Bob");

// this needs to add the agents if they don't exist
const connection = hello.connect(alice, bob);

const rule = Rule("alice-to-bob" as const, connection, () => {});

hello.addRule(
  alice,
  bob,
  alias((alice, bob) => {}),
);
