import SwiftUI

/// Pushed off Watch Home. Appending this never starts or continues a round.
private enum WatchHomePush: Hashable {
  case searchNearby
}

struct ContentView: View {
  @EnvironmentObject private var session: WatchClubSession
  @Environment(\.scenePhase) private var scenePhase
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
        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Button(action: { session.closePuttSheet() }) {
              Text("Back")
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(Color("cream"))
                .lineLimit(1)
                .padding(.horizontal, 8)
                .frame(minHeight: 24)
                .overlay(
                  Capsule()
                    .stroke(Color("cream"), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            Text("Hole \(session.putt.holeNumber) · Putts")
              .font(.system(size: 12, weight: .heavy))
              .foregroundStyle(Color("cream"))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          if !session.feedback.isEmpty {
            Text(session.feedback)
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(Color.orange)
              .lineLimit(1)
          }
          puttSheet
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.horizontal, 4)
      } else {
        clubPick
      }
    }
    .background(Color("bg").ignoresSafeArea())
    .onAppear { session.noteScenePhase("active") }
    .onChange(of: scenePhase) { phase in
      if phase == .active {
        session.noteScenePhase("active")
        session.refreshHomeIfShowing()
      }
      if phase == .inactive { session.noteScenePhase("inactive") }
      if phase == .background { session.noteScenePhase("background") }
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
        Text("Search nearby")
          .font(.system(size: 15, weight: .heavy))
          .foregroundStyle(Color("cream"))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
          .frame(maxWidth: .infinity, minHeight: 40)
          .overlay(
            RoundedRectangle(cornerRadius: 10)
              .stroke(Color("cream"), lineWidth: 1)
          )
      }
      .buttonStyle(.plain)

