# Reactive Programming Tutorial

Annette has built-in reactive programming capabilities that make it easy to build dynamic user interfaces and reactive systems. This tutorial will show you how to create reactive values, computed values, and effects that automatically update when their dependencies change.

## What You'll Learn

- How to create reactive values that automatically track changes
- How to create computed values that update when dependencies change
- How to create effects that run when reactive values change
- How to build reactive user interfaces
- How to handle complex reactive dependencies

## Prerequisites

- Basic understanding of Annette agents and networks
- Completed the [Getting Started Tutorial](getting-started-tutorial.md)
- Familiarity with reactive programming concepts (optional)

## Step 1: Creating Reactive Values

Reactive values automatically track changes and notify dependents:

```typescript
import { createReactive, createComputed, createEffect } from 'annette';

// Create a reactive value
const count = createReactive(0);
const multiplier = createReactive(2);

console.log(count()); // 0
console.log(multiplier()); // 2

// Update the value
count(5);
console.log(count()); // 5

// Reactive values are functions that can get and set values
count(count() + 1);
console.log(count()); // 6
```

**What you learned:**
- `createReactive(initialValue)` creates a reactive value
- Call the function with no arguments to get the current value
- Call the function with a value to set a new value
- Changes are automatically tracked for reactive updates

## Step 2: Creating Computed Values

Computed values automatically update when their dependencies change:

```typescript
import { createReactive, createComputed } from 'annette';

const count = createReactive(0);
const multiplier = createReactive(2);

// Create a computed value
const doubled = createComputed(() => {
  console.log('Computing doubled value...');
  return count() * multiplier();
});

console.log(doubled()); // 0 (0 * 2)

// When dependencies change, the computed value updates automatically
count(5);
console.log(doubled()); // 10 (5 * 2)

multiplier(3);
console.log(doubled()); // 15 (5 * 3)

// Computed values are cached and only recalculate when needed
console.log(doubled()); // 15 (cached, no "Computing..." message)
```

**What you learned:**
- `createComputed(computationFunction)` creates a computed value
- The computation function automatically tracks reactive dependencies
- Computed values are cached and only recalculate when dependencies change
- This is perfect for expensive calculations that depend on reactive data

## Step 3: Creating Effects

Effects run automatically when their dependencies change:

```typescript
import { createReactive, createEffect } from 'annette';

const count = createReactive(0);
const name = createReactive('Counter');

// Create an effect that logs changes
createEffect(() => {
  console.log(`${name()}: ${count()}`);
});

// Effects run immediately when created
// Output: "Counter: 0"

// When dependencies change, effects run automatically
count(1);
// Output: "Counter: 1"

name('My Counter');
count(5);
// Output: "My Counter: 5"

// Effects can have multiple dependencies
createEffect(() => {
  console.log(`Total: ${count() * 2}`);
});

count(10);
// Output: "My Counter: 10"
// Output: "Total: 20"
```

**What you learned:**
- `createEffect(effectFunction)` creates an effect
- Effects run immediately when created
- Effects automatically track reactive dependencies
- Effects run whenever any dependency changes
- Perfect for side effects like logging, DOM updates, or API calls

## Step 4: Building a Reactive Counter

Let's build a complete reactive counter application:

```typescript
import { createReactive, createComputed, createEffect } from 'annette';

function createReactiveCounter() {
  // State
  const count = createReactive(0);
  const step = createReactive(1);

  // Computed values
  const doubled = createComputed(() => count() * 2);
  const tripled = createComputed(() => count() * 3);
  const isEven = createComputed(() => count() % 2 === 0);
  const isPositive = createComputed(() => count() > 0);

  // Effects for logging
  createEffect(() => {
    console.log(`Count changed to: ${count()}`);
  });

  createEffect(() => {
    console.log(`Step changed to: ${step()}`);
  });

  createEffect(() => {
    console.log(`Doubled: ${doubled()}`);
  });

  // Actions
  const increment = () => count(count() + step());
  const decrement = () => count(count() - step());
  const reset = () => count(0);
  const setStep = (newStep: number) => step(newStep);

  // Getters
  const getCount = () => count();
  const getStep = () => step();
  const getDoubled = () => doubled();
  const getTripled = () => tripled();
  const getIsEven = () => isEven();
  const getIsPositive = () => isPositive();

  return {
    increment,
    decrement,
    reset,
    setStep,
    getCount,
    getStep,
    getDoubled,
    getTripled,
    getIsEven,
    getIsPositive
  };
}

// Usage
const counter = createReactiveCounter();

console.log('Initial state:');
console.log('Count:', counter.getCount());
console.log('Doubled:', counter.getDoubled());
console.log('Is even:', counter.getIsEven());

counter.increment();
console.log('After increment:');
console.log('Count:', counter.getCount());
console.log('Doubled:', counter.getDoubled());
console.log('Is even:', counter.getIsEven());

counter.setStep(5);
counter.increment();
console.log('After step change and increment:');
console.log('Count:', counter.getCount());
console.log('Step:', counter.getStep());
```

