import type { TranslatedLocale } from "./locale";
import type { PartialTranslation } from "./message";
import { type AppMessages, en } from "./messages/en/index";

const catalogs = { en } as const;

/** The desktop catalog of `locale`. */
export function appTranslation(locale: TranslatedLocale): PartialTranslation<AppMessages> | undefined {
  return catalogs[locale];
}
