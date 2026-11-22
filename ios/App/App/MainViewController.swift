import UIKit
import Capacitor

// Capacitor only auto-registers plugins that come from npm packages. The
// in-app RunLiveActivity plugin is registered here instead (Main.storyboard
// points its view controller at this class).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(RunLiveActivityPlugin())
    }
}
