const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// @generated with-release-signing";

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes(MARKER)) return config;
    config.modResults.contents += `
${MARKER}
def hiveKeystore = System.getenv("HIVE_ANDROID_KEYSTORE")
if (hiveKeystore) {
    def hivePassword = new File(System.getenv("HIVE_ANDROID_KEYSTORE_PASSWORD_FILE")).text.trim()
    android.signingConfigs.create("hiveRelease") {
        storeFile = new File(hiveKeystore)
        storePassword = hivePassword
        keyAlias = "hive"
        keyPassword = hivePassword
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.hiveRelease
}
`;
    return config;
  });
