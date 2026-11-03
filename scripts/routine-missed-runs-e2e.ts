// Checks what a routine does with the occurrences that came due while the host was off or asleep.
// It runs the real scheduler, SQLite stores, mailbox and routine timer. The clock moves with
// `setSystemTime`, and each cold-start pass gets an explicit clock. A wake goes through the timer's
// `suspend` and `resume`, which is what the system sleep calls. No provider, account or network starts.
//
// Run: `bun scripts/routine-missed-runs-e2e.ts`.
// Writes .openbot-build/routine-missed-runs-e2e/report.json and exits non-zero on a failure.

import { setSystemTime } from "bun:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Routine, RoutineMissedPolicy } from "@openbot/contracts/ipc";
import { Effect } from "effect";
import { ConversationRuntime } from "../src/backend/agent/conversation-runtime";
import { RoutineScheduler } from "../src/backend/agent/routine-scheduler";
import { AgentRoutineStore } from "../src/backend/agent-routine-store";
import { AgentStore } from "../src/backend/agent-store";
import { AgentWaitStore } from "../src/backend/agent-waits/agent-wait-store";
import { AgentWaits } from "../src/backend/agent-waits/agent-waits";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { RoutineTimer } from "../src/backend/routine-timer";
import { parseCreateRoutine, parseUpdateRoutine } from "../src/main/ipc/agent-inputs";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, ".openbot-build", "routine-missed-runs-e2e");
const STEP_DEADLINE_MS = 15_000;
const DAY = "2031-03-03";
const at = (time: string) => new Date(`${DAY}T${time}:00.000Z`);
const QUARTER_HOURLY = { kind: "custom", expression: "*/15 * * * *" } as const;

interface Fixture {
  database: OpenBotDatabase;
  mailbox: MailboxStore;
  scheduler: RoutineScheduler;
  timer: RoutineTimer;
  runs: AgentRoutineStore;
  agentId: string;
  hidden: Set<string>;
  errors: string[];
  start(): void;
  close(): void;
}

async function openFixture(root: string): Promise<Fixture> {
  const database = new OpenBotDatabase(join(root, "state"));
  const store = new AgentStore(join(root, "state"), join(root, "home"), database);
  const mailbox = new MailboxStore(join(root, "state"), store.sharedRoot, database);
  let conversation: ConversationRuntime | undefined;
  try {
    await runCauseEffect(store.initialize());
    await runCauseEffect(mailbox.initialize());
    const agent =
      store.list()[0] ??
      (await runCauseEffect(
        store.createAgent({
          name: "Missed fixture",
          description: "Synthetic missed-run fixture",
          avatarSeed: "routine-missed",
          avatarHue: null,
        }),
      ));
    const errors: string[] = [];
    const hidden = new Set<string>();
    let running = false;
    conversation = new ConversationRuntime(
      store,
      () => {},
      () => store.list(),
    );
    const runtime = conversation;
    const sources: RoutineScheduler[] = [];
    const timer = new RoutineTimer(
      () => sources,
      () => running,
      (code) => errors.push(code),
    );
    const waits = new AgentWaits({
      store: new AgentWaitStore({ database }),
      mailbox,
      hooks: { emit: () => {}, ownsRoutine: () => true, hasRoutine: () => true, requireKnownAgent: () => {} },
    });
    const scheduler = new RoutineScheduler({
      store,
      mailbox,
      conversation: runtime,
      timer,
      waits,
      timezone: () => "UTC",
      hooks: {
        emit: () => {},
        emitError: (code) => errors.push(code),
        emitQueue: () => {},
        scheduleDrain: () => {},
        interrupt: () => Effect.void,
        awaitDrain: () => undefined,
        syncMailboxMessages: () => {},
        listAgents: () => store.list(),
        excludedAgents: () => hidden,
        isRunning: () => running,
        usageLimited: () => false,
      },
    });
    sources.push(scheduler);
    return {
      database,
      mailbox,
      scheduler,
      timer,
      runs: new AgentRoutineStore(database),
      agentId: agent.id,
      hidden,
      errors,
      start() {
        running = true;
      },
      close() {
        timer.dispose();
        runtime.dispose();
        database.close();
      },
    };
  } catch (error) {
    conversation?.dispose();
    database.close();
    throw error;
  }
}

interface Step {
  name: string;
  passed: boolean;
  detail?: unknown;
  error?: string;
}

