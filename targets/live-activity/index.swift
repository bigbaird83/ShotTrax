import ActivityKit
import SwiftUI
import WidgetKit

/// Lock Screen and Dynamic Island for a round in progress.
/// The app sends the hole, score, last shot, and group line; yards come from
/// the phone's live GPS (25 m or better). A missing value shows "—", and so do
/// all yards once the content is stale (60 s after its fix: GPS stopped or the
/// app was killed).
@main
struct ShotTraxxRoundBundle: WidgetBundle {
  var body: some Widget {
    ShotTraxxRoundLiveActivity()
  }
}

private enum RoundColors {
  static let background = Color(red: 11 / 255, green: 26 / 255, blue: 18 / 255)
  static let lime = Color(red: 200 / 255, green: 245 / 255, blue: 66 / 255)
  static let cream = Color(red: 244 / 255, green: 241 / 255, blue: 232 / 255)
  static let muted = Color(red: 138 / 255, green: 154 / 255, blue: 142 / 255)
}

private func yardsText(_ yards: Int?) -> String {
  yards.map(String.init) ?? "—"
}

/// Yards to show: none once the content is stale, never the last numbers.
private func liveYards(_ yards: Int?, stale: Bool) -> Int? {
  stale ? nil : yards
}

private func holeLine(_ state: ShotTraxxRoundAttributes.ContentState) -> String {
  state.par.map { "Hole \(state.hole) · Par \($0)" } ?? "Hole \(state.hole)"
}

/// Last shot and group line on one row, whichever are present.
private func footerLine(_ state: ShotTraxxRoundAttributes.ContentState) -> String? {
  let parts = [state.lastShot, state.groupLine].compactMap { $0 }
  return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
}

struct YardsColumn: View {
  let label: String
  let yards: Int?
  let big: Bool
  let stale: Bool

  var body: some View {
    VStack(spacing: 0) {
      Text(label)
        .font(.caption2.weight(.heavy))
        .foregroundStyle(RoundColors.muted)
      Text(yardsText(yards))
        .font(big ? .system(size: 34, weight: .black, design: .rounded) : .title3.weight(.heavy))
        .monospacedDigit()
        .foregroundStyle(big ? RoundColors.lime : RoundColors.cream)
        .minimumScaleFactor(0.6)
        .lineLimit(1)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      stale ? "\(label) yards out of date" : yards.map { "\(label) \($0) yards" } ?? "\(label) no yards"
    )
  }
}

struct YardsRow: View {
  let state: ShotTraxxRoundAttributes.ContentState
  let stale: Bool

  var body: some View {
    if !state.hasGreen {
      Text("No green location for this hole")
        .font(.footnote.weight(.semibold))
        .foregroundStyle(RoundColors.muted)
    } else if state.hasEnds {
      HStack(alignment: .lastTextBaseline, spacing: 22) {
        YardsColumn(label: "FRONT", yards: liveYards(state.front, stale: stale), big: false, stale: stale)
        YardsColumn(label: "MIDDLE", yards: liveYards(state.middle, stale: stale), big: true, stale: stale)
        YardsColumn(label: "BACK", yards: liveYards(state.back, stale: stale), big: false, stale: stale)
      }
    } else {
      YardsColumn(label: "MIDDLE", yards: liveYards(state.middle, stale: stale), big: true, stale: stale)
    }
  }
}

struct RoundLockScreenView: View {
  let context: ActivityViewContext<ShotTraxxRoundAttributes>

  var body: some View {
    let state = context.state
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 1) {
          Text(context.attributes.courseName)
            .font(.caption.weight(.bold))
            .foregroundStyle(RoundColors.muted)
            .lineLimit(1)
          Text(holeLine(state))
            .font(.headline.weight(.heavy))
            .foregroundStyle(RoundColors.cream)
        }
        Spacer(minLength: 8)
        if !state.scoreLine.isEmpty {
          Text(state.scoreLine)
            .font(.subheadline.weight(.heavy))
            .monospacedDigit()
            .foregroundStyle(RoundColors.cream)
            .lineLimit(1)
        }
      }
      HStack {
        Spacer(minLength: 0)
        YardsRow(state: state, stale: context.isStale)
        Spacer(minLength: 0)
      }
      if let footer = footerLine(state) {
        Text(footer)
          .font(.footnote.weight(.semibold))
          .foregroundStyle(RoundColors.muted)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
    }
    .padding(14)
  }
}

struct ShotTraxxRoundLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: ShotTraxxRoundAttributes.self) { context in
      RoundLockScreenView(context: context)
        .activityBackgroundTint(RoundColors.background)
        .activitySystemActionForegroundColor(RoundColors.lime)
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(holeLine(state))
            .font(.subheadline.weight(.heavy))
            .foregroundStyle(RoundColors.cream)
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if !state.scoreLine.isEmpty {
            Text(state.scoreLine)
              .font(.subheadline.weight(.heavy))
              .monospacedDigit()
              .foregroundStyle(RoundColors.cream)
              .lineLimit(1)
          }
        }
        DynamicIslandExpandedRegion(.center) {
          YardsRow(state: state, stale: context.isStale)
        }
        DynamicIslandExpandedRegion(.bottom) {
          if let footer = footerLine(state) {
            Text(footer)
              .font(.caption.weight(.semibold))
              .foregroundStyle(RoundColors.muted)
              .lineLimit(1)
          }
        }
      } compactLeading: {
        Text("H\(state.hole)")
          .font(.caption.weight(.heavy))
          .foregroundStyle(RoundColors.cream)
      } compactTrailing: {
        Text(yardsText(liveYards(state.middle, stale: context.isStale)))
          .font(.caption.weight(.heavy))
          .monospacedDigit()
          .foregroundStyle(RoundColors.lime)
      } minimal: {
        Text(yardsText(liveYards(state.middle, stale: context.isStale)))
          .font(.caption2.weight(.heavy))
          .monospacedDigit()
          .foregroundStyle(RoundColors.lime)
      }
      .keylineTint(RoundColors.lime)
    }
  }
}
