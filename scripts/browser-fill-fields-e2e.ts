import { runBrowserFixture } from "./browser-fixture-runner";

await runBrowserFixture({
  name: "browser-fill-fields",
  tmpPrefix: "openbot-fill-fields-",
  label: "Browser fill",
  cases: { min: 20 },
});
