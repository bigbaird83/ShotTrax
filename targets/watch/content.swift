import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var session: WatchClubSession
  @State private var showAllClubs = false

  private let buckets: [(id: String, label: String)] = [
    ("inside_3", "Under 3 ft"),
    ("3_to_10", "3–10"),
    ("10_to_20", "10–20"),
    ("over_20", "20+"),
  ]

  var body: some View {
    Group {
      if session.showsNearby, session.nearby.awaitingSelect {
        VStack(alignment: .leading, spacing: 8) {
          if session.hasLiveHole {
            nearbyBack
          }
          Button(action: { session.requestNearby() }) {
            Text("Select course")
              .font(.headline.weight(.heavy))
              .frame(maxWidth: .infinity, minHeight: 44)
          }
          .buttonStyle(.bordered)
          .disabled(session.sending)
        }
        .padding(.horizontal, 4)
      } else if session.showsNearby, session.nearby.openPhone {
        VStack(alignment: .leading, spacing: 8) {
          if session.hasLiveHole {
            nearbyBack
          }
          Text(session.nearby.line.isEmpty ? "open the phone" : session.nearby.line)
            .font(.footnote.weight(.bold))
            .foregroundStyle(Color("cream"))
        }
        .padding(.horizontal, 4)
      } else if session.showsNearby {
        ScrollView {
          VStack(alignment: .leading, spacing: 8) {
            if session.hasLiveHole {
              nearbyBack
            }
            statusHeader
            nearbyStart
          }
          .padding(.horizontal, 4)
        }
      } else if session.putt.open {
        VStack(alignment: .leading, spacing: 8) {
          ScrollView {
            VStack(alignment: .leading, spacing: 8) {
              statusHeader
              puttSheet
            }
            .padding(.horizontal, 4)
          }
          puttMadeIt
            .padding(.horizontal, 4)
        }
      } else {
        clubPick
      }
    }
    .background(Color("bg").ignoresSafeArea())
  }

  @ViewBuilder
  private var nearbyBack: some View {
    Button(action: { session.dismissNearbyToHole() }) {
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
  }

  @ViewBuilder
  private var statusHeader: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Text(session.showsNearby ? "Courses near you" : session.putt.open ? "Hole \(session.putt.holeNumber) · Putts" : session.list.statusLine)
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
    if !session.feedback.isEmpty {
      Text(session.feedback)
        .font(.footnote.weight(.bold))
        .foregroundStyle(session.feedback.contains("✓") ? Color("accent") : Color.orange)
    }
  }

  @ViewBuilder
  private var nearbyStart: some View {
    if session.nearby.courseId != nil, session.nearby.holeCount == nil {
      if let name = session.nearby.courseName {
        Text(name)
          .font(.footnote.weight(.bold))
          .foregroundStyle(Color("cream"))
      }
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
      if let name = session.nearby.courseName {
        Text(name)
          .font(.footnote.weight(.bold))
          .foregroundStyle(Color("cream"))
      }
      ForEach(session.nearby.tees) { tee in
        Button(action: { session.pickTee(name: tee.name) }) {
          Text(tee.name)
            .font(.headline.weight(.heavy))
            .frame(maxWidth: .infinity, minHeight: 40)
        }
        .buttonStyle(.bordered)
        .disabled(session.sending)
      }
    } else {
      ForEach(session.nearby.courses) { course in
        Button(action: { session.pickCourse(courseId: course.id) }) {
          Text(course.name)
            .font(.headline.weight(.heavy))
            .frame(maxWidth: .infinity, minHeight: 40)
        }
        .buttonStyle(.bordered)
        .disabled(session.sending)
      }
    }
  }

  @ViewBuilder
  private var puttSheet: some View {
    Text("How long was the putt?")
      .font(.footnote.weight(.bold))
      .foregroundStyle(Color("cream"))

    ForEach(Array(session.putt.lengths.enumerated()), id: \.offset) { index, lengthId in
      Text("Putt \(index + 1) · \(session.putt.label(for: lengthId))")
        .font(.caption.weight(.heavy))
        .foregroundStyle(Color("cream"))
    }

    if session.putt.canAdd {
      Text("Putt \(session.putt.lengths.count + 1)")
        .font(.caption.weight(.heavy))
        .foregroundStyle(Color("cream"))
    }

    ForEach(buckets, id: \.id) { bucket in
      Button(action: { session.pickPuttLength(bucket.id) }) {
        Text(session.putt.label(for: bucket.id))
          .font(.headline.weight(.heavy))
          .frame(maxWidth: .infinity, minHeight: 40)
      }
      .buttonStyle(.bordered)
      .tint(session.putt.pending == bucket.id ? Color("accent") : Color("cream"))
      .disabled(session.sending || !session.putt.canAdd)
    }

    Button(action: { session.addPutt() }) {
      Text("Add a putt")
        .font(.headline.weight(.heavy))
        .frame(maxWidth: .infinity, minHeight: 40)
    }
    .buttonStyle(.bordered)
    .disabled(session.sending || session.putt.pending == nil || !session.putt.canAdd)

    if !session.putt.lengths.isEmpty {
      Button(action: { session.undoPutt() }) {
        Text("Undo putt")
          .font(.caption.weight(.heavy))
          .frame(maxWidth: .infinity, minHeight: 36)
      }
      .buttonStyle(.bordered)
      .disabled(session.sending)
    }

    if session.putt.pending == nil && session.putt.lengths.count < 5 {
      Text("No length — pick a distance")
        .font(.caption.weight(.bold))
        .foregroundStyle(Color("cream"))
    }
  }

  @ViewBuilder
  private var puttMadeIt: some View {
    Button(action: { session.madeIt() }) {
      Text("Made it")
        .font(.headline.weight(.black))
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.borderedProminent)
    .tint(Color("accent"))
    .foregroundStyle(Color.black)
    .disabled(session.sending)
  }

  @ViewBuilder
  private var clubPick: some View {
    GeometryReader { geo in
      let mapHeight = geo.size.height * 0.6
      let controlHeight = geo.size.height * 0.4
      VStack(alignment: .leading, spacing: 0) {
        VStack(alignment: .leading, spacing: 6) {
          Text(session.list.statusLine)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(Color("cream"))
            .lineLimit(2)
            .minimumScaleFactor(0.8)
          if !session.feedback.isEmpty {
            Text(session.feedback)
              .font(.system(size: 12, weight: .bold))
              .foregroundStyle(session.feedback.contains("✓") ? Color("accent") : Color.orange)
              .lineLimit(2)
          }
          Spacer(minLength: 0)
        }
        .frame(height: mapHeight, alignment: .topLeading)

        VStack(alignment: .leading, spacing: 6) {
          HStack(spacing: 8) {
            Button(action: { session.leave("back") }) {
              Text("Back")
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(Color("cream"))
                .frame(maxWidth: .infinity, minHeight: 44)
                .overlay(
                  RoundedRectangle(cornerRadius: 10)
                    .stroke(Color("cream"), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(session.sending)
            Button(action: { session.leave("home") }) {
              Text("Home")
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(Color("cream"))
                .frame(maxWidth: .infinity, minHeight: 44)
                .overlay(
                  RoundedRectangle(cornerRadius: 10)
                    .stroke(Color("cream"), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(session.sending)
          }

          GeometryReader { wheelGeo in
            let visible = min(3, max(stripClubs.count, 1))
            let gaps = CGFloat(max(visible - 1, 0)) * 8
            let pillWidth = max(1, (wheelGeo.size.width - gaps) / CGFloat(visible))
            ScrollViewReader { proxy in
              ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                  ForEach(wheelClubs, id: \.token) { club in
                    Text(session.list.label(for: club.id))
                      .font(.system(size: 16, weight: .black))
                      .foregroundStyle(club.id == stripSelectedId ? Color("accent") : Color("cream"))
                      .lineLimit(1)
                      .minimumScaleFactor(0.65)
                      .frame(width: pillWidth, height: 44)
                      .background(Color("bg"))
                      .overlay(
                        RoundedRectangle(cornerRadius: 10)
                          .stroke(club.id == stripSelectedId ? Color("accent") : Color("cream"), lineWidth: 1)
                      )
                      .padding(.trailing, club.seamAfter ? 24 : 0)
                      .id(club.token)
                      .onTapGesture {
                        if !session.sending { session.pick(clubId: club.id) }
                      }
                  }
                }
                .padding(.horizontal, 0)
              }
              .onAppear { proxy.scrollTo(stripWindowToken, anchor: .leading) }
              .onChange(of: stripScrollKey) { _ in
                proxy.scrollTo(stripWindowToken, anchor: .leading)
              }
            }
          }
          .frame(height: 52)

          if showPuttChips {
            HStack(spacing: 4) {
              ForEach(buckets, id: \.id) { bucket in
                Button(action: { session.addPutt(lengthId: bucket.id) }) {
                  Text(session.putt.label(for: bucket.id))
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(Color("cream"))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(maxWidth: .infinity, minHeight: 32)
                    .overlay(
                      RoundedRectangle(cornerRadius: 8)
                        .stroke(Color("cream"), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .disabled(session.sending || !session.putt.canAdd)
              }
            }
          }

          HStack(spacing: 8) {
            Button(action: { session.madeIt() }) {
              Text("Hole Out")
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
            .disabled(session.sending)

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
          }

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
                  .disabled(session.sending)
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

  /// Putter selected, or haversine ≤ 40 yd to hydrated green (good/soft only).
  /// Hard / forced quality never opens chips — putter-selected only.
  private var showPuttChips: Bool {
    if session.list.selectedClubId == "club_putter" { return true }
    guard session.list.yardsQuality == "good" || session.list.yardsQuality == "soft" else { return false }
    guard let yards = session.list.yardsToGreen else { return false }
    return yards <= 40
  }

  private var moreClubs: [String] {
    session.list.bag
  }

  private var stripScrollKey: String {
    let clubs = stripClubs.map { "\($0.id):\($0.carry)" }.joined(separator: ",")
    return "\(clubs)|\(stripWindowStart)|\(session.list.yardsToGreen ?? -1)|\(session.list.selectedClubId ?? "")"
  }

  private var stripPickId: String? {
    let clubs = stripClubs.filter { $0.id != "club_putter" }
    guard !clubs.isEmpty else { return nil }
    guard let hole = session.list.yardsToGreen else { return clubs.first?.id }
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
      guard let hole = session.list.yardsToGreen else { return Array(ranked.prefix(3)) }
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