      if session.hasLiveHole {
        Button(action: { session.dismissNearbyToHole() }) {
          Text("Continue · Hole \(session.list.holeNumber)")
            .font(.system(size: 15, weight: .heavy))
            .foregroundStyle(Color("bg"))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(outdoorLime)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
      }

      if session.home.queued {
        Text("Queued · will sync")
          .font(.system(size: 15, weight: .heavy))
          .foregroundStyle(Color.orange)
          .lineLimit(2)
          .minimumScaleFactor(0.8)
          .frame(maxWidth: .infinity, alignment: .leading)
      }

      ScrollView {
        VStack(alignment: .leading, spacing: 6) {
          Text("Select course")
            .font(.system(size: 16, weight: .heavy))
            .foregroundStyle(Color("cream"))
          if !session.feedback.isEmpty {
            Text(session.feedback)
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(session.feedback.contains("✓") || session.feedback.contains("★") ? Color("accent") : Color.orange)
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
              .foregroundStyle(Color("cream"))
          }

          Button(action: { session.requestHome() }) {
            Text(session.home.refreshLabel)
              .font(.system(size: 13, weight: .heavy))
              .foregroundStyle(session.home.queued ? Color.orange : Color("cream"))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .frame(maxWidth: .infinity, minHeight: 32)
              .overlay(
                RoundedRectangle(cornerRadius: 8)
                  .stroke(session.home.queued ? Color.orange : Color("muted"), lineWidth: 1)
              )
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
        Text("Back")
          .font(.system(size: 13, weight: .heavy))
          .foregroundStyle(Color("cream"))
          .frame(maxWidth: .infinity, minHeight: 32)
          .overlay(
            RoundedRectangle(cornerRadius: 8)
              .stroke(Color("cream"), lineWidth: 1)
          )
      }
      .buttonStyle(.plain)

      if session.home.queued {
        Text("Queued · will sync")
          .font(.system(size: 15, weight: .heavy))
          .foregroundStyle(Color.orange)
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
                .foregroundStyle(Color("cream"))
                .lineLimit(3)
                .minimumScaleFactor(0.8)
            }
          }
          ForEach(nearby) { course in
            homeRow(course)
          }

          Button(action: { session.requestHome() }) {
            Text(session.home.refreshLabel)
              .font(.system(size: 13, weight: .heavy))
              .foregroundStyle(session.home.queued ? Color.orange : Color("cream"))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .frame(maxWidth: .infinity, minHeight: 32)
              .overlay(
                RoundedRectangle(cornerRadius: 8)
                  .stroke(session.home.queued ? Color.orange : Color("muted"), lineWidth: 1)
              )
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
      .font(.system(size: 11, weight: .heavy))
      .foregroundStyle(Color("muted"))
      .padding(.top, 4)
  }

  /// Name area starts / continues the round. Star toggles the phone favorite only.
  @ViewBuilder
  private func homeRow(_ course: HomeCourse) -> some View {
    let live = session.isLiveCourse(course)
    HStack(spacing: 4) {
      Button(action: { session.openHomeCourse(course) }) {
        VStack(alignment: .leading, spacing: 1) {
          Text(course.name)
            .font(.system(size: 15, weight: .heavy))
            .foregroundStyle(Color("cream"))
            .lineLimit(2)
            .minimumScaleFactor(0.8)
            .multilineTextAlignment(.leading)
          if live {
            Text("Continue round")
              .font(.system(size: 11, weight: .heavy))
              .foregroundStyle(outdoorLime)
          } else if let distance = course.distanceLabel {
            Text(distance)
              .font(.system(size: 11, weight: .bold))
              .foregroundStyle(Color("muted"))
          }
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .padding(.horizontal, 8)
        .contentShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
          RoundedRectangle(cornerRadius: 10)
            .stroke(live ? outdoorLime : Color("cream"), lineWidth: live ? 2 : 1)
        )
      }
      .buttonStyle(.plain)
      .disabled(session.sending)

      Button(action: { session.toggleFavorite(course) }) {
        Image(systemName: course.favorite ? "star.fill" : "star")
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(course.favorite ? outdoorLime : Color("cream"))
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
      Text("Courses")
        .font(.system(size: 13, weight: .heavy))
        .foregroundStyle(Color("cream"))
        .frame(maxWidth: .infinity, minHeight: 32)
        .overlay(
          RoundedRectangle(cornerRadius: 8)
            .stroke(Color("cream"), lineWidth: 1)
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
        .font(.footnote.weight(.bold))
        .foregroundStyle(Color("cream"))
      if !session.showsNearby, !session.putt.open, session.list.showSoft {
        Text("Approximate")
          .font(.system(size: 10, weight: .heavy))
          .padding(.horizontal, 5)
          .padding(.vertical, 2)
          .background(Color.orange.opacity(0.25))
          .clipShape(Capsule())
      }
    }
    if nearbyShowsFeedback {
      Text(session.feedback)
        .font(.footnote.weight(.bold))
        .foregroundStyle(session.feedback.contains("✓") ? Color("accent") : Color.orange)
    }
  }

  @ViewBuilder
  private var nearbyStart: some View {
    if session.nearby.courseId != nil {
      // Watch Home owns the course list. This is holes → tees for the tapped course.
      // One cream title through holes → tees. Never orange + leftover white row.
      if let name = session.nearby.courseName {
        Text(name)
          .font(.footnote.weight(.bold))
          .foregroundStyle(Color("cream"))
          .lineLimit(2)
      }
      if session.nearby.holeCount == nil {
        Button(action: { session.pickHoleCount(9) }) {
          Text("9")
            .font(.headline.weight(.heavy))
            .frame(maxWidth: .infinity, minHeight: 40)
        }
        .buttonStyle(.bordered)
        .disabled(session.sending)
        Button(action: { session.pickHoleCount(18) }) {
          Text("18")
            .font(.headline.weight(.heavy))
            .frame(maxWidth: .infinity, minHeight: 40)
        }
        .buttonStyle(.bordered)
        .disabled(session.sending)
      } else if !session.nearby.tees.isEmpty {
        ForEach(session.nearby.tees) { tee in
          Button(action: { session.pickTee(name: tee.name) }) {
            Text(tee.name)
              .font(.headline.weight(.heavy))
              .frame(maxWidth: .infinity, minHeight: 40)
          }
          .buttonStyle(.bordered)
          .disabled(session.sending)
        }
      }
    }
  }

  /// #C8F542 — same lime as phone. Asset accent can vanish on Ultra outdoor.
  private let outdoorLime = Color(red: 200.0 / 255.0, green: 245.0 / 255.0, blue: 66.0 / 255.0)

  @ViewBuilder
  private var puttSheet: some View {
    // Fixed 2×2 with literal 0–3 — a lazy grid dropped that cell on Ultra.
    // Selection is lime fill on the same pill — never hide the tapped bucket.
    // Made is a full-width high-contrast pill under Add/Undo.
    VStack(spacing: 4) {
      HStack(spacing: 4) {
        puttLengthButton(id: "inside_3", label: "0–3")
        puttLengthButton(id: "3_to_10", label: "3–10")
      }
      HStack(spacing: 4) {
        puttLengthButton(id: "10_to_20", label: "10–20")
        puttLengthButton(id: "over_20", label: "20+")
      }

      HStack(spacing: 4) {
        Button(action: { session.addPutt() }) {
          Text("Add putt")
            .font(.system(size: 11, weight: .heavy))
            .foregroundStyle(Color("cream"))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity, minHeight: 36)
            .overlay(
              RoundedRectangle(cornerRadius: 10)
                .stroke(Color("cream"), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(session.sending || session.putt.pending == nil || !session.putt.canAdd)

        Button(action: { session.undoPutt() }) {
          Text("Undo")
            .font(.system(size: 11, weight: .heavy))
            .foregroundStyle(Color("cream"))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity, minHeight: 36)
            .overlay(
              RoundedRectangle(cornerRadius: 10)
                .stroke(Color("cream"), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(session.sending || session.putt.lengths.isEmpty)
      }

      Button(action: { session.madeIt() }) {
        Text("Made")
          .font(.system(size: 18, weight: .black))
          .foregroundStyle(Color("bg"))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
          .frame(maxWidth: .infinity, minHeight: 48)
          // Fill is clipped to the pill — no square lime behind the rounded stroke.
          .background(outdoorLime)
          .clipShape(RoundedRectangle(cornerRadius: 12))
          .contentShape(RoundedRectangle(cornerRadius: 12))
          .overlay(
            RoundedRectangle(cornerRadius: 12)
              .stroke(Color("cream"), lineWidth: 2)
          )
      }
      .buttonStyle(.plain)
      .layoutPriority(1)
      .fixedSize(horizontal: false, vertical: true)

      if !session.putt.lengths.isEmpty {
        Text(session.putt.lengths.enumerated().map { "Putt \($0.offset + 1) · \(session.putt.label(for: $0.element))" }.joined(separator: " · "))
          .font(.system(size: 10, weight: .heavy))
          .foregroundStyle(Color("cream"))
          .lineLimit(1)
      }

      if session.putt.pending == nil && session.putt.lengths.count < 5 {
        Text("No length — pick a distance")
          .font(.system(size: 10, weight: .bold))
          .foregroundStyle(Color("cream"))
          .lineLimit(1)
      }
    }
  }

  @ViewBuilder
  private func puttLengthButton(id: String, label: String) -> some View {
    let selected = session.putt.pending == id
    Button(action: { session.pickPuttLength(id) }) {
      Text(label)
        .font(.system(size: 13, weight: .heavy))
        .foregroundStyle(selected ? Color("bg") : Color("cream"))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity, minHeight: 36)
        .background(selected ? outdoorLime : Color.clear)
        .overlay(
          RoundedRectangle(cornerRadius: 10)
            .stroke(selected ? outdoorLime : Color("cream"), lineWidth: selected ? 3 : 1)
        )
    }
    .buttonStyle(.plain)
    .disabled(!session.putt.canAdd)
  }

  /// Back / Home / Putt row pill — same 44pt height, 10pt radius, 16pt font as
  /// the club strip. Fill and hit area are clipped to the rounded shape.
  @ViewBuilder
  private func actionPill(_ title: String) -> some View {
    Text(title)
      .font(.system(size: 16, weight: .heavy))
      .foregroundStyle(Color("cream"))
      .lineLimit(1)
      .minimumScaleFactor(0.65)
      .frame(maxWidth: .infinity, minHeight: 44)
      .background(Color("bg"))
      .clipShape(RoundedRectangle(cornerRadius: 10))
      .contentShape(RoundedRectangle(cornerRadius: 10))
      .overlay(
        RoundedRectangle(cornerRadius: 10)
          .stroke(Color("cream"), lineWidth: 1)
      )
  }

  @ViewBuilder
  private var clubPick: some View {
    GeometryReader { geo in
      let mapHeight = geo.size.height * 0.6
      let controlHeight = geo.size.height * 0.4
      VStack(alignment: .leading, spacing: 0) {
        VStack(alignment: .leading, spacing: 6) {
          // Left is Hole N · fixed tee length. Top-right is live yards to the green.
          HStack(alignment: .top, spacing: 6) {
            Text(session.list.statusLine)
              .font(.system(size: 16, weight: .bold))
              .foregroundStyle(Color("cream"))
              .lineLimit(1)
              .minimumScaleFactor(0.6)
              .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 0) {
              Text(session.list.liveYardsLabel)
                .font(.system(size: 28, weight: .heavy))
                .foregroundStyle(session.list.liveYardsTrusted ? Color("accent") : Color("muted"))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
              Text("to hole")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color("muted"))
                .lineLimit(1)
            }
            .fixedSize(horizontal: true, vertical: true)
          }
          if !session.feedback.isEmpty {
            Text(session.feedback)
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(session.feedback.contains("✓") ? Color("accent") : Color.orange)
              .lineLimit(2)
          }
          if !session.workoutDeniedHint.isEmpty {
            Button(action: { session.dismissWorkoutDeniedHint() }) {
              Text(session.workoutDeniedHint)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color.orange)
                .multilineTextAlignment(.leading)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
          }
          Spacer(minLength: 0)
        }
        .frame(height: mapHeight, alignment: .topLeading)

        VStack(alignment: .leading, spacing: 6) {
          HStack(spacing: 8) {
            Button(action: { session.madeIt() }) {
              actionPill("Hole Out")
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
                        .font(.system(size: 16, weight: .black))
                        .foregroundStyle(selected ? Color("bg") : Color("cream"))
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                        .frame(width: pillWidth, height: 44)
                        // Fill is clipped to the pill — no square halo / overflow box.
                        .background(selected ? outdoorLime : Color("bg"))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .contentShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                          RoundedRectangle(cornerRadius: 10)
                            .stroke(selected ? outdoorLime : Color("cream"), lineWidth: selected ? 3 : 1)
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
          .frame(height: 52)
          .layoutPriority(1)

          Button(action: { showAllClubs.toggle() }) {
            Text("All clubs")
              .font(.system(size: 15, weight: .heavy))
              .foregroundStyle(Color("cream"))
              .frame(maxWidth: .infinity, minHeight: 40)
              .overlay(
                RoundedRectangle(cornerRadius: 10)
                  .stroke(Color("cream"), lineWidth: 1)
              )
          }
          .buttonStyle(.plain)

          if showAllClubs {
            ScrollView {
              VStack(spacing: 4) {
                ForEach(moreClubs, id: \.self) { clubId in
                  Button(action: { session.pick(clubId: clubId) }) { // same pick as strip — marks the shot
                    Text(session.list.label(for: clubId))
                      .font(.system(size: 15, weight: .heavy))
                      .foregroundStyle(Color("cream"))
                      .frame(maxWidth: .infinity, alignment: .leading)
                      .frame(minHeight: 36)
                  }
                  .buttonStyle(.bordered)
                  .tint(Color("cream"))
                }
              }
            }
          }
        }
        .frame(minHeight: controlHeight, alignment: .top)
      }
    }
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
      Text("Round complete")
        .font(.system(size: 18, weight: .heavy))
        .foregroundStyle(Color("cream"))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text("Finish round on your phone.")
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(Color("muted"))
        .lineLimit(2)
        .minimumScaleFactor(0.8)
      if !session.feedback.isEmpty {
        Text(session.feedback)
          .font(.system(size: 12, weight: .bold))
          .foregroundStyle(session.feedback.contains("✓") ? Color("accent") : Color.orange)
          .lineLimit(2)
      }
      Spacer(minLength: 0)
      Button(action: { session.homeAfterRound() }) {
        actionPill("Home")
      }
      .buttonStyle(.plain)
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
