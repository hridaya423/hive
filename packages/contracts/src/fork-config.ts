import forkConfig from "../../../fork.config.json";

export interface ForkGitHubApp {
  clientId: string;
  slug: string;
}

export const FORK_CONFIG: typeof forkConfig & { githubApp?: ForkGitHubApp } = forkConfig;