const report: { passed: boolean; steps: Step[] } = { passed: false, steps: [] };

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  process.stdout.write(`- ${name}\n`);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`No result within ${STEP_DEADLINE_MS} ms.`)), STEP_DEADLINE_MS);
      }),
    ]);
    report.steps.push({ name, passed: true, detail: value });
    return value;
  } catch (error) {
    report.steps.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

const root = await mkdtemp(join(tmpdir(), "openbot-routine-missed-"));
let fixture: Fixture | undefined;

function current(): Fixture {
  assert.ok(fixture, "The fixture is open.");
  return fixture;
}

function create(name: string, missedPolicy?: RoutineMissedPolicy): Routine {
  return current().scheduler.create(
    parseCreateRoutine({
      agentId: current().agentId,
      name,
      instruction: `Run ${name}.`,
      active: true,
      timezone: "UTC",
      schedule: QUARTER_HOURLY,
      ...(missedPolicy ? { missedPolicy } : {}),
    }),
    { recordConversationEvent: false },
  );
}

function routine(id: string): Routine {
  const found = current()
    .scheduler.list(current().agentId)
    .find((row) => row.id === id);
  assert.ok(found, "The routine exists.");
  return found;
}

function deliveries(id: string): number {
  return current()
    .mailbox.conversationMessages(current().agentId)
    .filter((message) => message.routine?.routineId === id).length;
}

function scheduledRuns(id: string): string[] {
  return current()
    .runs.listRuns(current().agentId, id, 50, true)
    .filter((run) => !run.missed)
    .map((run) => run.scheduledFor)
    .sort();
}

function missedRecords(id: string): Array<{ count: number; first: string }> {
  return current()
    .runs.listRuns(current().agentId, id, 50, true)
    .flatMap((run) => (run.missed ? [{ count: run.missed.count, first: run.scheduledFor }] : []));
}

async function cancelQueued(): Promise<void> {
  const { mailbox, agentId } = current();
  for (const deliveryId of mailbox.queuedDeliveryIds(agentId))
    await runCauseEffect(mailbox.cancel(agentId, deliveryId));
}

async function reopenAt(now: Date): Promise<void> {
  current().close();
  fixture = undefined;
  setSystemTime(now);
  fixture = await openFixture(root);
}

async function coldStart(now: Date): Promise<void> {
  current().scheduler.skipMissed(new Date());
  await runCauseEffect(current().scheduler.resumePendingRuns());
  await runCauseEffect(current().scheduler.processDue(now));
}

function sleepUntil(now: Date): void {
  current().timer.suspend();
  setSystemTime(now);
  current().start();
  current().timer.resume();
}

async function until(settled: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!settled() && Date.now() < deadline) await new Promise((done) => setTimeout(done, 10));
  assert.ok(settled(), "The timer handled the routines after the wake.");
}