**What you learned:**
- You can create complex reactive systems with multiple interconnected values
- Computed values can depend on other computed values
- Effects provide a way to observe and react to changes
- The reactive system handles all the dependency tracking automatically

## Step 5: Reactive Todo List

Let's build a more complex reactive todo application:

```typescript
import { createReactive, createComputed, createEffect } from 'annette';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

function createTodoApp() {
  // State
  const todos = createReactive<Todo[]>([]);
  const filter = createReactive<'all' | 'active' | 'completed'>('all');
  const nextId = createReactive(1);

  // Computed values
  const activeTodos = createComputed(() =>
    todos().filter(todo => !todo.completed)
  );

  const completedTodos = createComputed(() =>
    todos().filter(todo => todo.completed)
  );

  const filteredTodos = createComputed(() => {
    switch (filter()) {
      case 'active':
        return activeTodos();
      case 'completed':
        return completedTodos();
      default:
        return todos();
    }
  });

  const stats = createComputed(() => ({
    total: todos().length,
    active: activeTodos().length,
    completed: completedTodos().length
  }));

  // Effects
  createEffect(() => {
    console.log(`Todos updated: ${stats().total} total, ${stats().active} active`);
  });

  createEffect(() => {
    console.log(`Filter changed to: ${filter()}`);
  });

  // Actions
  const addTodo = (text: string) => {
    const newTodo: Todo = {
      id: nextId(),
      text: text.trim(),
      completed: false
    };
    todos([...todos(), newTodo]);
    nextId(nextId() + 1);
  };

  const toggleTodo = (id: number) => {
    const updatedTodos = todos().map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );
    todos(updatedTodos);
  };

  const deleteTodo = (id: number) => {
    const updatedTodos = todos().filter(todo => todo.id !== id);
    todos(updatedTodos);
  };

  const clearCompleted = () => {
    todos(todos().filter(todo => !todo.completed));
  };

  const setFilter = (newFilter: 'all' | 'active' | 'completed') => {
    filter(newFilter);
  };

  // Getters
  const getTodos = () => todos();
  const getFilteredTodos = () => filteredTodos();
  const getStats = () => stats();
  const getFilter = () => filter();

  return {
    addTodo,
    toggleTodo,
    deleteTodo,
    clearCompleted,
    setFilter,
    getTodos,
    getFilteredTodos,
    getStats,
    getFilter
  };
}

// Usage
const app = createTodoApp();

app.addTodo('Learn Annette');
app.addTodo('Build reactive app');
app.addTodo('Write documentation');

console.log('All todos:', app.getTodos());
console.log('Stats:', app.getStats());

app.toggleTodo(1);
console.log('After toggling first todo:');
console.log('Stats:', app.getStats());

app.setFilter('active');
console.log('Active todos:', app.getFilteredTodos());

app.setFilter('completed');
console.log('Completed todos:', app.getFilteredTodos());
```

**What you learned:**
- You can create complex reactive applications with interdependent computed values
- Arrays and objects can be reactive values
- Multiple effects can respond to the same changes
- Computed values can create complex data transformations

## Step 6: Reactive Form Validation

Let's create a reactive form with validation:

