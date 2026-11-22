import WidgetKit
import SwiftUI

// Entry point of the widget extension (Live Activity only).
@main
struct RunLiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.2, *) {
            RunLiveActivityWidget()
        }
    }
}
