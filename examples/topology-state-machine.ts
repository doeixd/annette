import { createNetwork, createTopologyStateMachine } from "../src";

const scope = createNetwork("topology-machine");
const { Agent, Port, connect } = scope;

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

const Fetching = Agent.factory<{ attempt: number }>("Fetching", {
  ports: {
    main: Port.main(),
    aux: Port.aux("aux")
  }
});

const ErrorState = Agent.factory<{ reason: string; attempt: number }>("Error", {
  ports: {
    main: Port.main(),
    aux: Port.aux("aux")
  }
});

const Success = Agent.factory<{ data: string }>("Success", {
  ports: {
    main: Port.main(),
    aux: Port.aux("aux")
  }
});

const StartCmd = Agent.factory<null>("Start");
const FailCmd = Agent.factory<{ reason: string }>("Fail");
const SucceedCmd = Agent.factory<{ result: string }>("Succeed");
const RetryCmd = Agent.factory<null>("Retry");

const machineHelper = createTopologyStateMachine(scope, {
  machinePort: "aux",
  statePort: "aux",
  stateEventPort: "main",
  eventPort: "main"
});

machineHelper.transition(Idle, StartCmd, Fetching, {
  mapValue: () => ({ attempt: 1 })
});

machineHelper.transition(Fetching, FailCmd, ErrorState, {
  mapValue: (event, state) => ({ reason: event.reason, attempt: state.attempt })
});

machineHelper.transition(Fetching, SucceedCmd, Success, {
  mapValue: (event) => ({ data: event.result })
});

machineHelper.transition(ErrorState, RetryCmd, Fetching, {
  mapValue: (_event, state) => ({ attempt: (state.attempt ?? 0) + 1 })
});

const machine = Machine({ name: "MyProcess" });
const initialState = Idle(null);

connect(machine.ports.aux, initialState.ports.aux);

machineHelper.dispatch(machine, StartCmd(null));
console.log("After Start:", machineHelper.getState(machine)?.name, machineHelper.getState(machine)?.value);

machineHelper.dispatch(machine, FailCmd({ reason: "404 Not Found" }));
console.log("After Fail:", machineHelper.getState(machine)?.name, machineHelper.getState(machine)?.value);

machineHelper.dispatch(machine, RetryCmd(null));
console.log("After Retry:", machineHelper.getState(machine)?.name, machineHelper.getState(machine)?.value);

machineHelper.dispatch(machine, SucceedCmd({ result: "Payload Data" }));
console.log("After Succeed:", machineHelper.getState(machine)?.name, machineHelper.getState(machine)?.value);
