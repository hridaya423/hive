import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";

export const CAUSE_CODES = [
  "invalid_upload_request",
  "authentication",
  "permission",
  "rate_limit",
  "usage_limit",
  "billing",
  "network",
  "timeout",
  "stalled",
  "storage",
  "not_found",
  "conflict",
  "provider_unavailable",
  "context_too_long",
  "model_not_found",
  "invalid_request",
  "content_blocked",
  "turn_limit",
  "empty_answer",
  "provider_internal_error",
  "provider_exited",
  "attachment_type_unsupported",
  "attachment_too_large",
  "attachment_upload_failed",
  "cancelled",
  "unknown",
] as const;

export type CauseCode = (typeof CAUSE_CODES)[number];

export function isCauseCode(value: unknown): value is CauseCode {
  return CAUSE_CODES.some((code) => code === value);
}

const STRUCTURED_CAUSES: Readonly<Record<string, CauseCode>> = {
  invalid_upload_request: "invalid_upload_request",
  usageLimitExceeded: "usage_limit",
  contextWindowExceeded: "context_too_long",
  context_length_exceeded: "context_too_long",
  invalid_request_error: "invalid_request",
  model_not_found: "model_not_found",
  unauthorized: "authentication",
  authentication_error: "authentication",
  rate_limit_exceeded: "rate_limit",
  rate_limit_error: "rate_limit",
  rateLimitExceeded: "rate_limit",
  serverOverloaded: "provider_unavailable",
  internalServerError: "provider_unavailable",
  flexUnavailable: "provider_unavailable",
  insufficient_quota: "billing",
  ECONNREFUSED: "network",
  ECONNRESET: "network",
  ENOTFOUND: "network",
  ETIMEDOUT: "timeout",
  ENOSPC: "storage",
  EACCES: "permission",
  ENOENT: "not_found",
  EPIPE: "provider_exited",
  ABORT_ERR: "cancelled",
};

