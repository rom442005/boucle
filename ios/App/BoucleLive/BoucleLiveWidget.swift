import ActivityKit
import SwiftUI
import WidgetKit

/*
 * Extension « BoucleLive » : l'Activité en direct du suivi, comme Strava. Écran verrouillé : le nom du
 * parcours, la distance faite et le chrono en grand, l'allure (ou la vitesse), le restant, l'heure d'arrivée
 * et une barre de progression rose. Dynamic Island : la distance et le chrono.
 * Cible à créer une fois dans Xcode (voir MAINTENANCE.md, « Écran verrouillé »).
 */

private let pink = Color(red: 1, green: 0.176, blue: 0.333)

@main
struct BoucleLiveBundle: WidgetBundle {
    var body: some Widget {
        BoucleLiveActivity()
    }
}

/// Le chrono tourne tout seul (depuis départ + pauses) ; figé pendant une pause.
private func chrono(_ s: BoucleLiveAttributes.ContentState) -> Text {
    s.paused ? Text(s.elapsed) : Text(s.chronoBase, style: .timer)
}

struct BoucleLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BoucleLiveAttributes.self) { ctx in
            LockScreenView(title: ctx.attributes.title, s: ctx.state)
                .activityBackgroundTint(Color.black.opacity(0.72))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { ctx in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Distance").font(.caption2).foregroundStyle(.secondary)
                        Text(ctx.state.distance).font(.title2.bold()).monospacedDigit()
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(ctx.state.paused ? "En pause" : "Durée").font(.caption2).foregroundStyle(.secondary)
                        chrono(ctx.state).font(.title2.bold()).monospacedDigit().multilineTextAlignment(.trailing)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        HStack {
                            Text("\(ctx.state.metricLabel) \(ctx.state.metric)")
                            Spacer()
                            Text("Reste \(ctx.state.left)")
                        }
                        .font(.callout.weight(.semibold))
                        .monospacedDigit()
                        ProgressView(value: ctx.state.progress).tint(pink)
                    }
                }
            } compactLeading: {
                Image(systemName: "figure.run").foregroundStyle(pink)
            } compactTrailing: {
                Text(ctx.state.distance).monospacedDigit().font(.caption.bold())
            } minimal: {
                Image(systemName: "figure.run").foregroundStyle(pink)
            }
            .keylineTint(pink)
        }
    }
}

struct LockScreenView: View {
    let title: String
    let s: BoucleLiveAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "figure.run").foregroundStyle(pink)
                Text(title).font(.footnote.weight(.semibold)).lineLimit(1)
                Spacer()
                if let eta = s.eta { Text("Arrivée \(eta)").font(.footnote).foregroundStyle(.secondary) }
            }
            HStack(alignment: .lastTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Distance").font(.caption2).foregroundStyle(.secondary)
                    Text(s.distance).font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text(s.paused ? "En pause" : "Durée").font(.caption2).foregroundStyle(.secondary)
                    chrono(s).font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit().multilineTextAlignment(.trailing)
                }
            }
            HStack {
                Text("\(s.metricLabel) \(s.metric)")
                Spacer()
                Text("Reste \(s.left)")
            }
            .font(.subheadline.weight(.semibold))
            .monospacedDigit()
            ProgressView(value: s.progress).tint(pink)
        }
        .padding(16)
        .foregroundStyle(.white)
    }
}
