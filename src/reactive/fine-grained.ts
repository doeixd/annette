/**
 * Fine-Grained Reactivity System
 * 
 * This module provides property-level reactivity for more efficient updates.
 */

/**
 * Interface for a reactive subscription
 */
export interface Subscription {
  /** Unsubscribe from updates */
  unsubscribe(): void;
}

/**
 * Interface for a reactive emitter
 */
interface ReactiveEmitter {
  /** Add a subscription */
  subscribe(listener: () => void): Subscription;
  /** Emit an update */
  emit(): void;
}

/**
 * Create a reactive emitter
 */
function createEmitter(): ReactiveEmitter {
  const listeners = new Set<() => void>();
  
  return {
    subscribe(listener: () => void): Subscription {
      listeners.add(listener);
      
      return {
        unsubscribe: () => {
          listeners.delete(listener);
        }
      };
    },
    
    emit(): void {
      for (const listener of listeners) {
        listener();
      }
    }
  };
}

/**
 * Current reactive context for dependency tracking
 */
const reactiveContext: { current: ((path: string) => void) | null } = {
  current: null
};

/**
 * Reactive proxy system for fine-grained reactivity
 */
export class ReactiveProxy {
  /** Map of property paths to values */
  private valueMap = new Map<string, any>();
  
  /** Map of property paths to emitters */
  private emitterMap = new Map<string, ReactiveEmitter>();
  
  /** Map of property paths to objects */
  private objectMap = new Map<string, object>();
  
  /** Map of property paths to proxies */
  private proxyMap = new Map<string, any>();
  
  /** Map of proxies to original objects */
  private rawMap = new WeakMap<object, object>();
  
  /**
   * Create a reactive proxy for an object
   * @param value The object to make reactive
   * @param path The property path
   * @returns A reactive proxy
   */
  createProxy<T extends object>(value: T, path: string = ''): T {
    // If value is already a proxy, return it
    if (this.rawMap.has(value as object)) {
      return value;
    }
    
    // If we already have a proxy for this path, return it
    if (path && this.proxyMap.has(path)) {
      return this.proxyMap.get(path);
    }
    
    // Store the value
    if (path) {
      this.valueMap.set(path, value);
      this.objectMap.set(path, value);
    }
    
    // Create a proxy
    const proxy = new Proxy(value, {
      get: (target, prop) => {
        if (prop === '__isReactive') {
          return true;
        }
        
        if (prop === '__raw') {
          return target;
        }
        
        const key = prop.toString();
        const fullPath = path ? `${path}.${key}` : key;
        
        // Track dependency for this specific property
        this.trackDependency(fullPath);
        
        const value = target[prop as keyof T];
        
        // If value is an object, return a proxied version
        if (typeof value === 'object' && value !== null && !value.__isReactive) {
          return this.createProxy(value, fullPath);
        }
        
        return value;
      },
      
      set: (target, prop, value) => {
        const key = prop.toString();
        const fullPath = path ? `${path}.${key}` : key;
        
        // Get the old value
        const oldValue = target[prop as keyof T];
        
        // If the value is the same, do nothing
        if (oldValue === value) {
          return true;
        }
        
        // Update the value
        target[prop as keyof T] = value;
        
        // If the new value is an object, create a proxy for it
        if (typeof value === 'object' && value !== null && !value.__isReactive) {
          this.createProxy(value, fullPath);
        }
        
        // Notify dependents of this specific property
        this.notifyDependents(fullPath);
        
        // Also notify dependents of parent paths
        if (path) {
          this.notifyDependents(path);
        }
        
        return true;
      },
      
      deleteProperty: (target, prop) => {
        const key = prop.toString();
        const fullPath = path ? `${path}.${key}` : key;
        
        // Delete the property
        const result = delete target[prop as keyof T];
        
        if (result) {
          // Notify dependents of this specific property
          this.notifyDependents(fullPath);
          
          // Also notify dependents of parent paths
          if (path) {
            this.notifyDependents(path);
          }
        }
        
        return result;
      }
    });
    
    // Store the proxy
    if (path) {
      this.proxyMap.set(path, proxy);
    }
    
    // Store the raw object
    this.rawMap.set(proxy as object, value);
    
    return proxy;
  }
  
