import { describe, it, expect } from "vitest";
import { createNetwork, createEventSystem } from "../src";

describe("observer event system", () => {
  it("dispatches pulses through listeners", () => {
    const scope = createNetwork("observer-test");
    const events = createEventSystem(scope);

    const calls: string[] = [];
    const channel = events.createEvent<{ username: string }>("Login");

    events.listen(channel, (data) => {
      calls.push(`email:${data.username}`);
    });

    events.listen(channel, (data) => {
      calls.push(`analytics:${data.username}`);
    });

    const emitted = events.emit(channel, { username: "alice" });

    expect(emitted).toBe(true);
    expect(calls).toEqual(["analytics:alice", "email:alice"]);
    expect(scope.network.findAgents({ name: "Pulse" })).toHaveLength(0);
  });
});
