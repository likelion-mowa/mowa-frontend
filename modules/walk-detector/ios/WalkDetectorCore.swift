import Foundation
import CoreMotion
import CoreLocation
import HealthKit
import UserNotifications
import UIKit
import OSLog

/// F1 walk detection. **Deliberately bypasses JS entirely.**
///
/// Ported from ios-movement-test `hybrid/shared-ios/WalkDetectorCore.swift`
/// (commit 7fc8aed, 2026-08-09). The Korean body comments carry the measured
/// evidence behind every setting — preserve them when editing. Deliberate
/// divergences from the upstream file are marked inline with `MOWA:` comments;
/// everything else is verbatim.
///
/// Why detection AND notification posting both live in Swift: when the system
/// relaunches the app in the background, the JS bundle takes seconds to boot,
/// and iOS may reclaim execution time before any JS listener registers — the
/// notification would silently never fire. So the walk decision and the
/// UNUserNotificationCenter post happen entirely in native code, and the Expo
/// module (`WalkDetectorModule.swift`) is only a window that mirrors state to
/// JS. For the same reason, restore runs from
/// `application(_:didFinishLaunchingWithOptions:)` via WalkDetectorAppDelegate,
/// never from module init or JS.
///
/// Boundaries this repo draws around the Core:
/// - Notification **permission** is requested from JS (src/adapters/notifications);
///   the Core only posts. It never touches the UNUserNotificationCenter delegate
///   (expo-notifications owns it).
/// - `liveEvents` lives in process memory and resets on relaunch — acceptable:
///   the notification is the product path and `retrospectiveEvents` covers gaps.
/// - `onStepUpdate` / `onDeepLink` / `recordDeepLink` / `consumePendingDeepLink`
///   are ported but unwired — the TS contract has no matching surface yet.
final class WalkDetectorCore: NSObject {
    static let shared = WalkDetectorCore()

