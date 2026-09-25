import SwiftUI
import WidgetKit

/// Yards-to-green on the watch face.
/// Reads the phone hole-map number the Watch app already stored in the app group.
/// No location fix and no phone session. Never invents a yardage.
struct HoleYardsEntry: TimelineEntry {
  let date: Date
  let holeNumber: Int?
  let yards: Int?
  let inline: String
  let value: String
  let unavailable: Bool
}

struct HoleYardsProvider: TimelineProvider {
  func placeholder(in context: Context) -> HoleYardsEntry {
    HoleYardsEntry(
      date: Date(),
      holeNumber: nil,
      yards: nil,
      inline: "—",
      value: "—",
      unavailable: true
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (HoleYardsEntry) -> Void) {
    completion(current())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<HoleYardsEntry>) -> Void) {
    // The Watch app reloads this timeline when the displayed yards change.
    // .after re-reads the app group if a reload was dropped while the face was covered.
    // 60s matches the Watch reload ceiling so a 15s policy cannot spend the budget.
    completion(Timeline(entries: [current()], policy: .after(Date().addingTimeInterval(60))))
  }

  private func current() -> HoleYardsEntry {
    let defaults = UserDefaults(suiteName: "group.com.shottrax.app")
    let hole = defaults?.integer(forKey: "complicationHole") ?? 0
    let quality = defaults?.string(forKey: "complicationQuality") ?? "none"
    let hasYards = defaults?.object(forKey: "complicationYards") != nil
    let yardsRaw = defaults?.integer(forKey: "complicationYards") ?? 0
    let holeNumber: Int? = hole >= 1 ? hole : nil
    let trusted = (quality == "good" || quality == "soft") && hasYards && yardsRaw > 0
    let yards: Int? = trusted ? yardsRaw : nil
    let value = yards.map { String($0) } ?? "—"
    let inline: String
    // Same text as `complicationFromClubList`: H{n} · {yards} yd, or H{n} · — (quality none / no green).
    if let holeNumber, let yards {
      inline = "H\(holeNumber) · \(yards) yd"
    } else if let holeNumber {
      inline = "H\(holeNumber) · —"
    } else if let yards {
      inline = "\(yards) yd"
    } else {
      inline = "—"
    }
    return HoleYardsEntry(
      date: Date(),
      holeNumber: holeNumber,
      yards: yards,
      inline: inline,
      value: value,
      unavailable: yards == nil
    )
  }
}

struct HoleYardsView: View {
  @Environment(\.widgetFamily) private var family
  var entry: HoleYardsEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      circular
    case .accessoryCorner:
      Text(entry.value)
        .widgetLabel(entry.unavailable ? "Unavailable" : "yd")
    case .accessoryInline:
      Text(entry.inline)
    default:
      rectangular
    }
  }

  private var circular: some View {
    VStack(spacing: 0) {
      Text(entry.value)
        .font(.system(.title3, design: .rounded).weight(.bold))
        .minimumScaleFactor(0.4)
      if !entry.unavailable {
        Text("yd")
          .font(.system(.caption2, design: .rounded))
      }
    }
    .widgetAccentable()
  }

  private var rectangular: some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(entry.holeNumber.map { "Hole \($0)" } ?? "To green")
        .font(.caption2)
        .widgetAccentable()
      Text(entry.value)
        .font(.title2.weight(.semibold))
        .minimumScaleFactor(0.5)
      Text(entry.unavailable ? "Unavailable" : "yd")
        .font(.caption2)
    }
  }
}

@main
struct HoleYardsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ShotTraxxHoleYards", provider: HoleYardsProvider()) { entry in
      HoleYardsView(entry: entry)
        .containerBackground(for: .widget) {
          AccessoryWidgetBackground()
        }
    }
    .configurationDisplayName("Yards to green")
    .description("Yards to the green from the phone hole map. — when that number isn’t available.")
    .supportedFamilies([
      .accessoryCircular,
      .accessoryCorner,
      .accessoryInline,
      .accessoryRectangular,
    ])
  }
}
