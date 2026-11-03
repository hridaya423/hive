import { defineMessages } from "../../message";

/**
 * The public web pages that do one task: join a server, return from Slack or Discord, return from
 * billing, report a hosted site, and the load error page. `apps/auth-api` renders
 * them on the server in the visitor's language.
 */
export const messages = defineMessages("sitePage", {
  "sitePage.error.title": "This page could not load",
  "sitePage.error.body":
    "Check your connection and reload the page. If it still does not load, go back to the home page.",
  "sitePage.error.reload": "Reload page",
  "sitePage.error.home": "Back to home",
  "sitePage.join.title": "Join a Hive server",
  "sitePage.join.description": "Open a private server invitation in Hive.",
  "sitePage.join.eyebrow": "Private invitation",
  "sitePage.join.intro":
    "Open this invitation in Hive. The app checks the server and asks you to confirm before it connects.",
  "sitePage.join.invalid":
    "This invitation link is not valid or is not complete. Ask the server owner for a new invitation.",
  "sitePage.join.open": "Open Hive",
  // {browser} and {download} are links. Their text is browserLink and downloadLink.
  "sitePage.join.noApp": "No app? {browser} or {download}.",
  "sitePage.join.noAppMobile": "No app? {browser}.",
  "sitePage.join.browserLink": "Join in this browser",
  "sitePage.join.downloadLink": "download Hive",
  // {open} is the label of the button that did not open OpenBot.
  "sitePage.join.notOpened":
    "If Hive is on this computer, start it, then press {open} again. If it is not, download it first.",
  // {open} is the label of the button above this note.
  "sitePage.join.mobile": "If Hive is installed, tap {open}. You can also paste this link into Add server in the app.",
  "sitePage.join.email": "If the invitation came by email, sign in to Hive with that email address.",
  // {name} is Slack or Discord on all the connect keys.
  "sitePage.connect.title": "Return to Hive",
  "sitePage.connect.failedTitle": "The connection did not finish",
  "sitePage.connect.openApp": "Open Hive",
  "sitePage.connect.tryAgainApp": "Try again in Hive",
  "sitePage.connect.tryAgainBrowser": "Try again in browser",
  "sitePage.connect.doneInWebClient": "Your Hive tab finishes the {name} connection. You can close this tab.",
  "sitePage.connect.doneInApp": "Hive finishes the {name} connection on your computer.",
  "sitePage.connect.failure.cancelled": "The {name} connection was cancelled. Nothing changed.",
  "sitePage.connect.failure.expired": "The {name} sign-in expired. Start the connection again.",
  "sitePage.connect.failure.exchange": "{name} did not confirm the connection. Try again.",
  "sitePage.connect.failure.enterprise": "Connect one Slack workspace, not a whole organization.",
  "sitePage.connect.failure.takenSlack":
    "Another Hive server already answers this Slack workspace. Disconnect it on that server, then try again.",
  "sitePage.connect.failure.takenDiscord":
    "Another Hive server already answers this Discord server. Disconnect it on that server, then try again.",
  "sitePage.connect.failure.unavailable": "Hive cannot connect to {name} now. Try again later.",
  "sitePage.connect.failure.tabClosed":
    "The Hive tab that started the {name} connection did not answer. Open Hive in your browser and connect {name} again.",
  "sitePage.connect.failure.failed": "{name} did not finish the connection. Try again.",
  // {marketplace}, {apps} and {connect} are the names of these screens and that button in the app.
  "sitePage.connect.restartHint": "In Hive, open {marketplace}, then {apps}, then {name}, and select {connect}.",
  "sitePage.connect.notOpened":
    "Start Hive, then try again. If Hive is not on this computer, download it and connect {name} from the app.",
  "sitePage.openApp.title": "Nothing opened?",
  "sitePage.openApp.dismiss": "Not now",
  // {platform} is macOS, Windows or Linux.
  "sitePage.marketplace.downloadFor": "Download for {platform}",
});
