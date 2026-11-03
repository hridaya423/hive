import { FORK_CONFIG, type ForkGitHubApp } from "@openbot/contracts/fork-config";

// The GitHub App that the built-in GitHub connection signs in to.
//
// `bun scripts/create-github-app.ts` creates the app and prints its Client ID. A Client ID is
// public: device flow and refresh need nothing else, and the client secret never ships.

export type GitHubAppConfig = ForkGitHubApp;

/**
 * The configured app, or null. `githubApp` in `fork.config.json` names it. `OPENBOT_GITHUB_CLIENT_ID`
 * and `OPENBOT_GITHUB_APP_SLUG` override it. With no Client ID, the connection is not offered.
 */
export function githubAppConfig(
  env: NodeJS.ProcessEnv = process.env,
  fork: { githubApp?: ForkGitHubApp } = FORK_CONFIG,
): GitHubAppConfig | null {
  const clientId = env.OPENBOT_GITHUB_CLIENT_ID?.trim() || fork.githubApp?.clientId;
  const slug = env.OPENBOT_GITHUB_APP_SLUG?.trim() || fork.githubApp?.slug;
  if (!clientId || !slug || !/^[A-Za-z0-9.]+$/u.test(clientId) || !/^[a-z0-9-]+$/u.test(slug)) return null;
  return { clientId, slug };
}
