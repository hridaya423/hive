import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import { BROWSER_TAKEOVER_REASONS, VAULT_TEXT_LIMIT, type VaultContactFields } from "@openbot/contracts/ipc";
import { UI_BLOCK_LIMITS, UI_VAULT_REQUEST_KINDS } from "@openbot/contracts/ui-blocks";
import { z } from "zod";
import { advertisedJsonSchema } from "./agent/advertised-json-schema";
import {
  BROWSER_FILL_FIELDS_MAX_FIELDS,
  BROWSER_FILL_FIELDS_MAX_TEXT_BYTES,
  BROWSER_FILL_FIELDS_MAX_TIMEOUT_MS,
} from "./browser-fill-fields";

export const OPENBOT_BROWSER_NAMESPACE = "openbot_browser";

const identifier = z.string().min(1).max(INPUT_LIMITS.identifier);
const requiredString = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0);
const tabId = requiredString(INPUT_LIMITS.identifier);
const revision = z.number().int().nonnegative();
const timeout = z.number().int().min(0).max(30_000).optional();
const image = z.enum(["auto", "always", "never"]).optional();
const nonBlankString = (max: number) => z.string().max(max).trim().min(1);
const modifiers = z
  .array(z.enum(["Alt", "Control", "Meta", "Shift"]))
  .min(1)
  .max(4)
  .optional();

const browserTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ref"), ref: identifier, revision }),
  z.object({
    kind: z.literal("role"),
    role: nonBlankString(64),
    name: nonBlankString(500).exactOptional(),
    exact: z.boolean().exactOptional(),
  }),
  z.object({ kind: z.literal("text"), text: nonBlankString(500), exact: z.boolean().exactOptional() }),
  z.object({ kind: z.literal("css"), selector: nonBlankString(2_000) }),
  z.object({
    kind: z.literal("point"),
    x: z.number().min(0).max(INPUT_LIMITS.browserCoordinate),
    y: z.number().min(0).max(INPUT_LIMITS.browserCoordinate),
  }),
]);

const vaultText = z.string().max(VAULT_TEXT_LIMIT).optional();

const vaultContactShape = {
  fullName: vaultText.describe("Contact: the full name."),
  address: vaultText.describe("Contact: the street address."),
  address2: vaultText.describe("Contact: the apartment, suite or floor."),
  city: vaultText.describe("Contact: the city."),
  region: vaultText.describe("Contact: the state, province or region."),
  postalCode: vaultText.describe("Contact: the postal code."),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$|^$/u)
    .optional()
    .describe("Contact: the ISO 3166-1 alpha-2 country code, such as US or DE."),
  phone: vaultText.describe("Contact: the phone number."),
  email: vaultText.describe("Contact: the email address."),
} satisfies { [Key in Exclude<keyof VaultContactFields, "label">]: z.ZodType };

function browserTool<const Name extends string, Shape extends z.ZodRawShape>(definition: {
  name: Name;
  description: string;
  shape: Shape;
}) {
  const schema = z.strictObject(definition.shape);
  return {
    ...definition,
    schema,
    parse(value: unknown) {
      const result = schema.safeParse(value);
      if (!result.success) throw new Error(`Invalid browser tool arguments: ${z.prettifyError(result.error)}`);
      return { tool: definition.name, args: result.data };
    },
  };
}

// Keep unused legacy fields accepted, but require the fields each action reads.
const legacyActionFields = {
  ref: identifier.optional(),
  text: z.string().max(INPUT_LIMITS.browserActionText).optional(),
  submit: z.boolean().optional(),
  key: z.string().max(128).optional(),
  deltaY: z.number().optional(),
};
const legacyActionSchema = z.discriminatedUnion("type", [
  z.object({ ...legacyActionFields, type: z.literal("click"), ref: tabId }),
  z.object({
    ...legacyActionFields,
    type: z.literal("type"),
    ref: tabId,
    text: requiredString(INPUT_LIMITS.browserActionText),
  }),
  z.object({ ...legacyActionFields, type: z.literal("key"), key: requiredString(32) }),
  z.object({ ...legacyActionFields, type: z.literal("scroll"), deltaY: z.number() }),
  z.object({ ...legacyActionFields, type: z.literal("back") }),
  z.object({ ...legacyActionFields, type: z.literal("forward") }),
  z.object({ ...legacyActionFields, type: z.literal("reload") }),
]);

