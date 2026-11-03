import { runBrowserFixture } from "./browser-fixture-runner";

await runBrowserFixture({
  name: "browser-dialogs",
  tmpPrefix: "openbot-dialogs-",
  label: "Browser dialog",
  cases: { min: 24 },
  quickjs: true,
});
