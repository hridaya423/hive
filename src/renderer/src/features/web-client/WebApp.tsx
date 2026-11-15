import { agentTemplateIdFromWebAppSearch, WEB_APP_AGENT_TEMPLATE_PARAM } from "@openbot/contracts/agent-template-links";
import { DEFAULT_APP_LANGUAGE } from "@openbot/contracts/app-language";
import { companySignInErrorKey, WEB_APP_COMPANY_SIGN_IN_ERROR_PARAM } from "@openbot/contracts/company-sign-in";
import { type FirstTouch, readFirstTouch } from "@openbot/contracts/first-touch";
import { inviteUrlFromWebAppSearch, WEB_APP_INVITE_FIELDS } from "@openbot/contracts/invite-links";
import { type AppVariant, type CentralAuthState, type CentralAuthUser, isAvatarColor } from "@openbot/contracts/ipc";
import {
  type MarketplaceListingLink,
  marketplaceListingFromWebAppSearch,
  WEB_APP_MARKETPLACE_AGENT_PARAM,
  WEB_APP_MARKETPLACE_SKILL_PARAM,
} from "@openbot/contracts/marketplace-links";
import { pluginSlugFromWebAppSearch, WEB_APP_PLUGIN_PARAM } from "@openbot/contracts/plugin-links";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { formatLocale, resolveLocale } from "@openbot/i18n";
import { sourceText } from "@openbot/i18n/source";
import { markRemoteSync } from "@openbot/team-client/sync-profile";
import { Toaster, toast } from "@openbot/ui";
import { AccountLogin } from "@openbot/ui/features/account/AccountLogin";
import { AppLoadingScreen } from "@openbot/ui/features/account/AppLoadingScreen";
import { currentText } from "@openbot/ui/text";
import { Dynamic } from "@solidjs/web";
import { createSignal, createStore, onSettled, Show } from "solid-js";
import { StaticI18nProvider } from "../../i18n-context";
import { deleteRemoteWorkspaceFrames } from "../servers/remote-workspace-frame";
import type { WebWorkspace } from "./WebWorkspace";
import { deleteSavedAgentPictures } from "./web-agent-pictures";
import { createWebAppearancePreference } from "./web-appearance-preference";
import type { WebRuntimeFactory } from "./web-client-context";

/**
 * The workspace is its own chunk, so the sign-in screen does not wait for it. Each session check
 * starts it beside the session request; a signed-in account waits for both. A failed import is
 * tried again on the next check.
 */
let workspaceImport: Promise<typeof WebWorkspace> | null = null;
function loadWorkspace(): Promise<typeof WebWorkspace> {
  if (!workspaceImport) {
    workspaceImport = import("./WebWorkspace").then((module) => module.WebWorkspace);
    workspaceImport.catch(() => {
      workspaceImport = null;
    });
  }
  return workspaceImport;
}

/** A sign-in refusal that the login form already shows. */
class SignInIssueShown extends Error {}

/** The email signs in with the company's provider, not with an email code. */
class CompanySignInRequired extends Error {}

/**
 * The error code of a company sign-in that came back without a session, from
 * `/app?companySignInError=<code>`. The query is removed after it is read.
 */
function takeCompanySignInError(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get(WEB_APP_COMPANY_SIGN_IN_ERROR_PARAM);
  if (code === null) return null;
  url.searchParams.delete(WEB_APP_COMPANY_SIGN_IN_ERROR_PARAM);
  window.history.replaceState(window.history.state, "", url);
  return code;
}

/** The email start answered that the company's provider signs this email in. */
const COMPANY_SIGN_IN = Symbol("company sign-in");

function companySignInIssue(code: string) {
  return { code, message: sourceText(companySignInErrorKey(code)) };
}

/**
 * The shared agent a `/app?agent=<id>` link names. The query is removed after it is read, so a reload
 * does not open the preview again.
 */
function takeAgentTemplateLink(): string | null {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(WEB_APP_AGENT_TEMPLATE_PARAM)) return null;
  const id = agentTemplateIdFromWebAppSearch(url.search);
  url.searchParams.delete(WEB_APP_AGENT_TEMPLATE_PARAM);
  window.history.replaceState(window.history.state, "", url);
  return id;
}

/**
 * The invitation a `/app?api=…&server=…&fingerprint=…&invite=…` link names, as the `/join` page
 * passes it on. The fields are removed after they are read, so the secret does not stay in the
 * address bar or the history, and a reload does not open the dialog again.
 */
