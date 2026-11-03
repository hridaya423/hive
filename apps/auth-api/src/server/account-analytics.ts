import type { FirstTouch } from "@openbot/contracts/first-touch";

/** The client that verified the sign-in code that created the account. */
export type AccountSurface = "desktop" | "mobile" | "web";
/** Where the account service learned the first touch of an account. */
export type AttributionSource = "sign_in";

/** The kinds of email that the Worker sends through the shared SMTP mailbox. */
export type EmailKind = "sign_in_code" | "team_invite";
/** `unknown`: the server got the message but did not confirm it, so it can count against the quota. */
export type EmailResult = "accepted" | "rate_limited" | "unknown" | "failed";

type AccountAnalyticsEvent =
  | { name: "account_created"; surface: AccountSurface; firstTouch: FirstTouch | null }
  | { name: "account_attributed"; via: AttributionSource; firstTouch: FirstTouch }
  | { name: "email_sent"; kind: EmailKind; result: EmailResult };

/** Account events that only the Worker sees: new accounts and email sends. */
export interface AccountAnalytics {
  /**
   * Never throws and never waits: a failed send loses the event, not the request. `null` is for an
   * event with no account, such as `email_sent`: it has no `profileId`.
   */
  track(accountId: string | null, event: AccountAnalyticsEvent): void;
}

export const NO_ACCOUNT_ANALYTICS: AccountAnalytics = { track: () => undefined };
