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
      if session.nearby.active, session.nearby.openPhone || (session.nearby.courses.isEmpty && session.nearby.tees.isEmpty) {
        Text(session.nearby.line.isEmpty ? "open the phone" : session.nearby.line)
          .font(.footnote.weight(.bold))
          .foregroundStyle(Color("cream"))
          .padding(.horizontal, 4)
      } else if session.nearby.active {
        ScrollView {
          VStack(alignment: .leading, spacing: 8) {
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
  private var statusHeader: some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Text(session.nearby.active ? "Courses near you" : session.putt.open ? "Hole \(session.putt.holeNumber) · Putts" : session.list.statusLine)
        .font(.footnote.weight(.bold))
        .foregroundStyle(Color("cream"))
      if !session.nearby.active, !session.putt.open, session.list.showSoft {
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
    if !session.nearby.tees.isEmpty {
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
    VStack(alignment: .leading, spacing: 6) {
      statusHeader

      HStack(spacing: 6) {
        Button(action: { session.leave("back") }) {
          Text("Back")
            .font(.caption.weight(.heavy))
            .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.bordered)
        .disabled(session.sending)
        Button(action: { session.leave("home") }) {
          Text("Home")
            .font(.caption.weight(.heavy))
            .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.bordered)
        .disabled(session.sending)
      }

      ForEach(Array(session.list.top3.enumerated()), id: \.element) { index, clubId in
        Button(action: { session.pick(clubId: clubId) }) {
          Text(session.list.label(for: clubId))
            .frame(maxWidth: .infinity, minHeight: index == 0 ? 40 : 36)
        }
        .buttonStyle(.bordered)
        .font(index == 0 ? .headline.weight(.black) : .caption.weight(.heavy))
        .tint(index == 0 ? Color("accent") : Color("cream"))
        .disabled(session.sending)
      }

      Button(action: { showAllClubs.toggle() }) {
        Text("All clubs")
          .font(.headline.weight(.heavy))
          .frame(maxWidth: .infinity, minHeight: 36)
      }
      .buttonStyle(.bordered)

      if showAllClubs || session.list.top3.isEmpty {
        ScrollView {
          VStack(spacing: 6) {
            ForEach(moreClubs, id: \.self) { clubId in
              Button(action: { session.pick(clubId: clubId) }) {
                Text(session.list.label(for: clubId))
                  .font(.caption.weight(.heavy))
                  .frame(maxWidth: .infinity, minHeight: 36)
              }
              .buttonStyle(.bordered)
              .disabled(session.sending)
            }
          }
        }
      }
    }
    .padding(.horizontal, 4)
  }

  private var moreClubs: [String] {
    session.list.bag.filter { !session.list.top3.contains($0) }
  }
}

struct ContentView_Previews: PreviewProvider {
  static var previews: some View {
    ContentView()
      .environmentObject(WatchClubSession())
  }
}