function takeInviteLink(): string | null {
  const url = new URL(window.location.href);
  if (!WEB_APP_INVITE_FIELDS.some((field) => url.searchParams.has(field))) return null;
  const inviteUrl = inviteUrlFromWebAppSearch(url.search, { allowLocalDevelopmentApiUrl: import.meta.env.DEV });
  for (const field of WEB_APP_INVITE_FIELDS) url.searchParams.delete(field);
  window.history.replaceState(window.history.state, "", url);
  return inviteUrl;
}

/** The plugin listing a `/app?plugin=<slug>` link names. The query is removed after it is read. */
function takePluginLink(): string | null {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(WEB_APP_PLUGIN_PARAM)) return null;
  const slug = pluginSlugFromWebAppSearch(url.search);
  url.searchParams.delete(WEB_APP_PLUGIN_PARAM);
  window.history.replaceState(window.history.state, "", url);
  return slug;
}

/**
 * The agent or skill a `/app?marketplaceAgent=<id>` or `/app?marketplaceSkill=<slug>` link names.
 * The query is removed after it is read.
 */
function takeMarketplaceLink(): MarketplaceListingLink | null {
  const url = new URL(window.location.href);
  const params = [WEB_APP_MARKETPLACE_AGENT_PARAM, WEB_APP_MARKETPLACE_SKILL_PARAM];
  if (!params.some((param) => url.searchParams.has(param))) return null;
  const link = marketplaceListingFromWebAppSearch(url.search);
  for (const param of params) url.searchParams.delete(param);
  window.history.replaceState(window.history.state, "", url);
  return link;
}

