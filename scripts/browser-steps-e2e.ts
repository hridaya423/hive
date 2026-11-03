import { runBrowserFixture } from "./browser-fixture-runner";

await runBrowserFixture({
  name: "browser-steps",
  tmpPrefix: "openbot-browser-steps-",
  label: "Browser steps",
  cases: { min: 25 },
  quickjs: true,
});
