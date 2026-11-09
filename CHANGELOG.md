# Changelog

## 0.4.0-beta.3

Grade levels need Somtoday 0.2.0-beta.2 or newer.

### Added

- **Both levels of a dual-level class.** For classes graded on two levels
  (vmbo BB/KB) every grade and average shows both figures. `grade_level`
  (card-wide, or per child under `students`) picks which one is big:
  `both_main_first` (default), `both_alt_first`, `main` or `alt`.

### Fixed

- **A block without a subject is named.** A mentor or project block (for
  example "STARR") showed "—"; it now shows its own title.
- **A block over several periods is one row.** A lesson without period numbers
  that runs 13:00–14:30 now fills periods 6–7 instead of leaving period 7
  marked as free.

## 0.4.0-beta.2

### Added

- **Open a tab from a link.** `?somtoday_view=grades` (and optionally
  `&somtoday_student=<id>`) in the page address opens the card on that tab and
  child, so a notification leads straight to the new grade or message.

## 0.4.0-beta.1

Needs Somtoday 0.2.0-beta.1 or newer for the new parts; with an older integration the card
works as before and simply leaves them out.

### Added

- **Holiday countdown and school year.** A quiet line under the heading:
  _Nog 12 dagen tot de Kerstvakantie_, during the holiday _Kerstvakantie t/m
  3 jan_, and a small bar showing how far the school year is.
- **The class in the heading**, with the programme, e.g. _Klas 1A · havo/vwo_.
- **Assignments view** (_Inleveren_): work to hand in with its deadline and a
  status chip — late in red, open, not open yet, handed in.
- **Somtoday notices**: a banner when Somtoday announces an outage or
  maintenance.
- **Homework shows Somtoday's time estimate and the teacher's links**, which
  open in a new tab.
- **Grades, absences and messages**, for users who have been given access:
  latest grades (insufficient results in red, weight, date), subject averages
  with the overall average, absences and late arrivals, measures that are still
  running, and the account's messages with an unread dot and an expandable
  body. These never come from an entity: the card asks the integration's
  `somtoday.get_records` service, which checks the signed-in user. Nothing of it
  is stored in the browser or written to the console. A view without access or
  data is not shown at all.
- **A switch per section** in the editor. Everything is on by default.
- Existing cards pick up the new sensors by themselves, through the child's
  device; new cards get the fields filled in like the others.

### Changed

- Homework and test items are now `div role="button"` instead of `<button>`,
  so their links work in every browser. Keyboard use (Enter, Space) is the same.

## 0.3.2

### Fixed

- **Lesson material and unknown study items no longer show up as a test.**
  Every item that was not homework used to get the orange _Test_ chip. Lesson
  material (`lesson_material`, Somtoday `LESSTOF`, recognised by integration
  0.1.10) now has its own blue _Lesson material_ / _Lesstof_ chip, and any other
  type a neutral _Other_ / _Overig_ chip. The item badges and the printed week
  use the same labels.

## 0.3.1

- **An update no longer needs the browser cache cleared.** HACS serves the card
  with long cache headers and only changes its address on a fresh page load, so
  an open dashboard — the companion app, a wall tablet — kept running the old
  card, even after a Home Assistant restart. The card now checks for itself
  which version the dashboard serves (when it loads, when the app or tab comes
  back into view, and every fifteen minutes) and reloads the page once when it
  differs. It never reloads while the dashboard is being edited and never
  twice for the same version; in those cases it shows a _Reload_ button instead.
- The version the card reports is now taken from `package.json` at build time,
  the same place as the file's banner, so the two cannot drift apart.

Note: this takes effect from the next update onwards. Getting from 0.3.0 to
0.3.1 itself still needs one manual refresh, because 0.3.0 does not have the
check yet.

## 0.3.0

- **A Changes view.** Every timetable change of the last fourteen days, newest
  first: the lesson, what changed (dropped, moved, another room or teacher),
  what it was before, and when the change came in. Needs the integration's new
  _Schedule changes_ sensor (Somtoday 0.1.9); an existing card finds it by
  itself. Also available as _All children_ when that option is on.

## 0.2.0

- **All children on one card.** With `show_all_students: true` (a switch in the
  editor, off by default) the Today and Tomorrow views get an _All children_
  button that shows every child's day in its own column, side by side.
- **The children are now a second row under the view buttons** instead of above
  them: the view is the main choice, the child narrows it down. A single child
  still gets no row at all.
- **Choose the order of the children:** `student_order: manual` (the default,
  and what every existing card already did) keeps the list order and adds
  up/down arrows in the editor; `student_order: name` sorts alphabetically.

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
