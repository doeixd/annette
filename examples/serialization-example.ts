import { Network, Agent, Port, ActionRule, RewriteRule } from "../src";
import {
  serializeValue, deserializeValue, 
  serializeForTransport, deserializeFromTransport,
  serializeAgent, serializeNetwork,
  registerIsomorphicReference, getIsomorphicReference,
  deepClone, streamSerialize,
  Feature
} from "../src/serialization";

/**
 * This example demonstrates the serialization capabilities of Annette
 * using seroval and structuredClone for advanced serialization.
 */

console.log("======= Serialization Example =======");

// 1. Basic serialization and deserialization
console.log("\n--- Basic Serialization ---");

// Create a complex object with cyclic references
const complexObject = {
  number: 42,
  string: "Hello World",
  date: new Date(),
  regex: /test/i,
  array: [1, 2, 3],
  nested: {
    a: 1,
    b: 2
  }
};

// Add cyclic reference
complexObject.self = complexObject;

// Serialize the object
const serialized = serializeValue(complexObject);
console.log("Serialized complex object:");
console.log(serialized);

// Deserialize back to object
const deserialized = deserializeValue(serialized);
console.log("\nDeserialized object has cyclic reference:", deserialized.self === deserialized);

// 2. Deep cloning with structured clone
console.log("\n--- Deep Cloning ---");

// Create a value to clone
const originalValue = {
  name: "Original",
  values: [1, 2, 3],
  timestamp: new Date()
};

// Clone using our utility (uses structuredClone when possible)
const clonedValue = deepClone(originalValue);

// Modify the original
originalValue.name = "Modified";
originalValue.values.push(4);

// The clone remains unchanged
console.log("Original:", originalValue);
console.log("Clone:", clonedValue);

// 3. Isomorphic references
console.log("\n--- Isomorphic References ---");

// Register a custom function as an isomorphic reference
const calculateTotal = registerIsomorphicReference(
  'calculate-total',
  (items: {price: number, quantity: number}[]) => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
);

// Create an object with the function reference
const shoppingCart = {
  items: [
    { price: 10, quantity: 2 },
    { price: 5, quantity: 3 }
  ],
  calculateTotal
};

// Serialize and deserialize
const serializedCart = serializeValue(shoppingCart);
console.log("Serialized cart with isomorphic function:", serializedCart);

const deserializedCart = deserializeValue(serializedCart);
console.log("Total from deserialized function:", deserializedCart.calculateTotal(deserializedCart.items));

// 4. Cross-serialization for transport
console.log("\n--- Cross-Serialization ---");

// Create a shared reference map
const refs = new Map();

// Create objects with shared references
const user = { name: "Alice" };
const profile = { user, bio: "Developer" };
const posts = [
  { author: user, title: "Post 1" },
  { author: user, title: "Post 2" }
];

// Serialize with cross-references
const serializedUser = serializeForTransport(user, { refs, scopeId: "app" });
const serializedProfile = serializeForTransport(profile, { refs, scopeId: "app" });
const serializedPosts = serializeForTransport(posts, { refs, scopeId: "app" });

console.log("Cross-serialized objects:");
console.log("User:", serializedUser);
console.log("Profile:", serializedProfile);
console.log("Posts:", serializedPosts);

// 5. Serializing Annette agents and networks
console.log("\n--- Serializing Annette Components ---");

// Create a simple agent to demonstrate serialization
const simpleAgent = Agent<"SimpleAgent", { count: number }>("SimpleAgent", { count: 42 });

// Serialize the agent
const serializedAgent = serializeAgent(simpleAgent);
console.log("Serialized agent:", serializedAgent);

// Create a simple network representation for serialization
const networkData = {
  id: "simple-example-network",
  name: "Simple Example Network",
  agents: [
    {
      _agentId: simpleAgent._agentId,
      name: simpleAgent.name,
      value: simpleAgent.value
    }
  ]
};

// Serialize the network data
const serializedNetwork = serializeForTransport(networkData);
console.log("Serialized network data:", serializedNetwork);

// 6. Stream serialization for large or async values
console.log("\n--- Stream Serialization ---");

// Create a value with a promise
const asyncValue = {
  name: "Async Data",
  data: Promise.resolve([1, 2, 3, 4, 5]),
  timestamp: Date.now()
};

// Stream serialize
console.log("Stream serialization chunks:");
streamSerialize(asyncValue, {
  onSerialize: (chunk) => {
    console.log(" - Chunk:", chunk);
  }
});

// 7. Compatibility options
console.log("\n--- Compatibility Options ---");

// Create an object with features that might not be supported in all environments
const modernFeatures = {
  bigint: 9007199254740991n,
  object: Object.assign(Object.create(null), { test: true })
};

// Serialize with all features enabled
const fullFeatured = serializeValue(modernFeatures);
console.log("Full featured serialization:", fullFeatured);

// Serialize with compatibility options for older environments
const compatible = serializeValue(modernFeatures, {
  disabledFeatures: Feature.BigIntTypedArray | Feature.ObjectAssign
});
console.log("Compatible serialization:", compatible);