```typescript
import { createReactive, createComputed, createEffect } from 'annette';

function createValidatedForm() {
  // Form state
  const email = createReactive('');
  const password = createReactive('');
  const confirmPassword = createReactive('');

  // Validation rules
  const emailValid = createComputed(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email());
  });

  const passwordValid = createComputed(() => {
    return password().length >= 8;
  });

  const passwordsMatch = createComputed(() => {
    return password() === confirmPassword();
  });

  const formValid = createComputed(() => {
    return emailValid() && passwordValid() && passwordsMatch();
  });

  // Validation messages
  const emailError = createComputed(() => {
    if (!email()) return '';
    return emailValid() ? '' : 'Please enter a valid email address';
  });

  const passwordError = createComputed(() => {
    if (!password()) return '';
    return passwordValid() ? '' : 'Password must be at least 8 characters';
  });

  const confirmPasswordError = createComputed(() => {
    if (!confirmPassword()) return '';
    return passwordsMatch() ? '' : 'Passwords do not match';
  });

  // Effects for real-time validation feedback
  createEffect(() => {
    if (emailError()) {
      console.log('Email error:', emailError());
    }
  });

  createEffect(() => {
    if (passwordError()) {
      console.log('Password error:', passwordError());
    }
  });

  createEffect(() => {
    if (confirmPasswordError()) {
      console.log('Confirm password error:', confirmPasswordError());
    }
  });

  createEffect(() => {
    console.log('Form valid:', formValid());
  });

  // Actions
  const setEmail = (value: string) => email(value);
  const setPassword = (value: string) => password(value);
  const setConfirmPassword = (value: string) => confirmPassword(value);

  const submit = () => {
    if (formValid()) {
      console.log('Form submitted successfully!');
      console.log('Email:', email());
      // Reset form
      email('');
      password('');
      confirmPassword('');
    } else {
      console.log('Cannot submit: form has validation errors');
    }
  };

  // Getters
  const getEmail = () => email();
  const getPassword = () => password();
  const getConfirmPassword = () => confirmPassword();
  const getFormValid = () => formValid();
  const getEmailError = () => emailError();
  const getPasswordError = () => passwordError();
  const getConfirmPasswordError = () => confirmPasswordError();

  return {
    setEmail,
    setPassword,
    setConfirmPassword,
    submit,
    getEmail,
    getPassword,
    getConfirmPassword,
    getFormValid,
    getEmailError,
    getPasswordError,
    getConfirmPasswordError
  };
}

// Usage
const form = createValidatedForm();

form.setEmail('invalid-email');
form.setPassword('short');
form.setConfirmPassword('different');

console.log('Form valid:', form.getFormValid());

form.setEmail('user@example.com');
form.setPassword('securepassword');
form.setConfirmPassword('securepassword');

console.log('Form valid:', form.getFormValid());
form.submit();
```

**What you learned:**
- Reactive validation provides real-time feedback
- Complex validation logic can be broken down into simple computed values
- Effects can provide immediate user feedback
- Form state management becomes much simpler with reactivity

## Step 7: Advanced Reactive Patterns

### Pattern 1: Reactive API Calls

```typescript
import { createReactive, createComputed, createEffect } from 'annette';

function createUserSearch() {
  const searchQuery = createReactive('');
  const isLoading = createReactive(false);
  const results = createReactive<any[]>([]);
  const error = createReactive<string | null>(null);

  // Debounced search query
  const debouncedQuery = createComputed(() => {
    // In a real app, you'd implement debouncing
    return searchQuery();
  });

  // Effect to perform search
  createEffect(async () => {
    const query = debouncedQuery();
    if (!query.trim()) {
      results([]);
      return;
    }

    isLoading(true);
    error(null);

    try {
      // Simulate API call
      const response = await fakeApiSearch(query);
      results(response);
    } catch (err) {
      error('Search failed');
      results([]);
    } finally {
      isLoading(false);
    }
  });

  const setSearchQuery = (query: string) => searchQuery(query);

  return {
    setSearchQuery,
    getSearchQuery: () => searchQuery(),
    getResults: () => results(),
    getIsLoading: () => isLoading(),
    getError: () => error()
  };
}

// Simulate API call
async function fakeApiSearch(query: string) {
  await new Promise(resolve => setTimeout(resolve, 500));
  return [
    { id: 1, name: `${query} User 1` },
    { id: 2, name: `${query} User 2` }
  ];
}
```

### Pattern 2: Reactive State Machines

