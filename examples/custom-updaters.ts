import {
  defineUpdater, composeUpdaters, applyComposedUpdate, applyUpdate,
  SetUpdater, MergeUpdater, DeleteUpdater, IncrementUpdater, ArrayInsertUpdater,
  UpdaterDefinition, Core, StdLib, Simple
} from "../src";

/**
 * This example demonstrates the custom updater API in Annette,
 * which allows defining domain-specific updaters and making
 * updaters composable for complex nested updates.
 */

console.log("======= Custom Updaters Example =======");

// 1. Using built-in updaters
console.log("\n--- Built-in Updaters ---");

// Create a sample data object
let data = {
  name: "Product",
  price: 100,
  tags: ["electronics", "gadget"],
  metadata: {
    sku: "P12345",
    supplier: "TechCorp"
  }
};

console.log("Original data:", data);

// Create a set updater
const setNameUpdater = SetUpdater({ value: "Updated Product" }, ["name"]);

// Apply the updater
data = applyUpdate(data, setNameUpdater);
console.log("\nAfter SetUpdater:", data);

// Create a merge updater for nested object
const mergeMetadataUpdater = MergeUpdater(
  { value: { warehouse: "Central", stock: 42 } },
  ["metadata"]
);

// Apply the updater
data = applyUpdate(data, mergeMetadataUpdater);
console.log("\nAfter MergeUpdater:", data);

// Create an increment updater
const incrementPriceUpdater = IncrementUpdater({ value: 25 }, ["price"]);

// Apply the updater
data = applyUpdate(data, incrementPriceUpdater);
console.log("\nAfter IncrementUpdater:", data);

// Create an array insert updater
const insertTagUpdater = ArrayInsertUpdater(
  { value: "premium", index: 1 },
  ["tags"]
);

// Apply the updater
data = applyUpdate(data, insertTagUpdater);
console.log("\nAfter ArrayInsertUpdater:", data);

// Create a delete updater
const deleteTagUpdater = DeleteUpdater(
  { index: 2 },
  ["tags"]
);

// Apply the updater
data = applyUpdate(data, deleteTagUpdater);
console.log("\nAfter DeleteUpdater:", data);

// 2. Defining custom updaters
console.log("\n--- Custom Updaters ---");

// Define a toggle boolean updater
const toggleDefinition: UpdaterDefinition<boolean> = {
  type: "toggle",
  
  apply: (value, operation) => {
    // Simply invert the boolean value
    return !value;
  },
  
  merge: (op1, op2) => {
    // Toggle twice cancels out, odd number of toggles is a single toggle
    return { toggleCount: (op1.toggleCount || 1) + (op2.toggleCount || 1) };
  },
  
  invert: (op) => {
    // Inverting a toggle is just another toggle
    return op;
  },
  
  validate: (operation) => {
    // Any operation is valid for a toggle
    return true;
  },
  
  toString: (operation) => {
    return `toggle boolean value`;
  }
};

// Register the toggle updater
const ToggleUpdater = defineUpdater(toggleDefinition);

// Create a data object with a boolean
let featureFlags = {
  darkMode: false,
  betaFeatures: true,
  notifications: true
};

console.log("Original feature flags:", featureFlags);

// Create a toggle updater
const toggleDarkModeUpdater = ToggleUpdater({}, ["darkMode"]);
const toggleBetaUpdater = ToggleUpdater({}, ["betaFeatures"]);

// Apply the updaters
featureFlags = applyUpdate(featureFlags, toggleDarkModeUpdater);
featureFlags = applyUpdate(featureFlags, toggleBetaUpdater);

console.log("After toggle updaters:", featureFlags);

// Define a string transformation updater
const stringTransformDefinition: UpdaterDefinition<string> = {
  type: "transform",
  
  apply: (value, operation) => {
    if (!value) return value;
    
    switch (operation.transform) {
      case "uppercase":
        return value.toUpperCase();
      case "lowercase":
        return value.toLowerCase();
      case "capitalize":
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      case "reverse":
        return value.split("").reverse().join("");
      default:
        return value;
    }
  },
  
  merge: (op1, op2) => {
    // For merging, we create a pipeline of transforms
    return {
      transform: "pipeline",
      pipeline: [
        ...(op1.pipeline || [op1.transform]),
        ...(op2.pipeline || [op2.transform])
      ]
    };
  },
  
  invert: (op) => {
    // Create inverse operations where possible
    if (op.transform === "uppercase") {
      return { transform: "lowercase" };
    } else if (op.transform === "lowercase") {
      return { transform: "uppercase" };
    } else if (op.transform === "reverse") {
      return { transform: "reverse" }; // Reverse is its own inverse
    }
    return op;
  },
  
  validate: (operation) => {
    return operation && (
      operation.transform === "uppercase" ||
      operation.transform === "lowercase" ||
      operation.transform === "capitalize" ||
      operation.transform === "reverse" ||
      operation.transform === "pipeline"
    );
  }
};

