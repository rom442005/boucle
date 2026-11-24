import UIKit
import Capacitor

/// Vue de l'app : celle de Capacitor, avec les modules propres à Boucle (écran verrouillé du suivi).
class BoucleViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LiveTrackPlugin())
    }
}
