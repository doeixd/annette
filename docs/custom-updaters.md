# Custom Updaters in Annette

This document explains the custom updater API and composable updaters in Annette, which allow for more flexible and powerful updates to complex data structures.

## Overview

Annette's custom updater system provides:

1. **Custom Updater Definition**: Define domain-specific updaters for any data type
2. **Composable Updaters**: Combine multiple updaters for complex nested updates
3. **Standard Updaters**: Built-in updaters for common operations
4. **Optimized Updates**: Efficient application of updates to nested structures
5. **Invertible Operations**: Support for undoing operations

## Custom Updater Definition

Define custom updaters for domain-specific data types:

```typescript
import { defineUpdater } from 'annette';

// Define a Set updater for set operations
const SetUpdater = defineUpdater<Set<any>>({
  type: 'set',
  
  apply: (set, operation) => {
    const newSet = new Set(set);
    
    if (operation.action === 'add') {
      newSet.add(operation.value);
    } else if (operation.action === 'delete') {
      newSet.delete(operation.value);
    } else if (operation.action === 'clear') {
      newSet.clear();
    }
    
    return newSet;
  },
  
  merge: (op1, op2) => {
    // Simple merge strategy: later operations override earlier ones
    return op2;
  },
  
  invert: (op) => {
    // Invert operation for undo
    if (op.action === 'add') {
      return { action: 'delete', value: op.value };
    } else if (op.action === 'delete') {
      return { action: 'add', value: op.value };
    } else if (op.action === 'clear') {
      // Can't really invert clear without knowing the previous state
      return { action: 'error', message: 'Cannot invert clear operation' };
    }
    
    return op;
  }
});

// Create a set updater
const updater = SetUpdater({ action: 'add', value: 'javascript' });

// Apply the updater to a set
const mySet = new Set(['typescript']);
const newSet = applyUpdate(mySet, updater);
console.log(newSet); // Set(2) { 'typescript', 'javascript' }
```

### Updater Definition Interface

A custom updater definition consists of:

```typescript
interface UpdaterDefinition<T> {
  // Unique identifier for this updater type
  type: string;
  
  // Apply an operation to a value
  apply: (value: T, operation: any) => T;
  
  // Merge two operations
  merge: (op1: any, op2: any) => any;
  
  // Invert an operation (for undo)
  invert: (op: any) => any;
  
  // Optional: Validate an operation
  validate?: (operation: any) => boolean;
  
  // Optional: Get a string representation of an operation
  toString?: (operation: any) => string;
}
```

## Standard Updaters

Annette includes several standard updaters for common operations:

### SetUpdater

Replaces a value:

```typescript
import { SetUpdater, applyUpdate } from 'annette';

const nameUpdater = SetUpdater(
  { value: 'Jane' },
  ['name']
);

const person = { name: 'John', age: 30 };
const newPerson = applyUpdate(person, nameUpdater);
console.log(newPerson); // { name: 'Jane', age: 30 }
```

### MergeUpdater

Merges object properties:

```typescript
import { MergeUpdater, applyUpdate } from 'annette';

const userUpdater = MergeUpdater(
  { value: { email: 'jane@example.com', role: 'admin' } },
  ['user']
);

const data = { 
  user: { 
    name: 'Jane', 
    email: 'jane@gmail.com' 
  } 
};

const newData = applyUpdate(data, userUpdater);
console.log(newData.user); 
// { name: 'Jane', email: 'jane@example.com', role: 'admin' }
```

### DeleteUpdater

Deletes a property or array item:

```typescript
import { DeleteUpdater, applyUpdate } from 'annette';

// Delete object property
const propUpdater = DeleteUpdater(
  { key: 'temporary' },
  ['config']
);

// Delete array item
const itemUpdater = DeleteUpdater(
  { index: 1 },
  ['items']
);

const data = { 
  config: { 
    permanent: true, 
    temporary: false 
  },
  items: ['keep', 'delete', 'keep']
};

const step1 = applyUpdate(data, propUpdater);
const step2 = applyUpdate(step1, itemUpdater);

console.log(step2);
// { 
//   config: { permanent: true },
//   items: ['keep', 'keep']
// }
```

### IncrementUpdater

Increments a numeric value:

```typescript
import { IncrementUpdater, applyUpdate } from 'annette';

const counterUpdater = IncrementUpdater(
  { value: 5 },
  ['stats', 'counter']
);

const data = { stats: { counter: 10, total: 100 } };
const newData = applyUpdate(data, counterUpdater);

console.log(newData.stats.counter); // 15
```

