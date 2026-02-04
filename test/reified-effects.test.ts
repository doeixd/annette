import { describe, it, expect } from "vitest";
import { createNetwork, createReifiedEffectSystem } from "../src";

describe("reified effects", () => {
  it("delivers async results to the client", async () => {
    const scope = createNetwork("reified-effects-test");
    const { Agent, Port, connect, rules, network } = scope;
    const effects = createReifiedEffectSystem(scope);

    const Client = Agent.factory<{ data: string | null }>("Client", {
      ports: {
        main: Port.main("main"),
        io: Port.aux("io")
      }
    });

    rules.when(Client, effects.Result).consume((client, result) => {
      const value = result.value as { data: string };
      client.value.data = value.data;
    });

    const handler = effects.Handler({
      topic: "FETCH",
      fn: async () => "ok"
    });

    const client = Client({ data: null });
    connect(client.ports.io, handler.ports.capability);

    effects.requestFrom(client.ports.io, client.ports.main, "FETCH", { url: "/api" });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.value.data).toBe("ok");
    expect(network.findAgents({ name: "Effect" })).toHaveLength(0);
  });
});
