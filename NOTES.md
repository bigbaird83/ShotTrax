# ShotTrax / ShotTraxx — P5 part 1

Brand mark on the splash is **ShotTraxx**. The app/package name remains ShotTrax.

## Golf Courses API (course picker)

Nearby courses, hole par, and green centroids come from [Golf Courses API](https://golfcoursesapi.com/). **Do not hardcode the key.**

Set one of:

```bash
# local / Expo Go (inlined at bundle time)
EXPO_PUBLIC_GOLF_COURSES_API_KEY=your_key_here
```

or Expo extra (EAS secrets / `app.json`):

```json
{
  "expo": {
    "extra": {
      "golfCoursesApiKey": null
    }
  }
}
```

Copy `.env.example` to `.env` for local use. `.env` is gitignored.

Without a key, the **Nearby courses** picker is disabled and does not call the network. You can still type a course name and drop a green pin on the hole map. ShotTrax never invents a nearby-course list, par, or green coordinate.

When a key is present (P5 part 2):

- Nearby search is `GET https://golfcoursesapi.com/api/v1/courses?lat=&lng=&radius=`
- Course detail is `GET /api/v1/courses/:id`
- Par and green centroid are applied **only if the API returns them**. Missing par stays the scorecard default (not labeled as course par). Missing green stays empty — yards to green shows **— / unavailable**.

OSM fairway/green overlay is a stub hook in `src/course/osmOverlay.ts` (`fetchOsmOverlay` always returns `null` in part 1).

Client interface: `src/course/types.ts` (`CourseDataClient`).
