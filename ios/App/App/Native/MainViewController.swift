import Capacitor
import UIKit

/// Capacitor's web view controller with TuneBox's native plugins registered.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(YtdlpPlugin())
        bridge?.registerPluginInstance(FilesPlugin())
        bridge?.registerPluginInstance(PlayerPlugin())
    }
}
