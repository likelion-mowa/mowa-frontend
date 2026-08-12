/**
 * Pin the Xcode signing team into the generated project.
 *
 * `expo prebuild --clean` regenerates ios/ from scratch on every run, which
 * discards the Development Team selected in Xcode's Signing & Capabilities
 * tab. Without this plugin, every clean rebuild reverts to "no team" and
 * `expo run:ios` either prompts or fails to sign.
 *
 * This is a paid Apple Developer Program Individual membership. It started as
 * a free Personal Team and kept the same Team ID through the upgrade, so this
 * constant did not change — profiles simply went from 7-day to 1-year validity,
 * and TestFlight / App Store submission became possible.
 *
 * To build under a different Apple account, change DEVELOPMENT_TEAM to your
 * own team ID (Xcode > Settings > Accounts, or `security find-identity -v
 * -p codesigning`).
 */
const { withXcodeProject } = require('expo/config-plugins');

const DEVELOPMENT_TEAM = 'X4RZSKR6X3';

module.exports = function withDevelopmentTeam(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(buildConfigs)) {
      const entry = buildConfigs[key];
      // Skip the comment entries pbxproj interleaves with real records.
      if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;

      const settings = entry.buildSettings;
      // Only touch app targets; Pods targets have no product bundle id.
      if (!settings.PRODUCT_BUNDLE_IDENTIFIER) continue;

      settings.DEVELOPMENT_TEAM = DEVELOPMENT_TEAM;
      settings.CODE_SIGN_STYLE = 'Automatic';
    }

    return cfg;
  });
};
