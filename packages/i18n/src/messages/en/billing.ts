import { defineMessages } from "../../message";

export const messages = defineMessages("billing", {
  "billing.license.trial.until": "Free until {date}",
  "billing.license.starter.inUse": "{used} people use your servers. Starter is for 1 user.",
  "billing.license.change.more": { other: "More than {count}" },
  "billing.license.change.custom": "Custom",
  "billing.license.change.customDescription": {
    one: "For more than {count} user, we agree the price and the terms with you.",
    other: "For more than {count} users, we agree the price and the terms with you.",
  },
  // The order form: a hosted server and a license in one order. The pricing page and Billing show it.
  "billing.order.billing": "Billing period",
  "billing.order.currency": "Currency",
  "billing.order.monthly": "Monthly",
  "billing.order.yearly": "Yearly",
  // {percent} is a whole number, such as 20.
  "billing.order.yearlySaving": "−{percent}% yearly",
  "billing.order.server.title": "Hosted server",
  "billing.order.server.summary": "We run OpenBot for your team.",
  "billing.order.server.none": "No server",
  "billing.order.server.noneDetail": "Run OpenBot on your own computer",
  "billing.order.server.bestValue": "Best value",
  "billing.order.server.bestFor.starter": "Best for one person",
  "billing.order.server.bestFor.standard": "Best for a small team",
  "billing.order.server.bestFor.pro": "Best for heavy browser work",
  // {size} is a whole number of gigabytes.
  "billing.order.server.storage": "{size} GB storage",
  // {speed} is how many times faster than the Starter server, such as 2.
  "billing.order.server.speed": "{speed}× speed",
  "billing.order.license.title": "License",
  "billing.order.license.summary": "To use OpenBot at work.",
  "billing.order.license.none": "No license",
  "billing.order.license.noneDetail": "Personal and noncommercial use",
  "billing.order.license.starter": "Starter license",
  "billing.order.license.team": "Team license",
  // {percent} is a whole number, such as 20.
  "billing.order.license.bundleSaving": "−{percent}% with your server",
  // {included} is the number of members in the base price. {price} is the monthly price of one more member.
  "billing.order.license.teamDetail": "{included} included, +{price} for each more",
  "billing.order.license.serverMembers": {
    one: "Your server has {count} member",
    other: "Your server has {count} members",
  },
  "billing.order.license.members": "Team license members",
  "billing.order.license.fewer": "Fewer members",
  "billing.order.license.more": "More members",
  "billing.order.memberCount": { one: "{count} member", other: "{count} members" },
  "billing.order.summary.title": "Your plan",
  // {plan} is a server plan name, such as Standard.
  "billing.order.summary.server": {
    one: "{plan} server, {count} member",
    other: "{plan} server, up to {count} members",
  },
  "billing.order.summary.starterLicense": "Starter license, 1 member",
  "billing.order.summary.license": { one: "Team license, {count} member", other: "Team license, {count} members" },
  // {percent} is a whole number, such as 20.
  "billing.order.summary.yearlyDiscount": "Yearly discount ({percent}%)",
  "billing.order.summary.bundleDiscount": "Bundle discount",
  "billing.order.summary.personal": "Personal use on your own computer",
  "billing.order.summary.total": "Total",
  "billing.order.unit.month": "a month",
  "billing.order.unit.monthBilledYearly": "a month, billed yearly",
  // The unit beside the total for a visitor in the EU: the prices do not include VAT.
  "billing.order.unit.monthExclVat": "a month, excl. VAT",
  "billing.order.unit.monthBilledYearlyExclVat": "a month, billed yearly, excl. VAT",
  "billing.order.unit.free": "forever",
});
