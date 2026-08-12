import ExpoModulesCore
import CoreMotion
import UIKit

/**
 * Walk detection module — STUB.
 *
 * This session only establishes the JS <-> Swift surface. There is no detection
 * logic here yet: `start`/`stop` flip a flag, `queryHistory` returns a canned
 * row, and `emitTestEvent` fires a synthetic event.
 *
 * The real implementation drops into this module next session as
 * `WalkDetectorCore.swift`, wired through `OnStartObserving` below. CoreMotion
 * is imported here only for availability checks and to raise the permission
 * prompt — not to detect anything.
 */
public class WalkDetectorModule: Module {
  private let activityManager = CMMotionActivityManager()
  private var isRunning = false

  public func definition() -> ModuleDefinition {
    Name("WalkDetector")

    Events("onWalkDetected")

    // Fires when the first JS listener attaches. F1 will subscribe
    // WalkDetectorCore here and forward its callbacks via sendEvent.
    OnStartObserving("onWalkDetected") {
      // intentionally empty until F1
    }

    // Fires when the last JS listener detaches.
    OnStopObserving("onWalkDetected") {
      // intentionally empty until F1
    }

    AsyncFunction("start") { (promise: Promise) in
      self.isRunning = true

      guard CMMotionActivityManager.isActivityAvailable() else {
        // Simulator, or a device without a motion coprocessor.
        promise.resolve(false)
        return
      }

      // CoreMotion has no explicit permission-request API. Issuing a query IS
      // the prompt — this call is what makes the "Motion & Fitness" dialog
      // appear on first launch.
      self.activityManager.queryActivityStarting(
        from: Date().addingTimeInterval(-60),
        to: Date(),
        to: .main
      ) { _, _ in
        promise.resolve(true)
      }
    }

    AsyncFunction("stop") { () -> Bool in
      self.isRunning = false
      self.activityManager.stopActivityUpdates()
      return true
    }

    AsyncFunction("queryHistory") { (sinceMs: Double) -> [[String: Any]] in
      // STUB: one deterministic row so the bridge has a visible, assertable
      // return value. Replaced by CMMotionActivityManager.queryActivityStarting
      // results in the F1 session.
      return [
        [
          "id": "stub-0",
          "startedAtMs": sinceMs,
          "endedAtMs": sinceMs + 600_000,
          "steps": 742,
          "source": "stub",
        ]
      ]
    }

    AsyncFunction("getDiagnostics") { () -> [String: Any] in
      #if targetEnvironment(simulator)
        let isSimulator = true
      #else
        let isSimulator = false
      #endif

      return [
        "isPedometerAvailable": CMPedometer.isStepCountingAvailable(),
        "isActivityAvailable": CMMotionActivityManager.isActivityAvailable(),
        "motionAuthorization": Self.motionAuthorizationLabel(),
        "systemVersion": UIDevice.current.systemVersion,
        "isSimulator": isSimulator,
        "isRunning": self.isRunning,
      ]
    }

    AsyncFunction("emitTestEvent") { () -> Bool in
      // Proves Events / sendEvent / the JS listener path all work end to end,
      // so that "detection fires but JS never hears it" is not a possible
      // failure mode to debug later.
      let now = Date().timeIntervalSince1970 * 1000
      self.sendEvent(
        "onWalkDetected",
        [
          "id": UUID().uuidString,
          "startedAtMs": now,
          "endedAtMs": NSNull(),
          "steps": 0,
          "source": "stub",
        ]
      )
      return true
    }

    OnDestroy {
      self.activityManager.stopActivityUpdates()
    }
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
