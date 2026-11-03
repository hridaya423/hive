import type { AppTranslate, TranslatedLocale } from "@openbot/i18n";
import { appLanguageOption } from "@openbot/i18n/languages";

/** The text of one page in one language. Loader data carries it from the server to the browser. */
export interface PageText<Text> {
  /** The `lang` attribute of the page content. */
  lang: string;
  /** The catalog that the text came from. A page that renders catalog text in components gives it to `TextProvider`. */
  locale: TranslatedLocale;
  text: Text;
}

/**
 * Builds the text of a page in `locale`. A route loader calls it, so the server renders the text,
 * and hydration reads the same text from the loader data.
 */
export async function loadPageText<Text>(
  locale: TranslatedLocale,
  build: (t: AppTranslate) => Text,
): Promise<PageText<Text>> {
  const { translateFor } = await import("@openbot/i18n");
  return { lang: appLanguageOption(locale).lang ?? locale, locale, text: build(translateFor(locale)) };
}
