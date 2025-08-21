import {
  Agent, Network, ActionRule,
  createReactiveStore
} from "../src";

/**
 * Reactive Todo App Example
 *
 * This example demonstrates building a complete reactive todo application
 * using Annette's reactive system and network capabilities.
 */

console.log("======= Reactive Todo App =======");

// Define types for our todo application
type TodoItem = {
  id: number;
  text: string;
  completed: boolean;
  createdAt: Date;
  priority: 'low' | 'medium' | 'high';
};

type TodoFilter = 'all' | 'active' | 'completed';

type TodoState = {
  items: TodoItem[];
  filter: TodoFilter;
  nextId: number;
};

type TodoStats = {
  total: number;
  completed: number;
  active: number;
  highPriority: number;
};

// Create a reactive store for the todo state
const store = createReactiveStore();

// Create the reactive todo state
const todoState = store.createReactive<TodoState>({
  items: [
    { id: 1, text: "Learn Annette reactive system", completed: false, createdAt: new Date(), priority: 'high' },
    { id: 2, text: "Build a todo app", completed: true, createdAt: new Date(), priority: 'medium' },
    { id: 3, text: "Write documentation", completed: false, createdAt: new Date(), priority: 'low' }
  ],
  filter: 'all',
  nextId: 4
});

// Create computed properties for filtered todos
const getFilteredTodos = store.createComputed("filteredTodos", () => {
  console.log("🔄 Computing filtered todos...");

  switch (todoState.filter) {
    case 'active':
      return todoState.items.filter(todo => !todo.completed);
    case 'completed':
      return todoState.items.filter(todo => todo.completed);
    default:
      return todoState.items;
  }
});

// Create computed property for todo statistics
const getTodoStats = store.createComputed("todoStats", (): TodoStats => {
  console.log("🔄 Computing todo stats...");

  const total = todoState.items.length;
  const completed = todoState.items.filter(todo => todo.completed).length;
  const active = total - completed;
  const highPriority = todoState.items.filter(todo => todo.priority === 'high' && !todo.completed).length;

  return { total, completed, active, highPriority };
});

// Create computed property for high priority todos
const getHighPriorityTodos = store.createComputed("highPriorityTodos", () => {
  console.log("🔄 Computing high priority todos...");
  return todoState.items.filter(todo => todo.priority === 'high' && !todo.completed);
});

// Create a network for handling todo operations
const todoNetwork = Network("todo-network");

// Create agents for different todo operations
const addTodoAgent = Agent("AddTodo", {
  text: "",
  priority: 'medium' as 'low' | 'medium' | 'high'
});

const toggleTodoAgent = Agent("ToggleTodo", { id: 0 });
const deleteTodoAgent = Agent("DeleteTodo", { id: 0 });
const changeFilterAgent = Agent("ChangeFilter", { filter: 'all' as TodoFilter });
const clearCompletedAgent = Agent("ClearCompleted", {});

// Create a display agent that shows current state
const displayAgent = Agent("Display", {
  message: "",
  lastAction: ""
});

// Add agents to the network
todoNetwork.addAgent(addTodoAgent);
todoNetwork.addAgent(toggleTodoAgent);
todoNetwork.addAgent(deleteTodoAgent);
todoNetwork.addAgent(changeFilterAgent);
todoNetwork.addAgent(clearCompletedAgent);
todoNetwork.addAgent(displayAgent);

// Define rules for todo operations

// Rule to add a new todo
const addTodoRule = ActionRule(
  addTodoAgent.ports.main,
  displayAgent.ports.main,
  (addTodo, display) => {
    if (addTodo.value.text.trim()) {
      const newTodo: TodoItem = {
        id: todoState.nextId,
        text: addTodo.value.text.trim(),
        completed: false,
        createdAt: new Date(),
        priority: addTodo.value.priority
      };

      todoState.items.push(newTodo);
      todoState.nextId++;

      display.value.message = `Added: "${newTodo.text}"`;
      display.value.lastAction = "add";

      // Reset the add todo form
      addTodo.value.text = "";
    }

    return [addTodo, display];
  }
);

// Rule to toggle todo completion
const toggleTodoRule = ActionRule(
  toggleTodoAgent.ports.main,
  displayAgent.ports.main,
  (toggleTodo, display) => {
    const todo = todoState.items.find(t => t.id === toggleTodo.value.id);
    if (todo) {
      todo.completed = !todo.completed;
      display.value.message = `${todo.completed ? 'Completed' : 'Uncompleted'}: "${todo.text}"`;
      display.value.lastAction = "toggle";
    }

    return [toggleTodo, display];
  }
);

// Rule to delete a todo
const deleteTodoRule = ActionRule(
  deleteTodoAgent.ports.main,
  displayAgent.ports.main,
  (deleteTodo, display) => {
    const index = todoState.items.findIndex(t => t.id === deleteTodo.value.id);
    if (index !== -1) {
      const removedTodo = todoState.items.splice(index, 1)[0];
      display.value.message = `Deleted: "${removedTodo.text}"`;
      display.value.lastAction = "delete";
    }

    return [deleteTodo, display];
  }
);

// Rule to change filter
const changeFilterRule = ActionRule(
  changeFilterAgent.ports.main,
  displayAgent.ports.main,
  (changeFilter, display) => {
    todoState.filter = changeFilter.value.filter;
    display.value.message = `Filter changed to: ${changeFilter.value.filter}`;
    display.value.lastAction = "filter";

    return [changeFilter, display];
  }
);

