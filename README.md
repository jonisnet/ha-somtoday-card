# Somtoday Card

[![Sponsor](https://img.shields.io/badge/sponsor-ea4aaa?style=flat-square&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/jonisnet)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/jonisnet)

A responsive Home Assistant Lovelace card for the [`jonisnet/ha-somtoday`](https://github.com/jonisnet/ha-somtoday) integration. It shows a horizontal week timetable, the next school day, homework and the next test. Lessons, homework and tests open in a Home Assistant-native dialog.

## Installation

1. Add `https://github.com/jonisnet/ha-somtoday-card` to HACS as a **Dashboard** custom repository.
2. Install **Somtoday Card** and reload the browser.
3. Add `custom:somtoday-card` with the visual card editor.

No `browser_mod`, card-mod or runtime JavaScript dependency is required.

## Preview

![The card on a wide screen](https://raw.githubusercontent.com/jonisnet/ha-somtoday-card/main/preview/wide-dark.png)

![The card on a phone](https://raw.githubusercontent.com/jonisnet/ha-somtoday-card/main/preview/narrow-dark.png)

Light-theme versions are in [`preview/`](preview), and `preview/index.html`
renders the card locally with placeholder data. All names, teachers, rooms and
lessons in these previews are fictional.

## Configuration

Add the card with the visual editor and it fills itself in — every field, for
every child on the account. There is nothing to type.

It finds the entities through the entity registry and matches each one on its
`translation_key`. That key is the same in every language, which entity IDs are
not: Home Assistant builds those from the _translated_ entity name, in your own
language, for forty languages. Children are told apart by their device, and the
pupil's name is read from that device as well.

For one child the generated configuration is flat:

```yaml
type: custom:somtoday-card
default_view: week
name: Sanne Jansen
week_entity: sensor.somtoday_sanne_jansen_deze_week
next_week_entity: sensor.somtoday_sanne_jansen_volgende_week
today_entity: sensor.somtoday_sanne_jansen_vandaag
day_entity: sensor.somtoday_sanne_jansen_eerstvolgende_schooldag
planner_entity: sensor.somtoday_sanne_jansen_eigen_afspraken
homework_entity: sensor.somtoday_sanne_jansen_openstaand_huiswerk
upcoming_work_entity: sensor.somtoday_sanne_jansen_aankomend_schoolwerk
current_lesson_entity: sensor.somtoday_sanne_jansen_huidige_les
next_lesson_entity: sensor.somtoday_sanne_jansen_volgende_les
next_test_entity: sensor.somtoday_sanne_jansen_volgende_toets
base_schedule_entity: sensor.somtoday_sanne_jansen_basisrooster
last_update_entity: sensor.somtoday_sanne_jansen_laatste_update
```

With more than one child it becomes a `students` list instead, sorted by name so
they keep their order. Both shapes are accepted, so a single child can be moved
into a `students` list by hand at any time.

Everything can still be edited afterwards, and anything not detected — an older
Home Assistant without an entity registry, for instance — can be filled in by
hand. Only one of `week_entity`, `today_entity` or `day_entity` is required.

Subject colours are the one thing worth adding yourself:

```yaml
subject_colors:
  wiskunde: "#3867d6"
  engels: "#20bf6b"
  biologie: "#a55eea"
```

### Options

| Option           | Description                                      |
| ---------------- | ------------------------------------------------ |
| `title`          | Card heading                                     |
| `default_view`   | `day`, `week`, `homework`, or `tests`            |
| `show_view_tabs` | Show the in-card view switcher                   |
| `name`           | Pupil name in the heading, for a single child    |
| `students`       | One entry per child, when there is more than one |
| `subject_colors` | Subject name to CSS color mapping                |

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

## Getting notified as well

The card shows the timetable; it does not push anything at you. For a message
when something changes — a lesson dropped, moved, another room or teacher —
the integration ships a blueprint:

[![Import blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Fjonisnet%2Fha-somtoday%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fjonisnet%2Fsomtoday_roosterwijziging.yaml)

It asks which phones to notify and which page to open when the notification is
tapped, so you can send someone straight to the dashboard this card is on.

## Required integration data

Views are named here by what the integration calls them internally, because the
entity names themselves differ per language:

| View             | Sensor                                       |
| ---------------- | -------------------------------------------- |
| Week             | `active_week`, and `next_week` for next week |
| Day / Tomorrow   | `today` and `next_school_day`                |
| Homework         | `open_homework`                              |
| Tests            | `next_test` and `upcoming_work`              |
| Own appointments | `planner`                                    |

Browsing further ahead uses the integration's future-week sensors, which are
found at runtime through their `week_offset` attribute and need no configuration.
Removed baseline lessons are shown from each day's `missing` list, which comes
from `base_week`.

## Development

```bash
npm ci
npm run check
```

The build produces the single HACS resource `somtoday-card.js`. Every GitHub release must attach that file as an explicit release asset.
