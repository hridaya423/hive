// Installs Baileys, the WhatsApp Web library, into a folder outside this repository, for the WhatsApp
// channel: `bun scripts/install-whatsapp-runtime.ts <folder>`. Baileys needs `libsignal`, which is
// GPL-3.0, so it is not a dependency of the repository.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BAILEYS_VERSION } from "../src/backend/messaging/whatsapp/whatsapp-baileys";

const folder = process.argv[2] ? resolve(process.argv[2]) : null;
if (!folder) {
  process.stderr.write("usage: bun scripts/install-whatsapp-runtime.ts <folder>\n");
  process.exit(64);
}
mkdirSync(folder, { recursive: true });
writeFileSync(
  join(folder, "package.json"),
  `${JSON.stringify({ name: "hive-whatsapp-runtime", private: true, dependencies: { baileys: BAILEYS_VERSION } }, null, 2)}\n`,
);
const install = Bun.spawnSync(["bun", "install"], { cwd: folder, stdout: "inherit", stderr: "inherit" });
process.exit(install.exitCode);