// Register the string transform updater
const StringTransformUpdater = defineUpdater(stringTransformDefinition);

// Create a data object with strings
let textData = {
  title: "hello world",
  subtitle: "EXAMPLE TEXT",
  description: "This is a description of the item"
};

console.log("\nOriginal text data:", textData);

// Create string transform updaters
const uppercaseTitleUpdater = StringTransformUpdater(
  { transform: "uppercase" },
  ["title"]
);

const capitalizeTitleUpdater = StringTransformUpdater(
  { transform: "capitalize" },
  ["title"]
);

const lowercaseSubtitleUpdater = StringTransformUpdater(
  { transform: "lowercase" },
  ["subtitle"]
);

// Apply the updaters
textData = applyUpdate(textData, uppercaseTitleUpdater);
console.log("After uppercase title:", textData);

textData = applyUpdate(textData, lowercaseSubtitleUpdater);
console.log("After lowercase subtitle:", textData);

// 3. Composed updaters
console.log("\n--- Composed Updaters ---");

// Create a user record
let user = {
  id: 1001,
  name: "john smith",
  isActive: false,
  profile: {
    bio: "SOFTWARE DEVELOPER",
    experience: 3,
    tags: ["javascript", "typescript"]
  }
};

console.log("Original user:", user);

// Create multiple updaters
const capitalizeNameUpdater = StringTransformUpdater(
  { transform: "capitalize" },
  ["name"]
);

const activateUserUpdater = ToggleUpdater(
  {},
  ["isActive"]
);

const incrementExperienceUpdater = IncrementUpdater(
  { value: 1 },
  ["profile", "experience"]
);

const lowercaseBioUpdater = StringTransformUpdater(
  { transform: "lowercase" },
  ["profile", "bio"]
);

const addTagUpdater = ArrayInsertUpdater(
  { value: "react" },
  ["profile", "tags"]
);

// Compose the updaters
const compositeUserUpdater = composeUpdaters(
  capitalizeNameUpdater,
  activateUserUpdater,
  incrementExperienceUpdater,
  lowercaseBioUpdater,
  addTagUpdater
);

// Apply the composite updater
user = applyComposedUpdate(user, compositeUserUpdater);

console.log("After composite update:", user);

// 4. Integration with Annette Network
console.log("\n--- Integration with Annette Network ---");

// Create a network
const updaterNetwork = Core.createNetwork("updater-network");

// Create a document agent
const documentAgent = Core.createAgent("Document", {
  id: "doc-123",
  title: "draft document",
  content: "This is the initial content.",
  metadata: {
    status: "draft",
    version: 1,
    tags: ["document", "draft"]
  },
  isPublished: false
});

// Create an updater agent
const updaterAgent = Core.createAgent("UpdaterAgent", {
  pendingUpdates: [
    {
      type: "transform",
      path: ["title"],
      operation: { transform: "capitalize" }
    },
    {
      type: "increment",
      path: ["metadata", "version"],
      operation: { value: 1 }
    },
    {
      type: "toggle",
      path: ["isPublished"],
      operation: {}
    }
  ]
});

// Add agents to the network
updaterNetwork.addAgent(documentAgent);
updaterNetwork.addAgent(updaterAgent);

// Create a rule for applying updates
const applyUpdatesRule = Core.createRule(
  "apply-updates",
  documentAgent.ports.main,
  updaterAgent.ports.main,
  (document, updater, network) => {
    console.log("Applying updates to document...");
    
    // Apply each pending update
    for (const update of updater.value.pendingUpdates) {
      // Create the appropriate updater
      let updaterInstance;
      
      switch (update.type) {
        case "transform":
          updaterInstance = StringTransformUpdater(
            update.operation,
            update.path
          );
          break;
        case "increment":
          updaterInstance = IncrementUpdater(
            update.operation,
            update.path
          );
          break;
        case "toggle":
          updaterInstance = ToggleUpdater(
            update.operation,
            update.path
          );
          break;
      }
      
      if (updaterInstance) {
        // Apply the update
        document.value = applyUpdate(document.value, updaterInstance);
        console.log(`Applied ${update.type} updater to path [${update.path}]`);
      }
    }
    
    // Clear pending updates
    updater.value.pendingUpdates = [];
    
    return [document, updater];
  }
);

// Add the rule to the network
updaterNetwork.addRule(applyUpdatesRule);

// Connect the agents to trigger updates
updaterNetwork.connectPorts(documentAgent.ports.main, updaterAgent.ports.main);

// Execute one step
updaterNetwork.step();

// Show the updated document
console.log("\nFinal document state:");
console.log("Title:", documentAgent.value.title);
console.log("Is Published:", documentAgent.value.isPublished);
console.log("Version:", documentAgent.value.metadata.version);
console.log("Full document:", documentAgent.value);