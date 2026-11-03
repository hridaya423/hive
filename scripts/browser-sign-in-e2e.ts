import { runBrowserFixture } from "./browser-fixture-runner";

await runBrowserFixture({
  name: "browser-sign-in",
  tmpPrefix: "openbot-sign-in-",
  label: "Browser sign-in",
  cases: { min: 21 },
});