/** Input tools return a short status. The model reads the page with `snapshot` when it needs to. */
const ACTION_RESULT = "Returns a status; pass snapshot: true for a snapshot.";
const actionSnapshot = z.boolean().optional();
const targetAction = { tabId, target: browserTargetSchema, timeoutMs: timeout, snapshot: actionSnapshot };

// The fields of the tools that the `run_script` helpers also take as steps. A step names its tool
// in `action` and acts on the tab of the call, so these fields leave out `tabId`.
const navigateFields = {
  url: requiredString(INPUT_LIMITS.browserUrl).optional(),
  direction: z.enum(["back", "forward", "reload"]).optional(),
  timeoutMs: timeout,
};
const clickFields = {
  target: browserTargetSchema,
  timeoutMs: timeout,
  button: z.enum(["left", "middle", "right"]).optional(),
  clickCount: z.number().int().min(1).max(2).optional(),
  modifiers,
};
const typeFields = {
  target: browserTargetSchema.optional(),
  timeoutMs: timeout,
  text: z.string().max(INPUT_LIMITS.browserActionText),
  mode: z.enum(["replace", "append"]).optional(),
  submit: z.boolean().optional(),
};
const pressFields = { key: requiredString(128), target: browserTargetSchema.optional(), timeoutMs: timeout };
const hoverFields = { target: browserTargetSchema, timeoutMs: timeout };
const scrollFields = {
  target: browserTargetSchema.optional(),
  deltaX: z.number().min(-100_000).max(100_000).optional(),
  deltaY: z.number().min(-100_000).max(100_000).optional(),
  timeoutMs: timeout,
};
const selectOptionFields = { ...hoverFields, values: z.array(z.string().max(1_000)).min(1).max(100) };
const setCheckedFields = { ...hoverFields, checked: z.boolean() };
const waitForFields = {
  target: browserTargetSchema.optional(),
  text: requiredString(2_000).optional(),
  url: requiredString(INPUT_LIMITS.browserUrl).optional(),
  state: z.enum(["load", "domcontentloaded", "dom-quiet"]).optional(),
  timeoutMs: timeout,
};
const evaluateFields = {
  expression: z
    .string()
    .min(1)
    .max(64_000)
    .refine((value) => value.trim().length > 0, {
      message: "expression must not be blank",
    }),
  awaitPromise: z.boolean().optional(),
  timeoutMs: timeout,
};

export const BROWSER_SCRIPT_MAX_STEPS = 200;
const BROWSER_SCRIPT_MAX_CHARS = 20_000;
export const BROWSER_SCRIPT_DEFAULT_TIMEOUT_MS = 60_000;
const BROWSER_SCRIPT_MAX_TIMEOUT_MS = 120_000;

const browserStepSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("navigate"), ...navigateFields }),
  z.strictObject({ action: z.literal("click"), ...clickFields }),
  z.strictObject({ action: z.literal("type"), ...typeFields }),
  z.strictObject({ action: z.literal("press"), ...pressFields }),
  z.strictObject({ action: z.literal("hover"), ...hoverFields }),
  z.strictObject({ action: z.literal("scroll"), ...scrollFields }),
  z.strictObject({ action: z.literal("select_option"), ...selectOptionFields }),
  z.strictObject({ action: z.literal("set_checked"), ...setCheckedFields }),
  z.strictObject({ action: z.literal("wait_for"), ...waitForFields }),
  z.strictObject({ action: z.literal("evaluate"), ...evaluateFields }),
  z.strictObject({ action: z.literal("snapshot") }),
]);

export type BrowserStep = z.infer<typeof browserStepSchema>;