/** Inspect locally. The result is always a fixed code, never part of the input. */
export function classifyFailure(error: unknown): CauseCode {
  const record = isDynamicRecord(error) ? error : undefined;
  for (const key of [record?.codexErrorInfo, record?.code]) {
    if (isCauseCode(key)) return key;
    if (typeof key === "string" && Object.hasOwn(STRUCTURED_CAUSES, key)) return STRUCTURED_CAUSES[key] ?? "unknown";
    if (isDynamicRecord(key)) {
      const cause = codexFailureCause(key);
      if (cause) return cause;
    }
  }
  if (isDynamicRecord(record?.error)) {
    const nested = classifyFailure(record.error);
    if (nested !== "unknown") return nested;
  }
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : record?.message;
  if (typeof message !== "string") return "unknown";
  if (/\binvalid upload request\b/iu.test(message)) return "invalid_upload_request";
  // The limit and outage rules come first, so a text that names a limit and a size, such as "rate
  // limit: too many tokens per minute", keeps the cause that a backup model can pass.
  if (
    /\b(?:401 unauthorized|invalid[ _]api[ _]key|api key not valid|API_KEY_INVALID|not authenticated|UNAUTHENTICATED|authentication failed|authentication_error|token (?:has )?expired|sign in again|log in again)\b/iu.test(
      message,
    )
  )
    return "authentication";
  // Google's 429 is RESOURCE_EXHAUSTED.
  if (
    /\b(?:rate[ _-]?limit(?:ed|ing|_error|_exceeded)?|too many requests|RESOURCE_EXHAUSTED|resource has been exhausted)\b/iu.test(
      message,
    )
  )
    return "rate_limit";
  if (
    /\b(?:insufficient[ _](?:funds|balance|quota|credits?)|payment required|payment (?:is )?past due|credits? (?:exhausted|depleted)|out of credits|no Copilot plan|not authorized to use this Copilot feature)\b/iu.test(
      message,
    )
  )
    return "billing";
  // Claude Code names a spent spend cap "You've hit your monthly spend limit" (#8998).
  if (
    /\b(?:usage limit|hit your (?:weekly |session |\d+-hour )?limit|hit your (?:[\w']+ ){0,2}spend limit|quota (?:exceeded|reached|exhausted)|free[ _-]usage[ _-]exhausted|key limit exceeded)\b/iu.test(
      message,
    )
  )
    return "usage_limit";
  if (/\b(?:timed? out|ETIMEDOUT|gateway time-?out|deadline exceeded|DEADLINE_EXCEEDED)\b/iu.test(message))
    return "timeout";
  // A tool's MCP server that does not connect is not a provider network failure.
  if (
    /\b(?:fetch failed|failed to fetch|network request failed|connection error|socket hang up|stream disconnected|error sending request|(?:unable to|failed to|could not|cannot) connect(?!\s+to\s+(?:the\s+)?MCP\b)|ECONNRESET|ECONNREFUSED|ECONNABORTED|ENOTFOUND|EAI_AGAIN)\b/iu.test(
      message,
    )
  )
    return "network";
  if (/\b(?:ENOSPC|SQLITE_FULL|disk full)\b/iu.test(message)) return "storage";
  if (/\b(?:EACCES|permission denied|403 forbidden)\b/iu.test(message)) return "permission";
  // An outage: Claude's "API Error: 529 … overloaded_error", OpenAI's "server_error", Google's
  // UNAVAILABLE status in capitals, or a 5xx status that the text names as a status.
  if (
    /\b(?:service unavailable|bad gateway|internal server error|overloaded(?:_error)?|server_error|api_error|server had an error|high demand|temporarily unavailable|upstream connect error)\b/iu.test(
      message,
    ) ||
    /\bUNAVAILABLE\b/u.test(message) ||
    /\b(?:API Error|status(?: code)?|HTTP(?:\/[\d.]+)?)\W{0,4}5\d\d\b/iu.test(message)
  )
    return "provider_unavailable";
  // Before the status: a 400 or 413 that names the context is a context that is too long. "Too many
  // tokens, please wait" is Vertex's rate limit.
  if (
    /\b(?:context[ _-]?(?:length|window)[ _-]?exceeded|context[ _-]overflow|maximum context length|prompt is too long|too many (?:input )?tokens(?![^.]{0,40}\b(?:wait|per (?:minute|second|day)))|input token count\b.{0,80}\bexceeds)\b/iu.test(
      message,
    )
  )
    return "context_too_long";
  // OpenRouter's 403: "<model> requires moderation. Your input was flagged for …".
  if (/\b(?:content[ _-]?filter(?:ed)?|requires moderation|was flagged|safety (?:filter|block))\b/iu.test(message))
    return "content_blocked";
  if (
    /\b(?:model[ _]not[ _]found|unknown model|no such model|not a valid model|no endpoints found|model\b[^.,;:\n]{0,60}\b(?:not found|does not exist|is not supported))\b/iu.test(
      message,
    )
  )
    return "model_not_found";
  if (/\b(?:empty response|no visible content|reasoning_only)\b/iu.test(message)) return "empty_answer";
  if (/\b(?:turn|request|operation) (?:was )?cancell?ed\b/iu.test(message)) return "cancelled";
  // A status that the text names as a status, such as "(status 402)" or "HTTP 413". Status 0 only
  // counts in structured data: "exited with status 0" is not a network failure.
  const status = /\b(?:API Error|status(?: code)?|HTTP(?:\/[\d.]+)?)\W{0,4}([1-4]\d\d)\b/iu.exec(message)?.[1];
  const statusCause = status === undefined ? null : httpStatusCause(Number(status));
  if (statusCause) return statusCause;
  if (/\b(?:invalid[ _]request(?:_error)?|bad request|INVALID_ARGUMENT)\b/iu.test(message)) return "invalid_request";
  return "unknown";
}

/**
 * The cause of an HTTP status that a provider answered with, or `null` for a status that names none.
 * Status 0 is a request that got no answer.
 */
export function httpStatusCause(status: number): CauseCode | null {
  if (status === 0) return "network";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 401) return "authentication";
  if (status === 402) return "billing";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 408 || status === 504) return "timeout";
  if (status === 409) return "conflict";
  if (status === 413) return "context_too_long";
  if (status === 429) return "rate_limit";
  return status >= 500 && status <= 599 ? "provider_unavailable" : null;
}

/** Causes that say only that the provider refused a request, not why. */
const REFUSAL_CAUSES: ReadonlySet<CauseCode> = new Set(["invalid_request", "permission", "not_found"]);

/**
 * The cause that a structured field names, such as an HTTP status or an error name, else the cause
 * of the text. A field that says only that the request was refused yields to a text that says why,
 * such as a 400 for a context that is too long or a 403 for a flagged input.
 */
export function structuredCause(structured: CauseCode | null, text: CauseCode): CauseCode {
  if (!structured || (text !== "unknown" && REFUSAL_CAUSES.has(structured))) return text;
  return structured;
}

/**
 * Codex names a failed connection, a broken stream or a spent retry budget as an object, with the last
 * HTTP status when the provider answered. No status means that the provider did not answer. Any other
 * 4xx is a request that each model can refuse, so the message decides.
 */
function codexFailureCause(info: DynamicRecord): CauseCode | null {
  const failure = [
    "httpConnectionFailed",
    "responseStreamConnectionFailed",
    "responseStreamDisconnected",
    "responseTooManyFailedAttempts",
  ]
    .map((key) => info[key])
    .find(isDynamicRecord);
  if (!failure) return null;
  const status = failure.httpStatusCode;
  if (typeof status !== "number") return "network";
  if (status === 429) return "rate_limit";
  if (status === 401) return "authentication";
  if (status === 408) return "timeout";
  return status >= 500 ? "provider_unavailable" : null;
}
