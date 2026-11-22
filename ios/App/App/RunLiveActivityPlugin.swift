import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

// iOS counterpart of Android's RunNotificationPlugin (see
// android/.../RunNotificationPlugin.java and src/utils/runNotification.js).
// Same calls from JS: start / update / pause / stop, same argument names.
// Shows the run on the lock screen and in the Dynamic Island as a Live
// Activity (iOS 16.2+). On older iOS - and when the user switched Live
// Activities off - every call resolves as a silent no-op; run tracking itself
// never depends on this plugin.
@objc(RunLiveActivityPlugin)
public class RunLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RunLiveActivityPlugin"
    public let jsName = "RunLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    // ActivityKit types only exist on 16.1+, so the controller is held as Any.
    private var controllerStorage: Any?

    @available(iOS 16.2, *)
    private var controller: RunLiveActivityController {
        if let existing = controllerStorage as? RunLiveActivityController { return existing }
        let created = RunLiveActivityController()
        controllerStorage = created
        return created
    }

    // Called whenever JS transitions into "tracking, not paused": a new run,
    // a resume after pause (JS just calls start again), or re-attaching to a
    // run already in progress after the app was reopened.
    @objc func start(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let elapsedMs = call.getDouble("elapsedMs") ?? 0
            let distanceMeters = call.getDouble("distanceMeters")
            let paceLabel = call.getString("paceLabel")
            let title = call.getString("title")
            Task { await controller.start(elapsedMs: elapsedMs, distanceMeters: distanceMeters, paceLabel: paceLabel, title: title) }
        }
        call.resolve()
    }

    @objc func update(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let distanceMeters = call.getDouble("distanceMeters")
            let paceLabel = call.getString("paceLabel")
            let hasTitle = call.options.keys.contains("title")
            let title = call.getString("title")
            Task { await controller.update(distanceMeters: distanceMeters, paceLabel: paceLabel, hasTitle: hasTitle, title: title) }
        }
        call.resolve()
    }

    @objc func pause(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let title = call.getString("title")
            Task { await controller.pause(title: title) }
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            Task { await controller.stop() }
        }
        call.resolve()
    }
}

#if canImport(ActivityKit)
@available(iOS 16.2, *)
@MainActor
final class RunLiveActivityController {
    private var activity: Activity<RunActivityAttributes>?
    private var runTitle = "Run Conquest"
    private var state = RunActivityAttributes.ContentState(distance: "0.00", pace: "--")
    private var startDate = Date()
    private var active = false

    nonisolated init() {}

    private static func km(_ meters: Double) -> String {
        String(format: "%.2f", meters / 1000.0)
    }

    func start(elapsedMs: Double, distanceMeters: Double?, paceLabel: String?, title: String?) async {
        // Resume / re-attach: end whatever is showing (including an activity
        // left by a previous app process) and begin one with the fresh elapsed.
        await endAll()
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        startDate = Date().addingTimeInterval(-max(0, elapsedMs) / 1000.0)
        runTitle = (title?.isEmpty == false) ? title! : "Run Conquest"
        state = RunActivityAttributes.ContentState(
            distance: distanceMeters.map(Self.km) ?? "0.00",
            pace: paceLabel ?? "--"
        )
        active = true
        do {
            activity = try Activity.request(
                attributes: RunActivityAttributes(modeName: runTitle, startDate: startDate),
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
        } catch {
            // e.g. requested while backgrounded, or too many activities: stay silent.
            active = false
        }
    }

    func update(distanceMeters: Double?, paceLabel: String?, hasTitle: Bool, title: String?) async {
        guard active, let activity else { return }
        if let distanceMeters { state.distance = Self.km(distanceMeters) }
        if let paceLabel { state.pace = paceLabel }
        // Like Android: a new header replaces the mode label; '' restores it.
        if hasTitle { state.headline = (title?.isEmpty ?? true) ? nil : title }
        await activity.update(ActivityContent(state: state, staleDate: nil))
    }

    func pause(title: String?) async {
        guard active, let activity else { return }
        state.pausedAt = Date()
        if let title, !title.isEmpty { state.headline = title }
        await activity.update(ActivityContent(state: state, staleDate: nil))
    }

    func stop() async {
        active = false
        await endAll()
    }

    private func endAll() async {
        for running in Activity<RunActivityAttributes>.activities {
            await running.end(nil, dismissalPolicy: .immediate)
        }
        activity = nil
    }
}
#endif