  /**
   * Track a dependency for the current computation
   * @param path The property path
   */
  private trackDependency(path: string): void {
    if (reactiveContext.current) {
      reactiveContext.current(path);
    }
  }
  
  /**
   * Notify all dependents of a property
   * @param path The property path
   */
  private notifyDependents(path: string): void {
    // Get the emitter for this path
    const emitter = this.getEmitter(path);
    
    // Emit an update
    emitter.emit();
  }
  
  /**
   * Get or create an emitter for a property
   * @param path The property path
   * @returns The emitter
   */
  private getEmitter(path: string): ReactiveEmitter {
    if (!this.emitterMap.has(path)) {
      this.emitterMap.set(path, createEmitter());
    }
    
    return this.emitterMap.get(path)!;
  }
  
  /**
   * Subscribe to changes for a property
   * @param path The property path
   * @param listener The listener function
   * @returns A subscription
   */
  subscribe(path: string, listener: () => void): Subscription {
    const emitter = this.getEmitter(path);
    return emitter.subscribe(listener);
  }
  
  /**
   * Get the raw value for a property
   * @param path The property path
   * @returns The raw value
   */
  getValue(path: string): any {
    const parts = path.split('.');
    let value = this.valueMap.get(parts[0]);
    
    for (let i = 1; i < parts.length; i++) {
      if (value === undefined || value === null) {
        return undefined;
      }
      
      value = value[parts[i]];
    }
    
    return value;
  }
  
  /**
   * Set the value for a property
   * @param path The property path
   * @param value The new value
   */
  setValue(path: string, value: any): void {
    const parts = path.split('.');
    
    if (parts.length === 1) {
      // Direct property
      this.valueMap.set(path, value);
      this.notifyDependents(path);
      return;
    }
    
    // Nested property
    const parentPath = parts.slice(0, -1).join('.');
    const key = parts[parts.length - 1];
    
    const parentValue = this.objectMap.get(parentPath);
    if (parentValue) {
      parentValue[key] = value;
    }
  }
  
  /**
   * Check if a path exists in the reactive system
   * @param path The property path
   * @returns True if the path exists
   */
  hasPath(path: string): boolean {
    return this.valueMap.has(path) || this.objectMap.has(path);
  }
  
  /**
   * Run a function with dependency tracking
   * @param fn The function to run
   * @returns The dependencies tracked during execution
   */
  withTracking<T>(fn: () => T): { result: T, dependencies: Set<string> } {
    const dependencies = new Set<string>();
    
    const prevContext = reactiveContext.current;
    reactiveContext.current = (path) => {
      dependencies.add(path);
    };
    
    try {
      const result = fn();
      return { result, dependencies };
    } finally {
      reactiveContext.current = prevContext;
    }
  }
}

/**
 * Store for fine-grained reactive state
 */
export class ReactiveStore {
  private proxy = new ReactiveProxy();
  private computedCache = new Map<string, any>();
  private computedDependencies = new Map<string, Set<string>>();
  private computedSubscriptions = new Map<string, Subscription[]>();
  
  /**
   * Create a reactive object
   * @param initialValue The initial value
   * @returns A reactive proxy
   */
  createReactive<T extends object>(initialValue: T): T {
    return this.proxy.createProxy(initialValue);
  }
  
  /**
   * Create a computed property
   * @param key The computed property key
   * @param fn The computation function
   * @returns A function to get the computed value
   */
  createComputed<T>(key: string, fn: () => T): () => T {
    // Initial computation
    const { result, dependencies } = this.proxy.withTracking(fn);
    
    // Cache the result
    this.computedCache.set(key, result);
    this.computedDependencies.set(key, dependencies);
    
    // Subscribe to all dependencies
    const subscriptions: Subscription[] = [];
    for (const dep of dependencies) {
      const subscription = this.proxy.subscribe(dep, () => {
        // When a dependency changes, recompute
        this.recompute(key, fn);
      });
      
      subscriptions.push(subscription);
    }
    
    // Store subscriptions
    this.computedSubscriptions.set(key, subscriptions);
    
    // Return a function to get the computed value
    return () => {
      // Track this computed property as a dependency
      if (reactiveContext.current) {
        reactiveContext.current(key);
      }
      
      return this.computedCache.get(key);
    };
  }
  
