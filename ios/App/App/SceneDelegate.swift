import UIKit
import Capacitor

// UIScene lifecycle (required on iOS 27). The window and its root view controller
// (MainViewController, from Main.storyboard) are created by the system from
// UISceneStoryboardFile in Info.plist; this class only forwards URLs and universal
// links to Capacitor, which is what AppDelegate's open/continue methods used to do.
// Capacitor 6 has no scene support of its own, so we bridge to ApplicationDelegateProxy.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        UIApplication.shared.applicationSupportsShakeToEdit = false
        // Cold launch from a URL / universal link: the callbacks below aren't invoked for these.
        if !connectionOptions.urlContexts.isEmpty {
            self.scene(scene, openURLContexts: connectionOptions.urlContexts)
        }
        for activity in connectionOptions.userActivities {
            self.scene(scene, continue: activity)
        }
    }

    // Shake to Undo ("Undo Typing" alert from running motion) stays off every time the app
    // comes back: under scenes these are the callbacks that actually fire.
    func sceneWillEnterForeground(_ scene: UIScene) {
        UIApplication.shared.applicationSupportsShakeToEdit = false
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        UIApplication.shared.applicationSupportsShakeToEdit = false
    }

    // Custom URL schemes - including the Google sign-in callback
    // (the Google auth plugin listens for Capacitor's capacitorOpenURL notification).
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
            if let source = context.options.sourceApplication {
                options[.sourceApplication] = source
            }
            if let annotation = context.options.annotation {
                options[.annotation] = annotation
            }
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
        }
    }

    // Universal links
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
