import ExpoModulesCore
import CoreMotion
import UIKit

/**
 * Expo module wrapper around `WalkDetectorCore`.
 *
 * The Core does the detecting and posts the local notification itself; this
 * wrapper only maps the repo's TS contract (start/stop/queryHistory/
 * getDiagnostics/emitTestEvent + onWalkDetected) onto the Core's API and
 * mirrors state to JS. The Core callbacks `onStepUpdate` and `onDeepLink` are
 * left unattached on purpose — the TS contract has no matching event, and taps
 * reach JS through expo-notifications instead (src/adapters/notifications).
 */
public class WalkDetectorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WalkDetector")

    Events("onWalkDetected")

    // Attach the Core callback when the first JS listener arrives. Detection
    // itself keeps running with no listener; JS just stops hearing about it.
    OnStartObserving("onWalkDetected") {
      WalkDetectorCore.shared.onWalkDetected = { [weak self] event in
        self?.sendEvent("onWalkDetected", Self.toWalkEventPayload(event))
      }
    }

    OnStopObserving("onWalkDetected") {
      WalkDetectorCore.shared.onWalkDetected = nil
    }

    AsyncFunction("start") { (mechanism: String?, promise: Promise) in
      // CLLocationManager wants a run-loop thread and AsyncFunction bodies run
      // on a background queue, so hop to main before touching the Core.
      DispatchQueue.main.async {
        // nil = layered (keepalive live detector + observer safety net), the
        // verified product configuration since 2026-08-13. Explicit single
        // mechanisms remain for /debug measurement. An unknown string rejects
        // loudly — silently falling back would run a mechanism the caller
        // didn't ask for and mislabel any measurement.
        let selected: WalkDetectorCore.Mechanism
        if let raw = mechanism {
          guard let parsed = WalkDetectorCore.Mechanism(rawValue: raw) else {
            promise.reject("E_ENABLE", "unknown mechanism: \(raw)")
            return
          }
          selected = parsed
        } else {
          selected = .layered
        }
        // Inside enable(): for keepalive, startActivityUpdates IS the Motion &
        // Fitness prompt (CoreMotion has no permission API) and
        // requestAlwaysAuthorization raises the location prompt; the observer
        // path raises the HealthKit read sheet instead. Threshold/cooldown are
        // the measured defaults from the prior investigation. endDebounce is
        // how long the user must stay still before the walk counts as over —
        // 180 s absorbs a crosswalk wait (team decision 2026-08-13), and the
        // notification is delayed by exactly that much. deepLinkPath rides in
        // the notification payload; JS routes the tap to it (_layout.tsx).
        WalkDetectorCore.shared.enable(
          mechanism: selected,
          thresholdSteps: 30,
          cooldownSeconds: 300,
          endDebounceSeconds: 180,
          deepLinkPath: "/walk"
        ) { result in
          switch result {
          case .success:
            promise.resolve(true)
          case .failure(let error):
            // Reject rather than resolve(false): the JS adapter's try/catch
            // turns this into { ok: false, error } and /debug logs the reason.
            promise.reject("E_ENABLE", error.localizedDescription)
          }
        }
      }
    }

    AsyncFunction("stop") { (promise: Promise) in
      DispatchQueue.main.async {
        WalkDetectorCore.shared.disable()
        promise.resolve(true)
      }
    }

    AsyncFunction("queryHistory") { (sinceMs: Double, promise: Promise) in
      // liveEvents is only ever mutated on main; read it there too.
      DispatchQueue.main.async {
        let live = WalkDetectorCore.shared.liveEvents.filter {
          ($0["startedAtMs"] as? Double ?? 0) >= sinceMs
        }
        let since = Date(timeIntervalSince1970: sinceMs / 1000)
        WalkDetectorCore.shared.retrospectiveEvents(since: since) { retro in
          // A live event dominates any retro session it falls inside: retro
          // rows never carry step counts (CoreMotion history has none), so
          // drop a retro row when a live row started within its window.
          let deduped = retro.filter { row in
            guard let start = row["startedAtMs"] as? Double,
                  let end = row["endedAtMs"] as? Double else { return true }
            return !live.contains { liveRow in
              guard let liveStart = liveRow["startedAtMs"] as? Double else { return false }
              return liveStart >= start && liveStart <= end
            }
          }
          let merged = (live + deduped).map(Self.toWalkEventPayload).sorted {
            (($0["startedAtMs"] as? Double) ?? 0) > (($1["startedAtMs"] as? Double) ?? 0)
          }
          promise.resolve(merged)
        }
      }
    }

    AsyncFunction("getDiagnostics") { (promise: Promise) in
      DispatchQueue.main.async {
        #if targetEnvironment(simulator)
          let isSimulator = true
        #else
          let isSimulator = false
        #endif

        let status = WalkDetectorCore.shared.statusPayload()
        promise.resolve([
          "isPedometerAvailable": CMPedometer.isStepCountingAvailable(),
          "isActivityAvailable": CMMotionActivityManager.isActivityAvailable(),
          // Keep the local label helper: it has the 'unavailable' case that the
          // Core's statusPayload() cannot report.
          "motionAuthorization": Self.motionAuthorizationLabel(),
          "systemVersion": UIDevice.current.systemVersion,
          "isSimulator": isSimulator,
          "isRunning": WalkDetectorCore.shared.isEnabled,
          "mechanism": (status["mechanism"] as? String) ?? "none",
          "locationAuthorization": (status["locationAuthorization"] as? String) ?? "unknown",
          "warnings": (status["warnings"] as? [String]) ?? [],
          // Walk-session state, passed through verbatim: /debug is where a
          // silent detector has to explain itself.
          "activity": (status["activity"] as? String) ?? "-",
          "confidence": (status["confidence"] as? String) ?? "-",
          "currentSteps": (status["currentSteps"] as? Int) ?? 0,
          "walkActive": (status["walkActive"] as? Bool) ?? false,
          "walkStartedAtMs": status["walkStartedAtMs"] ?? NSNull(),
          "walkSteps": (status["walkSteps"] as? Int) ?? 0,
          "walkQualified": (status["walkQualified"] as? Bool) ?? false,
          "stationarySinceMs": status["stationarySinceMs"] ?? NSNull(),
          "endDebounceSeconds": (status["endDebounceSeconds"] as? Double) ?? 0,
          "lastActivityAtMs": status["lastActivityAtMs"] ?? NSNull(),
          "lastPedometerAtMs": status["lastPedometerAtMs"] ?? NSNull(),
        ] as [String: Any])
      }
    }

    AsyncFunction("emitTestEvent") { () -> Bool in
      // Goes through the same mapper as real detections, so this proves the
      // actual payload path — not a hand-built lookalike of it.
      let now = Date().timeIntervalSince1970 * 1000
      self.sendEvent(
        "onWalkDetected",
        Self.toWalkEventPayload([
          "id": UUID().uuidString,
          "startedAtMs": now,
          "endedAtMs": NSNull(),
          "steps": 0,
          "detection": "stub",
        ])
      )
      return true
    }

    // No OnDestroy: the Core is process-lifetime. Tearing it down here would
    // kill background detection on every Metro reload.
  }

  /// Core payloads say `detection`; the TS contract says `source`. One mapper
  /// for live events, history rows and the test event, so the shapes cannot
  /// drift apart per call site.
  private static func toWalkEventPayload(_ core: [String: Any]) -> [String: Any] {
    var payload = core
    let detection = payload.removeValue(forKey: "detection") as? String
    payload["source"] = detection ?? "live"
    return payload
  }

  private static func motionAuthorizationLabel() -> String {
    guard CMMotionActivityManager.isActivityAvailable() else { return "unavailable" }
    switch CMMotionActivityManager.authorizationStatus() {
    case .authorized: return "granted"
    case .denied, .restricted: return "denied"
    case .notDetermined: return "prompt"
    @unknown default: return "unknown"
    }
  }
}

/**
 * Background-relaunch recovery.
 *
 * When the system relaunches the app (significant location change), detection
 * must resume before — and regardless of whether — the JS bundle ever loads,
 * so the restore call lives in didFinishLaunching, not in module init or JS.
 * Registered via "appDelegateSubscribers" in expo-module.config.json; the
 * class and that registration must change together or the build breaks /
 * restore silently never runs.
 *
 * Deliberately does NOT touch UNUserNotificationCenter.delegate —
 * expo-notifications owns it, and notification authorization is requested from
 * JS (src/adapters/notifications). Tap responses reach JS through that adapter:
 * getLastNotificationResponse() for a cold-start tap plus a response listener
 * for a warm one, routed in src/app/_layout.tsx.
 */
public class WalkDetectorAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let launchedInBackground = application.applicationState == .background
    WalkDetectorCore.log.notice("did_finish_launching launchedInBackground=\(launchedInBackground)")
    WalkDetectorCore.shared.restoreIfNeeded()
    return true
  }
}