```typescript
import { createReactive, createComputed, createEffect } from 'annette';

type AppState = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

function createAppStateMachine() {
  const currentState = createReactive<AppState>('loading');
  const user = createReactive<any>(null);
  const error = createReactive<string | null>(null);

  // State-specific computed values
  const isLoading = createComputed(() => currentState() === 'loading');
  const isAuthenticated = createComputed(() => currentState() === 'authenticated');
  const isUnauthenticated = createComputed(() => currentState() === 'unauthenticated');
  const hasError = createComputed(() => currentState() === 'error');

  // State transition effects
  createEffect(() => {
    console.log('State changed to:', currentState());
  });

  createEffect(() => {
    if (isAuthenticated()) {
      console.log('User authenticated:', user());
    }
  });

  createEffect(() => {
    if (hasError()) {
      console.log('Error occurred:', error());
    }
  });

  // Actions
  const startLoading = () => {
    currentState('loading');
    error(null);
  };

  const setAuthenticated = (userData: any) => {
    user(userData);
    currentState('authenticated');
    error(null);
  };

  const setUnauthenticated = () => {
    user(null);
    currentState('unauthenticated');
    error(null);
  };

  const setError = (errorMessage: string) => {
    user(null);
    currentState('error');
    error(errorMessage);
  };

  return {
    getCurrentState: () => currentState(),
    getUser: () => user(),
    getError: () => error(),
    isLoading: () => isLoading(),
    isAuthenticated: () => isAuthenticated(),
    isUnauthenticated: () => isUnauthenticated(),
    hasError: () => hasError(),
    startLoading,
    setAuthenticated,
    setUnauthenticated,
    setError
  };
}
```

### Pattern 3: Reactive Caching

```typescript
import { createReactive, createComputed, createEffect } from 'annette';

function createReactiveCache() {
  const cache = createReactive<Map<string, any>>(new Map());
  const accessCount = createReactive<Map<string, number>>(new Map());

  // Computed: cache statistics
  const stats = createComputed(() => ({
    size: cache().size,
    totalAccesses: Array.from(accessCount().values()).reduce((sum, count) => sum + count, 0),
    mostAccessed: Array.from(accessCount().entries()).sort((a, b) => b[1] - a[1])[0]
  }));

  // Effect: log cache changes
  createEffect(() => {
    console.log('Cache updated. Size:', cache().size);
  });

  const get = (key: string) => {
    const value = cache().get(key);
    if (value !== undefined) {
      // Update access count - create new Map to trigger reactivity
      const updated = new Map(accessCount());
      const currentCount = updated.get(key) || 0;
      updated.set(key, currentCount + 1);
      accessCount(updated);
    }
    return value;
  };

  const set = (key: string, value: any) => {
    const newCache = new Map(cache());
    newCache.set(key, value);
    cache(newCache);

    // Initialize access count - create new Map to trigger reactivity
    if (!accessCount().has(key)) {
      const updated = new Map(accessCount());
      updated.set(key, 0);
      accessCount(updated);
    }
  };

  const remove = (key: string) => {
    const newCache = new Map(cache());
    newCache.delete(key);
    cache(newCache);

    const newAccessCount = new Map(accessCount());
    newAccessCount.delete(key);
    accessCount(newAccessCount);
  };

  const clear = () => {
    cache(new Map());
    accessCount(new Map());
  };

  return {
    get,
    set,
    remove,
    clear,
    getStats: () => stats(),
    getAll: () => Array.from(cache().entries())
  };
}
```

## Best Practices

### 1. **Keep Computations Simple**
```typescript
// Good: Simple, focused computation
const fullName = createComputed(() => `${firstName()} ${lastName()}`);

// Bad: Complex computation with side effects
const userData = createComputed(() => {
  fetch('/api/user') // Side effect!
    .then(data => updateUser(data)); // Another side effect!
  return `${firstName()} ${lastName()}`;
});
```

### 2. **Use Effects for Side Effects**
```typescript
// Good: Side effects in effects
createEffect(() => {
  document.title = `${count()} - My App`;
  localStorage.setItem('count', count().toString());
});

// Bad: Side effects in computed values
const title = createComputed(() => {
  const newTitle = `${count()} - My App`;
  document.title = newTitle; // Side effect in computed!
  return newTitle;
});
```

