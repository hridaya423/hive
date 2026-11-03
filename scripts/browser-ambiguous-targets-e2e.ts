import { runBrowserFixture } from "./browser-fixture-runner";

await runBrowserFixture({
  name: "browser-ambiguous-targets",
  tmpPrefix: "openbot-ambiguous-targets-",
  label: "Browser ambiguous target",
  cases: { min: 7 },
});
