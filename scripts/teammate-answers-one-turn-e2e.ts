// `bun scripts/teammate-answers-one-turn-e2e.ts`. Writes .openbot-build/teammate-answers-one-turn-e2e/report.json.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AgentStore } from "../src/backend/agent-store";
import { runCauseEffect } from "../src/backend/effect-boundary";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";

const OUT = resolve(import.meta.dirname, "../.openbot-build/teammate-answers-one-turn-e2e");
const root = await mkdtemp(join(tmpdir(), "teammate-answers-"));
const report: { checks: string[]; passed: boolean; error?: string } = { checks: [], passed: false };
const database = new OpenBotDatabase(join(root, "state"));
const store = new AgentStore(join(root, "state"), join(root, "home"), database);
const mailbox = new MailboxStore(join(root, "state"), store.sharedRoot, database);

const agent = (name: string) =>
  runCauseEffect(store.createAgent({ name, description: name, avatarSeed: name.toLowerCase(), avatarHue: null }));

async function request(chiefId: string, recipientAgentIds: string[], requestTurnId?: string) {
  const receipt = await runCauseEffect(
    mailbox.enqueue({
      sender: { kind: "agent", agentId: chiefId },
      recipientAgentIds,
      text: "Report back.",
      ...(requestTurnId ? { requestTurnId } : {}),
    }),
  );
  for (const delivery of receipt.deliveries) {
    await runCauseEffect(mailbox.markStarting(delivery.id));
    await runCauseEffect(mailbox.markRunning(delivery.id, `turn-${delivery.id}`));
  }
  return receipt;
}

async function answer(fromId: string, chiefId: string, requestId: string, deliveryId: string, end = true) {
  await runCauseEffect(
    mailbox.enqueue({
      sender: { kind: "agent", agentId: fromId },
      recipientAgentIds: [chiefId],
      text: `Answer from ${fromId}.`,
      replyToMessageId: requestId,
      expectsReply: false,
    }),
  );
  if (end) await runCauseEffect(mailbox.markTerminal(deliveryId, "completed"));
}

function onlyDelivery(receipt: { deliveries: { id: string }[] }): string {
  const [delivery] = receipt.deliveries;
  assert.ok(delivery, "A request made no delivery.");
  return delivery.id;
}

function startsTogether(chiefId: string): number {
  const next = mailbox.nextQueued(chiefId);
  return next ? 1 + mailbox.repliesToStartWith(next.delivery.id).length : 0;
}

async function drainChief(chiefId: string) {
  for (let next = mailbox.nextQueued(chiefId); next; next = mailbox.nextQueued(chiefId)) {
    for (const item of [next, ...mailbox.repliesToStartWith(next.delivery.id)]) {
      await runCauseEffect(mailbox.markStarting(item.delivery.id));
      await runCauseEffect(mailbox.markRunning(item.delivery.id, "chief-turn"));
      await runCauseEffect(mailbox.markTerminal(item.delivery.id, "completed"));
    }
  }
}

try {
  await runCauseEffect(store.initialize());
  await runCauseEffect(mailbox.initialize());
  const chief = await agent("Chief");
  const [hunter, launch, coding] = [await agent("Hunter"), await agent("Launch"), await agent("Coding")];

  const toHunter = await request(chief.id, [hunter.id], "chief-turn-1");
  const toLaunch = await request(chief.id, [launch.id], "chief-turn-1");
  const toCoding = await request(chief.id, [coding.id], "chief-turn-1");
  await answer(hunter.id, chief.id, toHunter.messageId, onlyDelivery(toHunter));
  assert.equal(startsTogether(chief.id), 0, "The first answer of a three-request turn started before the others.");
  await answer(launch.id, chief.id, toLaunch.messageId, onlyDelivery(toLaunch));
  assert.equal(startsTogether(chief.id), 0, "The second answer of a three-request turn started before the third.");
  await answer(coding.id, chief.id, toCoding.messageId, onlyDelivery(toCoding), false);
  assert.equal(startsTogether(chief.id), 3, "The three answers of one turn did not start in one turn.");
  await runCauseEffect(mailbox.markTerminal(onlyDelivery(toCoding), "completed"));
  await drainChief(chief.id);
  report.checks.push("answers to requests sent in one turn start in one turn");

  const early = await request(chief.id, [hunter.id], "chief-turn-2");
  const late = await request(chief.id, [launch.id], "chief-turn-3");
  await answer(hunter.id, chief.id, early.messageId, onlyDelivery(early));
  assert.equal(startsTogether(chief.id), 1, "An answer waited for a request that another turn sent.");
  await drainChief(chief.id);
  await answer(launch.id, chief.id, late.messageId, onlyDelivery(late));
  await drainChief(chief.id);
  report.checks.push("requests from different turns do not hold each other");

  const shared = await request(chief.id, [hunter.id, launch.id]);
  const [sharedHunter, sharedLaunch] = shared.deliveries;
  assert.ok(sharedHunter && sharedLaunch, "A request to two agents did not make two deliveries.");
  await answer(hunter.id, chief.id, shared.messageId, sharedHunter.id);
  assert.equal(startsTogether(chief.id), 0, "An answer to a request sent to two agents no longer waits.");
  await answer(launch.id, chief.id, shared.messageId, sharedLaunch.id);
  assert.equal(startsTogether(chief.id), 2, "The two answers to one request did not start together.");
  await drainChief(chief.id);
  report.checks.push("one request to several agents still holds its answers");

  const fine = await request(chief.id, [hunter.id], "chief-turn-4");
  const broken = await request(chief.id, [coding.id], "chief-turn-4");
  await runCauseEffect(mailbox.markTerminal(onlyDelivery(broken), "failed", "provider failed"));
  await answer(hunter.id, chief.id, fine.messageId, onlyDelivery(fine));
  assert.equal(startsTogether(chief.id), 1, "A failed request held the answer to another request of its turn.");
  assert.deepEqual(
    mailbox.unansweredRecipients(fine.messageId),
    [coding.id],
    "The turn that reads the answers does not name the teammate whose request of that turn failed.",
  );
  report.checks.push("a failed request does not hold the answers of its turn");

  report.passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  database.close();
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await rm(root, { recursive: true, force: true });
}
process.stdout.write(`${report.passed ? "PASS" : "FAIL"} ${join(OUT, "report.json")} ${report.error ?? ""}\n`);
process.exitCode = report.passed ? 0 : 1;
