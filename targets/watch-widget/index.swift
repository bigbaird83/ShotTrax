import SwiftUI
import WidgetKit

struct HoleYardsEntry: TimelineEntry {
  let date: Date
  let line: String
}

struct HoleYardsProvider: TimelineProvider {
  func placeholder(in context: Context) -> HoleYardsEntry {
    HoleYardsEntry(date: Date(), line: "Hole 1 · —")
  }

  func getSnapshot(in context: Context, completion: @escaping (HoleYardsEntry) -> Void) {
    completion(current())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<HoleYardsEntry>) -> Void) {
    let entry = current()
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60))))
  }

  private func current() -> HoleYardsEntry {
    let defaults = UserDefaults(suiteName: "group.com.shottrax.app")
    let hole = defaults?.integer(forKey: "holeNumber") ?? 0
    let quality = defaults?.string(forKey: "yardsQuality") ?? "none"
    let hasYards = defaults?.object(forKey: "yardsToGreen") != nil
    let yards = defaults?.integer(forKey: "yardsToGreen") ?? 0
    let holeNumber = hole > 0 ? hole : 1
    let yardsPart: String
    if quality != "none", hasYards {
      yardsPart = "\(yards) yd"
    } else {
      yardsPart = "—"
    }
    return HoleYardsEntry(date: Date(), line: "Hole \(holeNumber) · \(yardsPart)")
  }
}

struct HoleYardsView: View {
  var entry: HoleYardsEntry

  var body: some View {
    Text(entry.line)
      .font(.headline)
      .minimumScaleFactor(0.6)
      .widgetAccentable()
  }
}

@main
struct HoleYardsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ShotTraxxHoleYards", provider: HoleYardsProvider()) { entry in
      HoleYardsView(entry: entry)
        .containerBackground(for: .widget) {
          Color("widgetBackground")
        }
    }
    .configurationDisplayName("Hole")
    .description("Hole and yards to green")
    .supportedFamilies([.accessoryInline, .accessoryRectangular, .accessoryCircular])
  }
}
