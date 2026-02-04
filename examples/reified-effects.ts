import { createNetwork, createReifiedEffectSystem } from "../src";

const scope = createNetwork("reified-effects");
const { Agent, Port, connect, rules } = scope;

const effects = createReifiedEffectSystem(scope);

const UserProfile = Agent.factory<{ userId: string; data: unknown | null; error?: string }>("UserProfile", {
  ports: {
    main: Port.main("main"),
    io: Port.aux("io")
  }
});

rules.when(UserProfile, effects.Result).consume((profile, result) => {
  const value = result.value as { data: { name: string; url: string; source: string } };
  profile.value.data = value.data;
});

rules.when(UserProfile, effects.ErrorResult).consume((profile, error) => {
  const value = error.value as { reason: string };
  profile.value.error = value.reason;
});

const httpHandler = effects.Handler({
  topic: "HTTP_GET",
  fn: async (payload) => {
    const data = payload as { url: string };
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { name: "Alice", url: data.url, source: "REAL_API" };
  }
});

const profile = UserProfile({ userId: "123", data: null });
connect(profile.ports.io, httpHandler.ports.capability);

effects.requestFrom(profile.ports.io, profile.ports.main, "HTTP_GET", {
  url: `/api/users/${profile.value.userId}`
});