export function WebApp(props: { createRuntime?: WebRuntimeFactory } = {}) {
  // This component renders the text provider, so it reads the text of the last provider that rendered.
  const text = currentText();
  const [state, setState] = createStore<{
    account: CentralAuthUser | null;
    loaded: boolean;
    login: CentralAuthState;
    resendAt: number;
  }>({
    account: null,
    loaded: false,
    login: { status: "signed_out" },
    resendAt: 0,
  });
  const [agentTemplateId, setAgentTemplateId] = createSignal(takeAgentTemplateLink());
  const [inviteUrl, setInviteUrl] = createSignal(takeInviteLink());
  const [pluginSlug, setPluginSlug] = createSignal(takePluginLink());
  const [marketplaceListing, setMarketplaceListing] = createSignal(takeMarketplaceLink());
  /** Shown after the first session check, because its 401 resets the login state. */
  let companySignInReturnError = takeCompanySignInError();
  const [workspace, setWorkspace] = createSignal<typeof WebWorkspace>();
  /** Sets the account when the workspace code is ready to show it. */
  async function showAccount(account: CentralAuthUser) {
    const view = await loadWorkspace();
    setWorkspace(() => view);
    return account;
  }
  // The loading screen stays over the app until its exit ends.
  const [loadingShown, setLoadingShown] = createSignal(true);
  let channel: BroadcastChannel | null = null;
  let disposed = false;
  let sessionGeneration = 0;
  /**
   * The cookie's account session has ended. The server ended its remote sessions in the same write
   * (`endAccountSession`), so the closing workspace does not end them again.
   */
  let sessionEnded = false;
  function clearSession(ended = true) {
    sessionEnded = ended;
    // The saved workspace frames name the agents of the account's servers.
    if (ended) {
      deleteRemoteWorkspaceFrames(null);
      void deleteSavedAgentPictures(null);
    }
    sessionGeneration += 1;
    setState((draft) => {
      draft.account = null;
      draft.login = { status: "signed_out" };
    });
  }
  const accountFetch: typeof fetch = async (input, init) => {
    const generation = sessionGeneration;
    const response = await fetch(input, init);
    if (
      !disposed &&
      generation === sessionGeneration &&
      response.status === 401 &&
      input !== "/api/browser/email/start" &&
      input !== "/api/browser/email/verify" &&
      input !== "/api/browser/company/start"
    ) {
      if (state.account) channel?.postMessage("session-changed");
      clearSession();
    }
    return response;
  };
  async function request(
    path: string,
    body?:
      | { email: string }
      | { challengeId: string | null; code: string; firstTouch?: FirstTouch }
      | Record<string, never>,
  ) {
    const response = await accountFetch(`/api/browser/${path}`, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json", "X-OpenBot-Browser": "1" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await response.json();
    if (!response.ok) {
      if (
        path === "email/start" &&
        isDynamicRecord(value) &&
        isDynamicRecord(value.error) &&
        value.error.code === "company_sign_in_required"
      )
        throw new CompanySignInRequired();
      if (path === "email/start" || path === "email/verify") {
        const retryAfterSeconds = Number.parseInt(response.headers.get("Retry-After") ?? "", 10);
        const issue = {
          code:
            isDynamicRecord(value) && isDynamicRecord(value.error) && isString(value.error.code)
              ? value.error.code
              : "sign_in_failed",
          message:
            isDynamicRecord(value) && isDynamicRecord(value.error) && isString(value.error.message)
              ? value.error.message
              : text.t("webClient.login.failed"),
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        };
        setState((draft) => {
          draft.login = draft.login.status === "code_sent" ? { ...draft.login, issue } : { status: "error", issue };
        });
        throw new SignInIssueShown();
      }
      throw new Error(
        isDynamicRecord(value) && isDynamicRecord(value.error) && isString(value.error.message)
          ? value.error.message
          : text.t("webClient.login.requestFailed"),
      );
    }
    return value;
  }
  /** Like the desktop login, a server refusal is shown as the login issue, not also as a thrown error. */
  async function signInRequest(path: "email/start" | "email/verify", body: Parameters<typeof request>[1]) {
    try {
      return await request(path, body);
    } catch (error) {
      if (error instanceof SignInIssueShown) return null;
      throw error;
    }
  }
  function accountFrom(value: unknown): CentralAuthUser {
    if (
      !isDynamicRecord(value) ||
      !isDynamicRecord(value.user) ||
      !isString(value.user.id) ||
      !isString(value.user.email)
    )
      throw new Error(text.t("webClient.login.accountInvalid"));
    return {
      id: value.user.id,
      email: value.user.email,
      name: isString(value.user.name) ? value.user.name : null,
      avatarUrl: isString(value.user.avatarUrl) ? value.user.avatarUrl : null,
      chatColor: isAvatarColor(value.user.chatColor) ? value.user.chatColor : null,
    };
  }
  async function checkSession() {
    const generation = sessionGeneration;
    // The workspace code loads beside the session check, not after it.
    void loadWorkspace().catch(() => undefined);
    try {
      const session = await request("session");
      markRemoteSync("session");
      const account = await showAccount(accountFrom(session));
      markRemoteSync("workspace-code");
      if (!disposed && generation === sessionGeneration) {
        sessionEnded = false;
        setState((draft) => {
          draft.account = account;
        });
      }
    } catch (error) {
      if (!disposed && generation === sessionGeneration) {
        // Signed in, the workspace stays usable. Signed out, the login screen offers a retry, as on desktop.
        if (state.account)
          toast.error(
            text.sourceText(error instanceof Error ? error.message : text.t("webClient.login.sessionFailed")),
          );
        else
          setState((draft) => {
            draft.login = {
              status: "error",
              issue: { code: "auth_api_unavailable", message: sourceText("error.auth.serviceUnavailable") },
            };
          });
      }
    } finally {
      const returnError = companySignInReturnError;
      companySignInReturnError = null;
      if (!disposed)
        setState((draft) => {
          draft.loaded = true;
          if (returnError !== null && !draft.account && draft.login.status === "signed_out")
            draft.login = { status: "error", issue: companySignInIssue(returnError) };
        });
    }
  }
  async function start(email: string) {
    if (Date.now() < state.resendAt) throw new Error(text.t("webClient.login.wait"));
    const value = await signInRequest("email/start", { email }).catch((error: unknown) => {
      if (error instanceof CompanySignInRequired) return COMPANY_SIGN_IN;
      throw error;
    });
    if (value === COMPANY_SIGN_IN) return openCompanySignIn(email);
    if (value === null) return;
    if (!isDynamicRecord(value) || !isString(value.challengeId) || typeof value.resendAt !== "number")
      throw new Error(text.t("webClient.login.responseInvalid"));
    const challengeId = value.challengeId;
    const resendAt = value.resendAt;
    setState((draft) => {
      draft.resendAt = resendAt;
      draft.login = {
        status: "code_sent",
        challengeId,
        email,
        expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : Date.now() + 600000,
        resendAvailableAt: resendAt,
        ...(isString(value.developmentCode) ? { developmentCode: value.developmentCode } : {}),
      };
    });
  }
  /**
   * Goes to the company's sign-in page in this tab. The account service sends the browser back to
   * `/app` with the session cookie, or with `companySignInError`.
   */
  async function openCompanySignIn(email: string) {
    setState((draft) => {
      draft.login = { status: "company_sign_in", email };
    });
    const response = await accountFetch("/api/browser/company/start", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-OpenBot-Browser": "1" },
      body: JSON.stringify({ email }),
    });
    const value = await response.json().catch(() => null);
    if (response.ok && isDynamicRecord(value) && isString(value.authorizationUrl)) {
      window.location.assign(value.authorizationUrl);
      return;
    }
    const code =
      isDynamicRecord(value) && isDynamicRecord(value.error) && isString(value.error.code)
        ? value.error.code
        : "company_sign_in_failed";
    setState((draft) => {
      draft.login = { status: "company_sign_in", email, issue: companySignInIssue(code) };
    });
  }
  async function verify(challengeId: string, code: string) {
    // The first website visit of this browser, so that reports can name the source of a new account.
    const firstTouch = readFirstTouch(() => window.localStorage, Date.now());
    const value = await signInRequest("email/verify", { challengeId, code, ...(firstTouch ? { firstTouch } : {}) });
    if (value === null) return;
    const account = accountFrom(value);
    sessionGeneration += 1;
    sessionEnded = false;
    channel?.postMessage("session-changed");
    try {
      await showAccount(account);
    } catch {
      // The server has used the code and set the session, so the retry checks the session again.
      setState((draft) => {
        draft.login = {
          status: "error",
          issue: { code: "auth_api_unavailable", message: sourceText("error.auth.serviceUnavailable") },
        };
      });
      return;
    }
    setState((draft) => {
      draft.account = account;
    });
  }
  async function logout() {
    await request("logout", {});
    clearSession();
    channel?.postMessage("session-changed");
  }
  onSettled(() => {
    channel = new BroadcastChannel("openbot.web.session");
    channel.onmessage = () => {
      clearSession();
      void checkSession();
    };
    void checkSession();
    // A page restored from the back-forward cache still has its session; its connection ends normally.
    // A browser also sends `pageshow` after a normal load, which can come after the session check.
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      clearSession(false);
      void checkSession();
    };
    window.addEventListener("pageshow", restore);
    return () => {
      disposed = true;
      channel?.close();
      window.removeEventListener("pageshow", restore);
    };
  });
  const variant: AppVariant = import.meta.env.DEV ? "dev" : "production";
  const appearancePreference = createWebAppearancePreference();
  return (
    <StaticI18nProvider
      locale={resolveLocale(DEFAULT_APP_LANGUAGE, navigator.language)}
      formatLocale={formatLocale(DEFAULT_APP_LANGUAGE, navigator.language)}
    >
      <div class="web-app">
        <Toaster />
        <Show when={state.loaded}>
          <Show
            keyed
            when={state.account?.id}
            fallback={
              <AccountLogin
                variant={variant}
                state={state.login}
                onRetry={checkSession}
                onRequestEmailCode={start}
                onVerifyEmailCode={verify}
                onOpenCompanySignIn={() =>
                  state.login.status === "company_sign_in" ? openCompanySignIn(state.login.email) : Promise.resolve()
                }
                onReset={async () => {
                  clearSession();
                  setState((draft) => {
                    draft.resendAt = 0;
                  });
                }}
              />
            }
          >
            {(accountId) => (
              <Dynamic
                component={workspace()}
                accountId={accountId}
                accountEmail={state.account?.email ?? ""}
                accountName={state.account?.name ?? null}
                accountAvatarUrl={state.account?.avatarUrl ?? null}
                accountChatColor={state.account?.chatColor ?? null}
                accountFetch={accountFetch}
                onSessionCheck={checkSession}
                accountSessionEnded={() => sessionEnded}
                onLogout={logout}
                createRuntime={props.createRuntime}
                agentTemplateId={agentTemplateId()}
                onAgentTemplateClose={() => setAgentTemplateId(null)}
                inviteUrl={inviteUrl()}
                onInviteClose={() => setInviteUrl(null)}
                pluginSlug={pluginSlug()}
                onPluginSlugConsumed={() => setPluginSlug(null)}
                marketplaceListing={marketplaceListing()}
                onMarketplaceListingConsumed={() => setMarketplaceListing(null)}
                appearance={appearancePreference.appearance()}
                onChangeAppearance={appearancePreference.setAppearance}
              />
            )}
          </Show>
        </Show>
        <Show when={loadingShown()}>
          <AppLoadingScreen
            ready={state.loaded}
            onExited={() => {
              setLoadingShown(false);
              void loadWorkspace().catch(() => undefined);
            }}
          />
        </Show>
      </div>
    </StaticI18nProvider>
  );
}