### ArrayInsertUpdater

Inserts an item into an array:

```typescript
import { ArrayInsertUpdater, applyUpdate } from 'annette';

const insertUpdater = ArrayInsertUpdater(
  { value: 'New Item', index: 1 },
  ['items']
);

const data = { items: ['First', 'Last'] };
const newData = applyUpdate(data, insertUpdater);

console.log(newData.items); // ['First', 'New Item', 'Last']
```

## Composable Updaters

Combine multiple updaters for complex nested updates:

```typescript
import { 
  composeUpdaters, 
  SetUpdater, 
  MergeUpdater, 
  ArrayInsertUpdater,
  applyComposedUpdate
} from 'annette';

// Create individual updaters
const nameUpdater = SetUpdater(
  { value: 'Jane' },
  ['name']
);

const metaUpdater = MergeUpdater(
  { value: { verified: true, level: 3 } },
  ['meta']
);

const tagsUpdater = ArrayInsertUpdater(
  { value: 'premium', index: 0 },
  ['tags']
);

// Compose updaters
const composedUpdater = composeUpdaters(
  nameUpdater,
  metaUpdater,
  tagsUpdater
);

// Apply composed updater
const user = { 
  name: 'John', 
  meta: { joined: '2023-01-01', level: 1 },
  tags: ['active']
};

const newUser = applyComposedUpdate(user, composedUpdater);

console.log(newUser);
// {
//   name: 'Jane',
//   meta: { joined: '2023-01-01', level: 3, verified: true },
//   tags: ['premium', 'active']
// }
```

## Domain-Specific Updaters

Create updaters tailored to specific domains:

### Todo Item Updater

```typescript
const TodoUpdater = defineUpdater<any>({
  type: 'todo',
  
  apply: (todo, operation) => {
    const newTodo = { ...todo };
    
    if (operation.action === 'toggleComplete') {
      newTodo.completed = !newTodo.completed;
      newTodo.completedAt = newTodo.completed ? new Date().toISOString() : null;
    } else if (operation.action === 'updateText') {
      newTodo.text = operation.text;
      newTodo.updatedAt = new Date().toISOString();
    } else if (operation.action === 'setPriority') {
      newTodo.priority = operation.priority;
      newTodo.updatedAt = new Date().toISOString();
    }
    
    return newTodo;
  },
  
  merge: (op1, op2) => {
    return op2; // Last operation wins
  },
  
  invert: (op) => {
    if (op.action === 'toggleComplete') {
      return { action: 'toggleComplete' };
    } else if (op.action === 'updateText') {
      return { action: 'updateText', text: op.previousText };
    } else if (op.action === 'setPriority') {
      return { action: 'setPriority', priority: op.previousPriority };
    }
    
    return op;
  }
});

// Usage
const todoUpdater = TodoUpdater(
  { action: 'toggleComplete' },
  [1] // Update the second todo (index 1)
);

const todos = [
  { id: 1, text: 'Buy groceries', completed: false },
  { id: 2, text: 'Finish report', completed: false },
  { id: 3, text: 'Call mom', completed: true }
];

const newTodos = applyUpdate(todos, todoUpdater);
console.log(newTodos[1]); 
// { id: 2, text: 'Finish report', completed: true, completedAt: '2023...' }
```

### Form Field Updater

```typescript
const FormFieldUpdater = defineUpdater<any>({
  type: 'formField',
  
  apply: (form, operation) => {
    const newForm = { ...form };
    
    if (operation.action === 'setValue') {
      // Set a value in the form
      const { field, value } = operation;
      const parts = field.split('.');
      
      let current = newForm;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = value;
      
      // Mark as touched
      if (!newForm.touched) {
        newForm.touched = {};
      }
      newForm.touched[field] = true;
      
      // Validate if needed
      if (operation.validate) {
        const validationResult = operation.validate(value, newForm);
        
        if (!newForm.errors) {
          newForm.errors = {};
        }
        
        if (validationResult) {
          newForm.errors[field] = validationResult;
        } else {
          delete newForm.errors[field];
        }
      }
    } else if (operation.action === 'reset') {
      return operation.initialState || {};
    }
    
    return newForm;
  },
  
  merge: (op1, op2) => {
    return op2; // Last operation wins
  },
  
  invert: (op) => {
    if (op.action === 'setValue' && op.previousValue !== undefined) {
      return { 
        action: 'setValue', 
        field: op.field, 
        value: op.previousValue 
      };
    }
    
    return op;
  }
});
```

