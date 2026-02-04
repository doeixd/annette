/**
 * Component Model with Lifecycle Hooks
 * 
 * This module provides a comprehensive component model for building
 * reactive applications with Annette.
 */
import { ReactiveStore, createReactiveStore } from './fine-grained';

/**
 * Component lifecycle hooks
 */
export interface LifecycleHooks {
  /** Called when the component is mounted */
  onMounted?: () => void;
  
  /** Called when the component is updated */
  onUpdated?: () => void;
  
  /** Called when the component is unmounted */
  onUnmounted?: () => void;
  
  /** Called before the component is updated */
  onBeforeUpdate?: () => void;
  
  /** Called when an error occurs in the component */
  onError?: (error: Error) => void;
}

/**
 * Component instance
 */
interface ComponentInstance<P, S> {
  /** Component props */
  props: P;
  
  /** Component state */
  state: S;
  
  /** Whether the component is mounted */
  isMounted: boolean;
  
  /** Whether the component is unmounted */
  isUnmounted: boolean;
  
  /** Lifecycle hooks */
  hooks: LifecycleHooks;
  
  /** Cleanup functions */
  cleanup: Array<() => void>;
}

/**
 * Component context
 */
export interface ComponentContext<P> {
  /** Component props */
  props: P;
  
  /** Emit an event */
  emit: (event: string, ...args: any[]) => void;
  
  /** Add a cleanup function */
  onCleanup: (fn: () => void) => void;
  
  /** Register an effect */
  onEffect: (fn: () => void) => () => void;
  
  /** Register an error handler */
  onError: (fn: (error: Error) => void) => void;
}

/**
 * Component options
 */
export interface ComponentOptions<P, S> {
  /** Component name */
  name: string;
  
  /** Component props */
  props: P;
  
  /** Component setup function */
  setup: (context: ComponentContext<P>) => S;
  
  /** Lifecycle hooks */
  hooks?: LifecycleHooks;
}

/**
 * Current component being set up
 */
let currentComponent: ComponentInstance<any, any> | null = null;

/**
 * Reactive store for component reactivity
 */
const store = createReactiveStore();

/**
 * Create a component
 * @param options Component options
 * @returns Component state
 */
export function createComponent<P extends object, S>(
  options: ComponentOptions<P, S>
): S {
  // Create reactive props
  const props = store.createReactive(options.props);
  
  // Create component instance
  const instance: ComponentInstance<P, S> = {
    props,
    state: {} as S,
    isMounted: false,
    isUnmounted: false,
    hooks: options.hooks || {},
    cleanup: []
  };
  
  // Set current component
  const previousComponent = currentComponent;
  currentComponent = instance;
  
  // Create component context
  const context: ComponentContext<P> = {
    props,
    
    emit: (event, ...args) => {
      const handlers = props as Record<string, unknown>;
      const handler = handlers[`on${event.charAt(0).toUpperCase() + event.slice(1)}`];
      if (typeof handler === 'function') {
        handler(...args);
      }
    },

    
    onCleanup: (fn) => {
      instance.cleanup.push(fn);
    },
    
    onEffect: (fn) => {
      const dispose = store.createEffect(() => {
        try {
          fn();
        } catch (error) {
          if (instance.hooks.onError && error instanceof Error) {
            instance.hooks.onError(error);
          } else {
            console.error('Error in component effect:', error);
          }
        }
      });
      
      instance.cleanup.push(dispose);
      return dispose;
    },
    
    onError: (fn) => {
      instance.hooks.onError = fn;
    }
  };
  
  // Run setup function
  try {
    instance.state = options.setup(context);
  } catch (error) {
    if (instance.hooks.onError && error instanceof Error) {
      instance.hooks.onError(error);
    } else {
      console.error(`Error in component setup (${options.name}):`, error);
    }
  }
  
  // Restore previous component
  currentComponent = previousComponent;
  
  // Register lifecycle effect
  store.createEffect(() => {
    if (!instance.isMounted) {
      instance.isMounted = true;
      
      if (instance.hooks.onMounted) {
        try {
          instance.hooks.onMounted();
        } catch (error) {
          if (instance.hooks.onError && error instanceof Error) {
            instance.hooks.onError(error);
          } else {
            console.error(`Error in onMounted hook (${options.name}):`, error);
          }
        }
      }
    } else {
      if (instance.hooks.onUpdated) {
        try {
          instance.hooks.onUpdated();
        } catch (error) {
          if (instance.hooks.onError && error instanceof Error) {
            instance.hooks.onError(error);
          } else {
            console.error(`Error in onUpdated hook (${options.name}):`, error);
          }
        }
      }
    }
  });
  
  return instance.state;
}

