[![Sponsor](https://img.shields.io/badge/sponsor-ea4aaa?style=flat-square&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/jonisnet)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/jonisnet)

# Somtoday Card

A responsive Home Assistant Lovelace card for the [`jonisnet/ha-somtoday`](https://github.com/jonisnet/ha-somtoday) integration. It shows a horizontal week timetable, the next school day, homework and the next test. Lessons, homework and tests open in a Home Assistant-native dialog.

## Installation

1. Add `https://github.com/jonisnet/ha-somtoday-card` to HACS as a **Dashboard** custom repository.
2. Install **Somtoday Card** and reload the browser.
3. Add `custom:somtoday-card` with the visual card editor.

No `browser_mod`, card-mod or runtime JavaScript dependency is required.

## Preview

Screenshots are pending: the previous set showed a real student's name and had
fallen behind the card's features. `preview/index.html` renders the card with
placeholder data if you want to look at it locally.

## Configuration

Entity IDs are deliberately configured rather than inferred because Home Assistant translates entity names.

```yaml
type: custom:somtoday-card
title: School
default_view: week
show_view_tabs: true
students:
  - name: child
    week_entity: sensor.somtoday_child_deze_week
    today_entity: sensor.somtoday_child_vandaag
    day_entity: sensor.somtoday_child_eerstvolgende_schooldag
    current_lesson_entity: sensor.somtoday_child_huidige_les
    next_lesson_entity: sensor.somtoday_child_volgende_les
    homework_entity: sensor.somtoday_child_openstaand_huiswerk
    next_test_entity: sensor.somtoday_child_volgende_toets
    base_schedule_entity: sensor.somtoday_child_basisrooster
    planner_entity: sensor.somtoday_child_planning
    next_week_entity: sensor.somtoday_child_volgende_week
    upcoming_work_entity: sensor.somtoday_child_aankomend_schoolwerk
subject_colors:
  wiskunde: "#3867d6"
  engels: "#20bf6b"
  biologie: "#a55eea"
```

### Options

| Option           | Description                                |
| ---------------- | ------------------------------------------ |
| `title`          | Card heading                               |
| `default_view`   | `day`, `week`, `homework`, or `tests`      |
| `show_view_tabs` | Show the in-card view switcher             |
| `students`       | One or more explicitly configured students |
| `subject_colors` | Subject name to CSS color mapping          |

Mappings take precedence. Unmapped, school-specific abbreviations receive a
stable generated accent, so the card never depends on a hardcoded subject list.

With `planner_entity`, the day timeline shows local appointments and provides
add buttons before school, after school and in free periods. The integration
stores these locally and enforces the configured user permissions.

### Lesson periods and breaks

The timeline follows the actual Somtoday timestamps, with a fixed period
table (08:30-17:00) as the fallback boundary. Those times are the ones one
Dutch secondary school rings its bells on; if yours differs, adjust
`LESSON_PERIOD_SLOTS` in `src/helpers.js`. A 15-minute gap is shown
as a short break, 30 minutes as the long break, and a gap of 45 minutes or more
as a free period. Cancelled Somtoday lessons remain visible as cancelled.

The dedicated `today_entity` is preferred for the Day view. Older integration
versions remain supported through the week sensor and next-school-day fallback.
The card works without `base_schedule_entity`, which is disabled by default in
the integration. Unknown, unavailable and missing optional entities are handled
without breaking the card.

## Responsive layout

The week is horizontal while the card has enough room. A `ResizeObserver` measures the card itself—not the browser—and changes to a vertical day layout below 620 px.

## Required integration data

The week view requires the `deze_week`/`this_week` sensor. Other views require their corresponding school-day, homework, and next-test sensors. Removed baseline lessons are displayed from each day's `missing` list.

## Development

```bash
npm ci
npm run check
```

The build produces the single HACS resource `somtoday-card.js`. Every GitHub release must attach that file as an explicit release asset.
