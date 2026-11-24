import Foundation
import Capacitor
import CoreLocation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// Suivi en direct, côté iPhone : l'Activité en direct (écran verrouillé, Dynamic Island) et le GPS lu par
/// l'app, qui continue écran verrouillé (mode d'arrière-plan « location ») et passe chaque position à la page.
@objc(LiveTrackPlugin)
public class LiveTrackPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "LiveTrackPlugin"
    public let jsName = "BoucleLive"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    private var location: CLLocationManager?
    /// Activity<BoucleLiveAttributes> (iOS 16.2 et plus), gardée sans type pour iOS 15.
    private var activity: Any?

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.startLocation()
            if #available(iOS 16.2, *) {
                self.startActivity(call)
            }
            call.resolve()
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            let state = Self.state(call)
            Task { await (self.activity as? Activity<BoucleLiveAttributes>)?.update(ActivityContent(state: state, staleDate: nil)) }
        }
        call.resolve()
    }

    @objc func end(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.location?.stopUpdatingLocation()
            self.location = nil
            if #available(iOS 16.2, *) {
                let a = self.activity as? Activity<BoucleLiveAttributes>
                Task { await a?.end(nil, dismissalPolicy: .immediate) }
            }
            self.activity = nil
            call.resolve()
        }
    }

    // MARK: Activité en direct

    @available(iOS 16.2, *)
    private static func state(_ call: CAPPluginCall) -> BoucleLiveAttributes.ContentState {
        let base = call.getDouble("chronoBase") ?? Date().timeIntervalSince1970 * 1000
        return BoucleLiveAttributes.ContentState(
            distance: call.getString("distance") ?? "",
            metricLabel: call.getString("metricLabel") ?? "",
            metric: call.getString("metric") ?? "",
            left: call.getString("left") ?? "",
            eta: call.getString("eta"),
            progress: call.getDouble("progress") ?? 0,
            chronoBase: Date(timeIntervalSince1970: base / 1000),
            elapsed: call.getString("elapsed") ?? "",
            paused: call.getBool("paused") ?? false
        )
    }

    @available(iOS 16.2, *)
    private func startActivity(_ call: CAPPluginCall) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        // Une seule sortie à la fois : les anciennes activités s'effacent.
        for a in Activity<BoucleLiveAttributes>.activities {
            Task { await a.end(nil, dismissalPolicy: .immediate) }
        }
        let attrs = BoucleLiveAttributes(title: call.getString("title") ?? "Boucle")
        activity = try? Activity.request(attributes: attrs, content: ActivityContent(state: Self.state(call), staleDate: nil))
    }

    // MARK: GPS

    private func startLocation() {
        if location != nil { return }
        let m = CLLocationManager()
        m.delegate = self
        m.desiredAccuracy = kCLLocationAccuracyBest
        m.distanceFilter = kCLDistanceFilterNone
        m.activityType = .fitness
        m.pausesLocationUpdatesAutomatically = false
        // Demande UIBackgroundModes = location dans Info.plist (sinon iOS arrête l'app).
        m.allowsBackgroundLocationUpdates = true
        m.showsBackgroundLocationIndicator = true
        m.requestWhenInUseAuthorization()
        m.startUpdatingLocation()
        location = m
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for l in locations {
            var o: [String: Any] = [
                "lon": l.coordinate.longitude,
                "lat": l.coordinate.latitude,
                "accuracy": l.horizontalAccuracy,
                "time": l.timestamp.timeIntervalSince1970 * 1000,
            ]
            if l.speed >= 0 { o["speed"] = l.speed }
            if l.course >= 0 { o["heading"] = l.course }
            notifyListeners("position", data: o)
        }
    }
}
