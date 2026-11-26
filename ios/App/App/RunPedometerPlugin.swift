import Foundation
import Capacitor
import CoreMotion

// Step counter for runs (src/utils/pedometer.js). Wraps CMPedometer - the
// phone's own motion coprocessor - which counts steps (and, where the device
// can, distance) all day without the app running and can be asked for any
// window, so a run that was backgrounded still reports every step on return.
//
// Needs NSMotionUsageDescription (Info.plist) and nothing else: no HealthKit
// entitlement, no Health data. Uses no "required reason" API (no UserDefaults,
// file timestamps, boot time or disk space), so no privacy-manifest entry is
// needed for it.
@objc(RunPedometerPlugin)
public class RunPedometerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RunPedometerPlugin"
    public let jsName = "RunPedometer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let pedometer = CMPedometer()

    private func permissionName() -> String {
        switch CMPedometer.authorizationStatus() {
        case .authorized: return "granted"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        let available = CMPedometer.isStepCountingAvailable()
        call.resolve([
            "available": available,
            "permission": available ? permissionName() : "unavailable",
        ])
    }

    // The system dialog only appears on the first pedometer query, so a
    // throw-away one-second query is what triggers it.
    @objc func requestPermission(_ call: CAPPluginCall) {
        guard CMPedometer.isStepCountingAvailable() else {
            call.resolve(["permission": "unavailable"])
            return
        }
        if CMPedometer.authorizationStatus() != .notDetermined {
            call.resolve(["permission": permissionName()])
            return
        }
        let now = Date()
        pedometer.queryPedometerData(from: now.addingTimeInterval(-1), to: now) { [weak self] _, _ in
            DispatchQueue.main.async {
                call.resolve(["permission": self?.permissionName() ?? "prompt"])
            }
        }
    }

    // Live updates (cumulative since startedAtMs) for the run screen; the
    // authoritative number is always read(), which is also correct after the
    // app was suspended or killed.
    @objc func start(_ call: CAPPluginCall) {
        guard CMPedometer.isStepCountingAvailable() else {
            call.reject("unavailable")
            return
        }
        let ms = call.getDouble("startedAtMs") ?? Date().timeIntervalSince1970 * 1000
        let from = Date(timeIntervalSince1970: ms / 1000)
        pedometer.stopUpdates()
        pedometer.startUpdates(from: from) { [weak self] data, _ in
            guard let data = data else { return }
            var payload: [String: Any] = ["steps": data.numberOfSteps.intValue]
            if let d = data.distance { payload["distanceMeters"] = d.doubleValue }
            self?.notifyListeners("steps", data: payload)
        }
        call.resolve()
    }

    @objc func read(_ call: CAPPluginCall) {
        guard CMPedometer.isStepCountingAvailable() else {
            call.reject("unavailable")
            return
        }
        let ms = call.getDouble("startedAtMs") ?? Date().timeIntervalSince1970 * 1000
        let from = Date(timeIntervalSince1970: ms / 1000)
        pedometer.queryPedometerData(from: from, to: Date()) { data, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            guard let data = data else {
                call.resolve(["steps": NSNull()])
                return
            }
            var payload: [String: Any] = ["steps": data.numberOfSteps.intValue]
            if let d = data.distance { payload["distanceMeters"] = d.doubleValue }
            call.resolve(payload)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        pedometer.stopUpdates()
        call.resolve()
    }
}
