# Fine-Grained Reactivity in Annette

This document explains the fine-grained reactivity system in Annette, including property-level reactivity, computed properties, and the component model.

## Overview

Annette's fine-grained reactivity system provides:

1. **Property-Level Reactivity**: Track and react to changes at the individual property level
2. **Automatic Dependency Tracking**: Automatically track dependencies between reactive values
3. **Computed Properties**: Efficiently derive values from reactive state
4. **Component Model**: Build reusable components with lifecycle hooks
5. **DOM Integration**: Directly integrate with the DOM for web applications

## Fine-Grained Reactivity

Annette's reactivity system tracks dependencies at the property level:

```typescript
import { ReactiveProxy } from 'annette';

// Create a reactive proxy
const proxy = new ReactiveProxy();

// Create a reactive object
const user = proxy.createProxy({
  name: 'John',
  age: 30,
  address: {
    city: 'New York',
    country: 'USA'
  }
});

// Track dependencies for a specific property
const { result, dependencies } = proxy.withTracking(() => {
  return `${user.name} (${user.age})`;
});

console.log('Result:', result); // "John (30)"
console.log('Dependencies:', dependencies); // Set { "name", "age" }

// Subscribe to changes for a specific property
const subscription = proxy.subscribe('name', () => {
  console.log('Name changed to:', user.name);
});

// Update a property
user.name = 'Jane'; // Logs: "Name changed to: Jane"

// Unsubscribe when done
subscription.unsubscribe();
```

### Reactive Store

For more structured reactivity, use the `ReactiveStore`:

```typescript
import { createReactiveStore } from 'annette';

// Create a reactive store
const store = createReactiveStore();

// Create a reactive object
const counter = store.createReactive({
  count: 0,
  history: []
});

// Create a computed property
const doubled = store.createComputed('doubledCount', () => {
  return counter.count * 2;
});

// Create an effect
const dispose = store.createEffect(() => {
  console.log(`Count: ${counter.count}, Doubled: ${doubled()}`);
  
  // Track history
  counter.history.push(counter.count);
});

// Update the counter
counter.count = 1; // Logs: "Count: 1, Doubled: 2"
counter.count = 2; // Logs: "Count: 2, Doubled: 4"

// Clean up when done
dispose();
```

### Computed Properties

Computed properties automatically track dependencies and cache results:

```typescript
import { computed } from 'annette';

// Create reactive state
const reactive = proxy.createProxy({
  x: 1,
  y: 2
});

// Create a computed property
const sum = computed(() => {
  console.log('Computing sum...');
  return reactive.x + reactive.y;
});

// Use the computed value (computes once)
console.log(sum()); // Logs: "Computing sum..." then "3"
console.log(sum()); // Logs: "3" (cached)

// Update a dependency
reactive.x = 10;

// Use the computed value again (recomputes)
console.log(sum()); // Logs: "Computing sum..." then "12"
```

## Component Model

Annette provides a comprehensive component model with lifecycle hooks:

```typescript
import { createComponent, defineComponent } from 'annette';

// Define a counter component
const Counter = defineComponent({
  name: 'Counter',
  
  setup(context) {
    // Access props
    console.log('Initial props:', context.props);
    
    // Create reactive state
    const state = store.createReactive({
      count: 0,
      doubled: 0
    });
    
    // Create a computed property
    store.createComputed('doubled', () => {
      state.doubled = state.count * 2;
    });
    
    // Create methods
    const increment = () => {
      state.count++;
      context.emit('change', state.count);
    };
    
    const decrement = () => {
      state.count--;
      context.emit('change', state.count);
    };
    
    // Register cleanup
    context.onCleanup(() => {
      console.log('Component cleaned up');
    });
    
    // Register an effect
    context.onEffect(() => {
      console.log(`Count: ${state.count}, Doubled: ${state.doubled}`);
    });
    
    // Register error handler
    context.onError((error) => {
      console.error('Component error:', error);
    });
    
    // Return public API
    return {
      state,
      increment,
      decrement
    };
  },
  
  hooks: {
    onMounted() {
      console.log('Component mounted');
    },
    
    onUpdated() {
      console.log('Component updated');
    },
    
    onUnmounted() {
      console.log('Component unmounted');
    },
    
    onBeforeUpdate() {
      console.log('Component about to update');
    }
  }
});

// Use the component
const counter = Counter({
  initialCount: 0,
  onChange: (count) => {
    console.log('Counter changed:', count);
  }
});

// Access component state and methods
console.log('Initial state:', counter.state);
counter.increment();
counter.increment();
counter.decrement();
```