/** Steps from a `run_script` sandbox are untrusted values, so each one is decoded before it runs. */
export function parseBrowserStep(value: unknown): BrowserStep {
  const result = browserStepSchema.safeParse(value);
  if (!result.success) throw new Error(`Invalid browser step: ${z.prettifyError(result.error)}`);
  return result.data;
}

const BROWSER_TOOL_DEFINITIONS = [
  browserTool({
    name: "open",
    description: "Open an HTTP(S) URL in a new tab.",
    shape: { url: requiredString(INPUT_LIMITS.browserUrl) },
  }),
  browserTool({
    name: "list_tabs",
    description: "List the browser tabs of this agent, with popup openerTabId and blocked-popup feedback.",
    shape: {},
  }),
  browserTool({
    name: "status",
    description: "Get tabs, control state, environments, recordings and error counts.",
    shape: {},
  }),
  browserTool({
    name: "snapshot",
    description:
      "Read the page as one line per element (ref, role, name, tag, value, states) and get refs, valid until a navigation or the next snapshot. Viewport text comes first; truncated is true when content was left out: scroll or wait_for text to read more. An image may come separately. diagnostics and actions list only new entries.",
    shape: { tabId, image },
  }),
  browserTool({
    name: "submit_secret",
    description:
      "Ask the user for the secret of the active sign-in step, found in a fresh snapshot: a password, an email or SMS code, or an authenticator code. The user authorizes one fill-and-submit to the shown HTTPS origin. Never pass a secret as an argument. Use request_takeover when the method or code length is unclear.",
    shape: {
      tabId,
      method: z
        .enum(["password", "otp", "authenticator"])
        .describe("password; otp for a numeric email or SMS code; authenticator for an app code."),
      targets: z
        .array(browserTargetSchema)
        .min(1)
        .max(12)
        .describe("The active step only: one field, or all digit fields in order. Fresh refs; no username fields."),
      digits: z
        .number()
        .int()
        .min(0)
        .max(12)
        .default(6)
        .describe("Code length, 4–12, from the page. Omit for a password."),
      submission: z
        .enum(["click", "enter", "on_input"])
        .describe(
          "click with submitTarget for a Continue, Verify, Next or Sign in button; enter for Enter; on_input only fills, for a site that submits on the last digit.",
        ),
      submitTarget: browserTargetSchema.optional().describe("Required with click: the button, from the same snapshot."),
      loginId: identifier.optional().describe("A saved login from list_logins: OpenBot fills its password or code."),
      username: z
        .string()
        .max(VAULT_TEXT_LIMIT)
        .optional()
        .describe("For a password without loginId: the username typed on the page. A saved password keeps it."),
    },
  }),
  browserTool({
    name: "list_logins",
    description:
      "List 1Password, Bitwarden and OpenBot Vault logins for the tab's HTTPS site: id, title, username, hasOneTimePassword. No secrets. Type the username, then call submit_secret with loginId.",
    shape: { tabId },
  }),
  browserTool({
    name: "list_vault_items",
    description:
      "List what the user saved in the OpenBot Vault (not 1Password or Bitwarden): logins (id, website, username), cards (id, label, nameOnCard, brand, last4, expiry, hasSecurityCode) and contacts (every field). Passwords, card numbers and security codes are never returned. addedBy names the agent that added an item.",
    shape: {},
  }),
  browserTool({
    name: "save_vault_item",
    description:
      "Add contact info to the Vault, or change an item: a contact without id is new. A login or card needs its id from list_vault_items. A login changes only its username, a card only non-secret fields; you cannot set passwords, websites, card numbers or security codes. Omitted fields keep their value. Returns id, kind and name.",
    shape: {
      kind: z.enum(["contact", "login", "card"]),
      id: identifier.optional().describe("The item to change. Omit it to add a contact."),
      label: vaultText.describe("Contact or card: a short name."),
      ...vaultContactShape,
      username: vaultText.describe("Login: the username or email."),
      nameOnCard: vaultText,
      expMonth: z.number().int().min(1).max(12).optional(),
      expYear: z.number().int().min(2000).max(2099).optional(),
      billingContactId: identifier.nullable().optional().describe("Card: the id of its billing contact, or null."),
    },
  }),
  browserTool({
    name: "request_vault_item",
    description:
      'Ask the user to add a login, card or contact to the Vault, and wait. A chat card opens the Vault form with the fields you give; the user types the secrets. Use it when list_vault_items lacks an item the task needs. Returns {"status":"saved","id","kind","name"}, skipped or expired.',
    shape: {
      kind: z.enum(UI_VAULT_REQUEST_KINDS),
      title: requiredString(UI_BLOCK_LIMITS.title).describe("What the item is for."),
      label: vaultText.describe("Contact or card: a short name."),
      ...vaultContactShape,
      website: vaultText.describe("Login: the HTTPS website."),
      username: vaultText.describe("Login: the username or email."),
      nameOnCard: vaultText,
      expMonth: z.number().int().min(1).max(12).optional(),
      expYear: z.number().int().min(2000).max(2099).optional(),
    },
  }),
  browserTool({
    name: "delete_vault_item",
    description:
      "Delete a Vault item by its id from list_vault_items. This cannot be undone: ask first unless you added it or the user asked.",
    shape: { id: identifier },
  }),
  browserTool({
    name: "fill_card",
    description:
      "Type a saved card from list_vault_items into card fields from one fresh snapshot: the number, and optionally the security code, expiry (one field, or month and year) and name on the card, on the page or in an HTTPS payment frame. You never see the number or code. Does not submit. The first fill of a card on a site waits for the owner's approval. Returns the filled field names and a fresh snapshot.",
    shape: {
      tabId,
      cardId: identifier,
      targets: z
        .strictObject({
          number: browserTargetSchema,
          securityCode: browserTargetSchema.optional(),
          expiry: browserTargetSchema.optional().describe("One field for month and year, such as MM/YY."),
          expMonth: browserTargetSchema.optional(),
          expYear: browserTargetSchema.optional(),
          nameOnCard: browserTargetSchema.optional(),
        })
        .refine((targets) => !(targets.expiry && (targets.expMonth || targets.expYear)), {
          message: "Use expiry, or expMonth and expYear, not both.",
        }),
      timeoutMs: timeout,
    },
  }),
  browserTool({
    name: "request_link_payment",
    description:
      "Pay with the user's Link account. The user approves one payment in Link; the call waits up to 5 minutes and returns the cardId of a one-time card for fill_card. Call it once per purchase, with the final total.",
    shape: {
      amount: z
        .number()
        .int()
        .positive()
        .max(100_000_000)
        .describe("The total in the smallest currency unit, such as cents."),
      currency: z
        .string()
        .regex(/^[A-Za-z]{3}$/)
        .optional()
        .describe("ISO 4217 code. Default: the currency of the Link card."),
      merchantName: requiredString(200),
      merchantUrl: requiredString(2048).refine((value) => URL.canParse(value) && new URL(value).protocol === "https:", {
        message: "Use the https address of the merchant's site.",
      }),
      context: z
        .string()
        .trim()
        .min(100)
        .max(2000)
        .describe("What you buy, the quantity, and why. The user reads it in Link."),
    },
  }),
  browserTool({
    name: "request_takeover",
    description:
      "Ask the user to take over a tab for an unclear account choice, CAPTCHA, passkeys, payment confirmation such as 3-D Secure, or when secure handoff or card fill is unavailable.",
    shape: {
      tabId,
      reason: z
        .enum(BROWSER_TAKEOVER_REASONS)
        .optional()
        .describe("sign-in-blocked: the site refused the sign-in from the browser's network address."),
    },
  }),
  browserTool({
    name: "navigate",
    description:
      "Navigate to an HTTP(S) URL, history entry, or reload, wait for the page to settle, and return a fresh snapshot.",
    shape: { tabId, ...navigateFields },
  }),
  browserTool({
    name: "click",
    description: `Click a unique semantic, CSS, ref or coordinate target. ${ACTION_RESULT}`,
    shape: { tabId, ...clickFields, snapshot: actionSnapshot },
  }),
  browserTool({
    name: "type",
    description: `Enter text in a unique target. ${ACTION_RESULT} With no target the text goes as keystrokes to the focused element, for apps that draw their own surface, such as a canvas spreadsheet: click the cell first; a tab moves to the next column and a newline commits the row. mode applies only to an element target.`,
    shape: { tabId, ...typeFields, snapshot: actionSnapshot },
  }),
  browserTool({
    name: "fill_fields",
    description:
      "Replace 1–16 main-frame text fields from one fresh snapshot, 16 KiB in total. Does not submit; refuses password, code and payment fields. Returns one final snapshot. A partial result lists confirmed and uncertain indices: do not retry.",
    shape: {
      tabId,
      revision,
      fields: z
        .array(z.strictObject({ ref: identifier, text: z.string().max(BROWSER_FILL_FIELDS_MAX_TEXT_BYTES) }))
        .min(1)
        .max(BROWSER_FILL_FIELDS_MAX_FIELDS)
        .refine((fields) => new Set(fields.map((field) => field.ref)).size === fields.length, "Duplicate field refs.")
        .refine(
          (fields) =>
            fields.reduce((bytes, field) => bytes + new TextEncoder().encode(field.text).byteLength, 0) <=
            BROWSER_FILL_FIELDS_MAX_TEXT_BYTES,
          "Combined field text exceeds 16 KiB UTF-8.",
        ),
      timeoutMs: z.number().int().min(1).max(BROWSER_FILL_FIELDS_MAX_TIMEOUT_MS).optional(),
    },
  }),
  browserTool({
    name: "press",
    description: `Press a key or shortcut, such as Enter or Control+A. ${ACTION_RESULT}`,
    shape: { tabId, ...pressFields, snapshot: actionSnapshot },
  }),
  browserTool({
    name: "hover",
    description: `Hover a unique target. ${ACTION_RESULT}`,
    shape: { tabId, ...hoverFields, snapshot: actionSnapshot },
  }),
  browserTool({
    name: "scroll",
    description: `Scroll the page or a container by pixels. ${ACTION_RESULT}`,
    shape: { tabId, ...scrollFields, snapshot: actionSnapshot },
  }),
  browserTool({
    name: "select_option",
    description: `Select native select options by value or label. ${ACTION_RESULT}`,
    shape: { tabId, ...selectOptionFields, snapshot: actionSnapshot },
  }),
  browserTool({
    name: "set_checked",
    description: `Set a checkbox or radio. ${ACTION_RESULT}`,
    shape: { tabId, ...setCheckedFields, snapshot: actionSnapshot },
  }),
  browserTool({
    name: "drag",
    description: `Drag from one unique target to another. ${ACTION_RESULT}`,
    shape: {
      tabId,
      source: browserTargetSchema,
      target: browserTargetSchema,
      timeoutMs: timeout,
      snapshot: actionSnapshot,
    },
  }),
  browserTool({
    name: "upload_files",
    description: `Set local files on a file input or the chooser a click opens. ${ACTION_RESULT}`,
    shape: {
      ...targetAction,
      paths: z.array(z.string().min(1).max(INPUT_LIMITS.path)).min(1).max(INPUT_LIMITS.attachments),
    },
  }),
  browserTool({
    name: "wait_for",
    description: "Wait for a URL, text, target, load state or DOM quiet, then return a fresh snapshot.",
    shape: { tabId, ...waitForFields },
  }),
  browserTool({
    name: "evaluate",
    description:
      "Evaluate JavaScript in the main frame's page context, with the page's own access. Prefer snapshots and actions; use it for inspection or unsupported interactions. Returns a JSON value up to 64 KB.",
    shape: { tabId, ...evaluateFields },
  }),
  browserTool({
    name: "set_environment",
    description: "Set the viewport, color scheme and reduced-motion emulation.",
    shape: {
      tabId,
      preset: z.enum(["fill", "desktop", "tablet", "mobile", "custom"]).optional(),
      width: z.number().int().min(320).max(INPUT_LIMITS.browserDimension).optional(),
      height: z.number().int().min(240).max(INPUT_LIMITS.browserDimension).optional(),
      deviceScaleFactor: z.number().min(0.5).max(4).optional(),
      colorScheme: z.enum(["light", "dark", "system"]).optional(),
      reducedMotion: z.boolean().optional(),
    },
  }),
  browserTool({
    name: "recording_start",
    description: "Start a video-only WebM recording of a tab. It stops after 5 minutes or 100 MB.",
    shape: { tabId },
  }),
  browserTool({
    name: "recording_stop",
    description: "Stop a tab recording and return its saved path.",
    shape: { tabId },
  }),
  browserTool({
    name: "act",
    description: "Legacy: click, type, press, scroll, history or reload. Prefer the specific tools.",
    shape: {
      tabId,
      revision,
      action: legacyActionSchema,
    },
  }),
  browserTool({
    name: "screenshot",
    description:
      "Capture the visible page as an image. With a ref, capture only that element: a smaller image costs less context.",
    shape: { tabId, ref: identifier.optional() },
  }),
  browserTool({
    name: "run_script",
    description:
      "Run a short JavaScript program that drives one tab in one call and returns one final snapshot. Use it for a known sequence or a loop, such as paging until a condition holds. It runs in an isolated sandbox with no network, files, require or process, and awaits these helpers: navigate(url), click(target, options?), type(target, text, options?), press(key, target?), hover(target), scroll(deltaY, target?), selectOption(target, values), setChecked(target, checked), waitFor(condition, text or function), evaluate(expression or function), snapshot(), step({ action, ...fields }). A target is a CSS selector, role(role, name?), text(text) or a target object. A failed helper throws; steps before it stay done. log(...values) adds to the log. Return a JSON value. At most 200 steps; timeoutMs defaults to 60 s.",
    shape: {
      tabId,
      script: requiredString(BROWSER_SCRIPT_MAX_CHARS),
      finalSnapshot: z.boolean().optional(),
      timeoutMs: z.number().int().min(1_000).max(BROWSER_SCRIPT_MAX_TIMEOUT_MS).optional(),
    },
  }),
  browserTool({
    name: "handle_dialog",
    description:
      "Answer the dialog that your action opened: accept true is OK, false is Cancel. Returns the next dialog or the page status.",
    shape: { tabId, dialogId: identifier, accept: z.boolean() },
  }),
  browserTool({
    name: "close_tab",
    description: "Close a browser tab.",
    shape: { tabId },
  }),
] as const;

