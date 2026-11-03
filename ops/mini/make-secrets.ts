import { randomBytes } from "node:crypto";
import { createDevelopmentDefaults } from "../../scripts/development-secrets";

const defaults = createDevelopmentDefaults();
const values: Record<string, string> = {
  REMOTE_TICKET_PRIVATE_JWK: defaults.REMOTE_TICKET_PRIVATE_JWK ?? "",
  REMOTE_TICKET_PUBLIC_JWKS: defaults.REMOTE_TICKET_PUBLIC_JWKS ?? "",
  REMOTE_AUTH_WEBHOOK_SECRET: defaults.REMOTE_AUTH_WEBHOOK_SECRET ?? "",
  SKILLS_ADMIN_TOKEN: defaults.SKILLS_ADMIN_TOKEN ?? "",
  SITE_REPORT_HASH_SECRET: defaults.SITE_REPORT_HASH_SECRET ?? "",
  REMOTE_SESSION_SECRET: randomBytes(32).toString("hex"),
  TURN_SHARED_SECRET: randomBytes(32).toString("hex"),
};
for (const [name, value] of Object.entries(values)) {
  process.stdout.write(`${name}='${value.replaceAll("'", "'\\''")}'\n`);
}
