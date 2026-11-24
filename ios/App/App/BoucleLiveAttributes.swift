import Foundation
#if canImport(ActivityKit)
import ActivityKit

/// Activité en direct du suivi (écran verrouillé et Dynamic Island). Fichier partagé entre l'app et
/// l'extension BoucleLive : il doit appartenir aux deux cibles (voir MAINTENANCE.md, « Écran verrouillé »).
@available(iOS 16.1, *)
public struct BoucleLiveAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// « 3,42 km »
        public var distance: String
        /// « Allure » ou « Vitesse », et sa valeur (« 5:12 /km », « 24,3 km/h »)
        public var metricLabel: String
        public var metric: String
        /// « 6,6 km »
        public var left: String
        /// heure d'arrivée estimée (« 18:42 »)
        public var eta: String?
        /// 0 à 1
        public var progress: Double
        /// départ + pauses : le chrono tourne tout seul depuis cette date
        public var chronoBase: Date
        /// chrono figé pendant une pause (« 27:41 »)
        public var elapsed: String
        public var paused: Bool
    }

    /// « Course · Boucle de l'Erdre »
    public var title: String
}
#endif
