import type { HostReleaseStatus, UpdateStatus } from "@openbot/contracts/ipc";
import { Effect } from "effect";

interface HostReleaseOptions {
  currentVersion: string;
  packaged: boolean;
  updateStatus: () => Pick<UpdateStatus, "phase" | "managedByHost">;
}

export class HostReleaseService {
  readonly #options: HostReleaseOptions;

  constructor(options: HostReleaseOptions) {
    this.#options = options;
  }

  snapshot(): HostReleaseStatus {
    return {
      currentVersion: this.#options.currentVersion,
      latestVersion: null,
      phase: "unavailable",
      method: this.#method(),
    };
  }

  #method(): HostReleaseStatus["method"] {
    if (!this.#options.packaged) return "unavailable";
    const update = this.#options.updateStatus();
    if (update.managedByHost) return "host-manager";
    return update.phase === "unsupported" ? "manual" : "self-update";
  }

  readonly check = (): Effect.Effect<HostReleaseStatus> => Effect.sync(() => this.snapshot());
}