    static let log = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.example.movementtest",
        category: "f1-walk"
    )

    private enum Keys {
        static let enabled = "walk.enabled"
        static let mechanism = "walk.mechanism"
        static let threshold = "walk.thresholdSteps"
        static let cooldown = "walk.cooldownSeconds"
        // MOWA: stationary time that confirms a walk has ended (team decision
        // 2026-08-13: 180 s — long enough to absorb crosswalk waits).
        static let endDebounce = "walk.endDebounceSeconds"
        static let deepLinkPath = "walk.deepLinkPath"
        // MOWA: 설정 > 기록 제안 알림. Detection keeps running when this is off;
        // only the notification is withheld.
        static let notificationsEnabled = "walk.notificationsEnabled"
        static let lastNotifiedAt = "walk.lastNotifiedAt"
        // MOWA: safety-net dedupe watermark — steps with sample dates at or
        // before this instant were handled by the live layer or already
        // announced by the observer. Replaces the lastSeenSteps /
        // lastLiveNotifiedAt fire-time arbitration (2026-08-19): that scheme
        // compared the live notification against the PREVIOUS observer fire,
        // so any fire that learned nothing (locked-device read failure,
        // partial HealthKit commit) consumed the marker and let the same walk
        // notify twice. Orphaned values of the two retired keys on existing
        // installs are inert.
        static let stepsAccountedUntil = "walk.stepsAccountedUntil"
        // Diagnostic only (/debug "observer last fired") — not arbitration.
        static let lastObserverFiredAt = "walk.lastObserverFiredAt"
    }

    enum Mechanism: String {
        case coreLocationKeepAlive = "core-location-keepalive"
        case healthKitObserver = "healthkit-observer"
        // MOWA: keepalive as the live detector + observer as a missed-walk
        // safety net (2026-08-13 measurement: observer lags walk-end 7–18 min).
        case layered
        case none
    }

    // MARK: 상태

    private(set) var isEnabled = false
    private(set) var mechanism: Mechanism = .none
    private(set) var currentSteps = 0
    private(set) var lastActivityLabel = "-"
    private(set) var lastConfidenceLabel = "-"
    private(set) var liveEvents: [[String: Any]] = []

    /// 플러그인이 JS 로 이벤트를 올려보내기 위해 연결하는 콜백.
    /// 웹뷰가 없어도 감지는 계속 돌아야 하므로 **선택적**입니다.
    var onWalkDetected: (([String: Any]) -> Void)?
    var onStepUpdate: ((Int, Double?) -> Void)?
    var onDeepLink: (([String: Any]) -> Void)?

    /// 콜드스타트 레이스 대응 버퍼.
    /// 알림 탭 응답은 웹 번들 로드보다 먼저 도착하므로 여기에 담아뒀다가
    /// JS 가 `consumePendingDeepLink()` 로 꺼내갑니다.
    private var pendingDeepLink: [String: Any]?

    // MARK: 의존성

    // MOWA: var, not let — recreated on every start. See startMotionUpdates.
    private var pedometer = CMPedometer()
    private var activityManager = CMMotionActivityManager()
    private let locationManager = CLLocationManager()
    private let healthStore = HKHealthStore()
    private var observerQuery: HKObserverQuery?

    private var walkStartedAt: Date?
    private var walkBaselineSteps: Int?
    // MOWA: end-of-walk session state. The notification moved from the 30-step
    // threshold (early in the walk) to the debounced end, per the product flow
    // "걷기 종료 추정 → 기록 제안 Push 전송" (2026-08-13). `stationarySince` holds
    // the REAL stop moment (the activity row's startDate), not the debounce
    // expiry — the walk's end time must not include the 180 s wait.
    private var walkQualified = false
    private var stationarySince: Date?
    private var endDebounceWorkItem: DispatchWorkItem?
    private var lastDistanceMeters: Double?
    private var stepUpdatesActive = false
    // MOWA: sensor liveness, surfaced through statusPayload. Answering "is the
    // detector silent because nothing happened, or because a subscription
    // died?" used to need a root-only 300 MB device log archive (2026-08-14).
    private var lastActivityAt: Date?
    private var lastPedometerAt: Date?
    // MOWA: one-shot liveness markers so a dead CoreMotion subscription shows
    // in the log within seconds of the next walk instead of after a silent
    // 80-minute miss (2026-08-13).
    private var loggedFirstActivityCallback = false
    private var loggedFirstPedometerCallback = false

    var thresholdSteps: Int {
        get {
            let stored = UserDefaults.standard.integer(forKey: Keys.threshold)
            return stored > 0 ? stored : 30
        }
        set {
            UserDefaults.standard.set(newValue, forKey: Keys.threshold)
            Self.log.notice("threshold_steps=\(newValue)")
        }
    }
    var cooldownSeconds: TimeInterval {
        get {
            let stored = UserDefaults.standard.double(forKey: Keys.cooldown)
            return stored > 0 ? stored : 300
        }
        set {
            UserDefaults.standard.set(newValue, forKey: Keys.cooldown)
            Self.log.notice("cooldown_seconds=\(newValue)")
        }
    }
    var endDebounceSeconds: TimeInterval {
        get {
            let stored = UserDefaults.standard.double(forKey: Keys.endDebounce)
            return stored > 0 ? stored : 180
        }
        set {
            UserDefaults.standard.set(newValue, forKey: Keys.endDebounce)
            Self.log.notice("end_debounce_seconds=\(newValue)")
        }
    }
    private var deepLinkPath: String {
        UserDefaults.standard.string(forKey: Keys.deepLinkPath) ?? "/walk"
    }
    /// 미설정이면 true. `bool(forKey:)` alone would read a missing key as false
    /// and silently mute every existing install and every fresh one, which is
    /// exactly the silent-failure class this module is written to avoid.
    var notificationsEnabled: Bool {
        get {
            guard UserDefaults.standard.object(forKey: Keys.notificationsEnabled) != nil else {
                return true
            }
            return UserDefaults.standard.bool(forKey: Keys.notificationsEnabled)
        }
        set {
            UserDefaults.standard.set(newValue, forKey: Keys.notificationsEnabled)
            Self.log.notice("notifications_enabled=\(newValue)")
        }
    }

    private override init() {
        super.init()
        locationManager.delegate = self
    }

    // MARK: 활성화

    func enable(
        mechanism: Mechanism,
        thresholdSteps: Int,
        cooldownSeconds: Double,
        endDebounceSeconds: Double,
        deepLinkPath: String,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        UserDefaults.standard.set(thresholdSteps, forKey: Keys.threshold)
        UserDefaults.standard.set(cooldownSeconds, forKey: Keys.cooldown)
        UserDefaults.standard.set(endDebounceSeconds, forKey: Keys.endDebounce)
        UserDefaults.standard.set(deepLinkPath, forKey: Keys.deepLinkPath)

        // MOWA: restoreIfNeeded re-arms the persisted mechanism at every launch,
        // so a previous one may still be running here. Two sensor sets at once
        // produced double notifications in the 2026-08-13 measurement — every
        // enable starts from silence.
        stopSensors()

        // MOWA: one runloop tick between teardown and the new subscription. On
        // 2026-08-13 a same-tick stop→start left activity delivery dead for an
        // entire 80-min walk (2,097 locations flowed, zero CoreMotion
        // callbacks) — suspected motiond-side ordering race; unproven, so this
        // is paired with the liveness notices in startMotionUpdates.
        DispatchQueue.main.async { [weak self] in
            self?.startSelectedMechanism(mechanism, completion: completion)
        }
    }

    private func startSelectedMechanism(
        _ mechanism: Mechanism,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        switch mechanism {
        case .coreLocationKeepAlive:
            guard CMMotionActivityManager.isActivityAvailable() else {
                completion(.failure(DetectorError.unavailable(
                    "CMMotionActivityManager.isActivityAvailable() == false — 시뮬레이터에는 모션 코프로세서가 없습니다. 실물 iPhone 이 필요합니다."
                )))
                return
            }
            startCoreLocationKeepAlive()
            persist(enabled: true, mechanism: .coreLocationKeepAlive)
            completion(.success(()))

        case .healthKitObserver:
            enableHealthKitObserver(finalMechanism: .healthKitObserver, completion: completion)

        case .layered:
            // MOWA: keepalive detects live; the observer only backstops walks
            // the keepalive missed (arbitration in handleObserverFired).
            guard CMMotionActivityManager.isActivityAvailable() else {
                completion(.failure(DetectorError.unavailable(
                    "CMMotionActivityManager.isActivityAvailable() == false — 시뮬레이터에는 모션 코프로세서가 없습니다. 실물 iPhone 이 필요합니다."
                )))
                return
            }
            startCoreLocationKeepAlive()
            // Persist the working half first: if the observer part fails below,
            // a relaunch restores keepalive-only instead of nothing.
            persist(enabled: true, mechanism: .coreLocationKeepAlive)
            enableHealthKitObserver(finalMechanism: .layered) { result in
                if case .failure(let error) = result {
                    // Keepalive stays up; reject so /debug shows the truth.
                    Self.log.error("layered_degraded observer_failed=\(error.localizedDescription, privacy: .public)")
                }
                completion(result)
            }

        case .none:
            completion(.failure(DetectorError.unavailable("메커니즘을 선택하세요.")))
        }
    }

    private func startCoreLocationKeepAlive() {
        // ⚠️ Info.plist 의 위치 설명 키 두 개가 모두 있어야 동작합니다.
        // 하나라도 없으면 아무 에러 없이 조용히 무시되고, 설치당 1회라 재시도하려면
        // 앱을 지웠다 다시 설치해야 합니다.
        locationManager.requestAlwaysAuthorization()

        // ⚠️ UIBackgroundModes 에 location 이 없으면 이 줄이 앱을 즉시 종료시킵니다.
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        locationManager.showsBackgroundLocationIndicator = false
        // ⚠️ 이 두 줄이 F1 의 성패를 가릅니다. 값을 낮추면 배터리는 아끼지만 상주가 깨집니다.
        //
        // "위치 값은 안 쓰니 정확도를 최대한 낮추면 된다" 는 직관이 틀렸습니다. iOS 는
        // 앱이 위치를 **실제로 소비하는지** 를 보고 백그라운드 실행을 허용하는데, 저정확도
        // 요청은 셀타워 기반 저전력 경로로 처리되어 앱을 깨워둘 이유가 되지 못합니다.
        //
        // 실측 (iPhone 16 Pro / iOS 26.5.2, S2 = 홈으로 나간 뒤 화면잠금, 실내 보행):
        //
        //   변형 A  3km + distanceFilter 500m
        //     백그라운드 위치 전달 0건 · walk_detected 0건 · 포그라운드 이탈 후 4~11초에 서스펜드
        //     → 500m 를 이동하지 않으면 didUpdateLocations 가 아예 호출되지 않는다
        //
        //   변형 B  3km + distanceFilter None
        //     백그라운드 위치 전달 7건 · walk_detected 0건 · active 9 / suspended 8 로 번갈아
        //     → 위치는 오지만 상주가 유지되지 않아 CoreMotion 콜백이 흐르지 않는다
        //     → 앱을 여는 순간 쌓인 496 걸음이 한꺼번에 도착하고 그제야 알림이 발송된다
        //
        //   변형 C  10m + distanceFilter None   ← 지금 값
        //     실제 GPS 세션을 만들어 상주를 유지하려는 시도. 배터리 비용이 가장 큰 설정이다.
        //
        // ⚠️ keepalive_tick 로그의 부재를 근거로 쓰지 마세요. 그건 log.debug 라 아카이브에
        //    보존되지 않습니다. 판단은 locationd 의 "Sending location to client" 건수와
        //    RBSProcessState 의 running-suspended 전환으로 하세요.
        locationManager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        locationManager.distanceFilter = kCLDistanceFilterNone
        locationManager.startUpdatingLocation()
        // 시스템이 앱을 종료시켰을 때 다시 띄우기 위한 보험.
        locationManager.startMonitoringSignificantLocationChanges()

        startMotionUpdates()

        isEnabled = true
        mechanism = .coreLocationKeepAlive
        Self.log.notice("enabled mechanism=core-location-keepalive")
    }

    private func startMotionUpdates() {
        // MOWA: fresh instances per start. Reusing one manager across
        // stop/start cycles is a known source of silently-dead CoreMotion
        // subscriptions, and a stale daemon-side client is one candidate for
        // the 2026-08-13 silent 80-min walk. This also intentionally drops any
        // startStepUpdates subscription — that path is unwired from TS.
        activityManager.stopActivityUpdates()
        activityManager = CMMotionActivityManager()
        pedometer.stopUpdates()
        pedometer = CMPedometer()
        loggedFirstActivityCallback = false
        loggedFirstPedometerCallback = false
        Self.log.notice("motion_updates_started")

        activityManager.startActivityUpdates(to: .main) { [weak self] activity in
            guard let self, let activity else { return }
            if !self.loggedFirstActivityCallback {
                self.loggedFirstActivityCallback = true
                Self.log.notice("motion_first_callback source=activity")
            }
            self.handleActivity(activity)
        }

        guard CMPedometer.isStepCountingAvailable() else { return }
        pedometer.startUpdates(from: Date()) { [weak self] data, _ in
            guard let self, let data else { return }
            let steps = data.numberOfSteps.intValue
            let distance = data.distance?.doubleValue
            DispatchQueue.main.async {
                if !self.loggedFirstPedometerCallback {
                    self.loggedFirstPedometerCallback = true
                    Self.log.notice("motion_first_callback source=pedometer")
                }
                self.handlePedometer(steps: steps, distance: distance)
            }
        }
    }

    // MARK: 판정

    private func handleActivity(_ activity: CMMotionActivity) {
        lastActivityAt = Date()
        let labels = [
            activity.walking ? "walking" : nil,
            activity.running ? "running" : nil,
            activity.stationary ? "stationary" : nil,
            activity.automotive ? "automotive" : nil,
        ].compactMap { $0 }
        lastActivityLabel = labels.isEmpty ? "unknown" : labels.joined(separator: "+")

        switch activity.confidence {
        case .low: lastConfidenceLabel = "low"
        case .medium: lastConfidenceLabel = "medium"
        case .high: lastConfidenceLabel = "high"
        @unknown default: lastConfidenceLabel = "?"
        }

        // ⚠️ CMMotionActivity 의 플래그들은 상호배타가 아니고 전부 false 일 수도 있습니다.
        // confidence 로 거르지 않으면 차 안에서 "걷고 있습니다!" 알림이 날아갑니다.
        let isWalking = activity.walking && !activity.automotive && activity.confidence != .low

        if isWalking {
            if walkStartedAt == nil {
                walkStartedAt = Date()
                walkBaselineSteps = currentSteps
                walkQualified = false
                lastDistanceMeters = nil
                Self.log.notice("walk_started confidence=\(self.lastConfidenceLabel, privacy: .public)")
            } else if let pausedAt = stationarySince {
                // MOWA: a stop shorter than the debounce belongs to the same
                // walk — a crosswalk light, a shop window. Without this the
                // walk would be cut into sub-threshold pieces (measured
                // 2026-08-13: a 2-min indoor walk chopped into 4 silent ones).
                cancelEndDebounce()
                Self.log.notice("walk_resumed pausedFor=\(Int(Date().timeIntervalSince(pausedAt)))s")
            }
        } else if activity.stationary, walkStartedAt != nil, stationarySince == nil {
            // MOWA: the walk may be over, but nothing is decided yet. The
            // notification is a "기록 제안" for a FINISHED walk, so it waits for
            // the debounce; the stop moment is kept for the event's end time.
            stationarySince = activity.startDate
            scheduleEndDebounce()
            Self.log.notice("walk_pausing debounce=\(Int(self.endDebounceSeconds))s")
        }
    }

    // MARK: 산책 종료 확정

    private func scheduleEndDebounce() {
        guard let pausedAt = stationarySince else { return }
        endDebounceWorkItem?.cancel()
        // The row may arrive late (batched delivery after a suspension), so the
        // wait counts from the stop itself — a stop we only hear about 20 min
        // later is already confirmed.
        let delay = max(0, endDebounceSeconds - Date().timeIntervalSince(pausedAt))
        let item = DispatchWorkItem { [weak self] in self?.confirmWalkEnd() }
        endDebounceWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
    }

    private func cancelEndDebounce() {
        endDebounceWorkItem?.cancel()
        endDebounceWorkItem = nil
        stationarySince = nil
    }

    private func resetWalkSession() {
        cancelEndDebounce()
        walkStartedAt = nil
        walkBaselineSteps = nil
        walkQualified = false
        lastDistanceMeters = nil
    }

    /// The product's detection moment: the stationary debounce expired, so the
    /// walk is over. This is where a qualified walk becomes a JS event and,
    /// unless the cooldown suppresses it, the 기록 제안 notification.
    private func confirmWalkEnd() {
        endDebounceWorkItem = nil
        guard isEnabled, let startedAt = walkStartedAt, let baseline = walkBaselineSteps else {
            resetWalkSession()
            return
        }

        // The walk ended when the user stopped, not when this timer fired —
        // otherwise every duration would carry the debounce as walking time.
        let endedAt = max(stationarySince ?? Date(), startedAt)
        let walked = currentSteps - baseline

        guard walkQualified else {
            // Silent suppression was the most expensive failure class in the
            // prior repo; a walk that fails the bar still leaves a trace.
            Self.log.notice("walk_ended reason=sub-threshold steps=\(walked)")
            resetWalkSession()
            return
        }

        let event: [String: Any] = [
            // Keyed on the walk's start: one id per walk, stable across a
            // client retry (SQLite stores detections by this id).
            "id": "live-\(Int(startedAt.timeIntervalSince1970))",
            "startedAtMs": startedAt.timeIntervalSince1970 * 1000,
            "endedAtMs": endedAt.timeIntervalSince1970 * 1000,
            "steps": walked,
            "distanceMeters": lastDistanceMeters ?? NSNull(),
            "confidence": lastConfidenceLabel,
            "detection": "live",
        ]
        liveEvents.insert(event, at: 0)

        let stateLabel: String
        switch UIApplication.shared.applicationState {
        case .active: stateLabel = "foreground"
        case .inactive: stateLabel = "inactive"
        case .background: stateLabel = "background"
        @unknown default: stateLabel = "?"
        }
        let duration = Int(endedAt.timeIntervalSince(startedAt))
        Self.log.notice("walk_detected steps=\(walked) duration=\(duration)s appState=\(stateLabel, privacy: .public)")

        // JS hears about every detection, including one whose notification the
        // cooldown suppresses: the candidate record and notification-spam
        // control are separate concerns.
        onWalkDetected?(event)

        // MOWA: the live layer has fully handled this walk — the candidate
        // event above, the notification decision below — so the observer must
        // never re-announce its steps. Deliberately OUTSIDE the cooldown
        // branch: a cooldown-suppressed walk still produced a candidate, and
        // the safety net exists for walks the live layer MISSED, not ones it
        // chose to keep quiet about.
        advanceWatermark(to: endedAt, source: "live")

        if passesCooldown() {
            // 알림은 **여기 네이티브에서** 발송합니다. JS 가 떠 있는지와 무관하게 동작해야 하므로.
            postNotification(steps: walked, issuedAt: Date())
        }

        resetWalkSession()
    }

    private func handlePedometer(steps: Int, distance: Double?) {
        lastPedometerAt = Date()
        currentSteps = steps
        if stepUpdatesActive { onStepUpdate?(steps, nil) }

        guard walkStartedAt != nil, let baseline = walkBaselineSteps else { return }
        // Cumulative since startUpdates, not since this walk — unchanged from
        // the threshold-fire version, and nothing in JS reads it today.
        if let distance { lastDistanceMeters = distance }

        // MOWA: crossing the threshold no longer notifies. It only marks the
        // walk as worth reporting; confirmWalkEnd decides when (and whether)
        // anything is sent, because the push proposes recording a FINISHED walk.
        let walked = steps - baseline
        guard walked >= thresholdSteps, !walkQualified else { return }
        walkQualified = true
        Self.log.notice("walk_qualified steps=\(walked)")
    }

    private func passesCooldown() -> Bool {
        let last = UserDefaults.standard.double(forKey: Keys.lastNotifiedAt)
        let now = Date().timeIntervalSince1970
        if last > 0, now - last < cooldownSeconds {
            // MOWA: upstream returned silently here, yet 03-findings.md's diagnostic
            // table lists this line — silent suppression was the most expensive
            // failure class in the prior repo, so the skip must leave a trace.
            Self.log.notice("notification_suppressed reason=cooldown remaining=\(Int(self.cooldownSeconds - (now - last)))s")
            return false
        }
        UserDefaults.standard.set(now, forKey: Keys.lastNotifiedAt)
        return true
    }

    /// MOWA: monotone advance only. The observer's dedupe rests entirely on
    /// this value, so it must never move backwards — a clock hiccup or an
    /// out-of-order caller would otherwise reopen the double-notification bug.
    private func advanceWatermark(to date: Date, source: String) {
        let current = UserDefaults.standard.double(forKey: Keys.stepsAccountedUntil)
        let next = max(current, date.timeIntervalSince1970)
        UserDefaults.standard.set(next, forKey: Keys.stepsAccountedUntil)
        Self.log.notice("watermark_advanced source=\(source, privacy: .public) to=\(next)")
    }

    private func postNotification(steps: Int, issuedAt: Date) {
        // The single gate for 설정 > 기록 제안 알림. Both callers (the live
        // end-of-walk path and the observer safety net) come through here, so
        // one guard covers the whole feature. Detection itself is unaffected —
        // the candidate is still created when the app next runs.
        guard notificationsEnabled else {
            Self.log.notice("notification_suppressed steps=\(steps)")
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "걷기가 감지되었습니다"
        content.body = "\(steps)걸음 · 탭하면 걷기 화면으로 이동합니다"
        content.sound = .default
        content.userInfo = [
            "path": deepLinkPath,
            "issuedAtMs": issuedAt.timeIntervalSince1970 * 1000,
        ]

        let request = UNNotificationRequest(identifier: "walk", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                Self.log.error("notification_failed \(error.localizedDescription, privacy: .public)")
            } else {
                Self.log.notice("notification_posted issuedAt=\(issuedAt.timeIntervalSince1970)")
            }
        }
    }

    // MARK: HealthKit 경로

    // MOWA: finalMechanism lets the layered mode reuse this path — on success
    // the Core records .layered instead of .healthKitObserver.
    private func enableHealthKitObserver(
        finalMechanism: Mechanism,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(.failure(DetectorError.unavailable("HealthKit 을 사용할 수 없습니다.")))
            return
        }
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        healthStore.requestAuthorization(toShare: [], read: [stepType]) { [weak self] _, error in
            guard let self else { return }
            if let error {
                completion(.failure(error))
                return
            }
            // ⚠️ .immediate 를 넘겨도 stepCount 는 Apple 이 시간당 1회로 조용히 강등합니다
            // ("enforced transparently"). 그래서 처음부터 .hourly 로 요청합니다.
            self.healthStore.enableBackgroundDelivery(for: stepType, frequency: .hourly) { ok, error in
                if let error {
                    // errorAuthorizationDenied 는 보통 권한이 아니라
                    // com.apple.developer.healthkit.background-delivery entitlement 누락입니다.
                    completion(.failure(error))
                    return
                }
                guard ok else {
                    completion(.failure(DetectorError.unavailable("백그라운드 delivery 활성화 실패")))
                    return
                }
                DispatchQueue.main.async {
                    // MOWA: a user-initiated enable starts the net fresh —
                    // steps pocketed before pressing Start are not its
                    // business. Deliberately absent from restoreIfNeeded: the
                    // steps of a relaunch gap are exactly what the net exists
                    // to announce.
                    self.advanceWatermark(to: Date(), source: "enable")
                    self.registerObserverQuery()
                    self.isEnabled = true
                    self.mechanism = finalMechanism
                    self.persist(enabled: true, mechanism: finalMechanism)
                    Self.log.notice("enabled mechanism=\(finalMechanism.rawValue, privacy: .public) frequency=hourly")
                    completion(.success(()))
                }
            }
        }
    }

    /// ⚠️ 반드시 앱 실행 초기(AppDelegate)에 등록해야 합니다.
    func registerObserverQuery() {
        guard observerQuery == nil, HKHealthStore.isHealthDataAvailable() else { return }
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else { return }

        let query = HKObserverQuery(sampleType: stepType, predicate: nil) { [weak self] _, completionHandler, error in
            // ⚠️ completionHandler 를 3번 호출하지 않으면 HealthKit 이 이 앱에 대한
            // 백그라운드 전송을 **영구히** 중단합니다. 어느 경로로 빠져나가든 반드시 호출.
            defer { completionHandler() }
            guard error == nil, let self else { return }
            Self.log.notice("observer_fired")
            self.handleObserverFired()
        }

        healthStore.execute(query)
        observerQuery = query
        Self.log.notice("observer_registered")
    }

    private func handleObserverFired() {
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else { return }

        // Diagnostic only: /debug's "observer last fired" row. A read that
        // fails below still WAS a fire, so recording it up front is correct —
        // and since the dedupe no longer keys off fire times, recording it
        // early consumes nothing (the retired scheme's exact mistake).
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Keys.lastObserverFiredAt)

        // First fire on this install (or after the update that introduced the
        // watermark): only set the baseline. Same shape as the retired
        // observer_baseline_set fix — double(forKey:) reads a missing key as 0,
        // which would otherwise turn the whole window into "new" steps the
        // moment the mechanism is toggled on.
        guard UserDefaults.standard.object(forKey: Keys.stepsAccountedUntil) != nil else {
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Keys.stepsAccountedUntil)
            Self.log.notice("observer_watermark_init")
            return
        }

        // MOWA: the dedupe IS the query bound. HealthKit stamps step samples
        // with the time they were walked, not the time they were committed, so
        // summing only past the watermark structurally excludes every
        // already-handled walk — including its late-committing chunks, which
        // the retired delta scheme re-announced (double notification measured
        // 2026-08-14: observer 11:54:28 vs live 11:55:27 against a 300 s
        // cooldown). The 2-hour clamp keeps the old "a walk older than this is
        // not worth announcing" semantics and caps ambient-step accumulation
        // across long detection gaps.
        let end = Date()
        let watermark = Date(
            timeIntervalSince1970: UserDefaults.standard.double(forKey: Keys.stepsAccountedUntil)
        )
        let start = max(watermark, end.addingTimeInterval(-2 * 3600))
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)

        let query = HKStatisticsQuery(
            quantityType: stepType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum
        ) { [weak self] _, statistics, error in
            guard let self else { return }
            // ⚠️ 기기가 잠겨 있으면 HealthKit 을 읽을 수 없습니다
            // (Protected Unless Open, 잠금 ~10분 후 차단). 값이 없는 것과 걸음이 0인 것을
            // 구분해서 기록해야 나중에 결과를 오해하지 않습니다.
            // errorNoData IS a valid answer: the window sum is 0.
            if let error {
                let nsError = error as NSError
                let isNoData = nsError.domain == HKErrorDomain
                    && nsError.code == HKError.Code.errorNoData.rawValue
                if !isNoData {
                    // MOWA: watermark untouched — a fire that learned nothing
                    // consumes nothing. The retired scheme advanced its marker
                    // here, which is exactly how a locked-device fire let the
                    // NEXT fire re-announce an already-notified walk.
                    Self.log.notice("observer_read_failed error=\(error.localizedDescription, privacy: .public) (기기 잠금 중일 수 있음)")
                    return
                }
            }
            let sum = statistics?.sumQuantity()?.doubleValue(for: .count()) ?? 0
            Self.log.notice("observer_steps windowStart=\(start.timeIntervalSince1970) sum=\(sum)")

            guard sum >= Double(self.thresholdSteps) else {
                // MOWA: NO watermark advance here. Samples are dated when
                // walked but committed 7–18 min later, so a sub-threshold fire
                // may simply be EARLY — advancing to `end` claimed steps the
                // query had never seen, and a walk whose commit lagged one
                // unrelated fire was swallowed forever (measured 2026-08-20
                // 01:20: three fires each sum=0 while the walked samples sat
                // uncommitted behind the already-advanced watermark). Ambient
                // pooling, which this advance used to cap, is the liveness
                // gate's job below; sub-threshold leftovers age out through
                // the 2-hour clamp.
                return
            }

            // MOWA: the live layer is mid-walk, or holding an end that is
            // about to be confirmed. It will notify with the real step count
            // for THIS walk and advance the watermark past these samples; if
            // it dies mid-walk instead, the watermark is untouched and the
            // next fire rescues them. The net exists for a live layer that is
            // dead, not one that is working.
            if self.walkStartedAt != nil {
                Self.log.notice("notification_suppressed reason=live-pending")
                return
            }

            // MOWA: liveness gate. If OUR pedometer subscription produced a
            // callback inside the query window, the live layer was awake while
            // these steps were walked and chose not to sessionize them (short
            // shuffles, low confidence) — the net must not second-guess that
            // with a raw sum (measured 2026-08-19 23:56: 142 pooled ambient
            // steps announced as a walk while live was healthy). The test is
            // witnessing the WINDOW, not "callback within N minutes": fresh
            // HealthKit steps with no callback in their window PROVE the
            // subscription was dead, while a putter-then-idle pool would
            // out-age any recency bar by the time a late fire arrives. nil =
            // no live layer at all (observer-only mode, fresh relaunch,
            // degraded restore) — exactly when the net must stay armed.
            if let witnessed = self.lastPedometerAt, witnessed >= start {
                Self.log.notice("notification_suppressed reason=live-alive lastPedometerAt=\(witnessed.timeIntervalSince1970)")
                self.advanceWatermark(to: end, source: "live-alive")
                return
            }

            // Watermark untouched on a cooldown miss too: these steps were
            // never announced, so the next fire after the quiet period must
            // still see them — the retired scheme's baseline update silently
            // swallowed the walk here.
            guard self.passesCooldown() else { return }

            self.advanceWatermark(to: end, source: "observer")
            self.postNotification(steps: Int(sum), issuedAt: Date())
        }
        healthStore.execute(query)
    }

    // MARK: 비활성화 · 복구

    // MOWA: extracted from disable() so enable() can silence a previously
    // restored mechanism before starting a new one (double-notification fix).
    private func stopSensors() {
        activityManager.stopActivityUpdates()
        pedometer.stopUpdates()
        locationManager.stopUpdatingLocation()
        locationManager.stopMonitoringSignificantLocationChanges()
        locationManager.allowsBackgroundLocationUpdates = false
        if let observerQuery {
            healthStore.stop(observerQuery)
            self.observerQuery = nil
        }
        healthStore.disableAllBackgroundDelivery { _, _ in }
        // Drops any pending end-debounce too: a walk whose sensors are gone can
        // never be confirmed, and a stale timer would fire against a new session.
        resetWalkSession()
    }

    func disable() {
        stopSensors()
        persist(enabled: false, mechanism: .none)
        isEnabled = false
        mechanism = .none
        Self.log.notice("disabled")
    }

    /// AppDelegate 가 실행 초기에 호출합니다.
    func restoreIfNeeded() {
        guard UserDefaults.standard.bool(forKey: Keys.enabled) else { return }
        let saved = Mechanism(rawValue: UserDefaults.standard.string(forKey: Keys.mechanism) ?? "") ?? .none
        Self.log.notice("restore mechanism=\(saved.rawValue, privacy: .public)")

        // MOWA: startCoreLocationKeepAlive() ends in startMotionUpdates(), and
        // startActivityUpdates IS the Motion & Fitness prompt — CoreMotion has
        // no request API, so issuing the query is what raises the dialog. This
        // function runs from didFinishLaunchingWithOptions, before any JS, so a
        // restore that reaches it puts that dialog on screen with no
        // explanation in front of it and nothing in JS able to hold it back
        // (measured 2026-08-20). Restoring is not worth spending a
        // once-per-install prompt the user has never been shown a reason for:
        // the app's permission screen asks with one, and the start() that
        // follows brings the keepalive back up.
        //
        // Only `notDetermined` is refused. A denial has already consumed the
        // prompt, so restoring then raises nothing and behaves as before.
        let motionUnasked = CMMotionActivityManager.authorizationStatus() == .notDetermined

        switch saved {
        case .coreLocationKeepAlive:
            guard locationManager.authorizationStatus == .authorizedAlways else {
                Self.log.notice("restore_skipped reason=not-always-authorized")
                return
            }
            guard !motionUnasked else {
                Self.log.notice("restore_skipped reason=motion-not-asked")
                return
            }
            startCoreLocationKeepAlive()
        case .healthKitObserver:
            // No prompt here: registerObserverQuery only executes an
            // HKObserverQuery. The HealthKit sheet comes from
            // enableHealthKitObserver's requestAuthorization, which restore
            // never calls.
            registerObserverQuery()
            isEnabled = true
            mechanism = .healthKitObserver
        case .layered:
            // MOWA: restore both halves; a missing Always grant — or an unasked
            // Motion permission — degrades to observer-only rather than
            // dropping the whole layer.
            if motionUnasked {
                Self.log.notice("restore_degraded reason=motion-not-asked keepalive=skipped")
            } else if locationManager.authorizationStatus == .authorizedAlways {
                startCoreLocationKeepAlive()
            } else {
                Self.log.notice("restore_degraded reason=not-always-authorized keepalive=skipped")
            }
            registerObserverQuery()
            isEnabled = true
            mechanism = .layered
        case .none:
            break
        }
    }

    private func persist(enabled: Bool, mechanism: Mechanism) {
        UserDefaults.standard.set(enabled, forKey: Keys.enabled)
        UserDefaults.standard.set(mechanism.rawValue, forKey: Keys.mechanism)
    }

    // MARK: 포그라운드 걸음 관측

    func startStepUpdates() {
        stepUpdatesActive = true
        guard mechanism == .none, CMPedometer.isStepCountingAvailable() else { return }
        // 백그라운드 감지가 꺼져 있어도 포그라운드 관측은 가능해야 합니다.
        pedometer.startUpdates(from: Date()) { [weak self] data, _ in
            guard let self, let data else { return }
            let steps = data.numberOfSteps.intValue
            DispatchQueue.main.async {
                self.currentSteps = steps
                self.onStepUpdate?(steps, data.currentCadence?.doubleValue)
            }
        }
    }

    func stopStepUpdates() {
        stepUpdatesActive = false
        if mechanism == .none { pedometer.stopUpdates() }
    }

    // MARK: 딥링크 버퍼

    func recordDeepLink(path: String, issuedAtMs: Double?, coldStart: Bool) {
        let link: [String: Any] = [
            "path": path,
            "issuedAtMs": issuedAtMs ?? NSNull(),
            "coldStart": coldStart,
        ]
        pendingDeepLink = link
        Self.log.notice("deeplink_received path=\(path, privacy: .public) coldStart=\(coldStart)")
        onDeepLink?(link)
    }

    func consumePendingDeepLink() -> [String: Any]? {
        defer { pendingDeepLink = nil }
        return pendingDeepLink
    }

    // MARK: 진단

    func statusPayload() -> [String: Any] {
        var warnings: [String] = []

        if !CMMotionActivityManager.isActivityAvailable() {
            warnings.append("동작 분류를 사용할 수 없습니다 — 시뮬레이터에는 모션 코프로세서가 없습니다.")
        }
        if CMMotionActivityManager.authorizationStatus() == .denied {
            warnings.append("설정 > 개인정보 보호 및 보안 > 동작 및 피트니스 > 피트니스 추적이 꺼져 있습니다. 이 마스터 토글이 꺼지면 기기 전체에서 CoreMotion 이 죽습니다.")
        }
        if mechanism == .coreLocationKeepAlive, locationManager.authorizationStatus != .authorizedAlways {
            warnings.append("위치 권한이 '항상'이 아닙니다. '사용 중'만으로는 백그라운드에서 프로세스가 유지되지 않습니다.")
        }
        if ProcessInfo.processInfo.isLowPowerModeEnabled {
            warnings.append("저전력 모드가 켜져 있습니다 — 백그라운드 실행이 억제되어 측정이 오염됩니다.")
        }
        // MOWA: the silent-death check. On 2026-08-13 locationd delivered 2,097
        // updates through an 80-minute walk while CoreMotion produced zero
        // callbacks; nothing on screen said so. 10 min is well past any normal
        // gap — activity rows arrive whenever the classification changes.
        if isEnabled, mechanism != .healthKitObserver {
            let since = lastActivityAt.map { Date().timeIntervalSince($0) }
            if since == nil || since! > 600 {
                warnings.append("동작 분류 콜백이 \(since.map { "\(Int($0))초째" } ?? "한 번도") 없습니다 — CoreMotion 구독이 조용히 죽었을 수 있습니다. 감지를 다시 시작해 보세요.")
            }
        }

        let motionAuth: String
        switch CMMotionActivityManager.authorizationStatus() {
        case .authorized: motionAuth = "granted"
        case .denied: motionAuth = "denied"
        case .restricted: motionAuth = "denied"
        case .notDetermined: motionAuth = "prompt"
        @unknown default: motionAuth = "unknown"
        }

        let locationAuth: String
        switch locationManager.authorizationStatus {
        case .authorizedAlways: locationAuth = "always"
        case .authorizedWhenInUse: locationAuth = "whenInUse"
        case .denied, .restricted: locationAuth = "denied"
        case .notDetermined: locationAuth = "notDetermined"
        @unknown default: locationAuth = "unknown"
        }

        return [
            "enabled": isEnabled,
            "mechanism": mechanism.rawValue,
            "locationAuthorization": locationAuth,
            "motionAuthorization": motionAuth,
            "warnings": warnings,
            // Walk-session state. Detection can only be silent for a few
            // reasons, and these separate them: no walking classification
            // (activity/confidence), a dead subscription (lastActivityAtMs /
            // lastPedometerAtMs), a walk under the step bar (walkSteps /
            // walkQualified), or an end still being debounced (stationarySinceMs).
            "activity": lastActivityLabel,
            "confidence": lastConfidenceLabel,
            "currentSteps": currentSteps,
            "walkActive": walkStartedAt != nil,
            "walkStartedAtMs": Self.epochMsOrNull(walkStartedAt),
            "walkSteps": walkBaselineSteps.map { currentSteps - $0 } ?? 0,
            "walkQualified": walkQualified,
            "stationarySinceMs": Self.epochMsOrNull(stationarySince),
            "endDebounceSeconds": endDebounceSeconds,
            // The other two detection criteria, read through the same
            // UserDefaults-backed getters as endDebounceSeconds. Reporting them
            // here rather than copying 30/300 into TypeScript is the point: a
            // copy would be a second source of truth that no gate in this repo
            // could catch drifting from the Swift literal.
            "thresholdSteps": thresholdSteps,
            "cooldownSeconds": cooldownSeconds,
            // Observer liveness. Confirming that the HealthKit safety net
            // actually fired otherwise means pulling os_log off the phone with
            // `log collect` — this row is what makes /debug enough.
            "lastObserverFiredAtMs": Self.epochMsOrNull(
                epochSeconds: UserDefaults.standard.double(forKey: Keys.lastObserverFiredAt)
            ),
            // The net's dedupe state: steps dated at or before this instant
            // are already handled. Watching this row advance to a walk's end
            // time is how the double-notification fix is verified on device
            // without pulling os_log off the phone.
            "stepsAccountedUntilMs": Self.epochMsOrNull(
                epochSeconds: UserDefaults.standard.double(forKey: Keys.stepsAccountedUntil)
            ),
            "lastActivityAtMs": Self.epochMsOrNull(lastActivityAt),
            "lastPedometerAtMs": Self.epochMsOrNull(lastPedometerAt),
        ]
    }

    private static func epochMsOrNull(_ date: Date?) -> Any {
        guard let date else { return NSNull() }
        return date.timeIntervalSince1970 * 1000
    }

    /// The observer path stores its timestamps as epoch SECONDS, and
    /// `double(forKey:)` answers 0 for a key that was never written — which
    /// here means "never written on this install", not 1970.
    private static func epochMsOrNull(epochSeconds: Double) -> Any {
        guard epochSeconds > 0 else { return NSNull() }
        return epochSeconds * 1000
    }

    /// 앱이 꺼져 있던 동안의 걷기를 소급 조회합니다.
    /// ⚠️ F1 성공이 아닙니다 — "알림을 보낼 수 있었다"가 아니라 "나중에 알아냈다"는 뜻입니다.
    func retrospectiveEvents(since: Date, completion: @escaping ([[String: Any]]) -> Void) {
        guard CMMotionActivityManager.isActivityAvailable() else {
            completion([])
            return
        }
        activityManager.queryActivityStarting(from: since, to: Date(), to: .main) { activities, _ in
            guard let activities else {
                completion([])
                return
            }

            var events: [[String: Any]] = []
            var sessionStart: Date?
            var sessionConfidence = "-"

            for activity in activities {
                if activity.walking, sessionStart == nil {
                    sessionStart = activity.startDate
                    switch activity.confidence {
                    case .high: sessionConfidence = "high"
                    case .medium: sessionConfidence = "medium"
                    default: sessionConfidence = "low"
                    }
                } else if !activity.walking, let start = sessionStart {
                    let end = activity.startDate
                    if end.timeIntervalSince(start) >= 60 {
                        events.append([
                            "id": "retro-\(Int(start.timeIntervalSince1970))",
                            "startedAtMs": start.timeIntervalSince1970 * 1000,
                            "endedAtMs": end.timeIntervalSince1970 * 1000,
                            "steps": 0,
                            "distanceMeters": NSNull(),
                            "confidence": sessionConfidence,
                            "detection": "retrospective",
                        ])
                    }
                    sessionStart = nil
                }
            }
            completion(Array(events.reversed().prefix(20)))
        }
    }

    enum DetectorError: LocalizedError {
        case unavailable(String)

        var errorDescription: String? {
            switch self {
            case .unavailable(let message): return message
            }
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension WalkDetectorCore: CLLocationManagerDelegate {
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Self.log.notice("authorization_changed status=\(manager.authorizationStatus.rawValue)")
        if manager.authorizationStatus == .authorizedAlways,
           mechanism == .coreLocationKeepAlive,
           isEnabled {
            manager.allowsBackgroundLocationUpdates = true
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // 위치 값 자체는 쓰지 않습니다. 이 로그가 백그라운드에서 계속 찍히는지가
        // "프로세스 상주가 유지되고 있는가"의 지표입니다.
        Self.log.debug("keepalive_tick locations=\(locations.count)")
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Self.log.error("location_error \(error.localizedDescription, privacy: .public)")
    }
}
