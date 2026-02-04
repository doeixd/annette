# Annette Examples

This directory contains example code demonstrating various features of the Annette library.

## Basic Examples

- `simple.ts` - Basic counter example showing core functionality
- `run-example.js` - Simple example demonstrating network reduction
- `object-api.js` - Example of the object-based API
- `dynamic-typed.js` / `dynamic-typed.ts` - Examples of dynamic typing in JavaScript and TypeScript
- `typed-api.ts` - Example demonstrating TypeScript typing features
- `scoped-network.ts` - Scoped network API with factories, batching, and untracking
- `dom-graph-mounting.ts` - Graph mounting into the DOM with `renderToGraph`
- `topology-state-machine.ts` - Topology-based state machine helper
- `observer-event-system.ts` - Linked-list observer event system
- `reified-effects.ts` - Reified async effect handling
- `optimized-dom.ts` - Optimized DOM blocks and list diffing
- `zero.ts` - Zero-cost topology runtime usage
- `zero-middleware.ts` - Zero middleware recording example
- `zero-fanout.ts` - Zero fanout helper example
- `js-framework-benchmark/zero.ts` - Zero benchmark data operations
- `js-framework-benchmark/zero-dom.ts` - Zero DOM benchmark operations
- `rule-dsl.ts` - Fluent rule builder example

## JS Framework Benchmark Notes

Known issues and notes:
- 634: HTML structure not fully correct
- 796: Explicit `requestAnimationFrame` calls
- 800: View state on the model
- 801: Manual event delegation
- 1139: Does not pass strict CSP
- 1261: Manual caching of (v)dom nodes

Notes:
- Bench examples use declarative templates via `zero.dom.createBlockTemplate`.
- `nested-network.ts` - Agent hosting a scoped network


## Rule Examples

- `rewrite-example.js` - Demonstrates the RewriteRule system
- `update-rule-example.js` / `update-rule-example.ts` - Examples of different rule update patterns
- `complex-update-rule.ts` - Advanced example of complex update rules
- `tracked-action-example.js` / `tracked-action-example.ts` - Demonstrates tracked action rules
- `optimized-reduction-example.js` - Shows optimization features for rule reduction

## Time Travel Examples

- `timetravel-example.js` - Demonstrates basic time travel functionality
- `simple-timetravel.js` - Simplified example of time travel features
- `timetravel-demo.js` - Comprehensive demo of time travel features
- `timetravel-summary.md` - Documentation of time travel implementation and usage

## Updater Agent Examples

- `simple-updater.js` - Basic example of the Updater agent functionality
- `updater-example.js` - More detailed example of Updater usage
- `updater-network-example.js` - Comprehensive example showing how Updaters interact in a network
- `updater-summary.md` - Documentation of Updater implementation and features

## Running Examples

Most examples can be run using Node.js:

```bash
node examples/simple-updater.js
```

TypeScript examples can be run using ts-node:

```bash
npx ts-node examples/typed-api.ts
```

## Example Categories

### State Management

Examples demonstrating Annette's state management capabilities:
- `simple-updater.js`
- `updater-network-example.js`
- `tracked-action-example.js`

### Time Travel Debugging

Examples showing Annette's time travel debugging features:
- `simple-timetravel.js`
- `timetravel-demo.js`

### Type-Safe Interaction Nets

Examples demonstrating Annette's TypeScript integration:
- `typed-api.ts`
- `dynamic-typed.ts`

### Rule Systems

Examples of different rule types and patterns:
- `rewrite-example.js`
- `update-rule-example.js`
- `complex-update-rule.ts`