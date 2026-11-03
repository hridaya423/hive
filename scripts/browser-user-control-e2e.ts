import { runBrowserFixture } from "./browser-fixture-runner";

await runBrowserFixture({
  name: "browser-user-control",
  tmpPrefix: "openbot-user-control-",
  label: "Browser user control",
  cases: { min: 19 },
});