// Rule to clear completed todos
const clearCompletedRule = ActionRule(
  clearCompletedAgent.ports.main,
  displayAgent.ports.main,
  (clearCompleted, display) => {
    const initialCount = todoState.items.length;
    todoState.items = todoState.items.filter(todo => !todo.completed);
    const removedCount = initialCount - todoState.items.length;

    display.value.message = `Cleared ${removedCount} completed todo(s)`;
    display.value.lastAction = "clear";

    return [clearCompleted, display];
  }
);

// Add all rules to the network
todoNetwork.addRule(addTodoRule);
todoNetwork.addRule(toggleTodoRule);
todoNetwork.addRule(deleteTodoRule);
todoNetwork.addRule(changeFilterRule);
todoNetwork.addRule(clearCompletedRule);

// Create a reactive effect to display the current state
store.createEffect(() => {
  const filteredTodos = getFilteredTodos();
  const stats = getTodoStats();
  const highPriority = getHighPriorityTodos();

  console.log("\n📋 === Todo List ===");
  console.log(`📊 Stats: ${stats.completed}/${stats.total} completed, ${stats.active} active`);
  if (stats.highPriority > 0) {
    console.log(`🚨 High priority items: ${stats.highPriority}`);
  }
  console.log(`🔍 Filter: ${todoState.filter}`);
  console.log("");

  filteredTodos.forEach(todo => {
    const priorityIcon = todo.priority === 'high' ? '🚨' : todo.priority === 'medium' ? '📌' : '📝';
    const statusIcon = todo.completed ? '✅' : '⏳';
    console.log(`${statusIcon} ${priorityIcon} ${todo.id}. ${todo.text}`);
  });

  if (filteredTodos.length === 0) {
    console.log("(No todos to display)");
  }

  if (highPriority.length > 0) {
    console.log("\n🚨 High Priority Items:");
    highPriority.forEach(todo => {
      console.log(`  • ${todo.text}`);
    });
  }

  console.log("");
});

// Function to simulate user interactions
function simulateUserInteractions() {
  console.log("🎯 Starting Todo App Simulation\n");

  // Show initial state
  console.log("Initial state:");
  // The effect will automatically display the current state

  // Add a new todo
  console.log("➕ Adding a new todo...");
  addTodoAgent.value.text = "Learn about Annette networks";
  addTodoAgent.value.priority = 'high';
  todoNetwork.connectPorts(addTodoAgent.ports.main, displayAgent.ports.main);
  todoNetwork.step();

  // Toggle a todo
  console.log("🔄 Toggling first todo...");
  toggleTodoAgent.value.id = 1;
  todoNetwork.connectPorts(toggleTodoAgent.ports.main, displayAgent.ports.main);
  todoNetwork.step();

  // Change filter to active
  console.log("🔍 Changing filter to 'active'...");
  changeFilterAgent.value.filter = 'active';
  todoNetwork.connectPorts(changeFilterAgent.ports.main, displayAgent.ports.main);
  todoNetwork.step();

  // Add another todo
  console.log("➕ Adding another todo...");
  addTodoAgent.value.text = "Write unit tests";
  addTodoAgent.value.priority = 'medium';
  todoNetwork.connectPorts(addTodoAgent.ports.main, displayAgent.ports.main);
  todoNetwork.step();

  // Change filter to completed
  console.log("🔍 Changing filter to 'completed'...");
  changeFilterAgent.value.filter = 'completed';
  todoNetwork.connectPorts(changeFilterAgent.ports.main, displayAgent.ports.main);
  todoNetwork.step();

  // Clear completed todos
  console.log("🗑️ Clearing completed todos...");
  todoNetwork.connectPorts(clearCompletedAgent.ports.main, displayAgent.ports.main);
  todoNetwork.step();

  // Change filter back to all
  console.log("🔍 Changing filter back to 'all'...");
  changeFilterAgent.value.filter = 'all';
  todoNetwork.connectPorts(changeFilterAgent.ports.main, displayAgent.ports.main);
  todoNetwork.step();

  // Delete a todo
  console.log("🗑️ Deleting a todo...");
  deleteTodoAgent.value.id = 3;
  todoNetwork.connectPorts(deleteTodoAgent.ports.main, displayAgent.ports.main);
  todoNetwork.step();

  console.log("🎉 Simulation complete!");
}

// Demonstrate the reactive computed properties
function demonstrateComputedProperties() {
  console.log("\n🧮 === Demonstrating Computed Properties ===");

  console.log("Direct access to computed values:");
  console.log("Filtered todos count:", getFilteredTodos().length);
  console.log("Active todos count:", getTodoStats().active);
  console.log("High priority todos count:", getHighPriorityTodos().length);

  console.log("\nAdding a high priority todo...");
  todoState.items.push({
    id: todoState.nextId++,
    text: "URGENT: Fix critical bug",
    completed: false,
    createdAt: new Date(),
    priority: 'high'
  });

  console.log("Accessing computed values again (should recompute):");
  console.log("Filtered todos count:", getFilteredTodos().length);
  console.log("Active todos count:", getTodoStats().active);
  console.log("High priority todos count:", getHighPriorityTodos().length);

  console.log("\nAccessing again (should use cached values):");
  console.log("Filtered todos count:", getFilteredTodos().length);
  console.log("Active todos count:", getTodoStats().active);
  console.log("High priority todos count:", getHighPriorityTodos().length);
}

// Run the demonstrations
demonstrateComputedProperties();
simulateUserInteractions();

// Export for use in other examples
export {
  todoState,
  getFilteredTodos,
  getTodoStats,
  getHighPriorityTodos,
  todoNetwork,
  addTodoAgent,
  toggleTodoAgent,
  deleteTodoAgent,
  changeFilterAgent,
  clearCompletedAgent,
  displayAgent
};