## Practical Examples

### Form State Management

```typescript
// Create a form state manager
class FormStateManager {
  private state: any;
  
  constructor(initialState: any) {
    this.state = initialState;
  }
  
  getState(): any {
    return this.state;
  }
  
  setValue(field: string, value: any, validate?: (value: any, form: any) => string | null): void {
    const updater = FormFieldUpdater({
      action: 'setValue',
      field,
      value,
      validate
    });
    
    this.state = applyUpdate(this.state, updater);
  }
  
  setTouched(field: string): void {
    const updater = FormFieldUpdater({
      action: 'setTouched',
      field
    });
    
    this.state = applyUpdate(this.state, updater);
  }
  
  reset(): void {
    const updater = FormFieldUpdater({
      action: 'reset',
      initialState: {
        user: { firstName: '', lastName: '', email: '' },
        errors: {},
        touched: {}
      }
    });
    
    this.state = applyUpdate(this.state, updater);
  }
}

// Use the form state manager
const form = new FormStateManager({
  user: { firstName: '', lastName: '', email: '' },
  errors: {},
  touched: {}
});

// Fill out the form
form.setValue('user.firstName', 'John');
form.setValue('user.lastName', 'Doe');
form.setValue('user.email', 'invalid', (value) => {
  return value.includes('@') ? null : 'Invalid email';
});

console.log(form.getState());
// {
//   user: { firstName: 'John', lastName: 'Doe', email: 'invalid' },
//   errors: { 'user.email': 'Invalid email' },
//   touched: { 'user.firstName': true, 'user.lastName': true, 'user.email': true }
// }

// Fix the email
form.setValue('user.email', 'john.doe@example.com');

console.log(form.getState());
// Email error is cleared
```

### Document Editor with Undo/Redo

```typescript
// Define document operations
const DocumentUpdater = defineUpdater<any>({
  type: 'document',
  
  apply: (doc, operation) => {
    const newDoc = { ...doc };
    
    if (operation.action === 'insertText') {
      const { position, text } = operation;
      newDoc.content = 
        doc.content.substring(0, position) + 
        text + 
        doc.content.substring(position);
      newDoc.version++;
    } else if (operation.action === 'deleteText') {
      const { position, length } = operation;
      newDoc.content = 
        doc.content.substring(0, position) + 
        doc.content.substring(position + length);
      newDoc.version++;
    } else if (operation.action === 'formatText') {
      const { position, length, format } = operation;
      
      // In a real implementation, this would apply formatting
      // For simplicity, we just track it here
      if (!newDoc.formatting) {
        newDoc.formatting = [];
      }
      
      newDoc.formatting.push({ position, length, format });
      newDoc.version++;
    }
    
    return newDoc;
  },
  
  merge: (op1, op2) => {
    // Merging text operations is complex
    // This is a simplified approach
    return op2;
  },
  
  invert: (op) => {
    if (op.action === 'insertText') {
      return { 
        action: 'deleteText', 
        position: op.position, 
        length: op.text.length
      };
    } else if (op.action === 'deleteText') {
      return {
        action: 'insertText',
        position: op.position,
        text: op.deletedText // This would be stored in history
      };
    } else if (op.action === 'formatText') {
      return {
        action: 'formatText',
        position: op.position,
        length: op.length,
        format: op.previousFormat // This would be stored in history
      };
    }
    
    return op;
  }
});

// Document editor with undo/redo
class DocumentEditor {
  private document: any;
  private history: any[] = [];
  private historyIndex: number = -1;
  
  constructor(initialDocument: any) {
    this.document = initialDocument;
  }
  
  getDocument(): any {
    return this.document;
  }
  
  insertText(position: number, text: string): void {
    const operation = {
      action: 'insertText',
      position,
      text
    };
    
    this.applyOperation(operation);
  }
  
  deleteText(position: number, length: number): void {
    // Store deleted text for undo
    const deletedText = this.document.content.substring(position, position + length);
    
    const operation = {
      action: 'deleteText',
      position,
      length,
      deletedText // For undo
    };
    
    this.applyOperation(operation);
  }
  
  formatText(position: number, length: number, format: any): void {
    // Store previous format for undo
    const previousFormat = this.getFormatAt(position, length);
    
    const operation = {
      action: 'formatText',
      position,
      length,
      format,
      previousFormat // For undo
    };
    
    this.applyOperation(operation);
  }
  
  private getFormatAt(position: number, length: number): any {
    // In a real implementation, this would retrieve the current formatting
    return null;
  }
  
  private applyOperation(operation: any): void {
    // Create updater
    const updater = DocumentUpdater(operation);
    
    // Apply update
    const newDocument = applyUpdate(this.document, updater);
    
    // Update document
    this.document = newDocument;
    
    // Add to history (removing any forward history if we're in the middle)
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    this.history.push(operation);
    this.historyIndex = this.history.length - 1;
  }
  
  undo(): boolean {
    if (this.historyIndex < 0) {
      return false; // Nothing to undo
    }
    
    // Get the operation to undo
    const operation = this.history[this.historyIndex];
    
    // Create inverted operation
    const invertedOp = DocumentUpdater.invert(operation);
    
    // Apply inverted operation
    const updater = DocumentUpdater(invertedOp);
    this.document = applyUpdate(this.document, updater);
    
    // Move history index back
    this.historyIndex--;
    
    return true;
  }
  
  redo(): boolean {
    if (this.historyIndex >= this.history.length - 1) {
      return false; // Nothing to redo
    }
    
    // Move history index forward
    this.historyIndex++;
    
    // Get the operation to redo
    const operation = this.history[this.historyIndex];
    
    // Apply operation
    const updater = DocumentUpdater(operation);
    this.document = applyUpdate(this.document, updater);
    
    return true;
  }
}
```