### Lifecycle Hooks

Components have several lifecycle hooks:

1. **onMounted**: Called when the component is mounted
2. **onUpdated**: Called when the component is updated
3. **onUnmounted**: Called when the component is unmounted
4. **onBeforeUpdate**: Called before the component is updated
5. **onError**: Called when an error occurs in the component

### Component Context

The component context provides:

1. **props**: Access to the component props
2. **emit**: Method to emit events to the parent
3. **onCleanup**: Register cleanup functions
4. **onEffect**: Register effects
5. **onError**: Register error handlers

## DOM Integration

For web applications, Annette provides direct DOM integration:

```typescript
import { render, defineComponent } from 'annette';

// Define a component
const App = defineComponent({
  name: 'App',
  
  setup() {
    const state = store.createReactive({
      count: 0,
      items: ['Item 1', 'Item 2', 'Item 3']
    });
    
    const increment = () => {
      state.count++;
    };
    
    const addItem = () => {
      state.items.push(`Item ${state.items.length + 1}`);
    };
    
    return {
      state,
      increment,
      addItem
    };
  }
});

// Create the app instance
const app = App({});

// Render to the DOM
render(() => {
  return {
    type: 'div',
    props: {
      children: [
        {
          type: 'h1',
          props: {
            children: `Counter: ${app.state.count}`
          }
        },
        {
          type: 'button',
          props: {
            onClick: app.increment,
            children: 'Increment'
          }
        },
        {
          type: 'ul',
          props: {
            children: app.state.items.map(item => ({
              type: 'li',
              props: {
                children: item
              }
            }))
          }
        }
      ]
    }
  };
}, document.getElementById('app'));
```

### JSX Support

Annette also supports JSX-like syntax through the `createElement` function:

```typescript
import { createElement, render } from 'annette';

function App({ state, increment, addItem }) {
  return createElement('div', {}, 
    createElement('h1', {}, `Counter: ${state.count}`),
    createElement('button', { onClick: increment }, 'Increment'),
    createElement('ul', {}, 
      ...state.items.map(item => 
        createElement('li', {}, item)
      )
    )
  );
}

// Render with JSX-like syntax
render(() => App(app), document.getElementById('app'));
```

## Advanced Features

### Batched Updates

For better performance, you can batch multiple updates:

```typescript
import { ReactiveStore } from 'annette';

const store = new ReactiveStore();

// Batch multiple updates
store.batch(() => {
  counter.count = 10;
  counter.name = 'New counter';
  counter.enabled = true;
});
```

### Automatic Cleanup

Effects and subscriptions are automatically cleaned up when their dependencies are removed:

```typescript
const state = store.createReactive({
  showDetail: true,
  detail: {
    name: 'Item',
    description: 'Description'
  }
});

// This effect will be automatically cleaned up when showDetail becomes false
store.createEffect(() => {
  if (state.showDetail) {
    console.log('Detail:', state.detail.name);
  }
});

// Later
state.showDetail = false; // Effect is automatically cleaned up
```

### Nested Components

Components can be nested to create complex UIs:

```typescript
const TodoItem = defineComponent({
  name: 'TodoItem',
  
  setup(context) {
    return {
      toggle: () => {
        context.emit('toggle', context.props.id);
      }
    };
  }
});

const TodoList = defineComponent({
  name: 'TodoList',
  
  setup() {
    const state = store.createReactive({
      todos: [
        { id: 1, text: 'Learn Annette', completed: false },
        { id: 2, text: 'Build an app', completed: false }
      ]
    });
    
    const toggleTodo = (id) => {
      const todo = state.todos.find(t => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
      }
    };
    
    return {
      state,
      toggleTodo
    };
  }
});

// Render nested components
render(() => {
  const list = TodoList({});
  
  return createElement('div', {},
    createElement('h1', {}, 'Todo List'),
    createElement('ul', {},
      ...list.state.todos.map(todo => 
        createElement(TodoItem, { 
          id: todo.id, 
          text: todo.text, 
          completed: todo.completed,
          onToggle: list.toggleTodo
        })
      )
    )
  );
}, document.getElementById('app'));
```