  /**
   * Recompute a computed property
   * @param key The computed property key
   * @param fn The computation function
   */
  private recompute<T>(key: string, fn: () => T): void {
    // Clean up old subscriptions
    const oldSubscriptions = this.computedSubscriptions.get(key) || [];
    for (const subscription of oldSubscriptions) {
      subscription.unsubscribe();
    }
    
    // Recompute
    const { result, dependencies } = this.proxy.withTracking(fn);
    
    // Update cache
    this.computedCache.set(key, result);
    this.computedDependencies.set(key, dependencies);
    
    // Subscribe to new dependencies
    const subscriptions: Subscription[] = [];
    for (const dep of dependencies) {
      const subscription = this.proxy.subscribe(dep, () => {
        this.recompute(key, fn);
      });
      
      subscriptions.push(subscription);
    }
    
    // Store new subscriptions
    this.computedSubscriptions.set(key, subscriptions);
    
    // Notify dependents of this computed property
    this.notifyComputed(key);
  }
  
  /**
   * Notify dependents of a computed property
   * @param key The computed property key
   */
  private notifyComputed(key: string): void {
    // Subscribe to the computed property
    const emitter = createEmitter();
    const subscription = this.proxy.subscribe(key, () => {
      emitter.emit();
    });
    
    // Emit an update
    emitter.emit();
    
    // Clean up
    subscription.unsubscribe();
  }
  
  /**
   * Create an effect
   * @param fn The effect function
   * @returns A function to dispose the effect
   */
  createEffect(fn: () => void): () => void {
    // Initial run
    const { dependencies } = this.proxy.withTracking(fn);
    
    // Subscribe to all dependencies
    const subscriptions: Subscription[] = [];
    for (const dep of dependencies) {
      const subscription = this.proxy.subscribe(dep, () => {
        // When a dependency changes, rerun the effect
        this.rerunEffect(fn);
      });
      
      subscriptions.push(subscription);
    }
    
    // Return a dispose function
    return () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    };
  }
  
  /**
   * Rerun an effect
   * @param fn The effect function
   */
  private rerunEffect(fn: () => void): void {
    // Just run the effect, it will track dependencies automatically
    this.proxy.withTracking(fn);
  }
  
  /**
   * Subscribe to changes for a property
   * @param path The property path
   * @param listener The listener function
   * @returns A subscription
   */
  subscribe(path: string, listener: () => void): Subscription {
    return this.proxy.subscribe(path, listener);
  }
  
  /**
   * Run a function with batched updates
   * @param fn The function to run
   * @returns The result of the function
   */
  batch<T>(fn: () => T): T {
    // TODO: Implement proper batching
    return fn();
  }
}

/**
 * Create a reactive store
 * @returns A reactive store
 */
export function createReactiveStore(): ReactiveStore {
  return new ReactiveStore();
}

/**
 * Create a computed property with automatic memoization
 * @param fn The computation function
 * @returns A function to get the computed value
 */
export function computed<T>(fn: () => T): () => T {
  let cachedValue: T;
  let isDirty = true;
  let dependencies = new Set<string>();
  let subscriptions: Subscription[] = [];
  
  // Create a reactive proxy for tracking
  const proxy = new ReactiveProxy();
  
  // Track dependencies when the function is called
  return () => {
    if (isDirty) {
      // Clean up old subscriptions
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
      
      // Track dependencies during computation
      const result = proxy.withTracking(fn);
      cachedValue = result.result;
      dependencies = result.dependencies;
      isDirty = false;
      
      // Subscribe to all dependencies
      subscriptions = [];
      for (const dep of dependencies) {
        const subscription = proxy.subscribe(dep, () => {
          isDirty = true;
        });
        
        subscriptions.push(subscription);
      }
    }
    
    return cachedValue;
  };
}