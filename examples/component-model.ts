import {
  createComponent, defineComponent, ComponentOptions, 
  ComponentContext, LifecycleHooks, createElement, render,
  Core, Simple
} from "../src";

/**
 * This example demonstrates the component model in Annette,
 * which provides a framework for building reusable components
 * with lifecycle hooks and DOM integration.
 */

console.log("======= Component Model Example =======");

// 1. Basic component creation
console.log("\n--- Basic Component ---");

// Define component props interface
interface CounterProps {
  initialCount: number;
  step?: number;
  onIncrement?: (newValue: number) => void;
}

// Define component state interface
interface CounterState {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

// Create a counter component
const counterState = createComponent<CounterProps, CounterState>({
  name: "Counter",
  props: {
    initialCount: 0,
    step: 1
  },
  setup(context) {
    // Access props in a type-safe way
    const { props, emit, onCleanup, onEffect } = context;
    
    // Create state
    let count = props.initialCount;
    
    // Log mount
    console.log(`Counter component mounted with initial count: ${count}`);
    
    // Setup an effect
    const disposeEffect = onEffect(() => {
      console.log(`Counter value: ${count}`);
    });
    
    // Setup cleanup
    onCleanup(() => {
      console.log("Counter component cleanup");
      disposeEffect();
    });
    
    // Return the component state
    return {
      count,
      increment: () => {
        count += props.step || 1;
        emit("increment", count);
        if (props.onIncrement) {
          props.onIncrement(count);
        }
      },
      decrement: () => {
        count -= props.step || 1;
        emit("decrement", count);
      },
      reset: () => {
        count = props.initialCount;
        emit("reset", count);
      }
    };
  },
  hooks: {
    onMounted: () => {
      console.log("Counter component mounted");
    },
    onUpdated: () => {
      console.log("Counter component updated");
    },
    onBeforeUpdate: () => {
      console.log("Counter about to update");
    },
    onError: (error) => {
      console.error("Counter component error:", error.message);
    }
  }
});

// Use the counter
console.log("Initial counter state:", counterState);
counterState.increment();
console.log("After increment:", counterState.count);
counterState.increment();
console.log("After increment:", counterState.count);
counterState.decrement();
console.log("After decrement:", counterState.count);
counterState.reset();
console.log("After reset:", counterState.count);

// 2. Reusable component with defineComponent
console.log("\n--- Reusable Component ---");

// Define a reusable todo item component
interface TodoItemProps {
  id: number;
  text: string;
  completed: boolean;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

interface TodoItemState {
  toggle: () => void;
  remove: () => void;
  isCompleted: () => boolean;
}

// Define the component
const TodoItem = defineComponent<TodoItemProps, TodoItemState>({
  name: "TodoItem",
  setup(context) {
    const { props, emit } = context;
    
    // Log props
    console.log(`Todo item created: "${props.text}" (${props.completed ? 'completed' : 'active'})`);
    
    return {
      toggle: () => {
        props.onToggle(props.id);
        emit("toggle", props.id);
      },
      remove: () => {
        props.onDelete(props.id);
        emit("delete", props.id);
      },
      isCompleted: () => props.completed
    };
  },
  hooks: {
    onMounted: () => {
      console.log("TodoItem component mounted");
    }
  }
});

// Create todo items
const todos = [
  { id: 1, text: "Learn Annette component model", completed: false },
  { id: 2, text: "Build a component", completed: false }
];

// Create handler functions
const handleToggle = (id: number) => {
  console.log(`Toggling todo ${id}`);
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
  }
};

const handleDelete = (id: number) => {
  console.log(`Deleting todo ${id}`);
  const index = todos.findIndex(t => t.id === id);
  if (index !== -1) {
    todos.splice(index, 1);
  }
};

// Create instances
const todoItems = todos.map(todo => 
  TodoItem({
    id: todo.id,
    text: todo.text,
    completed: todo.completed,
    onToggle: handleToggle,
    onDelete: handleDelete
  })
);

// Use the todo items
todoItems.forEach((item, index) => {
  console.log(`Todo ${index + 1}: ${todos[index].text}`);
  console.log("  Is completed:", item.isCompleted());
  
  // Toggle the first todo
  if (index === 0) {
    item.toggle();
    console.log("  After toggle:", item.isCompleted());
  }
});

// 3. Integration with Annette Network
console.log("\n--- Integration with Annette Network ---");

// Create a network
const componentNetwork = Core.createNetwork("component-network");

// Create a component store agent
const componentStoreAgent = Core.createAgent("ComponentStore", {
  components: {
    counter: {
      name: "Counter",
      props: { initialCount: 10, step: 2 },
      state: { count: 10 }
    },
    todoList: {
      name: "TodoList",
      props: { items: todos },
      state: { items: todos }
    }
  },
  updates: []
});

// Create a renderer agent
const rendererAgent = Core.createAgent("Renderer", {
  root: "app",
  rendered: [],
  pending: []
});

// Add agents to the network
componentNetwork.addAgent(componentStoreAgent);
componentNetwork.addAgent(rendererAgent);

// Create a rule for updating components
const updateComponentRule = Core.createRule(
  "update-component",
  componentStoreAgent.ports.main,
  rendererAgent.ports.main,
  (store, renderer, network) => {
    console.log("Updating components...");
    
    // Simulate updating the counter component
    const counter = store.value.components.counter;
    counter.state.count += counter.props.step;
    
    // Add to renderer's rendered list
    renderer.value.rendered.push({
      component: counter.name,
      props: counter.props,
      output: `<div>Counter: ${counter.state.count}</div>`
    });
    
    console.log(`Rendered counter with value: ${counter.state.count}`);
    
    return [store, renderer];
  }
);

// Add the rule to the network
componentNetwork.addRule(updateComponentRule);

// Connect the agents to trigger rendering
componentNetwork.connectPorts(
  componentStoreAgent.ports.main, 
  rendererAgent.ports.main
);

// Execute multiple steps
console.log("\nExecuting component network steps...");
for (let i = 0; i < 3; i++) {
  console.log(`\nStep ${i + 1}:`);
  componentNetwork.step();
}

// 4. Virtual DOM rendering (simulated)
console.log("\n--- Virtual DOM Rendering (Simulated) ---");

// Create a simulated DOM renderer that logs to console
const domRenderer = {
  render: (element: any) => {
    console.log("Rendered DOM:", JSON.stringify(element, null, 2));
    return () => console.log("Cleanup render");
  }
};

// Create a component using JSX-like syntax
const CounterView = (props: { count: number, onIncrement: () => void }) => {
  return createElement(
    "div",
    { className: "counter" },
    createElement("h2", {}, `Count: ${props.count}`),
    createElement(
      "button",
      { onClick: props.onIncrement },
      "Increment"
    )
  );
};

// Render the component
console.log("Rendering counter view...");
const counterView = CounterView({ 
  count: counterState.count, 
  onIncrement: counterState.increment 
});

// Simulate rendering to DOM
domRenderer.render(counterView);

// Show final render output
console.log("\nFinal renderer state:");
console.log(`Rendered ${rendererAgent.value.rendered.length} components`);
rendererAgent.value.rendered.forEach((item, index) => {
  console.log(`${index + 1}. ${item.component} -> ${item.output}`);
});