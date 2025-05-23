/**
 * Vector Clock Implementation
 * 
 * Vector clocks are used for tracking causality in distributed systems,
 * enabling more robust versioning and conflict detection.
 */

/**
 * Vector clock for tracking causality in distributed systems
 */
export class VectorClock {
  private clock: Map<string, number> = new Map();

  /**
   * Create a new vector clock
   * @param initialClock Optional initial clock state
   */
  constructor(initialClock?: Record<string, number> | Map<string, number>) {
    if (initialClock) {
      if (initialClock instanceof Map) {
        this.clock = new Map(initialClock);
      } else {
        this.clock = new Map(Object.entries(initialClock));
      }
    }
  }

  /**
   * Increment the clock for a specific node
   * @param nodeId The node identifier to increment
   */
  increment(nodeId: string): void {
    this.clock.set(nodeId, (this.clock.get(nodeId) || 0) + 1);
  }

  /**
   * Get the clock value for a specific node
   * @param nodeId The node identifier
   */
  get(nodeId: string): number {
    return this.clock.get(nodeId) || 0;
  }

  /**
   * Set the clock value for a specific node
   * @param nodeId The node identifier
   * @param value The value to set
   */
  set(nodeId: string, value: number): void {
    this.clock.set(nodeId, value);
  }

  /**
   * Merge this clock with another clock
   * @param other The other vector clock to merge with
   */
  merge(other: VectorClock): void {
    for (const [nodeId, time] of other.clock.entries()) {
      this.clock.set(nodeId, Math.max(this.clock.get(nodeId) || 0, time));
    }
  }

  /**
   * Check if this clock is causally before another clock
   * @param other The other vector clock to compare with
   */
  isBefore(other: VectorClock): boolean {
    // This clock is before other if:
    // 1. For all nodes in this clock, this clock's value is less than or equal to other's value
    // 2. For at least one node, this clock's value is strictly less than other's value
    
    let strictlyLessThanExists = false;
    
    // Check all nodes in this clock
    for (const [nodeId, time] of this.clock.entries()) {
      const otherTime = other.get(nodeId);
      
      // If this time is greater than other time, this is not before other
      if (time > otherTime) {
        return false;
      }
      
      // If this time is strictly less than other time, record that
      if (time < otherTime) {
        strictlyLessThanExists = true;
      }
    }
    
    // Check all nodes in other clock that aren't in this clock
    for (const [nodeId, otherTime] of other.clock.entries()) {
      if (!this.clock.has(nodeId) && otherTime > 0) {
        strictlyLessThanExists = true;
      }
    }
    
    // This is before other if there's at least one entry where this is strictly less than other
    return strictlyLessThanExists;
  }

  /**
   * Check if this clock is causally after another clock
   * @param other The other vector clock to compare with
   */
  isAfter(other: VectorClock): boolean {
    // This clock is after other if other is before this
    return other.isBefore(this);
  }

  /**
   * Check if this clock is concurrent with another clock
   * @param other The other vector clock to compare with
   */
  isConcurrentWith(other: VectorClock): boolean {
    // This clock is concurrent with other if:
    // 1. This is not before other
    // 2. This is not after other
    return !this.isBefore(other) && !this.isAfter(other);
  }

  /**
   * Check if this clock is equal to another clock
   * @param other The other vector clock to compare with
   */
  equals(other: VectorClock): boolean {
    // Two clocks are equal if they have the same entries
    
    // First check if they have the same number of entries with non-zero values
    const thisEntries = Array.from(this.clock.entries()).filter(([_, time]) => time > 0);
    const otherEntries = Array.from(other.clock.entries()).filter(([_, time]) => time > 0);
    
    if (thisEntries.length !== otherEntries.length) {
      return false;
    }
    
    // Then check if all entries in this clock match the other clock
    for (const [nodeId, time] of thisEntries) {
      if (other.get(nodeId) !== time) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Create a deep copy of this vector clock
   */
  clone(): VectorClock {
    return new VectorClock(this.clock);
  }

  /**
   * Convert the vector clock to a string
   */
  toString(): string {
    // Filter out zero entries to save space
    const nonZeroEntries = Array.from(this.clock.entries())
      .filter(([_, time]) => time > 0);
    
    return JSON.stringify(Object.fromEntries(nonZeroEntries));
  }

  /**
   * Convert the vector clock to a plain object
   */
  toObject(): Record<string, number> {
    return Object.fromEntries(this.clock);
  }

  /**
   * Create a vector clock from a string representation
   * @param str The string representation of a vector clock
   */
  static fromString(str: string): VectorClock {
    try {
      const obj = JSON.parse(str);
      return new VectorClock(obj);
    } catch (e) {
      throw new Error(`Invalid vector clock string: ${str}`);
    }
  }

  /**
   * Create a vector clock from a plain object
   * @param obj The object representation of a vector clock
   */
  static fromObject(obj: Record<string, number>): VectorClock {
    return new VectorClock(obj);
  }
}

/**
 * Interface for items with vector clocks
 */
export interface Versioned {
  vectorClock: VectorClock;
}

/**
 * Compare two versioned items to determine their causal relationship
 * @returns -1 if a is before b, 1 if a is after b, 0 if concurrent
 */
export function compareVersioned(a: Versioned, b: Versioned): -1 | 0 | 1 {
  if (a.vectorClock.isBefore(b.vectorClock)) {
    return -1;
  } else if (a.vectorClock.isAfter(b.vectorClock)) {
    return 1;
  } else {
    return 0;
  }
}

/**
 * Versioned data with value and vector clock
 */
export class VersionedData<T> implements Versioned {
  constructor(
    public value: T,
    public vectorClock: VectorClock
  ) {}

  /**
   * Update the value and increment the vector clock
   * @param value The new value
   * @param nodeId The node ID to increment
   */
  update(value: T, nodeId: string): void {
    this.value = value;
    this.vectorClock.increment(nodeId);
  }

  /**
   * Create a deep copy of this versioned data
   */
  clone(): VersionedData<T> {
    return new VersionedData<T>(
      JSON.parse(JSON.stringify(this.value)),
      this.vectorClock.clone()
    );
  }
}