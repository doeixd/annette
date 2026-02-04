# Agent Development Guide

## Project Overview

Annette is a TypeScript implementation of Interaction Nets - a computational model based on graph rewriting. It provides:

- **Core Engine**: Agents, ports, connections, rules, and networks for interaction net primitives
- **Reactive System**: SolidJS-like reactive primitives with fine-grained reactivity
- **Distributed Networks**: Cross-network synchronization with conflict resolution and vector clocks
- **Plugin Architecture**: Extensible system with time travel, effects, and synchronization plugins
- **Parallel Execution**: Worker-based parallel rule execution with dependency analysis
- **Developer Experience**: Progressive disclosure APIs, debugging tools, and enhanced error handling

## Commands

- **Build**: `npm run build` or `pridepack build`
- **Type check**: `npm run type-check` or `pridepack check` 
- **Test**: `npm test` or `vitest`
- **Test single file**: `vitest test/specific.test.ts`
- **Dev/Watch**: `npm run dev` or `pridepack dev`
- **Clean**: `npm run clean` or `pridepack clean`

## Code Style

- **TypeScript**: Strict mode enabled with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- **Imports**: Use relative imports (e.g., `from './agent'`), group by: external libs, core modules, internal modules
- **Naming**: PascalCase for classes/interfaces (e.g., `IAgent`, `Agent`), camelCase for functions/variables
- **Interfaces**: Prefix with `I` (e.g., `INetwork`, `IRule`)
- **Types**: Use descriptive union types, generic templates for agent definitions
- **Comments**: JSDoc for public APIs, avoid inline comments unless complex
- **Error Handling**: Use custom error classes extending base `Error`
- **Testing**: Vitest framework with descriptive test names
- **Docs**: Update README or docs when public APIs change
- **Organization**: Keep new modules under `src/`; DOM helpers live under `src/dom/`

Keep full TypeScript type inference and dynamism. We want a great developer experience with type safety. Don't be scared of generics and subtyping.
When fixing errors, try to keep all functionality. If a feature is partially implemented, don't unimplement it; add a comment and continue to fully implement it.
Try to understand the bigger picture and how your change fits into the overall architecture.
Avoid breaking public APIs unless explicitly requested.