import { createNetwork, createEventSystem } from "../src";

const scope = createNetwork("observer-events");
const events = createEventSystem(scope);

const onLogin = events.createEvent<{ username: string }>("UserLogin");

events.listen(onLogin, (data) => {
  console.log(`📧 EMAIL SERVICE: Welcome, ${data.username}`);
});

events.listen(onLogin, (data) => {
  console.log(`📊 ANALYTICS: Logged login for ${data.username}`);
});

console.log("--- Ready to Emit ---");

events.emit(onLogin, { username: "alice_123" });
