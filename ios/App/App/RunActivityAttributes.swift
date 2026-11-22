import Foundation
#if canImport(ActivityKit)
import ActivityKit

// SHARED FILE: must belong to BOTH the App target and the widget extension
// target (File inspector -> Target Membership: tick both). The app starts/
// updates the Live Activity with these types; the widget renders them.
//
// Mirrors Android's RunNotificationPlugin (Chronometer notification, id 28351):
// run-mode header, a ticking elapsed timer, distance (km, 2 decimals) and pace.
@available(iOS 16.2, *)
public struct RunActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Distance in km, already formatted like Android ("0.00").
        public var distance: String
        /// Pace label exactly as the in-app panel shows it ("5:30" or "--").
        public var pace: String
        /// Optional temporary header (e.g. "Vehicle detected", "Paused");
        /// nil/empty = show the run-mode name.
        public var headline: String?
        /// Set while the run is paused: freezes the timer at this moment.
        public var pausedAt: Date?

        public init(distance: String, pace: String, headline: String? = nil, pausedAt: Date? = nil) {
            self.distance = distance
            self.pace = pace
            self.headline = headline
            self.pausedAt = pausedAt
        }
    }

    /// Run-mode label from utils/runModeLabel.js ("Territory Capture", "Training", ...).
    public var modeName: String
    /// Moving-time origin: now - elapsedMs at start(), so Text(timerInterval:) ticks without updates.
    public var startDate: Date

    public init(modeName: String, startDate: Date) {
        self.modeName = modeName
        self.startDate = startDate
    }
}
#endif
