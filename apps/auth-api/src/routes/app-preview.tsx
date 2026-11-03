import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/app-preview")({
  head: () => ({
    meta: [{ title: "Hive application preview" }, { name: "robots", content: "noindex, follow" }],
  }),
  headers: () => ({ "X-Robots-Tag": "noindex, follow" }),
});