/**
 * Unmount a component
 * @param state Component state
 */
export function unmountComponent<S>(state: S): void {
  // Find the component instance
  // This would require additional tracking in a real implementation
  // For now, we'll assume we can find it based on the state
  
  // Run cleanup functions
  
  // Call onUnmounted hook
}

/**
 * Create a component with JSX support
 * @param name Component name
 * @param props Component props
 * @param children Component children
 * @returns Component element
 */
export function createElement(
  name: string | Function,
  props: any,
  ...children: any[]
): any {
  // Create props with children
  const propsWithChildren = {
    ...props,
    children: children.length === 0 ? undefined :
              children.length === 1 ? children[0] :
              children
  };
  
  // If name is a function, call it with props
  if (typeof name === 'function') {
    return name(propsWithChildren);
  }
  
  // Otherwise, return a virtual element
  return {
    type: name,
    props: propsWithChildren
  };
}

/**
 * DOM renderer for web applications
 */
export class DOMRenderer {
  private rootElement: HTMLElement;
  private cleanup: Array<() => void> = [];
  
  /**
   * Create a DOM renderer
   * @param rootElement Root element to render into
   */
  constructor(rootElement: HTMLElement) {
    this.rootElement = rootElement;
  }
  
  /**
   * Render a component into the DOM
   * @param component Component function
   * @returns Cleanup function
   */
  render(component: () => any): () => void {
    // Create an effect to update the DOM when the component changes
    const dispose = store.createEffect(() => {
      const result = component();
      
      // Convert result to DOM elements
      const elements = this.toDOM(result);
      
      // Update container
      this.rootElement.innerHTML = '';
      this.rootElement.append(...elements);
    });
    
    // Add to cleanup
    this.cleanup.push(dispose);
    
    // Return a function to stop rendering
    return () => {
      dispose();
      this.cleanup = this.cleanup.filter(fn => fn !== dispose);
    };
  }
  
  /**
   * Convert a virtual element to DOM nodes
   * @param node Virtual element
   * @returns DOM nodes
   */
  private toDOM(node: any): Node[] {
    if (node === null || node === undefined) {
      return [];
    }
    
    // Handle primitive values
    if (typeof node !== 'object') {
      return [document.createTextNode(String(node))];
    }
    
    // Handle arrays
    if (Array.isArray(node)) {
      return node.flatMap(item => this.toDOM(item));
    }
    
    // Handle DOM elements (already converted)
    if (node instanceof Node) {
      return [node];
    }
    
    // Handle virtual elements
    if (node.type && node.props) {
      const element = document.createElement(node.type);
      
      // Set attributes
      for (const [key, value] of Object.entries(node.props)) {
        if (key === 'children') continue;
        
        if (key.startsWith('on') && typeof value === 'function') {
          // Handle event listeners
          const eventName = key.slice(2).toLowerCase();
          element.addEventListener(eventName, value);
        } else {
          // Set attribute
          element.setAttribute(key, String(value));
        }
      }
      
      // Add children
      if (node.props.children) {
        const childNodes = this.toDOM(node.props.children);
        element.append(...childNodes);
      }
      
      return [element];
    }
    
    // Handle unknown node types
    console.warn('Unknown node type:', node);
    return [];
  }
  
  /**
   * Clean up the renderer
   */
  dispose(): void {
    for (const cleanup of this.cleanup) {
      cleanup();
    }
    
    this.cleanup = [];
  }
}

/**
 * Render a component into the DOM
 * @param component Component function
 * @param container Container element
 * @returns Cleanup function
 */
export function render(component: () => any, container: HTMLElement): () => void {
  const renderer = new DOMRenderer(container);
  return renderer.render(component);
}

/**
 * Define a component factory
 * @param options Component options
 * @returns Component factory function
 */
export function defineComponent<P extends object, S>(
  options: Omit<ComponentOptions<P, S>, 'props'>
): (props: P) => S {
  return (props: P) => {
    return createComponent({
      ...options,
      props
    });
  };
}