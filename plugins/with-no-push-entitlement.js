/**
 * Strip the remote-push entitlement that expo-notifications injects.
 *
 * The expo-notifications config plugin unconditionally adds `aps-environment`
 * for remote push. This app only ever raises LOCAL notifications, so the
 * entitlement declares a capability that is never used.
 *
 * Originally this was a hard blocker: a free Personal Team cannot sign the
 * Push Notifications capability at all. The account is now a paid membership,
 * so signing would succeed — but the entitlement is still removed, because
 * declaring an unused capability invites avoidable App Review questions about
 * why the app requests remote push it never sends.
 *
 * Why a config plugin instead of a post-prebuild script:
 * `scripts/strip-aps-entitlement.mjs` edits ios/ after the fact, so it only
 * works on code paths that remember to run it. `npx expo run:ios` on a repo
 * with no ios/ directory triggers an implicit prebuild that reintroduces the
 * entitlement AFTER the script has already no-opped. Removing it here means it
 * can never be reintroduced, whichever path generates ios/.
 *
 * ⚠️ MUST be listed FIRST in app.json `plugins`, before "expo-notifications".
 * This is counter-intuitive: Expo composes entitlement mods so the most
 * recently registered plugin's action runs FIRST and then delegates down the
 * chain. Registering first therefore means running LAST — after
 * expo-notifications has added the key, which is the only point where deleting
 * it does anything. Verified empirically: listed last, this plugin sees only
 * the two HealthKit keys and the delete is a no-op.
 *
 * If someone reorders app.json plugins, this silently stops working and iOS
 * signing fails again. Guard: after `npm run prebuild`, grep the generated
 * entitlements under ios/ for "aps-environment" — it must return no matches.
 *
 * Drop this plugin if the project ever moves to a paid team and uses real
 * remote push.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withNoPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