try {
  let defaultId = "";
  let skipId = "";
  let explicitId = "";
  let pausedId = "";
  let hiddenId = "";

  await step("A routine with no missedPolicy defaults to run-once, an explicit skip stays skip", async () => {
    setSystemTime(at("10:01"));
    fixture = await openFixture(root);
    const unset = create("Default policy");
    const skip = create("Explicit skip", "skip");
    const run = create("Explicit run-once", "run-once");
    defaultId = unset.id;
    skipId = skip.id;
    explicitId = run.id;
    assert.equal(unset.missedPolicy, "run-once");
    assert.equal(skip.missedPolicy, "skip");
    assert.equal(run.missedPolicy, "run-once");
    const once = current().scheduler.create(
      parseCreateRoutine({
        agentId: current().agentId,
        name: "One reminder",
        instruction: "Send the reminder.",
        active: true,
        timezone: "UTC",
        schedule: { kind: "once", date: DAY, time: "10:30" },
      }),
      { recordConversationEvent: false },
    );
    assert.equal(once.missedPolicy, "run-once");
    const edited = current().scheduler.update(
      parseUpdateRoutine({ agentId: current().agentId, routineId: skipId, name: "Explicit skip, renamed" }),
      { recordConversationEvent: false },
    );
    assert.equal(edited.missedPolicy, "skip", "An edit that omits the policy keeps the explicit skip.");
    await runCauseEffect(current().scheduler.processDue(at("10:15")));
    await cancelQueued();
    return { default: unset.missedPolicy, skip: skip.missedPolicy, once: once.missedPolicy };
  });

  await step("Cold start after many missed occurrences runs the default routine once", async () => {
    await reopenAt(at("12:20"));
    await coldStart(at("12:20"));
    assert.deepEqual(scheduledRuns(defaultId), [at("10:15").toISOString(), at("12:15").toISOString()]);
    assert.equal(deliveries(defaultId), 2, "One run before the stop and exactly one after the start.");
    assert.equal(routine(defaultId).trigger.nextRunAt, at("12:30").toISOString());
    assert.deepEqual(missedRecords(defaultId), [{ count: 7, first: at("10:30").toISOString() }]);
    assert.equal(deliveries(explicitId), 2);
    await runCauseEffect(current().scheduler.processDue(at("12:20")));
    assert.equal(deliveries(defaultId), 2, "A second pass does not repeat the catch-up.");
    return { scheduled: scheduledRuns(defaultId), missed: missedRecords(defaultId) };
  });

  await step("Cold start leaves an explicit skip without a run and moves it on", async () => {
    assert.deepEqual(scheduledRuns(skipId), [at("10:15").toISOString()]);
    assert.equal(deliveries(skipId), 1, "Only the run before the stop.");
    assert.equal(routine(skipId).trigger.nextRunAt, at("12:30").toISOString());
    assert.deepEqual(missedRecords(skipId), [{ count: 8, first: at("10:30").toISOString() }]);
    return { missed: missedRecords(skipId) };
  });

  await step("The normal schedule goes on after the catch-up", async () => {
    await cancelQueued();
    setSystemTime(at("12:30"));
    await runCauseEffect(current().scheduler.processDue(at("12:30")));
    assert.equal(deliveries(defaultId), 3);
    assert.equal(deliveries(skipId), 2);
    assert.equal(routine(defaultId).trigger.nextRunAt, at("12:45").toISOString());
    await cancelQueued();
    return { nextRunAt: routine(defaultId).trigger.nextRunAt };
  });

  await step("A wake from sleep runs the default routine once and not the explicit skip", async () => {
    const before = {
      unset: deliveries(defaultId),
      skip: deliveries(skipId),
      explicit: deliveries(explicitId),
    };
    sleepUntil(at("15:20"));
    assert.equal(routine(skipId).trigger.nextRunAt, at("15:30").toISOString(), "The wake moves an explicit skip on.");
    assert.deepEqual(missedRecords(skipId).slice(0, 1), [{ count: 11, first: at("12:45").toISOString() }]);
    await until(() => deliveries(defaultId) === before.unset + 1 && deliveries(explicitId) === before.explicit + 1);
    assert.equal(deliveries(skipId), before.skip, "An explicit skip runs nothing at the wake.");
    assert.equal(scheduledRuns(defaultId).at(-1), at("15:15").toISOString());
    assert.equal(routine(defaultId).trigger.nextRunAt, at("15:30").toISOString());
    assert.deepEqual(missedRecords(defaultId).slice(0, 1), [{ count: 10, first: at("12:45").toISOString() }]);
    assert.deepEqual(current().errors, []);
    await cancelQueued();
    return { unset: deliveries(defaultId), skip: deliveries(skipId), missed: missedRecords(defaultId) };
  });

  await step("A second wake with nothing missed runs nothing", async () => {
    const before = deliveries(defaultId);
    current().timer.suspend();
    setSystemTime(at("15:21"));
    current().timer.resume();
    await runCauseEffect(current().scheduler.processDue(at("15:21")));
    assert.equal(deliveries(defaultId), before);
    return { deliveries: deliveries(defaultId) };
  });

  await step("A paused routine does not catch up at a start, a wake or a resume", async () => {
    setSystemTime(at("15:22"));
    const paused = create("Paused default");
    pausedId = paused.id;
    current().scheduler.update(parseUpdateRoutine({ agentId: current().agentId, routineId: pausedId, active: false }), {
      recordConversationEvent: false,
    });
    await reopenAt(at("17:20"));
    await coldStart(at("17:20"));
    assert.equal(deliveries(pausedId), 0, "No catch-up at a start.");
    assert.deepEqual(missedRecords(pausedId), []);
    await cancelQueued();
    sleepUntil(at("18:20"));
    await until(() => scheduledRuns(defaultId).includes(at("18:15").toISOString()));
    await cancelQueued();
    assert.equal(deliveries(pausedId), 0, "No catch-up at a wake.");
    const resumed = current().scheduler.update(
      parseUpdateRoutine({ agentId: current().agentId, routineId: pausedId, active: true }),
      { recordConversationEvent: false },
    );
    assert.equal(resumed.trigger.nextRunAt, at("18:30").toISOString());
    await runCauseEffect(current().scheduler.processDue(at("18:20")));
    assert.equal(deliveries(pausedId), 0, "A resume does not fire the paused time.");
    assert.deepEqual(missedRecords(pausedId), []);
    assert.deepEqual(scheduledRuns(pausedId), []);
    return { nextRunAt: resumed.trigger.nextRunAt };
  });

  await step("A hidden agent's routine does not catch up at a start, a wake or a restore", async () => {
    setSystemTime(at("18:21"));
    const routineHidden = create("Hidden default");
    hiddenId = routineHidden.id;
    await reopenAt(at("20:20"));
    current().hidden.add(current().agentId);
    await coldStart(at("20:20"));
    assert.equal(deliveries(hiddenId), 0, "No catch-up at a start.");
    sleepUntil(at("21:20"));
    assert.equal(deliveries(hiddenId), 0, "No catch-up at a wake.");
    current().scheduler.skipMissedFor(current().agentId, new Date());
    current().hidden.clear();
    await runCauseEffect(current().scheduler.processDue(at("21:20")));
    assert.equal(deliveries(hiddenId), 0, "No catch-up when the agent comes back.");
    assert.ok(missedRecords(hiddenId).length > 0, "The occurrences of the hide are recorded as missed.");
    assert.equal(routine(hiddenId).trigger.nextRunAt, at("21:30").toISOString());
    assert.deepEqual(current().errors, []);
    return { missed: missedRecords(hiddenId) };
  });

  report.passed = true;
} finally {
  setSystemTime();
  fixture?.close();
  await rm(root, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Report: ${join(OUT, "report.json")}\n`);
}