### 3. **Avoid Circular Dependencies**
```typescript
// Bad: Circular dependency
const a = createReactive(1);
const b = createComputed(() => a() + 1);
const c = createComputed(() => b() + 1);
// Don't do: a(c()) - this creates a cycle!

// Good: Break the cycle
const a = createReactive(1);
const b = createComputed(() => a() + 1);
const c = createComputed(() => b() + 1);
```

### 4. **Batch Updates**
```typescript
// Good: Batch related updates
const updateUser = (newData: any) => {
  // Use a batch function if available, or update in sequence
  name(newData.name);
  email(newData.email);
  age(newData.age);
};

// Bad: Spread updates across time
setTimeout(() => name(newData.name), 0);
setTimeout(() => email(newData.email), 0);
setTimeout(() => age(newData.age), 0);
```

### 5. **Cleanup Effects**
```typescript
// If you need to cleanup effects (rare in most apps)
const cleanup = createEffect(() => {
  const subscription = someObservable.subscribe(handleUpdate);
  return () => subscription.unsubscribe(); // Cleanup function
});

// Later, if you need to destroy the effect
cleanup();
```

## Performance Considerations

### 1. **Minimize Dependencies**
```typescript
// More efficient: fewer dependencies
const userFullName = createComputed(() => `${user().firstName} ${user().lastName}`);

// Less efficient: more dependencies
const firstName = createComputed(() => user().firstName);
const lastName = createComputed(() => user().lastName);
const fullName = createComputed(() => `${firstName()} ${lastName()}`);
```

### 2. **Cache Expensive Computations**
```typescript
// Cache expensive operations
const expensiveValue = createComputed(() => {
  // Only recalculates when user changes
  return expensiveCalculation(user());
});
```

### 3. **Use Selectors for Large Objects**
```typescript
// Good: Select specific properties
const userName = createComputed(() => largeUserObject().name);
const userEmail = createComputed(() => largeUserObject().email);

// Bad: Pass entire large object
const userData = createComputed(() => largeUserObject());
```

## Troubleshooting

### Common Issues:

1. **"Effect runs too often"**
   - Check your dependencies - you might be depending on more than needed
   - Use primitive values instead of objects/arrays if possible
   - Consider using selectors for specific properties

2. **"Computed value doesn't update"**
   - Make sure you're calling the reactive functions inside the computation
   - Check that the dependencies are actually reactive values
   - Verify that the dependencies are being called during the computation

3. **"Memory leaks"**
   - Effects are automatically cleaned up when their dependencies are
   - But if you create effects in components, clean them up on unmount
   - Avoid creating effects in loops

4. **"Infinite loops"**
   - Don't update a reactive value inside its own computed value
   - Be careful with effects that update their own dependencies
   - Use `batch()` if available to group updates

## Integration with Annette Networks

Reactive programming works great with Annette networks:

```typescript
import { Agent, Network, ActionRule } from 'annette';
import { createReactive, createEffect } from 'annette';

function createReactiveNetwork() {
  const net = Network('reactive-network');

  // Create reactive state
  const count = createReactive(0);

  // Create agents that sync with reactive state
  const counterAgent = Agent('Counter', { value: count() });
  net.addAgent(counterAgent);

  // Sync reactive state with agent
  createEffect(() => {
    counterAgent.value = { value: count() };
  });

  // Sync agent changes back to reactive state
  const incrementer = Agent('Incrementer', { amount: 1 });
  net.addAgent(incrementer);

  const incrementRule = ActionRule(
    counterAgent.ports.main,
    incrementer.ports.main,
    (counter, incrementer) => {
      const newValue = counter.value.value + incrementer.value.amount;
      count(newValue); // Update reactive state
      counter.value = { value: newValue };
      return [counter, incrementer];
    }
  );

  net.addRule(incrementRule);

  return { net, count, increment: () => count(count() + 1) };
}
```

This shows how reactive programming and agent-based networks can work together seamlessly!

## Next Steps

Now that you understand reactive programming, explore:

- [Time Travel Tutorial](time-travel-tutorial.md) - Add undo/redo to your reactive apps
- [Distributed Systems Tutorial](distributed-tutorial.md) - Share reactive state across multiple clients
- [Advanced Examples](../examples/reactive-todo.ts) - See real-world reactive applications

Reactive programming with Annette makes building dynamic, responsive applications much easier! 🚀