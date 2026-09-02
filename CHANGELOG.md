# Changelog

## 0.1.2

- Fill the whole card automatically when it is first added to a dashboard, for
  every child on the account: all twelve entity fields per pupil instead of one
  guessed week sensor, and a `students` array when there is more than one child.
- Detect those entities by `translation_key` through the entity registry rather
  than by reading entity_id text. Home Assistant builds entity_ids from the
  translated entity name in the user's own language, for forty languages, so the
  previous `_deze_week` / `_this_week` guess only ever worked on a Dutch or
  English install. The pupil's name now comes from the device rather than from
  the entity_id. Installs without an entity registry keep the old guess, which
  additionally tolerates the `_2` suffix Home Assistant appends after a
  reinstall.

## 0.1.1

- Browse one selected timetable week up to eight weeks ahead with compact
  previous/next arrows. Returning to This week restores the standard Next week
  control.
- Replace the removed previews with privacy-safe examples that use fictional
  pupils, teachers, rooms and timetable content only.

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
