import { Linking } from "react-native";
import { showFailureAlert } from "@/shared/lib/failure-alert";
import { haptics } from "@/shared/lib/haptics";
import { currentText } from "@/shared/lib/text";
import type { DictationNotice } from "../model/voice-dictation";

export function showDictationNotice(notice: DictationNotice, error?: unknown): void {
  void haptics.notification("error");
  const { t } = currentText();
  showFailureAlert(
    error,
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