## Optimization Techniques

### Memoization

Computed properties are automatically memoized:

```typescript
// This will only recalculate when dependencies change
const expensiveComputation = store.createComputed('expensive', () => {
  console.log('Computing...');
  return someExpensiveCalculation(state.data);
});
```

### Fine-Grained Dependency Tracking

Only properties that are actually used are tracked:

```typescript
const user = store.createReactive({
  name: 'John',
  age: 30,
  address: {
    city: 'New York',
    country: 'USA'
  }
});

// This effect only depends on user.name, not the entire user object
store.createEffect(() => {
  console.log('Name:', user.name);
});

// This won't trigger the effect
user.age = 31;

// This will trigger the effect
user.name = 'Jane';
```

### Lazy Evaluation

Computed properties are evaluated lazily:

```typescript
const computedValue = store.createComputed('lazyValue', () => {
  console.log('Computing expensive value...');
  return expensiveCalculation();
});

// Nothing is computed yet

// Only computed when accessed
console.log(computedValue());

// Uses cached value on subsequent access
console.log(computedValue());
```

## Practical Examples

### Form Handling

```typescript
const Form = defineComponent({
  name: 'Form',
  
  setup() {
    const state = store.createReactive({
      username: '',
      email: '',
      password: '',
      errors: {},
      isValid: false
    });
    
    // Create validators
    const validators = {
      username: (value) => value.length >= 3 ? null : 'Username must be at least 3 characters',
      email: (value) => /^.+@.+\..+$/.test(value) ? null : 'Invalid email address',
      password: (value) => value.length >= 8 ? null : 'Password must be at least 8 characters'
    };
    
    // Update form field
    const updateField = (field, value) => {
      state[field] = value;
      
      // Validate the field
      const error = validators[field](value);
      if (error) {
        state.errors[field] = error;
      } else {
        delete state.errors[field];
      }
      
      // Check overall validity
      state.isValid = Object.keys(state.errors).length === 0 &&
        state.username && state.email && state.password;
    };
    
    // Submit the form
    const submit = () => {
      if (state.isValid) {
        console.log('Form submitted:', {
          username: state.username,
          email: state.email,
          password: state.password
        });
      }
    };
    
    return {
      state,
      updateField,
      submit
    };
  }
});
```

### Data Fetching

```typescript
const DataLoader = defineComponent({
  name: 'DataLoader',
  
  setup(context) {
    const state = store.createReactive({
      data: null,
      loading: false,
      error: null
    });
    
    // Fetch data
    const fetchData = async () => {
      state.loading = true;
      state.error = null;
      
      try {
        const response = await fetch(context.props.url);
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        state.data = await response.json();
      } catch (error) {
        state.error = error.message;
      } finally {
        state.loading = false;
      }
    };
    
    // Fetch on mount
    context.onEffect(() => {
      fetchData();
    });
    
    // Refetch when URL changes
    context.onEffect(() => {
      if (context.props.url) {
        fetchData();
      }
    });
    
    return {
      state,
      fetchData
    };
  }
});
```

## Comparison with Other Reactive Systems

| Feature | Annette | React | Vue | SolidJS |
|---------|---------|-------|-----|---------|
| Dependency Tracking | Property-level | Component-level | Property-level | Property-level |
| Reactivity Model | Direct proxy | Virtual DOM | Proxy-based | Signal-based |
| Rendering Model | Direct DOM | Virtual DOM | Virtual DOM | Direct DOM |
| Component Model | Setup function | Functional/Class | Options API | JSX/Signals |
| Fine-grained Updates | Yes | No (without memo) | Yes | Yes |
| Computed Caching | Automatic | Manual (useMemo) | Automatic | Automatic |

## Conclusion

Annette's fine-grained reactivity system provides a powerful foundation for building reactive applications:

1. **Property-Level Reactivity** minimizes unnecessary updates
2. **Automatic Dependency Tracking** simplifies development
3. **Computed Properties** optimize derived values
4. **Component Model** enables reusable, composable UI
5. **DOM Integration** provides direct rendering for web applications

By leveraging these features, you can build highly performant and maintainable reactive applications.