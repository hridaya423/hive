import { runBrowserFixture } from "./browser-fixture-runner";

await runBrowserFixture({
  name: "browser-agent-session",
  tmpPrefix: "openbot-agent-session-",
  label: "Browser agent session",
  cases: { exact: 16 },
});
