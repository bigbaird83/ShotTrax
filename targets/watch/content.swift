import SwiftUI

/// Row B middle button. Opens the last-shot screen (Change club / Delete shot).
private let watchEditShotLabel = "Undo"
/// VoiceOver name. The visible word stays Undo.
private let watchUndoAccessibilityLabel = "Undo or change last shot"

/// Pushed off Watch Home. Appending this never starts or continues a round.
private enum WatchHomePush: Hashable {
  case searchNearby
}

struct ContentView: View {
  @EnvironmentObject private var session: WatchClubSession
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.isLuminanceReduced) private var isLuminanceReduced
  @State private var showAllClubs = false
  /// Search nearby is a push on this stack so Back pops and Home stays mounted.
  @State private var homePath = NavigationPath()

  var body: some View {
    Group {
    if session.showsHome {
      NavigationStack(path: $homePath) {
        watchHome
          .navigationDestination(for: WatchHomePush.self) { destination in
            switch destination {
            case .searchNearby:
              nearbySearch
            }
          }
      }
    } else if session.showsNearby {
        ScrollView {
          VStack(alignment: .leading, spacing: 8) {
            coursesBack
            statusHeader
            nearbyStart
          }
          .padding(.horizontal, 4)
        }
      } else if session.list.roundComplete && !session.putt.open {
        roundComplete
      } else if session.putt.open {
        // Compact title only. Fixed 2×2 — Ultra clipped 0–3 and Made.
        // Back/Cancel returns to hole play — no Made/Add, no invent GPS.
        // Feedback takes the title's place so it never adds a line and pushes
        // Made down.
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Button(action: { session.closePuttSheet() }) {
              capsuleBack(Text("Back"), height: 22)
            }
            .buttonStyle(.plain)
            if session.feedback.isEmpty {
              Text("Hole \(session.putt.holeNumber) · Putts")
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(outdoorCream)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            } else {
              Text(session.feedback)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(outdoorOrange)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            }
          }
          .frame(height: 22)
          puttSheet
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, 4)
      } else if session.penaltyChoicesOpen {
        penaltyMenu
      } else if session.changeClubOpen {
        changeClubList
      } else if session.editShotOpen {
        editShotMenu
      } else if showAllClubs {
        allClubsList
      } else {
        clubPick
      }
    }
    .background(Color("bg").ignoresSafeArea())
    .onAppear {
      session.noteLuminanceReduced(isLuminanceReduced)
      session.noteScenePhase("active")
    }
    .onChange(of: scenePhase) { phase in
      session.noteLuminanceReduced(isLuminanceReduced)
      if phase == .active {
        session.noteScenePhase("active")
        session.refreshHomeIfShowing()
      }
      if phase == .inactive { session.noteScenePhase("inactive") }
      if phase == .background { session.noteScenePhase("background") }
    }
    .onChange(of: isLuminanceReduced) { reduced in
      session.noteLuminanceReduced(reduced)
    }
    .onChange(of: session.list.holeNumber) { _ in
      // A new hole starts on the hole face, not a bag list or edit screen left open.
      showAllClubs = false
      session.closeEditScreens()
    }
    .onChange(of: session.showsHome) { showing in
      // Leaving Home (hole, or holes/tees) drops the push. Search → Back does not.
      if !showing { homePath = NavigationPath() }
    }
  }

  // MARK: Watch Home — Favorites stay the body. Nearby is a push.

  @ViewBuilder
  private var watchHome: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: { homePath.append(WatchHomePush.searchNearby) }) {
        tileChrome(
          HStack(spacing: 6) {
            limeGlyph("location.fill")
            Text("Search nearby")
              .font(.system(size: 15, weight: .heavy, design: .rounded))
              .foregroundStyle(outdoorCream)
              .lineLimit(1)
              .minimumScaleFactor(0.7)
          }
          .frame(maxWidth: .infinity, minHeight: 40),
          tone: .plain,
          radius: 12
        )
      }
      .buttonStyle(.plain)

      if session.hasLiveHole {
        Button(action: { session.dismissNearbyToHole() }) {
          tileChrome(
            HStack(spacing: 6) {
              Image(systemName: "play.fill")
                .font(.system(size: 12, weight: .heavy))
              Text("Continue · Hole \(session.list.holeNumber)")
                .font(.system(size: 15, weight: .heavy, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            }
            .foregroundStyle(Color("bg"))
            .frame(maxWidth: .infinity, minHeight: 40),
            tone: .selected,
            radius: 12
          )
        }
        .buttonStyle(.plain)
      }

      if session.home.queued {
        Text("Queued · will sync")
          .font(.system(size: 15, weight: .heavy, design: .rounded))
          .foregroundStyle(outdoorOrange)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      ScrollView {
        VStack(alignment: .leading, spacing: 6) {
          Text("Select course")
            .font(.system(size: 17, weight: .heavy, design: .rounded))
            .foregroundStyle(outdoorCream)
            .padding(.top, 2)
          if !session.feedback.isEmpty {
            Text(session.feedback)
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(session.feedback.contains("✓") || session.feedback.contains("★") ? outdoorLime : outdoorOrange)
              .lineLimit(2)
          }

          let favorites = session.home.favoriteRows
          if !favorites.isEmpty {
            homeSectionTitle("Favorites")
            ForEach(favorites) { course in
              homeRow(course)
            }
          } else if !session.home.line.isEmpty {
            Text(session.home.line)
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(outdoorCream)
          }

          Button(action: { session.requestHome() }) {
            refreshButtonLabel(session.home.refreshLabel)
          }
          .buttonStyle(.plain)
          .disabled(session.home.loading && !session.home.queued)
          .padding(.top, 4)
        }
      }
    }
    .padding(.horizontal, 4)
    .navigationBarBackButtonHidden(true)
    .toolbar(.hidden, for: .navigationBar)
  }

  /// Nearby courses from the phone / Worker. Same rows as before — never invented.
  /// Back pops this push; Home (and its favorites) stay on the stack.
  @ViewBuilder
  private var nearbySearch: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: {
        if !homePath.isEmpty { homePath.removeLast() }
      }) {
        tileChrome(
          HStack(spacing: 4) {
            backChevron
            Text("Back")
              .font(.system(size: 13, weight: .heavy, design: .rounded))
          }
          .foregroundStyle(outdoorCream)
          .frame(maxWidth: .infinity, minHeight: 32),
          tone: .plain,
          radius: 10
        )
      }
      .buttonStyle(.plain)

      if session.home.queued {
        Text("Queued · will sync")
          .font(.system(size: 15, weight: .heavy, design: .rounded))
          .foregroundStyle(outdoorOrange)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      ScrollView {
        VStack(alignment: .leading, spacing: 6) {
          homeSectionTitle("Nearby")
          // Phone GCA nearby (40 mi) from the Watch fix, else the phone's fix or
          // its last known location, else the phone's cached list. Nearby
          // favorites are included; no nearby rows → favorites below the line.
          let nearby = session.home.nearbyScreenRows
          let hasNearby = session.home.line.isEmpty && !nearby.isEmpty
          if !hasNearby {
            if session.home.loading && !session.home.queued {
              Text("Finding courses…")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color("muted"))
            } else if !session.home.queued {
              Text(session.home.nearbyEmptyLine)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(outdoorCream)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
            }
          }
          ForEach(nearby) { course in
            homeRow(course)
          }

          Button(action: { session.requestHome() }) {
            refreshButtonLabel(session.home.refreshLabel)
          }
          .buttonStyle(.plain)
          .disabled(session.home.loading && !session.home.queued)
          .padding(.top, 4)
        }
      }
    }
    .padding(.horizontal, 4)
    .background(Color("bg").ignoresSafeArea())
    .navigationBarBackButtonHidden(true)
    .toolbar(.hidden, for: .navigationBar)
    .onAppear { session.requestHome() }
  }

  @ViewBuilder
  private func homeSectionTitle(_ title: String) -> some View {
    Text(title.uppercased())
      .font(.system(size: 11, weight: .heavy, design: .rounded))
      .tracking(0.8)
      .foregroundStyle(Color("muted"))
      .padding(.top, 4)
  }

  /// Quiet refresh at the bottom of Home / Nearby. Outline only, so it never
  /// competes with the course rows above it. Orange while queued.
  private func refreshButtonLabel(_ title: String) -> some View {
    HStack(spacing: 5) {
      Image(systemName: session.home.queued ? "clock.arrow.circlepath" : "arrow.clockwise")
        .font(.system(size: 11, weight: .heavy))
      Text(title)
        .font(.system(size: 13, weight: .heavy, design: .rounded))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
    .foregroundStyle(session.home.queued ? outdoorOrange : Color("muted"))
    .frame(maxWidth: .infinity, minHeight: 32)
    .contentShape(RoundedRectangle(cornerRadius: 10))
    .overlay(
      RoundedRectangle(cornerRadius: 10)
        .stroke(session.home.queued ? outdoorOrange : tileEdge, lineWidth: 1)
    )
  }

  /// Name area starts / continues the round. Star toggles the phone favorite only.
  @ViewBuilder
  private func homeRow(_ course: HomeCourse) -> some View {
    let live = session.isLiveCourse(course)
    HStack(spacing: 4) {
      Button(action: { session.openHomeCourse(course) }) {
        tileChrome(
          VStack(alignment: .leading, spacing: 1) {
            Text(course.name)
              .font(.system(size: 15, weight: .heavy, design: .rounded))
              .foregroundStyle(outdoorCream)
              .lineLimit(2)
              .minimumScaleFactor(0.8)
              .multilineTextAlignment(.leading)
            if live {
              Text("Continue round")
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .foregroundStyle(outdoorLime)
            } else if let distance = course.distanceLabel {
              Text(distance)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(Color("muted"))
            }
          }
          .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
          .padding(.horizontal, 10)
          .padding(.vertical, 4),
          // The live course keeps a lime edge so it stands out in the list.
          tone: live ? .accent : .plain,
          radius: 12
        )
      }
      .buttonStyle(.plain)
      .disabled(session.sending)

      Button(action: { session.toggleFavorite(course) }) {
        Image(systemName: course.favorite ? "star.fill" : "star")
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(course.favorite ? outdoorLime : Color("muted"))
          .frame(width: 34, height: 44)
          .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(course.favorite ? "Remove favorite" : "Add favorite"))
    }
  }

  /// Holes / Tees → back to Watch Home (live round stays put).
  @ViewBuilder
  private var coursesBack: some View {
    Button(action: { session.backToHome() }) {
      tileChrome(
        HStack(spacing: 4) {
          backChevron
          Text("Courses")
            .font(.system(size: 13, weight: .heavy, design: .rounded))
        }
        .foregroundStyle(outdoorCream)
        .frame(maxWidth: .infinity, minHeight: 32),
        tone: .plain,
        radius: 10
      )
    }
    .buttonStyle(.plain)
  }

  /// After a course pick: Holes / Tees. Before a pick the face is Watch Home.
  private var nearbyNavTitle: String {
    if session.nearby.holeCount != nil, !session.nearby.tees.isEmpty {
      return "Tees"
    }
    return "Holes"
  }

  /// Pick reply echoes the course name in orange — hide that so the title is once.
  private var nearbyShowsFeedback: Bool {
    !session.feedback.isEmpty && session.feedback != session.nearby.courseName
  }

  @ViewBuilder
  private var statusHeader: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Text(session.showsNearby ? nearbyNavTitle : session.putt.open ? "Hole \(session.putt.holeNumber) · Putts" : session.list.statusLine)
        .font(.system(size: 15, weight: .heavy, design: .rounded))
        .foregroundStyle(outdoorCream)
      if !session.showsNearby, !session.putt.open, session.list.showSoft {
        Text("Approximate")
          .font(.system(size: 10, weight: .heavy))
          .foregroundStyle(outdoorOrange)
          .padding(.horizontal, 5)
          .padding(.vertical, 2)
          .background(outdoorOrange.opacity(0.2))
          .clipShape(Capsule())
      }
    }
    if nearbyShowsFeedback {
      Text(session.feedback)
        .font(.footnote.weight(.bold))
        .foregroundStyle(session.feedback.contains("✓") ? outdoorLime : outdoorOrange)
    }
  }

  @ViewBuilder
  private var nearbyStart: some View {
    if session.nearby.courseId != nil {
      // Watch Home owns the course list. This is holes → tees for the tapped course.
      // One cream title through holes → tees. Never orange + leftover white row.
      if let name = session.nearby.courseName {
        Text(name)
          .font(.system(size: 13, weight: .bold, design: .rounded))
          .foregroundStyle(Color("cream"))
          .lineLimit(2)
      }
      if session.nearby.holeCount == nil {
        Button(action: { session.pickHoleCount(9) }) {
          nearbyChoice(Text("9"))
        }
        .buttonStyle(.plain)
        .disabled(session.sending)
        Button(action: { session.pickHoleCount(18) }) {
          nearbyChoice(Text("18"))
        }
        .buttonStyle(.plain)
        .disabled(session.sending)
      } else if !session.nearby.tees.isEmpty {
        ForEach(session.nearby.tees) { tee in
          Button(action: { session.pickTee(name: tee.name) }) {
            nearbyChoice(Text(tee.name))
          }
          .buttonStyle(.plain)
          .disabled(session.sending)
        }
      }
    }
  }

  /// Leading chevron on full-width Back / Courses tiles.
  private var backChevron: some View {
    Image(systemName: "chevron.left")
      .font(.system(size: 11, weight: .heavy))
  }

  /// Small lime SF Symbol that leads a tile label.
  private func limeGlyph(_ name: String) -> some View {
    Image(systemName: name)
      .font(.system(size: 13, weight: .heavy))
      .foregroundStyle(outdoorLime)
  }

  /// Holes / tees choice: same raised tile as the rest of the Watch.
  private func nearbyChoice(_ label: Text) -> some View {
    tileChrome(
      label
        .font(.system(size: 17, weight: .heavy, design: .rounded))
        .foregroundStyle(outdoorCream)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity, minHeight: 40),
      tone: .plain,
      radius: 12
    )
  }

  /// #C8F542 — same lime as phone. Asset accent can vanish on Ultra outdoor.
  private let outdoorLime = Color(red: 200.0 / 255.0, green: 245.0 / 255.0, blue: 66.0 / 255.0)
  /// #F4F1E8 — same cream as the hole title. Literal so the empty dash does not
  /// depend on a named color the way accent does.
  private let outdoorCream = Color(red: 244.0 / 255.0, green: 241.0 / 255.0, blue: 232.0 / 255.0)
  /// #F57A3D — phone orange. Penalty and warnings.
  private let outdoorOrange = Color(red: 245.0 / 255.0, green: 122.0 / 255.0, blue: 61.0 / 255.0)
  /// #1A3324 — raised tile one step above the #0B1A12 face, so buttons read as
  /// solid shapes instead of cream outlines.
  private let tileFill = Color(red: 26.0 / 255.0, green: 51.0 / 255.0, blue: 36.0 / 255.0)
  /// Tile edge: cream at low alpha still traces the shape in sun on Ultra.
  private var tileEdge: Color { outdoorCream.opacity(0.28) }

  /// One look for every Watch button. Plain is a raised tile, accent is the
  /// finishing action, warning is Penalty, selected is the solid lime fill.
  private enum TileTone { case plain, accent, warning, selected }

  private func tileInk(_ tone: TileTone) -> Color {
    switch tone {
    case .plain: return outdoorCream
    case .accent: return outdoorLime
    case .warning: return outdoorOrange
    case .selected: return Color("bg")
    }
  }

  private func tileBackground(_ tone: TileTone) -> Color {
    switch tone {
    case .plain: return tileFill
    case .accent: return outdoorLime.opacity(0.14)
    case .warning: return outdoorOrange.opacity(0.16)
    case .selected: return outdoorLime
    }
  }

  private func tileStroke(_ tone: TileTone) -> Color {
    switch tone {
    case .plain: return tileEdge
    case .accent: return outdoorLime
    case .warning: return outdoorOrange
    case .selected: return outdoorLime
    }
  }

  private func tileStrokeWidth(_ tone: TileTone) -> CGFloat {
    tone == .plain ? 1 : 1.5
  }

  /// Rounded-rect fill, clip, hit area and edge in one place.
  private func tileChrome<Content: View>(_ content: Content, tone: TileTone, radius: CGFloat) -> some View {
    content
      .background(tileBackground(tone))
      .clipShape(RoundedRectangle(cornerRadius: radius))
      .contentShape(RoundedRectangle(cornerRadius: radius))
      .overlay(
        RoundedRectangle(cornerRadius: radius)
          .stroke(tileStroke(tone), lineWidth: tileStrokeWidth(tone))
      )
  }

  /// Small capsule Back used on the putt sheet and penalty menu.
  private func capsuleBack(_ label: Text, height: CGFloat) -> some View {
    HStack(spacing: 3) {
      Image(systemName: "chevron.left")
        .font(.system(size: 10, weight: .heavy))
      label
        .font(.system(size: 12, weight: .heavy, design: .rounded))
        .lineLimit(1)
    }
    .foregroundStyle(outdoorCream)
    .padding(.horizontal, 10)
    .frame(height: height)
    .background(tileFill)
    .clipShape(Capsule())
    .contentShape(Capsule())
    .overlay(
      Capsule()
        .stroke(tileEdge, lineWidth: 1)
    )
  }

  @ViewBuilder
  private var puttSheet: some View {
    // Fixed 2×2 with literal 0–3 — a lazy grid dropped that cell on Ultra.
    // Selection is lime fill on the same pill — never hide the tapped bucket.
    // Made is a full-width high-contrast pill under Add/Undo.
    // Every button stays on screen from 40mm to Ultra: rows run 36pt (Made 48pt)
    // and shrink only on a short face. The putt list / cue line is dropped
    // before any row would go under 32pt. Same math as watchPuttSheetFrames.
    GeometryReader { geo in
      let footerLines = (session.putt.lengths.isEmpty ? 0 : 1)
        + (session.putt.pending == nil && session.putt.lengths.count < 5 ? 1 : 0)
      let footerHeight = CGFloat(footerLines) * 16
      let rowWithFooter = min(36, (geo.size.height - 24 - footerHeight) / 4)
      let showsFooter = footerLines > 0 && rowWithFooter >= 32
      let rowHeight = max(0, showsFooter ? rowWithFooter : min(36, (geo.size.height - 24) / 4))
      let madeHeight = rowHeight + 12
      VStack(spacing: 4) {
        HStack(spacing: 4) {
          puttLengthButton(id: "inside_3", label: "0–3")
          puttLengthButton(id: "3_to_10", label: "3–10")
        }
        .frame(height: rowHeight)
        HStack(spacing: 4) {
          puttLengthButton(id: "10_to_20", label: "10–20")
          puttLengthButton(id: "over_20", label: "20+")
        }
        .frame(height: rowHeight)

        HStack(spacing: 4) {
          Button(action: { session.addPutt() }) {
            tileChrome(
              Text("Add putt")
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(outdoorCream)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, maxHeight: .infinity),
              tone: .plain,
              radius: 10
            )
          }
          .buttonStyle(.plain)
          .disabled(session.sending || session.putt.pending == nil || !session.putt.canAdd)

          Button(action: { session.undoPutt() }) {
            tileChrome(
              Text("Undo")
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(outdoorCream)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, maxHeight: .infinity),
              tone: .plain,
              radius: 10
            )
          }
          .buttonStyle(.plain)
          .disabled(session.sending || session.putt.lengths.isEmpty)
        }
        .frame(height: rowHeight)

        Button(action: { session.madeIt() }) {
          HStack(spacing: 6) {
            Image(systemName: "flag.fill")
              .font(.system(size: 14, weight: .heavy))
            Text("Made")
              .font(.system(size: 18, weight: .black, design: .rounded))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          .foregroundStyle(Color("bg"))
          .frame(maxWidth: .infinity)
          .frame(height: madeHeight)
          // Fill is clipped to the pill — no square lime behind the rounded stroke.
          .background(outdoorLime)
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .contentShape(RoundedRectangle(cornerRadius: 12))
          // Cream edge keeps the pill outlined in Ultra outdoor glare.
          .overlay(
            RoundedRectangle(cornerRadius: 12)
              .stroke(Color("cream"), lineWidth: 2)
          )
        }
        .buttonStyle(.plain)
        .layoutPriority(1)

        if !session.putt.lengths.isEmpty, showsFooter {
          Text(session.putt.lengths.enumerated().map { "Putt \($0.offset + 1) · \(session.putt.label(for: $0.element))" }.joined(separator: " · "))
            .font(.system(size: 10, weight: .heavy, design: .rounded))
            .foregroundStyle(outdoorCream)
            .lineLimit(1)
            .frame(height: 12)
        }

        if session.putt.pending == nil && session.putt.lengths.count < 5, showsFooter {
          Text("No length — pick a distance")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Color("muted"))
            .lineLimit(1)
            .frame(height: 12)
        }
      }
      .frame(maxWidth: .infinity, alignment: .top)
    }
  }

  @ViewBuilder
  private func puttLengthButton(id: String, label: String) -> some View {
    let selected = session.putt.pending == id
    Button(action: { session.pickPuttLength(id) }) {
      Text(label)
        .font(.system(size: 14, weight: .heavy, design: .rounded))
        .monospacedDigit()
        .foregroundStyle(tileInk(selected ? .selected : .plain))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(selected ? outdoorLime : tileFill)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .contentShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
          RoundedRectangle(cornerRadius: 10)
            .stroke(selected ? outdoorLime : tileEdge, lineWidth: selected ? 1.5 : 1)
        )
    }
    .buttonStyle(.plain)
    .disabled(!session.putt.canAdd)
  }

  /// Hole Out is the finishing action (lime); Penalty costs a stroke (orange).
  /// Everything else is a plain raised tile.
  private func actionPillTone(_ title: String) -> TileTone {
    switch title {
    case "Hole Out": return .accent
    case "Penalty": return .warning
    default: return .plain
    }
  }

  /// Back / Home / Putt row pill — same 44pt height, 10pt radius, 16pt font as
  /// the club strip. Fill and hit area are clipped to the rounded shape.
  @ViewBuilder
  private func actionPill(_ title: String) -> some View {
    let tone = actionPillTone(title)
    Text(title)
      .font(.system(size: 16, weight: .heavy, design: .rounded))
      .foregroundStyle(tileInk(tone))
      .lineLimit(1)
      .minimumScaleFactor(title == watchEditShotLabel ? 0.5 : 0.65)
      // Fills its row: 44pt, less only on a short face (see clubPick).
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(tileBackground(tone))
      .clipShape(RoundedRectangle(cornerRadius: 10))
      .contentShape(RoundedRectangle(cornerRadius: 10))
      .overlay(
        RoundedRectangle(cornerRadius: 10)
          .stroke(tileStroke(tone), lineWidth: tileStrokeWidth(tone))
      )
  }

  /// Blank slot the size of one actionPill, so a short row keeps the 3-column grid.
  private var emptyPillSlot: some View {
    Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  /// Penalty reasons as their own screen: small Back, then a 2-column grid of
  /// equal tiles. Tile height shrinks so the last row ends ≥8pt above the
  /// bottom safe area — no scroll, no clipped "Unplayable".
  @ViewBuilder
  private var penaltyMenu: some View {
    GeometryReader { geo in
      let backHeight: CGFloat = 28
      let rows: CGFloat = 2
      let tileHeight = max(0, min(44, (geo.size.height - backHeight - 6 * rows - 8) / rows))
      VStack(alignment: .leading, spacing: 6) {
        Button(action: { session.closePenaltyChoices() }) {
          capsuleBack(Text("Back"), height: backHeight)
        }
        .buttonStyle(.plain)
        HStack(spacing: 6) {
          Button(action: { session.pickPenalty("water") }) {
            penaltyTile("Water", height: tileHeight)
          }
          .buttonStyle(.plain)
          Button(action: { session.pickPenalty("ob") }) {
            penaltyTile("OB", height: tileHeight)
          }
          .buttonStyle(.plain)
        }
        HStack(spacing: 6) {
          Button(action: { session.pickPenalty("unplayable") }) {
            penaltyTile("Unplayable", height: tileHeight)
          }
          .buttonStyle(.plain)
          Button(action: { session.pickPenalty("other") }) {
            penaltyTile("Other", height: tileHeight)
          }
          .buttonStyle(.plain)
        }
        Spacer(minLength: 0)
      }
    }
    .padding(.horizontal, 4)
  }

  /// Same warning tone, radius and font as the Penalty pill, at a height that fits the grid.
  @ViewBuilder
  private func penaltyTile(_ title: String, height: CGFloat) -> some View {
    Text(title)
      .font(.system(size: 16, weight: .heavy, design: .rounded))
      .foregroundStyle(outdoorCream)
      .lineLimit(1)
      .minimumScaleFactor(0.5)
      .padding(.horizontal, 4)
      .frame(maxWidth: .infinity)
      .frame(height: height)
      .background(tileBackground(.warning))
      .clipShape(RoundedRectangle(cornerRadius: 10))
      .contentShape(RoundedRectangle(cornerRadius: 10))
      .overlay(
        RoundedRectangle(cornerRadius: 10)
          .stroke(tileStroke(.warning), lineWidth: tileStrokeWidth(.warning))
      )
  }

  @ViewBuilder
  private var clubPick: some View {
    GeometryReader { geo in
      // Header, then three equal button rows: Penalty / Home / Putt, Hole Out /
      // Retry / All clubs, and the club strip. Rows are 44pt and shrink only on a
      // short face, so every button stays on screen from 40mm to Ultra.
      // Same math as watchHoleFrames in src/domain/watchLayout.ts.
      let headerHeight: CGFloat = 48
      // Fits "999" at 28pt plus "yd"; the caption scales down to it.
      let yardsColumnWidth: CGFloat = 70
      // 4pt under the header, then two 6pt gaps between the three rows.
      let rowHeight = max(0, min(44, (geo.size.height - headerHeight - 16) / 3))
      let slotWidth = max(0, (geo.size.width - 16) / 3)
      // 60% top, but never so tall that the Hole Out row + club pills fall past
      // the bottom safe area on a short face.
      let mapHeight = max(0, min(geo.size.height * 0.6, geo.size.height - (rowHeight * 2 + 6)))
      let controlHeight = geo.size.height - mapHeight
      VStack(alignment: .leading, spacing: 0) {
        VStack(alignment: .leading, spacing: 0) {
          // Hole N · tee length and a one-line message on the left, live yards on
          // the right. Fixed height; the workout hint covers it (tap to dismiss)
          // instead of pushing the buttons down.
          HStack(alignment: .top, spacing: 6) {
            // Left: Hole N on its own line, the tee length under it, then one
            // message line. Two short lines instead of "Hole N · 412 yd", so
            // both stay readable next to the yards on a 40mm face.
            VStack(alignment: .leading, spacing: 0) {
              VStack(alignment: .leading, spacing: 0) {
                Text("Hole \(session.list.holeNumber)")
                  .font(.system(size: 15, weight: .heavy, design: .rounded))
                  .foregroundStyle(outdoorCream)
                  .lineLimit(1)
                  .minimumScaleFactor(0.75)
                if let tee = session.list.teeLengthLabel {
                  Text(tee)
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(Color("muted"))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                }
              }
              .accessibilityElement(children: .ignore)
              .accessibilityLabel(Text(session.list.statusLine))
              if session.penaltyRetry, !session.penaltyNotice.isEmpty {
                Text(session.penaltyNotice)
                  .font(.system(size: 12, weight: .bold))
                  .foregroundStyle(outdoorOrange)
                  .lineLimit(1)
                  .minimumScaleFactor(0.7)
              } else if !session.feedback.isEmpty {
                Text(session.feedback)
                  .font(.system(size: 12, weight: .bold))
                  .foregroundStyle(session.feedback.contains("✓") ? outdoorLime : outdoorOrange)
                  .lineLimit(1)
                  .minimumScaleFactor(0.7)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // Right: a fixed-width yards column, so it can never run into the
            // hole and tee lines. Big digits, small "yd".
            VStack(alignment: .trailing, spacing: 0) {
              // The empty string is still "—", but U+2014 in SF Compact stays a
              // hairline even at heavy 28. In muted on the dark green that stroke
              // disappears on Ultra, while size-11 "to hole" in the same color
              // still reads. A filled bar cannot collapse or antialias away.
              // Trusted yards use literal lime: the named accent color vanishes outdoors.
              if session.appLiveYardsTrusted, let yards = session.appLiveYards {
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                  Text("\(yards)")
                    .font(.system(size: 28, weight: .heavy, design: .rounded))
                    // Fixed-width digits: the number counts down without jitter.
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                  Text("yd")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                }
                .foregroundStyle(outdoorLime)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(session.appLiveYardsLabel))
              } else {
                Capsule()
                  .fill(outdoorCream)
                  .frame(width: 26, height: 5)
                  .frame(minHeight: 28, alignment: .center)
                  .accessibilityLabel(session.appLiveYardsLabel)
              }
              Group {
                if let reason = session.liveYardsReason, !reason.isEmpty {
                  Text(reason)
                } else {
                  Text("to hole")
                }
              }
              .font(.system(size: 11, weight: .semibold, design: .rounded))
              .foregroundStyle(Color("muted"))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
            }
            .frame(width: yardsColumnWidth, alignment: .trailing)
          }
          .frame(height: headerHeight, alignment: .top)
          .overlay {
            if !session.workoutDeniedHint.isEmpty {
              Button(action: { session.dismissWorkoutDeniedHint() }) {
                tileChrome(
                  Text(session.workoutDeniedHint)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(outdoorCream)
                    .multilineTextAlignment(.leading)
                    .lineLimit(3)
                    .minimumScaleFactor(0.7)
                    .padding(.horizontal, 6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading),
                  tone: .warning,
                  radius: 10
                )
              }
              .buttonStyle(.plain)
            }
          }
          Spacer(minLength: 0)
          // Penalty / Home / Putt: three equal Hole Out-sized pills, Penalty left,
          // directly above Hole Out. They sit in the top area's spare space so
          // nothing pushes Hole Out or the club pills down. Never full width.
          HStack(spacing: 8) {
            Button(action: { session.openPenaltyChoices() }) {
              actionPill("Penalty")
            }
            .buttonStyle(.plain)
            Button(action: { session.leave("home") }) {
              actionPill("Home")
            }
            .buttonStyle(.plain)
            // Putt matches Back / Home: same width share, height, radius, font.
            Button(action: { session.openPuttSheet() }) {
              actionPill("Putt")
            }
            .buttonStyle(.plain)
          }
          .frame(height: rowHeight)
          .padding(.bottom, 6)
        }
        .frame(height: mapHeight, alignment: .topLeading)

        VStack(alignment: .leading, spacing: 6) {
          // Hole Out keeps the same pill and column as Penalty. The middle slot is
          // Undo (last shot on this hole). Retry takes it only while a
          // penalty, undo, or club change is unconfirmed, and clears once the
          // phone confirms that id. The last slot holds All clubs (overlay below).
          HStack(spacing: 8) {
            Button(action: { session.madeIt() }) {
              actionPill("Hole Out")
            }
            .buttonStyle(.plain)
            if session.penaltyRetry || session.undoRetry || session.clubChangeRetry {
              Button(action: {
                if session.penaltyRetry {
                  session.retryPenalty()
                } else if session.undoRetry {
                  session.retryUndo()
                } else {
                  session.retryClubChange()
                }
              }) {
                actionPill("Retry")
              }
              .buttonStyle(.plain)
            } else {
              // Dim with no shot on this hole. Opening the screen is not a swing.
              Button(action: { session.openEditShot() }) {
                actionPill(watchEditShotLabel)
              }
              .buttonStyle(.plain)
              .allowsHitTesting(session.canEditShot)
              .opacity(session.canEditShot ? 1 : 0.4)
              .accessibilityLabel(Text(watchUndoAccessibilityLabel))
            }
            emptyPillSlot
          }
          .frame(height: rowHeight)

          GeometryReader { wheelGeo in
            let visible = min(3, max(stripClubs.count, 1))
            let gaps = CGFloat(max(visible - 1, 0)) * 8
            let pillWidth = max(1, (wheelGeo.size.width - gaps) / CGFloat(visible))
            ScrollViewReader { proxy in
              ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                  ForEach(wheelClubs, id: \.token) { club in
                    let selected = club.id == stripSelectedId
                    Button(action: { session.pick(clubId: club.id) }) {
                      Text(session.list.label(for: club.id))
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .foregroundStyle(tileInk(selected ? .selected : .plain))
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                        .frame(width: pillWidth, height: rowHeight)
                        // Fill is clipped to the pill — no square halo / overflow box.
                        .background(selected ? outdoorLime : tileFill)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .contentShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                          RoundedRectangle(cornerRadius: 10)
                            .stroke(selected ? outdoorLime : tileEdge, lineWidth: selected ? 1.5 : 1)
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, club.seamAfter ? 24 : 0)
                    .id(club.token)
                  }
                }
                .padding(.horizontal, 0)
              }
              .id(stripWindowToken ?? "strip")
              .onAppear { proxy.scrollTo(stripWindowToken, anchor: .leading) }
              .onChange(of: stripScrollKey) { _ in
                proxy.scrollTo(stripWindowToken, anchor: .leading)
              }
            }
          }
          .frame(height: rowHeight)
          .layoutPriority(1)
        }
        // All clubs fills Row B's last slot, so it costs no extra row. It opens
        // the bag as its own screen (allClubsList) instead of a list under the fold.
        .overlay(alignment: .topTrailing) {
          Button(action: { showAllClubs = true }) {
            tileChrome(
              Text("All clubs")
                .font(.system(size: 14, weight: .heavy, design: .rounded))
                .foregroundStyle(outdoorCream)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 2)
                .frame(maxWidth: .infinity, maxHeight: .infinity),
              tone: .plain,
              radius: 10
            )
          }
          .buttonStyle(.plain)
          .frame(width: slotWidth, height: rowHeight)
        }
        .frame(minHeight: controlHeight, alignment: .top)
      }
    }
    .padding(.horizontal, 4)
  }

  /// Edit the most recent shot on this hole. Back, Change club, and Delete shot
  /// are not swings: they do not start the 30-second yardage hold.
  @ViewBuilder
  private var editShotMenu: some View {
    GeometryReader { geo in
      let backHeight: CGFloat = 28
      let rowHeight = max(0, min(44, (geo.size.height - backHeight - 6 * 3 - 8) / 2))
      VStack(alignment: .leading, spacing: 6) {
        Button(action: { session.backFromEditShot() }) {
          capsuleBack(Text("Back"), height: backHeight)
        }
        .buttonStyle(.plain)
        Button(action: { session.openChangeClub() }) {
          actionPill("Change club")
            .frame(height: rowHeight)
        }
        .buttonStyle(.plain)
        Button(action: { session.deleteEditedShot() }) {
          actionPill("Delete shot")
            .frame(height: rowHeight)
        }
        .buttonStyle(.plain)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.horizontal, 4)
  }

  /// Same scrolling bag as All clubs. Picking a row reassigns this shot's club.
  /// It does not mark a new shot and does not start the yardage hold.
  @ViewBuilder
  private var changeClubList: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: { session.backFromChangeClub() }) {
        capsuleBack(Text("Back"), height: 28)
      }
      .buttonStyle(.plain)
      ScrollView {
        VStack(spacing: 4) {
          ForEach(moreClubs, id: \.self) { clubId in
            let current = clubId == session.list.lastShotClubId
            Button(action: { session.pickEditClub(clubId) }) {
              tileChrome(
                Text(session.list.label(for: clubId))
                  .font(.system(size: 15, weight: .heavy, design: .rounded))
                  .foregroundStyle(tileInk(current ? .selected : .plain))
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .padding(.horizontal, 10)
                  .frame(minHeight: 38),
                tone: current ? .selected : .plain,
                radius: 10
              )
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.horizontal, 4)
  }

  /// The whole bag as its own screen, so every club is reachable by scrolling
  /// instead of sitting under the fold of the hole face.
  @ViewBuilder
  private var allClubsList: some View {
    VStack(alignment: .leading, spacing: 6) {
      Button(action: { showAllClubs = false }) {
        capsuleBack(Text("Back"), height: 28)
      }
      .buttonStyle(.plain)
      ScrollView {
        VStack(spacing: 4) {
          ForEach(moreClubs, id: \.self) { clubId in
            Button(action: {
              session.pick(clubId: clubId) // same pick as strip — marks the shot
              showAllClubs = false
            }) {
              tileChrome(
                Text(session.list.label(for: clubId))
                  .font(.system(size: 15, weight: .heavy, design: .rounded))
                  .foregroundStyle(tileInk(clubId == stripSelectedId ? .selected : .plain))
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .padding(.horizontal, 10)
                  .frame(minHeight: 38),
                tone: clubId == stripSelectedId ? .selected : .plain,
                radius: 10
              )
            }
            .buttonStyle(.plain)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.horizontal, 4)
  }

  private var moreClubs: [String] {
    session.list.bag
  }

  private var stripScrollKey: String {
    let clubs = stripClubs.map { "\($0.id):\($0.carry)" }.joined(separator: ",")
    return "\(clubs)|\(stripWindowStart)|\(session.list.rankYards ?? -1)|\(session.list.selectedClubId ?? "")"
  }

  private var stripPickId: String? {
    let clubs = stripClubs.filter { $0.id != "club_putter" }
    guard !clubs.isEmpty else { return nil }
    guard let hole = session.list.rankYards else { return clubs.first?.id }
    return clubs.min { abs($0.carry - hole) < abs($1.carry - hole) }?.id
  }

  private var stripSelectedId: String? {
    session.list.selectedClubId
  }

  private var stripWindowStart: Int {
    let clubs = stripClubs
    let n = clubs.count
    guard n > 3 else { return 0 }
    let ranked = clubs.filter { $0.id != "club_putter" }
    let closestThree: [(id: String, carry: Int)] = {
      guard let hole = session.list.rankYards else { return Array(ranked.prefix(3)) }
      return Array(
        ranked.sorted { a, b in
          let da = abs(a.carry - hole)
          let db = abs(b.carry - hole)
          if da != db { return da < db }
          return a.carry < b.carry
        }.prefix(3)
      ).sorted { $0.carry < $1.carry }
    }()
    if let selected = session.list.selectedClubId,
       let selectedIndex = clubs.firstIndex(where: { $0.id == selected }),
       !closestThree.contains(where: { $0.id == selected }) {
      if selectedIndex > 0 && selectedIndex < n - 1 { return selectedIndex - 1 }
      if selectedIndex >= n - 1 { return n - 3 }
      return 0
    }
    guard let first = closestThree.first else { return 0 }
    return min(max(clubs.firstIndex(where: { $0.id == first.id }) ?? 0, 0), n - 3)
  }

  private var stripWindowToken: String? {
    let clubs = stripClubs
    guard !clubs.isEmpty else { return wheelClubs.first?.token }
    if clubs.count <= 1 { return clubs[0].id }
    let start = stripWindowStart
    return "\(clubs[start].id)#1"
  }

  /// Same STOCK_AVG_CARRY seeds as phone rankDistanceYards / resolveWheelCarries.
  private let stockCarryYards: [String: Int] = [
    "club_driver": 230,
    "club_3w": 210,
    "club_5w": 195,
    "club_4h": 185,
    "club_2i": 200,
    "club_3i": 190,
    "club_4i": 180,
    "club_5i": 170,
    "club_6i": 160,
    "club_7i": 150,
    "club_8i": 140,
    "club_9i": 130,
    "club_pw": 120,
    "club_48": 115,
    "club_50": 110,
    "club_gw": 105,
    "club_sw": 90,
    "club_lw": 75,
  ]

  private var stripClubs: [(id: String, carry: Int)] {
    var rows = session.list.bag
      .filter { $0 != "club_putter" }
      .compactMap { id -> (id: String, carry: Int)? in
        if let sent = session.list.clubCarry[id], sent > 0 {
          return (id: id, carry: sent)
        }
        if let carry = carryFromLabel(session.list.label(for: id)) {
          return (id: id, carry: carry)
        }
        if let stock = stockCarryYards[id] {
          return (id: id, carry: stock)
        }
        return nil
      }
    if let selected = session.list.selectedClubId, selected != "club_putter",
       !rows.contains(where: { $0.id == selected }) {
      let carry = carryFromLabel(session.list.label(for: selected)) ?? stockCarryYards[selected] ?? 1
      rows.append((id: selected, carry: carry))
    }
    rows = rows.sorted { $0.carry < $1.carry }
    // Putter is on the scrollable bag strip (end of bag). No invented carry. Not a top-3 suggestion.
    if session.list.bag.contains("club_putter") || session.list.selectedClubId == "club_putter" {
      if !rows.contains(where: { $0.id == "club_putter" }) {
        rows.append((id: "club_putter", carry: 0))
      }
    }
    return rows
  }

  private var wheelClubs: [(token: String, id: String, carry: Int, seamAfter: Bool)] {
    let base = stripClubs
    guard base.count > 1 else {
      return base.map { (token: $0.id, id: $0.id, carry: $0.carry, seamAfter: false) }
    }
    return (0..<3).flatMap { copy in
      base.enumerated().map { index, club in
        (
          token: "\(club.id)#\(copy)",
          id: club.id,
          carry: club.carry,
          seamAfter: index == base.count - 1
        )
      }
    }
  }

  /// Last hole finished (Made it / Hole Out). Never the Hole 18 putt sheet.
  @ViewBuilder
  private var roundComplete: some View {
    VStack(alignment: .leading, spacing: 8) {
      // Icon shares the title line so Home stays on screen on a 40mm face.
      HStack(spacing: 6) {
        Image(systemName: "flag.checkered")
          .font(.system(size: 16, weight: .heavy))
          .foregroundStyle(outdoorLime)
        Text("Round complete")
          .font(.system(size: 18, weight: .heavy, design: .rounded))
          .foregroundStyle(outdoorCream)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
      Text("Finish round on your phone.")
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(Color("muted"))
        .lineLimit(2)
        .minimumScaleFactor(0.8)
      if !session.feedback.isEmpty {
        Text(session.feedback)
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(session.feedback.contains("✓") ? outdoorLime : outdoorOrange)
          .lineLimit(2)
      }
      Spacer(minLength: 0)
      Button(action: { session.homeAfterRound() }) {
        actionPill("Home")
      }
      .buttonStyle(.plain)
      .frame(height: 44)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .padding(.horizontal, 4)
  }

  private func carryFromLabel(_ label: String) -> Int? {
    let parts = label.components(separatedBy: " · ")
    guard parts.count > 1 else { return nil }
    let raw = parts[1].trimmingCharacters(in: .whitespaces)
    if raw.isEmpty || raw == "—" || raw == "-" { return nil }
    guard let yards = Int(raw), yards > 0 else { return nil }
    return yards
  }
}

struct ContentView_Previews: PreviewProvider {
  static var previews: some View {
    ContentView()
      .environmentObject(WatchClubSession())
  }
}
