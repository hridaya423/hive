import { AppLogo } from "@openbot/brand";
import { Link } from "@tanstack/solid-router";
import { ButtonLink } from "../ui/button";

export function SiteHeader() {
  return (
    <header class="landing-header" data-enter="header">
      <Link class="landing-brand" to="/app" reloadDocument aria-label="Hive web app">
        <AppLogo variant="production" class="landing-brand-logo" />
        <span>Hive</span>
      </Link>
      <div class="site-header-actions">
        <ButtonLink
          to="/app"
          reloadDocument
          variant="secondary"
          size="sm"
          icon="arrow-right"
          class="landing-button-glass site-header-secondary"
        >
          App
        </ButtonLink>
      </div>
    </header>
  );
}
