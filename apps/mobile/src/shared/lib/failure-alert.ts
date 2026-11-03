import { errorReference } from "@openbot/user-errors";
import { Alert, type AlertButton } from "react-native";
import { currentText } from "@/shared/lib/text";

export function showFailureAlert(error: unknown, ...args: Parameters<typeof Alert.alert>): void {
  const reference = errorReference(error);
  if (!reference) {
    Alert.alert(...args);
    return;
  }
  const [title, message, buttons, options] = args;
  const { t } = currentText();
  const code = t("error.reference.label", { code: reference });
  const kept: AlertButton[] = buttons?.length ? buttons : [{ text: t("common.close"), style: "cancel" }];
  const copy: AlertButton[] =
    kept.length < 3
      ? [
          {
            text: t("error.reference.copy"),
            onPress: () =>
              void import("expo-clipboard").then((clipboard) => clipboard.setStringAsync(reference)).catch(() => false),
          },
        ]
      : [];
  Alert.alert(title, message ? `${message}\n\n${code}` : code, [...kept, ...copy], options);
}
