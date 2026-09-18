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
        ScrollView {
          VStack(alignment: .leading, spacing: 8) {
            statusHeader
            puttSheet
          }
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
    if session.putt.lengths.isEmpty {
      Text("How long was the putt?")
        .font(.footnote.weight(.bold))
        .foregroundStyle(Color("cream"))
    } else {
      ForEach(Array(session.putt.lengths.enumerated()), id: \.offset) { index, lengthId in
        Text("Putt \(index + 1) · \(session.putt.label(for: lengthId))")
          .font(.caption.weight(.heavy))
          .foregroundStyle(Color("cream"))
      }
    }

    ForEach(buckets, id: \.id) { bucket in
      Button(action: { session.addPutt(lengthId: bucket.id) }) {
        Text(session.putt.label(for: bucket.id))
          .font(.headline.weight(.heavy))
          .frame(maxWidth: .infinity, minHeight: 40)
      }
      .buttonStyle(.bordered)
      .disabled(session.sending || !session.putt.canAdd)
    }

    if !session.putt.lengths.isEmpty {
      Button(action: { session.undoPutt() }) {
        Text("Undo putt")
          .font(.caption.weight(.heavy))
          .frame(maxWidth: .infinity, minHeight: 36)
      }
      .buttonStyle(.bordered)
      .disabled(session.sending)
    }

    Button(action: { session.madeIt() }) {
      Text("Made it")
        .font(.headline.weight(.black))
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.borderedProminent)
    .tint(Color("accent"))
    .foregroundStyle(Color.black)
    .disabled(session.sending || !session.putt.canMake)
  }

  @ViewBuilder
  private var clubPick: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(session.list.statusLine)
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(Color("cream"))
        .lineLimit(1)
        .minimumScaleFactor(0.8)

      HStack(spacing: 6) {
        Button(action: { session.leave("back") }) {
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
        .disabled(session.sending)
        Button(action: { session.leave("home") }) {
          Text("Home")
            .font(.system(size: 13, weight: .heavy))
            .foregroundStyle(Color("cream"))
            .frame(maxWidth: .infinity, minHeight: 32)
            .overlay(
              RoundedRectangle(cornerRadius: 8)
                .stroke(Color("cream"), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(session.sending)
      }

      if !session.feedback.isEmpty {
        Text(session.feedback)
          .font(.system(size: 10, weight: .bold))
          .foregroundStyle(session.feedback.contains("✓") ? Color("accent") : Color.orange)
          .lineLimit(1)
      }

      GeometryReader { geo in
        let visible = min(3, max(stripClubs.count, 1))
        let pillWidth = max(44.0, (geo.size.width - CGFloat(max(visible - 1, 0)) * 8) / CGFloat(visible))
        ScrollViewReader { proxy in
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach(wheelClubs, id: \.token) { club in
                Text(session.list.label(for: club.id))
                  .font(.system(size: 15, weight: .black))
                  .foregroundStyle(club.id == stripSelectedId ? Color("accent") : Color("cream"))
                  .lineLimit(1)
                  .minimumScaleFactor(0.7)
                  .frame(width: pillWidth, height: 36)
                  .background(Color("bg"))
                  .overlay(
                    RoundedRectangle(cornerRadius: 10)
                      .stroke(club.id == stripSelectedId ? Color("accent") : Color("cream"), lineWidth: 1)
                  )
                  .padding(.trailing, club.seamAfter ? 24 : 0)
                  .id(club.token)
                  .onTapGesture {
                    if !session.sending { session.select(club.id) }
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
      .frame(height: 44)

      HStack(spacing: 6) {
        if session.list.lastClubId != nil {
          Button(action: { session.pickSameClub() }) {
            Text(sameClubTitle)
              .font(.system(size: 12, weight: .heavy))
              .foregroundStyle(Color("cream"))
              .lineLimit(1)
              .minimumScaleFactor(0.7)
              .frame(maxWidth: .infinity, minHeight: 28)
          }
          .buttonStyle(.plain)
          .disabled(session.sending)
        }

        Button(action: { showAllClubs.toggle() }) {
          Text("All clubs")
            .font(.system(size: 12, weight: .heavy))
            .foregroundStyle(Color("cream"))
            .frame(maxWidth: .infinity, minHeight: 28)
        }
        .buttonStyle(.plain)
      }

      if showAllClubs {
        ScrollView {
          VStack(spacing: 2) {
            ForEach(moreClubs, id: \.self) { clubId in
              Button(action: { session.pick(clubId: clubId) }) { // same pick as strip — marks the shot
                Text(session.list.label(for: clubId))
                  .font(.system(size: 13, weight: .heavy))
                  .foregroundStyle(Color("cream"))
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .frame(minHeight: 24)
              }
              .buttonStyle(.bordered)
              .tint(Color("cream"))
              .disabled(session.sending)
            }
          }
        }
      }
    }
    .padding(.horizontal, 2)
  }

  private var sameClubTitle: String {
    guard let id = session.list.lastClubId else { return "Same club" }
    let raw = session.list.label(for: id)
    let name = raw.components(separatedBy: " · ").first ?? raw
    if name.isEmpty { return "Same club" }
    return "Same club · \(name)"
  }

  private var moreClubs: [String] {
    session.list.bag
  }

  private var stripScrollKey: String {
    "\(session.list.bag.joined(separator: ","))-\(session.list.yardsToGreen ?? -1)"
  }

  private var stripPickId: String? {
    let clubs = stripClubs
    guard !clubs.isEmpty else { return nil }
    guard let hole = session.list.yardsToGreen else { return clubs.first?.id }
    return clubs.min { abs($0.carry - hole) < abs($1.carry - hole) }?.id
  }

  private var stripSelectedId: String? {
    session.list.selectedClubId ?? stripPickId
  }

  private var stripWindowStart: Int {
    let clubs = stripClubs
    let n = clubs.count
    guard n > 0 else { return 0 }
    let closest = clubs.firstIndex(where: { $0.id == stripPickId }) ?? 0
    if n <= 2 { return 0 }
    if closest > 0 && closest < n - 1 { return closest - 1 }
    if closest >= n - 1 { return n - 3 }
    return 0
  }

  private var stripWindowToken: String? {
    let clubs = stripClubs
    guard !clubs.isEmpty else { return wheelClubs.first?.token }
    if clubs.count <= 1 { return clubs[0].id }
    let start = min(max(stripWindowStart, 0), clubs.count - 1)
    return "\(clubs[start].id)#1"
  }

  private var stripClubs: [(id: String, carry: Int)] {
    session.list.bag
      .filter { $0 != "club_putter" }
      .compactMap { id -> (id: String, carry: Int)? in
        guard let carry = carryFromLabel(session.list.label(for: id)) else { return nil }
        return (id: id, carry: carry)
      }
      .sorted { $0.carry < $1.carry }
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
