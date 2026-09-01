# Changelog

## 0.1.0

### Fixed

- **Removed personal data.** The README, changelog, source, tests, bundle and
  preview page named a real child and the school they attend. The lesson-period
  constant is now `LESSON_PERIOD_SLOTS` rather than being named after that
  school, the preview uses a placeholder, and the link to the school's own
  timetable page is gone. The published bundle for earlier versions still
  contains the old constant name — use 0.1.0 or later.

## 0.0.2

### Fixed

- **The bundle announced the wrong version.** The banner was a hardcoded string
  in `scripts/build.mjs`, so it still read `v0.0.1-beta.1` after 0.0.1 shipped —
  a version inside a build script does not look like a version field when you go
  around bumping them. It is now read from `package.json` and cannot drift again.

## 0.0.1

- Initial local preview build.
- Week, day, homework and test views.
- Keep the Today view on today's timetable after the last bell by preferring
  the active-week data over the next-school-day fallback.
- Prefer the integration's dedicated Today sensor when configured, while
  retaining backwards-compatible fallbacks.
- Native detail dialogs, visual editor, multiple students and subject colors.
- Container-width responsive layout and timetable deviation rendering.
- Timeline blocks for short/long breaks, free periods and cancelled lessons,
  based on actual lesson times and a fixed period table as day boundaries.
- Local planner appointments before school, after school and during free periods.
- Tomorrow navigation, this/next-week switching, teacher names and lesson-bound
  homework/test indicators.
- Split combined openings such as 75 minutes into the official 30-minute lunch
  break plus a 45-minute free period.
- Always show lesson periods 1-10, including clearly marked empty
  periods with planner buttons.
- Print the selected week as a clean landscape timetable without the Home
  Assistant interface.
