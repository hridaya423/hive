// Counts the IPC calls that the renderer makes for a scripted session, on a virtual clock, through the
// real `notifyTeamTyping`, `createPresentationPublisher` and `shareInFlight` and the real
// `DynamicIslandCoordinator`. It needs no app and no sign-in. It does not replace a trace of a running
// app: the sequence is synthetic. Writes .openbot-build/renderer-ipc-calls-e2e/report.json.
// `--typing-module=<path>` counts typing calls through another copy of `team-typing.ts`, such as the
// one before the throttle.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ScopedAgentEvent } from "@openbot/contracts/ipc";
import { DynamicIslandCoordinator } from "@openbot/team-client/dynamic-island-coordinator";

const OUT = resolve(import.meta.dirname, "../.openbot-build/renderer-ipc-calls-e2e");
const typingModule = process.argv.find((arg) => arg.startsWith("--typing-module="))?.slice("--typing-module=".length);

let now = 1_000_000;
let nextTimerId = 1;
const timers = new Map<number, { at: number; run: () => void }>();
const realDateNow = Date.now;
globalThis.Date.now = () => now;
Object.assign(globalThis, {
  setTimeout: (run: () => void, delay = 0) => {
    const id = nextTimerId++;
    timers.set(id, { at: now + delay, run });
    return id;
  },
  clearTimeout: (id: number) => void timers.delete(id),
});

async function flushMicrotasks(): Promise<void> {
  for (let tick = 0; tick < 20; tick++) await Promise.resolve();
}

async function advance(ms: number): Promise<void> {
  const end = now + ms;
  for (;;) {
    const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    timers.delete(due[0]);
    now = Math.max(now, due[1].at);
    due[1].run();
    await flushMicrotasks();
  }
  now = end;
  await flushMicrotasks();
}

const typingCalls: { at: number; agentId: string | null; typing: boolean }[] = [];
Object.assign(globalThis, {
  window: {
    openbot: {
      servers: {
        setTyping: async (input: { agentId: string | null; typing: boolean }) => {
          typingCalls.push({ at: now, ...input });
        },
      },
    },
  },
});

const typingExports: { notifyTeamTyping: (agentId: string, typing: boolean) => void } = await import(
  typingModule ? resolve(typingModule) : "../src/renderer/src/features/team/team-typing"
);
const { notifyTeamTyping } = typingExports;

interface ScriptedEvent {
  type: string;
  agentId?: string;
  threadId?: string;
  turnId?: string;
  detail?: string;
  status?: string;
  messageId?: string;
  delta?: string;
  agents?: { id: string; name: string; notifications: boolean }[];
  snapshot?: {
    agentId: string;
    activeTurnId: null;
    messages: { id: string; author: string; text: string; status: string; createdAt: string }[];
  };
}

async function typingScenario() {
  const keystrokes = 150;
  for (let key = 0; key < keystrokes; key++) {
    notifyTeamTyping("agent-a", true);
    await advance(200);
  }
  await advance(3_000);
  notifyTeamTyping("agent-a", false);
  await advance(5_000);
  const last = typingCalls.at(-1);
  assert.deepEqual(last && { agentId: last.agentId, typing: last.typing }, { agentId: null, typing: false });
  const trueCalls = typingCalls.filter((call) => call.typing);
  const gaps = trueCalls.slice(1).map((call, index) => call.at - (trueCalls[index]?.at ?? 0));
  return {
    keystrokes,
    seconds: (keystrokes * 200) / 1000,
    calls: typingCalls.length,
    maxGapMsBetweenTrueCalls: Math.max(...gaps, 0),
    minGapMsBetweenTrueCalls: Math.min(...gaps, Number.POSITIVE_INFINITY),
    finalCall: last,
  };
}

