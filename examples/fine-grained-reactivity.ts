import {
  ReactiveProxy, createReactiveStore,
  computed, Agent, Network, ActionRule
} from "../src";

/**
 * This example demonstrates the fine-grained reactivity system in Annette,
 * which tracks dependencies at the property level for more efficient updates.
 */

console.log("======= Fine-Grained Reactivity Example =======");

// 1. Basic reactive proxy usage
console.log("\n--- Basic Reactive Proxy ---");

// Create a reactive proxy
const proxy = new ReactiveProxy();

// Create a reactive object
const user = proxy.createProxy({
  firstName: "John",
  lastName: "Doe",
  age: 30,
  address: {
    street: "123 Main St",
    city: "Anytown",
    zipCode: "12345"
  }
});

// Create a subscription to a specific property
const firstNameSubscription = proxy.subscribe("firstName", () => {
  console.log("First name changed:", user.firstName);
});

// Create a subscription to a nested property
const citySubscription = proxy.subscribe("address.city", () => {
  console.log("City changed:", user.address.city);
});

// Modify the properties to trigger reactivity
console.log("Modifying firstName...");
user.firstName = "Jane";

console.log("Modifying city...");
user.address.city = "New City";

console.log("Modifying street (no direct subscription)...");
user.address.street = "456 Oak Ave";

// Clean up subscriptions
firstNameSubscription.unsubscribe();
citySubscription.unsubscribe();

// 2. Reactive Store with computed properties
console.log("\n--- Reactive Store with Computed Properties ---");

// Create a reactive store
const store = createReactiveStore();

// Create a reactive todo list
const todos = store.createReactive({
  items: [
    { id: 1, text: "Learn Annette", completed: true },
    { id: 2, text: "Build an app", completed: false },
    { id: 3, text: "Share with others", completed: false }
  ],
  filter: "all" // can be "all", "active", or "completed"
});

// Create a computed property for filtered todos
const getFilteredTodos = store.createComputed("filteredTodos", () => {
  console.log("Computing filtered todos...");
  
  if (todos.filter === "all") {
    return todos.items;
  } else if (todos.filter === "active") {
    return todos.items.filter(todo => !todo.completed);
  } else if (todos.filter === "completed") {
    return todos.items.filter(todo => todo.completed);
  }
  
  return todos.items;
});

// Create a computed property for todo stats
const getTodoStats = store.createComputed("todoStats", () => {
  console.log("Computing todo stats...");
  
  const total = todos.items.length;
  const completed = todos.items.filter(todo => todo.completed).length;
  const active = total - completed;
  
  return { total, completed, active };
});

// Create an effect to log changes
store.createEffect(() => {
  const filteredTodos = getFilteredTodos();
  const stats = getTodoStats();
  
  console.log(`Todo List: ${stats.completed}/${stats.total} completed, Filter: ${todos.filter}`);
  console.log("Filtered todos:", filteredTodos.map(t => t.text).join(", "));
});

// Try different filters
console.log("\nChanging filter to 'active'...");
todos.filter = "active";

console.log("\nChanging filter to 'completed'...");
todos.filter = "completed";

console.log("\nAdding a new todo...");
todos.items.push({ id: 4, text: "Master reactivity", completed: false });

console.log("\nMarking a todo as completed...");
todos.items[1].completed = true;

// 3. Standalone computed values
console.log("\n--- Standalone Computed Values ---");

// Create a reactive data source
const counter = { count: 0 };
const proxy2 = new ReactiveProxy();
const reactiveCounter = proxy2.createProxy(counter);

// Create a computed value that depends on the counter
const doubledCount = computed(() => {
  console.log("Computing doubled count...");
  return reactiveCounter.count * 2;
});

// Create a computed value that depends on the first computed
const tripledDoubledCount = computed(() => {
  console.log("Computing tripled doubled count...");
  return doubledCount() * 3;
});

// Access the computed values
console.log("Initial values:");
console.log("Count:", reactiveCounter.count);
console.log("Doubled:", doubledCount());
console.log("Tripled doubled:", tripledDoubledCount());

// Update the source value
console.log("\nUpdating count to 5...");
reactiveCounter.count = 5;

// Access the computed values again (should recompute)
console.log("After update:");
console.log("Count:", reactiveCounter.count);
console.log("Doubled:", doubledCount());
console.log("Tripled doubled:", tripledDoubledCount());

// Access again (should use cached values)
console.log("\nAccessing again (no recomputation):");
console.log("Doubled:", doubledCount());
console.log("Tripled doubled:", tripledDoubledCount());

// 4. Integration with Annette Network
console.log("\n--- Integration with Annette Network ---");

// Create a network
const reactiveNetwork = Network("reactive-network");

// Create a reactive data agent
const dataAgent = Agent("ReactiveData", {
  items: [
    { id: 1, name: "Item 1", value: 100 },
    { id: 2, name: "Item 2", value: 200 },
    { id: 3, name: "Item 3", value: 300 }
  ],
  metadata: {
    source: "local",
    lastUpdated: Date.now()
  }
});

// Create a reactive store agent
const storeAgent = Agent("ReactiveStore", {
  store: store,
  computedValues: {},
  effects: []
});

// Create a computed agent
const computedAgent = Agent("ComputedValue", {
  name: "totalValue",
  value: 0,
  dependencies: ["items"]
});

// Add agents to the network
reactiveNetwork.addAgent(dataAgent);
reactiveNetwork.addAgent(storeAgent);
reactiveNetwork.addAgent(computedAgent);

// Create a rule for updating the computed value
const computeRule = ActionRule(
  dataAgent.ports.main,
  computedAgent.ports.main,
  (data, computed) => {
    console.log("Computing total value...");

    // Calculate the total value
    const totalValue = data.value.items.reduce(
      (sum, item) => sum + item.value,
      0
    );

    // Update the computed value
    computed.value.value = totalValue;

    console.log(`Total value computed: ${totalValue}`);

    return [data, computed];
  }
);

// Add the rule to the network
reactiveNetwork.addRule(computeRule);

// Connect the agents to trigger the computation
reactiveNetwork.connectPorts(dataAgent.ports.main, computedAgent.ports.main);

// Execute one step
reactiveNetwork.step();

// Show the computed value
console.log("Computed agent value:", computedAgent.value.value);

// Update the data
console.log("\nUpdating data items...");
dataAgent.value.items[0].value = 150;
dataAgent.value.items.push({ id: 4, name: "Item 4", value: 400 });

// Connect again to trigger recomputation
reactiveNetwork.connectPorts(dataAgent.ports.main, computedAgent.ports.main);
reactiveNetwork.step();

// Show the updated computed value
console.log("Updated computed agent value:", computedAgent.value.value);