export const BROWSER_DYNAMIC_TOOLS = [
  {
    type: "namespace" as const,
    name: OPENBOT_BROWSER_NAMESPACE,
    description: "Operate OpenBot's private, persistent native Electron/CDP browser.",
    tools: BROWSER_TOOL_DEFINITIONS.map((definition) => ({
      type: "function" as const,
      name: definition.name,
      description: definition.description,
      inputSchema: advertisedJsonSchema(definition.schema),
    })),
  },
];

export type BrowserToolCall = ReturnType<(typeof BROWSER_TOOL_DEFINITIONS)[number]["parse"]>;
export type BrowserToolArguments<Name extends BrowserToolCall["tool"]> = Extract<
  BrowserToolCall,
  { tool: Name }
>["args"];

export function parseBrowserToolCall(tool: string, value: unknown): BrowserToolCall {
  const definition = BROWSER_TOOL_DEFINITIONS.find((candidate) => candidate.name === tool);
  if (!definition) throw new Error(`Unknown browser tool: ${tool}`);
  return definition.parse(value);
}

// Upload staging parses the same arguments before it resolves and authorizes local files.
export function parseBrowserToolArguments(tool: "upload_files", value: unknown): BrowserToolArguments<"upload_files">;
export function parseBrowserToolArguments(tool: string, value: unknown): BrowserToolCall["args"];
export function parseBrowserToolArguments(tool: string, value: unknown): BrowserToolCall["args"] {
  return parseBrowserToolCall(tool, value).args;
}
