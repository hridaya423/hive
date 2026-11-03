import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import { z } from "zod";

const memoryId = z.string().min(1).max(INPUT_LIMITS.identifier);

export const searchMemoriesInput = z.strictObject({
  query: z.string().trim().min(1).max(256),
  limit: z.number().int().min(1).max(10).optional(),
});

export const listMemoriesInput = z.strictObject({
  after: memoryId.nullable().optional(),
});

export const setMemoryInclusionInput = z.strictObject({
  changes: z
    .array(
      z.strictObject({
        memoryId,
        inclusion: z.enum(["essential", "searchable"]),
        expectedRevision: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(25),
});

export const MEMORY_RECALL_TOOL_DEFINITIONS = [
  {
    name: "search_memories",
    description:
      "Search your saved memories when a past preference, decision or fact can help. Returns committed entries and their revisions. Terms are words, not operators. No match: do not invent the fact.",
    shape: searchMemoriesInput.shape,
  },
  {
    name: "list_memories",
    description:
      "Read a page of your saved memories for review or maintenance; pass nextCursor as after to continue. For a specific fact, search.",
    shape: listMemoriesInput.shape,
  },
  {
    name: "set_memory_inclusion",
    description:
      "Stage which memories go into every prompt: essential only for facts needed across tasks, else searchable. Get current revisions from search_memories or list_memories. Changes commit after a successful turn, within the prompt budget. User-controlled choices cannot change.",
    shape: setMemoryInclusionInput.shape,
  },
];
