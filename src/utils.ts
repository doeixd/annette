/**
 * Utility functions for Annette
 */

/**
 * Safely iterate over a Set
 * Works with both ES5 and ES6+ targets
 */
export function iterateSet<T>(set: Set<T>): T[] {
  return Array.from(set);
}

/**
 * Safely iterate over a Map's keys
 * Works with both ES5 and ES6+ targets
 */
export function iterateMapKeys<K, V>(map: Map<K, V>): K[] {
  return Array.from(map.keys());
}

/**
 * Safely iterate over a Map's values
 * Works with both ES5 and ES6+ targets
 */
export function iterateMapValues<K, V>(map: Map<K, V>): V[] {
  return Array.from(map.values());
}

/**
 * Safely iterate over a Map's entries
 * Works with both ES5 and ES6+ targets
 */
export function iterateMapEntries<K, V>(map: Map<K, V>): [K, V][] {
  return Array.from(map.entries());
}

/**
 * Helper to check if a string is a UUID
 */
export function isUUID(id: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(id);
}

/**
 * Helper to safely stringify values
 */
export function safeStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return `[Unserializable: ${typeof value}]`;
  }
}

/**
 * Helper to safely parse JSON
 */
export function safeParse<T>(text: string, fallback?: T): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}