## Advanced Topics

### Custom Updater Registration

Register custom updaters globally:

```typescript
import { registerStandardUpdaters, getUpdaterDefinition } from 'annette';

// Register standard updaters
registerStandardUpdaters();

// Check if an updater is registered
const setUpdaterDef = getUpdaterDefinition('set');
console.log('Set updater registered:', !!setUpdaterDef);
```

### Path-Based Updates

Apply updates to deeply nested paths:

```typescript
// Apply to a nested path
const deepUpdater = SetUpdater(
  { value: 'new value' },
  ['user', 'preferences', 'theme']
);

const data = {
  user: {
    name: 'John',
    preferences: {
      theme: 'light',
      notifications: true
    }
  }
};

const newData = applyUpdate(data, deepUpdater);
console.log(newData.user.preferences.theme); // 'new value'
```

### Batch Updates

Apply multiple updates in a single operation:

```typescript
// Apply multiple updates in one step
const batchedData = applyComposedUpdate(data, composeUpdaters(
  SetUpdater({ value: 'new value' }, ['user', 'preferences', 'theme']),
  SetUpdater({ value: false }, ['user', 'preferences', 'notifications']),
  MergeUpdater({ value: { role: 'admin' } }, ['user'])
));
```

### Custom Update Validation

Validate updates before applying them:

```typescript
const ValidatedUpdater = defineUpdater<any>({
  type: 'validated',
  
  validate: (operation) => {
    if (operation.action === 'setValue' && operation.field && operation.value !== undefined) {
      return true;
    }
    return false;
  },
  
  apply: (value, operation) => {
    // Apply the update
    // ...
  },
  
  merge: (op1, op2) => {
    return op2;
  },
  
  invert: (op) => {
    return op;
  }
});
```

## Best Practices

1. **Define Domain-Specific Updaters**: Create updaters tailored to your domain model
2. **Use Composition**: Compose multiple simple updaters instead of one complex updater
3. **Include Validation**: Validate operations before applying them
4. **Implement Invert**: Support undo operations by implementing the invert method
5. **Use Path-Based Updates**: Apply updates to specific paths for fine-grained control
6. **Consider Performance**: Use optimized updaters for large data structures
7. **Maintain Immutability**: Always return new objects, never modify the input
8. **Document Operations**: Clearly document the operations supported by each updater

## Conclusion

Annette's custom updater system provides a powerful foundation for managing state updates:

1. **Custom Updater Definition** enables domain-specific update operations
2. **Composable Updaters** allow complex nested updates
3. **Standard Updaters** provide common operations out of the box
4. **Optimized Updates** ensure efficient state management
5. **Invertible Operations** support undo/redo functionality

By leveraging these features, you can build sophisticated state management systems that are both powerful and maintainable.