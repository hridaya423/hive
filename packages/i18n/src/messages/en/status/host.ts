import { defineMessages } from "../../../message";

export const messages = defineMessages("status.host", {
  // Status lines of the WebRTC host.
  "status.host.registered": "Registered this Hive for WebRTC access.",
  "status.host.keyRotated": "Server key changed. Paired devices stay paired.",
  "status.host.identityUpdated": "Server identity updated.",
  "status.host.starting": "Starting the WebRTC host…",
  "status.host.ready": "This Hive is ready for WebRTC connections.",
  "status.host.stopping": "Making this Hive private…",
  "status.host.private": "This Hive is private.",
});
