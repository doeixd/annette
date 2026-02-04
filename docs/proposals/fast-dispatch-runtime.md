# Proposal: Fast Dispatch Runtime (Compiled Interaction Nets)

## Summary

This proposal outlines a fast-dispatch runtime for Annette that compiles interaction-net topology into direct function calls while preserving the existing network model for serialization, time travel, and debugging. The design introduces a hybrid execution mode where ports can switch between scheduled dispatch and direct call chains.

## Related Proposals

- `docs/proposals/zero-cost-topology.md`

## Goals

- Reduce per-step overhead for hot interaction paths (event chains, DOM updates, selection).
- Preserve the existing interaction-net data model (agents, ports, connections) as the source of truth.
- Allow opt-in usage, starting with isolated modules and expanding to core.
- Provide a controlled hybrid mode that can switch between fast dispatch and managed scheduling.

## Non-Goals

- Replacing the current network or rule system entirely.
- Removing time travel, serialization, or deterministic stepping from the default runtime.
- Changing public APIs without an opt-in path.

## Motivation

The current scheduler performs graph scans to identify redexes. This provides observability and replay but is slower than direct execution for large, repeatable event chains. Many workflows (list updates, event listeners, effect handling) can benefit from a dispatch mode that treats connections as function references.

## Design Overview

### Concept: Ports as Dispatch Functions

Each bound port has a dispatch function:

- **Managed mode**: dispatch enqueues a pair into the scheduler.
- **Fast mode**: dispatch calls the connected port handler directly.

This creates a topology of function references without discarding the underlying graph metadata.

### HybridPort

A port wrapper stores topology metadata and a dispatch function:

- `connectedAgentId`: serialized graph state
- `dispatch`: function pointer
- `optimize()`: swaps dispatch from scheduler to neighbor handler
- `deoptimize()`: restores scheduler dispatch

### Engine Modes

- `managed`: current behavior (scheduler-driven).
- `fast`: ports call neighbors directly.
- `hybrid`: selective optimization per connection or per subnet.

### Fast Handlers

Each agent type exposes a handler method (or table) per port. The handler is the compiled entry point for fast dispatch. In managed mode, handlers are invoked through scheduler actions.

## API Surface (Proposed)

### Experimental FastNet Module

A standalone module to prove the runtime without core changes:

- `createFastNet()`
- `connectFast(agentPort, agentPort)`
- `emitFast(port, payload)`
- `compileGraph()`
- `decompileGraph()`

### Hybrid Network Extensions

Optional additions to `Network` and `ScopedNetwork`:

- `network.optimizePorts({ mode, filter })`
- `network.deoptimizePorts()`
- `network.dispatch(port, payload)`
- `network.isOptimized(port)`

## Target Use Cases

1. **Observer chains**: event listeners or pulse propagation.
2. **Optimized DOM blocks**: direct update delivery to block edits.
3. **Selection manager**: single-selection rewiring without scheduler overhead.
4. **Effect routing**: fast handler dispatch where async side effects already exist.

## Data Model Compatibility

- Graph metadata remains the source of truth for serialization and time travel.
- Fast mode caches function references, but never deletes or replaces topology metadata.
- Disconnected ports invalidate cached function pointers.

## Sync and Bridging

Introduce explicit boundary agents to handle side effects and syncing:

- `NetworkBridge` receives fast dispatch payloads and re-emits managed events.
- `SyncAgent` serializes payloads before forwarding to fast paths.

## Fallback and Safety

- Any port without a compatible handler remains in managed mode.
- A global flag disables fast mode for deterministic debugging.
- Deoptimization occurs on structural mutation (connect/disconnect/remove).

## Implementation Plan

### Phase 1: Experimental Module

- Implement `FastPort` and `FastAgent` prototypes in `src/fast-runtime`.
- Provide a minimal event-chain demo (observer-like usage).
- Add benchmarks comparing scheduler vs direct dispatch.

### Phase 2: Hybrid Ports

- Add optional dispatch hooks to bound ports.
- Introduce `network.optimizePorts()` and `network.dispatch()` APIs.
- Provide adapters for optimized DOM and observer event system.

### Phase 3: Tooling

- Add diagnostics to show optimized connections.
- Add tracing hooks to verify fast vs managed execution.

## Testing Strategy

- Unit tests for dispatch correctness in fast and hybrid modes.
- Determinism tests: fast mode should produce identical state as managed mode.
- Deoptimization tests: ensure dynamic graph changes fall back safely.

## Open Questions

- Should fast mode be per-network or per-subgraph?
- How should fast dispatch interact with time travel snapshots?
- Can the fast path be used for deterministic replay, or should it be debug-only?

## Risks

- Reduced observability when bypassing the scheduler.
- Function pointer invalidation after graph mutations.
- Increased complexity in the port lifecycle.

## Appendix: Example Hybrid Port

```typescript
type DispatchFn = (payload: unknown) => void;

class HybridPort {
  connectedAgentId: string | null = null;
  dispatch: DispatchFn;

  constructor(private scheduler: { enqueue: DispatchFn }) {
    this.dispatch = (payload) => this.scheduler.enqueue(payload);
  }

  optimize(neighborHandler: DispatchFn) {
    this.dispatch = neighborHandler;
  }

  deoptimize() {
    this.dispatch = (payload) => this.scheduler.enqueue(payload);
  }
}
```
