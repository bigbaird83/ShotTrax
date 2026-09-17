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
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(session.putt.open ? "Hole \(session.putt.holeNumber) · Putts" : session.list.statusLine)
            .font(.headline)
            .foregroundStyle(Color("cream"))
          if !session.putt.open, session.list.showSoft {
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

        if session.putt.open {
          puttSheet
        } else {
          clubPick
        }
      }
      .padding(.horizontal, 4)
    }
    .background(Color("bg").ignoresSafeArea())
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
    HStack(spacing: 6) {
      Button(action: { session.leave("back") }) {
        Text("Back")
          .font(.caption.weight(.heavy))
          .frame(maxWidth: .infinity, minHeight: 36)
      }
      .buttonStyle(.bordered)
      .disabled(session.sending)
      Button(action: { session.leave("home") }) {
        Text("Home")
          .font(.caption.weight(.heavy))
          .frame(maxWidth: .infinity, minHeight: 36)
      }
      .buttonStyle(.bordered)
      .disabled(session.sending)
    }

    Button(action: { session.pickSameClub() }) {
      Text(sameClubTitle)
        .font(.headline.weight(.black))
        .frame(maxWidth: .infinity, minHeight: 44)
    }
    .buttonStyle(.borderedProminent)
    .tint(Color("accent"))
    .foregroundStyle(Color.black)
    .disabled(session.sending)

    if !session.list.top3.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        ForEach(Array(session.list.top3.enumerated()), id: \.element) { index, clubId in
          Button(action: { session.pick(clubId: clubId) }) {
            Text(session.list.label(for: clubId))
              .frame(maxWidth: .infinity, minHeight: index == 0 ? 48 : 36)
          }
          .buttonStyle(.bordered)
          .font(index == 0 ? .title3.weight(.black) : .caption.weight(.bold))
          .tint(index == 0 ? Color("accent") : Color("cream"))
        }
      }
    }

    Button(action: { showAllClubs.toggle() }) {
      Text("All clubs")
        .font(.headline.weight(.heavy))
        .frame(maxWidth: .infinity, minHeight: 40)
    }
    .buttonStyle(.bordered)

    if showAllClubs {
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 52), spacing: 6)], spacing: 6) {
        ForEach(session.list.bag, id: \.self) { clubId in
          Button(session.list.label(for: clubId)) {
            session.pick(clubId: clubId)
          }
          .buttonStyle(.bordered)
          .font(.caption.weight(.heavy))
        }
      }
    }
  }

  private var sameClubTitle: String {
    if let id = session.list.lastClubId {
      return "Same club · \(session.list.label(for: id))"
    }
    return "Same club"
  }
}

struct ContentView_Previews: PreviewProvider {
  static var previews: some View {
    ContentView()
      .environmentObject(WatchClubSession())
  }
}
