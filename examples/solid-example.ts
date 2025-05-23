/**
 * Annette-Solid Example
 * 
 * This example demonstrates the SolidJS-like reactive library built on Annette's interaction nets.
 */
import { 
  createSignal, 
  createMemo, 
  createEffect, 
  createResource,
  createStore,
  batch,
  createRoot
} from '../src/solid';

// Simple counter example
function counterExample() {
  console.log("\n--- Counter Example ---");
  
  // Create a signal for the count
  const [count, setCount] = createSignal(0);
  
  // Create a derived value
  const doubled = createMemo(() => count() * 2);
  
  // Create an effect that logs changes
  const dispose = createEffect(() => {
    console.log(`Count: ${count()}, Doubled: ${doubled()}`);
  });
  
  // Update the count several times
  console.log("Incrementing count 5 times...");
  for (let i = 0; i < 5; i++) {
    setCount(count() + 1);
  }
  
  // Batch updates together
  console.log("\nBatch updating count 5 more times...");
  batch(() => {
    for (let i = 0; i < 5; i++) {
      setCount(count() + 1);
    }
  });
  
  // Dispose the effect
  console.log("\nDisposing effect...");
  dispose.dispose();
  
  // Update once more (should not trigger the effect)
  setCount(count() + 1);
  console.log(`Final count: ${count()}, doubled: ${doubled()}`);
}

// Nested computations example
function nestedComputationsExample() {
  console.log("\n--- Nested Computations Example ---");
  
  // Create signals
  const [firstName, setFirstName] = createSignal("John");
  const [lastName, setLastName] = createSignal("Doe");
  
  // Create nested memos
  const fullName = createMemo(() => `${firstName()} ${lastName()}`);
  const greeting = createMemo(() => `Hello, ${fullName()}!`);
  
  // Create an effect
  createEffect(() => {
    console.log(greeting());
  });
  
  // Update first name
  console.log("Changing first name to 'Jane'...");
  setFirstName("Jane");
  
  // Update last name
  console.log("Changing last name to 'Smith'...");
  setLastName("Smith");
}

// Resource example
async function resourceExample() {
  console.log("\n--- Resource Example ---");
  
  // Create a signal for user ID
  const [userId, setUserId] = createSignal(1);
  
  // Create a resource
  const [user, fetchUser] = createResource(
    // Source function
    () => userId(),
    // Fetcher function
    async (id) => {
      console.log(`Fetching user ${id}...`);
      // Simulate API call
      return new Promise<{id: number, name: string}>(resolve => {
        setTimeout(() => {
          resolve({ id, name: `User ${id}` });
        }, 1000);
      });
    },
    { name: 'user' }
  );
  
  // Create an effect to log loading state
  createEffect(() => {
    if (user.loading()) {
      console.log("Loading user...");
    } else {
      console.log(`Loaded: ${JSON.stringify(user.latest())}`);
    }
  });
  
  // Wait for first load
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  // Change user ID to trigger refetch
  console.log("\nChanging user ID to 2...");
  setUserId(2);
  
  // Wait for second load
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  // Manually trigger refetch
  console.log("\nManually refetching user...");
  await fetchUser(true);
}

// Store example
function storeExample() {
  console.log("\n--- Store Example ---");
  
  // Create a reactive store
  const [state, setState] = createStore({
    user: {
      name: "John Doe",
      age: 30
    },
    todos: [
      { id: 1, text: "Learn Annette", completed: false },
      { id: 2, text: "Build reactive library", completed: false }
    ]
  });
  
  // Create effects to monitor changes
  createEffect(() => {
    console.log(`User: ${state.user.name}, ${state.user.age} years old`);
  });
  
  createEffect(() => {
    console.log(`Todos: ${state.todos.length} items`);
    state.todos.forEach(todo => {
      console.log(`- ${todo.text} ${todo.completed ? '(done)' : ''}`);
    });
  });
  
  // Update user name
  console.log("\nUpdating user name...");
  setState(draft => {
    draft.user.name = "Jane Smith";
  });
  
  // Update age and mark todo as completed
  console.log("\nUpdating age and todos...");
  setState(draft => {
    draft.user.age = 31;
    draft.todos[0].completed = true;
  });
  
  // Add a new todo
  console.log("\nAdding a new todo...");
  setState(draft => {
    draft.todos.push({
      id: 3,
      text: "Deploy application",
      completed: false
    });
  });
}

// Run all examples inside a root
createRoot(async () => {
  console.log("Running Annette-Solid examples...");
  
  counterExample();
  nestedComputationsExample();
  await resourceExample();
  storeExample();
  
  console.log("\nAll examples completed!");
});