async function islandScenario() {
  const { createPresentationPublisher } = await import(
    "../src/renderer/src/features/dynamic-island/dynamic-island-publish"
  );
  const text = {
    taskWorking: "Working",
    questionHeader: "Question",
    questionText: "Question",
    optionFallback: (n: number) => `Option ${n}`,
    takeoverTitle: "Takeover",
    takeoverDetail: "Takeover",
    failureTitle: "Failed",
    failureDetail: "Failed",
    approvalCommand: "Command",
    approvalFileChange: "File",
    approvalPermissions: "Permissions",
    errorMessage: (_error: unknown, fallback: string) => fallback,
  };
  const coordinator = new DynamicIslandCoordinator(() => text);
  const sent: unknown[] = [];
  const publish = createPresentationPublisher(
    () => coordinator.presentation(["local"]),
    async (presentation) => void sent.push(presentation),
  );
  const agent = { id: "agent-a", name: "A", notifications: true };
  const apply = (event: ScriptedEvent, bufferedLive = false) => {
    const scoped: ScopedAgentEvent = JSON.parse(JSON.stringify({ serverId: "local", event, bufferedLive }));
    coordinator.applyEvent(scoped, "other");
    publish();
  };
  let requests = 0;
  const step = async (event: ScriptedEvent, wait: number, bufferedLive = false) => {
    requests++;
    apply(event, bufferedLive);
    await advance(wait);
  };
  await step({ type: "agents-changed", agents: [agent] }, 250);
  await step({ type: "turn-started", agentId: "agent-a", threadId: "t", turnId: "turn-1" }, 250);
  for (let event = 0; event < 240; event++) {
    if (event % 4 === 0)
      await step(
        { type: "turn-progress", agentId: "agent-a", threadId: "t", turnId: "turn-1", detail: `Step ${event}` },
        250,
      );
    else await step({ type: "skills-changed", agentId: "agent-a" }, 250);
  }
  await step({ type: "turn-completed", agentId: "agent-a", threadId: "t", turnId: "turn-1", status: "completed" }, 500);
  const quiet = { events: requests, calls: sent.length };
  await step(
    {
      type: "conversation",
      snapshot: {
        agentId: "agent-a",
        activeTurnId: null,
        messages: [
          { id: "m1", author: "agent", text: "Start", status: "streaming", createdAt: "2026-11-03T12:00:00.000Z" },
        ],
      },
    },
    50,
    true,
  );
  for (let delta = 0; delta < 200; delta++)
    await step({ type: "conversation-delta", agentId: "agent-a", messageId: "m1", delta: ` word${delta}` }, 50);
  await advance(1_000);
  const finalPresentation = coordinator.presentation(["local"]);
  assert.deepEqual(sent.at(-1), finalPresentation);
  const streamingEvents = requests - quiet.events;
  const streamingCalls = sent.length - quiet.calls;
  return {
    quietEvents: { events: quiet.events, ipcCallsBefore: quiet.events, ipcCallsAfter: quiet.calls },
    streamingReply: {
      events: streamingEvents,
      secondsBetweenEvents: 0.05,
      ipcCallsBefore: streamingEvents,
      ipcCallsAfter: streamingCalls,
    },
  };
}

async function usageScenario() {
  const { shareInFlight } = await import("../src/renderer/src/rate-limit");
  const run = async (keys: string[]) => {
    let calls = 0;
    const read = shareInFlight(async () => {
      calls++;
      await new Promise<void>((done) => setTimeout(done, 1_450));
      return calls;
    });
    const results = keys.map((key) => read(key));
    await advance(1_450);
    await advance(1_450);
    await advance(1_450);
    await Promise.all(results);
    return calls;
  };
  const sameKeyThree = await run(["local:codex", "local:codex", "local:codex"]);
  const changingKeysThree = await run(["local:", "local:codex", "local:codex,claude"]);
  const spaced = await (async () => {
    let calls = 0;
    const read = shareInFlight(async () => void calls++);
    await read("local:codex");
    await read("local:codex");
    return calls;
  })();
  assert.equal(sameKeyThree, 1);
  assert.equal(changingKeysThree, 2);
  assert.equal(spaced, 2);
  return {
    threeAtOnceSameProviders: { before: 3, after: sameKeyThree },
    threeAtOnceProvidersChanging: { before: 3, after: changingKeysThree },
    twoSequential: { before: 2, after: spaced },
  };
}

const report = {
  note: "Synthetic sequence on a virtual clock. Not a trace of a running app.",
  typing: await typingScenario(),
  island: await islandScenario(),
  usage: await usageScenario(),
};
globalThis.Date.now = realDateNow;
mkdirSync(OUT, { recursive: true });
writeFileSync(
  resolve(OUT, typingModule ? "report-baseline.json" : "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
