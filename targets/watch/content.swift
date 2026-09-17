import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var session: WatchClubSession

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(session.list.statusLine)
            .font(.headline)
            .foregroundStyle(Color("cream"))
          if session.list.showSoft {
            Text("SOFT")
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

        Button(action: { session.pickSameClub() }) {
          Text(sameClubTitle)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color("accent"))
        .foregroundStyle(Color.black)
        .disabled(session.sending)

        if !session.list.top3.isEmpty {
          HStack(spacing: 6) {
            ForEach(Array(session.list.top3.enumerated()), id: \.element) { index, clubId in
              Button(session.list.label(for: clubId)) {
                session.pick(clubId: clubId)
              }
              .buttonStyle(.bordered)
              .font(index == 0 ? .headline.weight(.black) : .body.weight(.bold)
              )
            }
          }
        }

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
      .padding(.horizontal, 4)
    }
    .background(Color("bg").ignoresSafeArea())
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
