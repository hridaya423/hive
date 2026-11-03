import { Linking } from "react-native";
import { showFailureAlert } from "@/features/analytics/failure-reports";
import { haptics } from "@/shared/lib/haptics";
import { currentText } from "@/shared/lib/text";
import type { DictationNotice } from "../model/voice-dictation";

export function showNotice(notice: DictationNotice, error?: unknown): void {
  void haptics.notification("error");
  const { t } = currentText();
  showFailureAlert(
    error,
    "voice",
    t(notice.title),
    t(notice.message),
    notice.openSettings
      ? [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("mobile.chat.dictation.openSettings"), onPress: () => void Linking.openSettings() },
        ]
      : undefined,
  );
}
