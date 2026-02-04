import { describe, it, expect } from "vitest";
import { createNetwork, createTopologyStateMachine } from "../src";

describe("topology state machines", () => {
  it("rewires machine state through transitions", () => {
    const scope = createNetwork("topology-test");
    const { Agent, Port, connect, network } = scope;

    const Machine = Agent.factory<{ name: string }>("Machine", {
      ports: {
        main: Port.main(),
        aux: Port.aux("aux")
      }
    });

    const Idle = Agent.factory<null>("Idle", {
      ports: {
        main: Port.main(),
        aux: Port.aux("aux")
      }
    });

    const Working = Agent.factory<{ attempt: number }>("Working", {
      ports: {
        main: Port.main(),
        aux: Port.aux("aux")
      }
    });

    const Start = Agent.factory<null>("Start");

    const machineHelper = createTopologyStateMachine(scope, {
      machinePort: "aux",
      statePort: "aux",
      stateEventPort: "main",
      eventPort: "main"
    });

    machineHelper.transition(Idle, Start, Working, {
      mapValue: () => ({ attempt: 1 })
    });

    const machine = Machine({ name: "Flow" });
    const idle = Idle(null);

    connect(machine.ports.aux, idle.ports.aux);

    expect(machineHelper.getState(machine)?.name).toBe("Idle");

    machineHelper.dispatch(machine, Start(null));

    const current = machineHelper.getState(machine);
    expect(current?.name).toBe("Working");
    expect(current?.value).toEqual({ attempt: 1 });
    expect(network.findAgents({ name: "Start" })).toHaveLength(0);
  });
});
