import ActivityKit
import WidgetKit
import SwiftUI

private let brandOrange = Color(red: 221 / 255, green: 87 / 255, blue: 28 / 255) // #DD571C

// Ticking elapsed time. The system advances it by itself (no per-second
// updates); when paused it freezes at `pausedAt`.
@available(iOS 16.2, *)
private struct RunTimerText: View {
    let context: ActivityViewContext<RunActivityAttributes>

    var body: some View {
        Text(
            timerInterval: context.attributes.startDate...context.attributes.startDate.addingTimeInterval(24 * 3600),
            pauseTime: context.state.pausedAt,
            countsDown: false,
            showsHours: false
        )
        .monospacedDigit()
        .multilineTextAlignment(.trailing)
    }
}

@available(iOS 16.2, *)
private struct StatBlock: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.title3.weight(.bold)).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

@available(iOS 16.2, *)
private func header(_ context: ActivityViewContext<RunActivityAttributes>) -> String {
    if let h = context.state.headline, !h.isEmpty { return h }
    return context.attributes.modeName
}

// Lock screen / banner.
@available(iOS 16.2, *)
private struct LockScreenView: View {
    let context: ActivityViewContext<RunActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "figure.run").foregroundStyle(brandOrange)
                Text("Run Conquest").font(.headline)
                Spacer()
                Text(header(context))
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(brandOrange.opacity(0.25), in: Capsule())
            }
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    RunTimerText(context: context)
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .frame(maxWidth: 150, alignment: .leading)
                    Text("Time").font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                StatBlock(value: context.state.distance, label: "km")
                Spacer().frame(width: 18)
                StatBlock(value: context.state.pace, label: "min/km")
            }
        }
        .padding(16)
        .activityBackgroundTint(Color.black.opacity(0.85))
        .activitySystemActionForegroundColor(brandOrange)
    }
}

@available(iOS 16.2, *)
struct RunLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            LockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        Image(systemName: "figure.run").foregroundStyle(brandOrange)
                        Text(header(context)).font(.caption.weight(.semibold)).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RunTimerText(context: context)
                        .font(.title3.weight(.bold))
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        StatBlock(value: context.state.distance, label: "km")
                        Spacer()
                        StatBlock(value: context.state.pace, label: "min/km")
                    }
                    .padding(.top, 4)
                }
            } compactLeading: {
                Image(systemName: "figure.run").foregroundStyle(brandOrange)
            } compactTrailing: {
                RunTimerText(context: context)
                    .font(.caption.weight(.semibold))
                    .frame(width: 48, alignment: .trailing)
            } minimal: {
                Image(systemName: "figure.run").foregroundStyle(brandOrange)
            }
            .keylineTint(brandOrange)
        }
    }
}
