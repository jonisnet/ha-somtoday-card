/* eslint-disable no-useless-escape -- print HTML must escape its closing script tag */
import {
  VIEWS,
  buildSchoolDayTimeline,
  LESSON_PERIOD_SLOTS,
  buildStubConfig,
  compareLessonTime,
  findDay,
  formatDate,
  formatTime,
  isEntityUsable,
  lessonDeviation,
  normalizeStudents,
  normalizeWeekDays,
  sortHomework,
  subjectColor,
  validateConfig,
  workForLesson,
} from "./helpers.js";
import { TRANSLATIONS } from "./translations.js";

const VERSION = "0.1.2";
const getLit = () => {
  const base =
    customElements.get("hui-masonry-view") ||
    customElements.get("ha-panel-lovelace") ||
    customElements.get("ha-app");
  const LitElement = base ? Object.getPrototypeOf(base) : window.LitElement;
  return {
    LitElement,
    html: LitElement?.prototype?.html || window.html,
    css: LitElement?.prototype?.css || window.css,
  };
};

const { LitElement, html, css } = getLit();

function fireConfigChanged(element, config) {
  element.dispatchEvent(
    new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true,
    }),
  );
}

function commonPrefix(left = "", right = "") {
  let index = 0;
  while (left[index] && left[index] === right[index]) index += 1;
  return index;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function completeSchoolWeek(days, weekStart) {
  const known = new Map(days.map((day) => [day.date, day]));
  const monday = new Date(`${weekStart || days[0]?.date}T12:00:00`);
  if (Number.isNaN(monday.getTime())) return days;
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 5 }, (_, offset) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return known.get(key) || { date: key, lessons: [], missing: [] };
  });
}

class SomtodayCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _view: { state: true },
    _studentIndex: { state: true },
    _compact: { state: true },
    _dialog: { state: true },
    _weekOffset: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }
    ha-card {
      overflow: hidden;
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 16px 8px;
    }
    .heading {
      min-width: 0;
      flex: 1;
    }
    h2 {
      margin: 0;
      font-size: 1.25rem;
      line-height: 1.3;
    }
    .subtitle {
      color: var(--secondary-text-color);
      font-size: 0.82rem;
    }
    .student-tabs,
    .view-tabs {
      display: flex;
      gap: 4px;
      overflow: auto;
      padding: 0 12px 10px;
      scrollbar-width: none;
    }
    .view-tabs {
      border-bottom: 1px solid var(--divider-color);
      flex-wrap: wrap;
      overflow: visible;
      gap: 0;
    }
    .view-tabs .tab {
      padding: 7px 9px;
      font-size: 0.88rem;
    }
    button {
      font: inherit;
      color: inherit;
    }
    .tab {
      border: 0;
      border-radius: 999px;
      background: transparent;
      padding: 8px 12px;
      cursor: pointer;
      white-space: nowrap;
      transition:
        background 0.16s ease,
        color 0.16s ease,
        transform 0.16s ease;
    }
    .tab:hover {
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    .tab.active {
      background: var(--primary-color);
      color: var(--text-primary-color, white);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .content {
      padding: 14px;
    }
    .week {
      display: grid;
      grid-template-columns: repeat(var(--days, 5), minmax(130px, 1fr));
      gap: 10px;
      overflow-x: auto;
    }
    :host([compact]) .week {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      overflow: visible;
    }
    @media (max-width: 600px) {
      :host([compact]) .week { grid-template-columns: 1fr; }
    }
    .day-column {
      min-width: 0;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      padding: 8px;
      background: color-mix(
        in srgb,
        var(--card-background-color) 94%,
        var(--primary-color)
      );
    }
    .day-title {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      padding: 2px 4px 8px;
      font-weight: 600;
    }
    .count {
      color: var(--secondary-text-color);
      font-size: 0.78rem;
    }
    .lesson,
    .item {
      width: 100%;
      text-align: left;
      border: 0;
      border-left: 4px solid var(--subject-color, var(--primary-color));
      border-radius: 9px;
      padding: 9px;
      margin: 0 0 7px;
      background: color-mix(
        in srgb,
        var(--subject-color, var(--primary-color)) 10%,
        var(--card-background-color)
      );
      cursor: pointer;
      transition:
        transform 0.14s ease,
        box-shadow 0.14s ease,
        background 0.14s ease;
    }
    .lesson:hover,
    .item:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px
        color-mix(in srgb, var(--primary-text-color) 14%, transparent);
    }
    .lesson.current {
      box-shadow: 0 0 0 2px var(--primary-color);
    }
    .lesson.cancelled {
      border-color: var(--error-color);
      opacity: 0.76;
      text-decoration: line-through;
      background: color-mix(
        in srgb,
        var(--error-color) 12%,
        var(--card-background-color)
      );
    }
    .lesson.missing {
      border-style: dashed;
      border-color: var(--warning-color);
      background: transparent;
      color: var(--secondary-text-color);
    }
    .lesson.changed {
      border-color: var(--warning-color);
    }
    .gap,
    .day-edge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 5px 0 8px;
      padding: 7px 9px;
      border: 1px dashed var(--divider-color);
      border-radius: 9px;
      color: var(--secondary-text-color);
      font-size: .78rem;
    }
    .gap.free_period { border-color: var(--warning-color); color: var(--primary-text-color); }
    .add { border: 0; border-radius: 999px; background: color-mix(in srgb, var(--primary-color) 14%, transparent); color: var(--primary-color); cursor: pointer; padding: 4px 9px; }
    .appointment { --subject-color: var(--accent-color, var(--primary-color)); }
    .empty-lesson { opacity: .72; background: transparent; border: 1px dashed var(--divider-color); border-left: 4px dashed var(--divider-color); }
    .empty-lesson { box-sizing: border-box; width: 100%; overflow: hidden; }
    .empty-lesson .lesson-head { min-width: 0; }
    .empty-lesson .lesson-head span:last-child { margin-left: auto; white-space: nowrap; }
    .empty-lesson .add { margin-top: 7px; max-width: 100%; }
    .week-switch { display: flex; align-items: center; gap: 5px; width: 100%; margin: 0 0 10px; }
    .week-arrow { display: inline-flex; align-items: center; justify-content: center; padding: 8px; }
    .week-arrow ha-icon { --mdc-icon-size: 20px; }
    .print-button { margin-left: auto; display: inline-flex; align-items: center; justify-content: center; padding: 8px; }
    .print-button ha-icon { --mdc-icon-size: 20px; }
    :host([compact]) .print-button { display: none; }
    .work-chips { display: flex; gap: 5px; margin-top: 7px; }
    .work-chip { border-radius: 999px; padding: 3px 7px; font-size: .7rem; font-weight: 700; cursor: pointer; }
    .work-chip.homework { color: #176b35; background: #b9f6ca; }
    .work-chip.test, .work-chip.large_test { color: #8a3f00; background: #ffd5a6; }
    .lesson-head,
    .item-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 6px;
      font-weight: 600;
      min-width: 0;
    }
    .lesson-head > span:first-child,
    .item-head > span:first-child { min-width: 0; overflow-wrap: anywhere; }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 9px;
      margin-top: 4px;
      font-size: 0.78rem;
      color: var(--secondary-text-color);
    }
    .badge {
      display: inline-flex;
      border-radius: 999px;
      padding: 2px 6px;
      font-size: 0.68rem;
      font-weight: 600;
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--warning-color) 18%, transparent);
    }
    .cancelled .badge {
      color: var(--error-color);
    }
    .list {
      display: grid;
      gap: 9px;
    }
    .item {
      margin: 0;
      border-left-color: var(--primary-color);
    }
    .item.urgent {
      border-left-color: var(--warning-color);
    }
    .description {
      margin-top: 6px;
      color: var(--secondary-text-color);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .empty,
    .error {
      text-align: center;
      padding: 30px 14px;
      color: var(--secondary-text-color);
    }
    .error ha-icon {
      color: var(--error-color);
      display: block;
      margin: 0 auto 8px;
    }
    ha-dialog {
      --mdc-dialog-min-width: min(520px, calc(100vw - 32px));
      --mdc-dialog-max-width: 680px;
    }
    .dialog-content {
      padding: 0 24px 20px;
    }
    .dialog-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
    }
    .dialog-grid dt {
      color: var(--secondary-text-color);
    }
    .dialog-grid dd {
      margin: 0;
      white-space: pre-wrap;
    }
    @media (prefers-reduced-motion: reduce) {
      * {
        transition: none !important;
      }
    }
  `;

  constructor() {
    super();
    this._view = "week";
    this._studentIndex = 0;
    this._compact = false;
    this._dialog = null;
    this._lastRelevant = "";
    this._weekOffset = 0;
  }

  setConfig(config) {
    validateConfig(config);
    this._config = {
      title: "Somtoday",
      default_view: "week",
      show_view_tabs: true,
      ...config,
    };
    this._view = this._config.default_view;
    this._weekOffset = 0;
  }

  static getConfigElement() {
    return document.createElement("somtoday-card-editor");
  }
  // Fills every field the card knows about, for every child on the account, so
  // dropping the card on a dashboard gives working tabs instead of one guessed
  // sensor. Matching happens on translation_key via the entity registry — see
  // detectStudents() for why entity_id text is not good enough.
  static getStubConfig(hass) {
    return buildStubConfig(hass);
  }

  set hass(value) {
    const ids = normalizeStudents(this._config || {}).flatMap((student) =>
      Object.entries(student)
        .filter(([key]) => key.endsWith("_entity"))
        .map(([, id]) => id),
    );
    const automaticWeekIds = Object.values(value?.states || {})
      .filter((state) => Number.isInteger(state.attributes?.week_offset))
      .map((state) => state.entity_id);
    const relevant = [...new Set([...ids, ...automaticWeekIds])]
      .map((id) => `${id}:${value?.states?.[id]?.last_updated || ""}`)
      .join("|");
    this._hass = value;
    if (relevant !== this._lastRelevant) {
      this._lastRelevant = relevant;
      this.requestUpdate();
    }
  }
  get hass() {
    return this._hass;
  }

  connectedCallback() {
    super.connectedCallback();
    this._observer = new ResizeObserver(([entry]) => {
      const compact = entry.contentRect.width < 1000;
      if (compact !== this._compact) {
        this._compact = compact;
        this.toggleAttribute("compact", compact);
      }
    });
    this._observer.observe(this);
  }
  disconnectedCallback() {
    this._observer?.disconnect();
    super.disconnectedCallback();
  }

  _locale() {
    return this._hass?.locale?.language?.startsWith("nl") ? "nl" : "en";
  }
  _t(key) {
    return TRANSLATIONS[this._locale()][key] || TRANSLATIONS.en[key] || key;
  }
  _state(id) {
    return id ? this._hass?.states?.[id] : null;
  }
  _student() {
    return normalizeStudents(this._config)[this._studentIndex] || {};
  }
  _colors() {
    return this._config.subject_colors || {};
  }

  render() {
    if (!this._config || !this._hass) return html``;
    const students = normalizeStudents(this._config);
    const student = this._student();
    return html`<ha-card>
      <div class="header">
        <ha-icon icon="mdi:school-outline"></ha-icon>
        <div class="heading">
          <h2>${this._config.title}</h2>
          <div class="subtitle">${student.name || this._t(this._view)}</div>
        </div>
      </div>
      ${
        students.length > 1
          ? html`<div class="student-tabs">
              ${students.map(
                (item, index) =>
                  html`<button
                    class="tab ${index === this._studentIndex ? "active" : ""}"
                    @click=${() => {
                      this._studentIndex = index;
                      this.requestUpdate();
                    }}
                  >
                    ${item.name || `Student ${index + 1}`}
                  </button>`,
              )}
            </div>`
          : ""
      }
      ${
        this._config.show_view_tabs !== false
          ? html`<div class="view-tabs">
              ${VIEWS.map(
                (view) =>
                  html`<button
                    class="tab ${view === this._view ? "active" : ""}"
                    @click=${() => {
                      this._view = view;
                      this.requestUpdate();
                    }}
                  >
                    ${this._t(view)}
                  </button>`,
              )}
            </div>`
          : ""
      }
      <div class="content">${this._renderView(student)}</div>
      ${this._renderDialog()}
    </ha-card>`;
  }

  _renderView(student) {
    if (this._view === "week") return this._renderWeek(student);
    if (this._view === "day") return this._renderDay(student);
    if (this._view === "tomorrow") return this._renderTomorrow(student);
    if (this._view === "homework") return this._renderHomework(student);
    return this._renderTests(student);
  }

  _renderWeek(student) {
    const state = this._weekState(student, this._weekOffset);
    const controls = this._renderWeekControls();
    if (!isEntityUsable(state)) return html`${controls}${this._empty(state ? "unavailable" : "no_data")}`;
    const days = completeSchoolWeek(normalizeWeekDays(state.attributes.days), state.attributes.week_start);
    if (!days.length) return html`${controls}${this._empty("no_data")}`;
    return html`${this._renderWeekControls(days, student)}<div class="week" style="--days:${days.length}">
      ${days.map((day) => this._renderDayColumn(day, null, student))}
    </div>`;
  }

  _weekState(student, offset) {
    if (offset === 0) return this._state(student.week_entity);
    if (offset === 1) {
      return this._state(student.next_week_entity) || this._relatedState(student, (candidate) => candidate.attributes?.week_offset === 1 && Array.isArray(candidate.attributes?.days));
    }
    return this._relatedState(student, (candidate) => candidate.attributes?.week_offset === offset && Array.isArray(candidate.attributes?.days));
  }

  _renderWeekControls(days = null, student = null) {
    const future = this._weekOffset >= 2;
    return html`<div class="week-switch">
      <button class="tab ${this._weekOffset === 0 ? "active" : ""}" @click=${() => (this._weekOffset = 0)}>${this._t("this_week")}</button>
      ${future
        ? html`<button class="tab week-arrow" aria-label=${this._t("previous_week")} @click=${() => (this._weekOffset = Math.max(1, this._weekOffset - 1))}><ha-icon icon="mdi:chevron-left"></ha-icon></button><span class="tab active">${this._weekOffset} ${this._t("weeks")}</span>${this._weekOffset < 8 ? html`<button class="tab week-arrow" aria-label=${this._t("next_week")} @click=${() => (this._weekOffset += 1)}><ha-icon icon="mdi:chevron-right"></ha-icon></button>` : ""}`
        : html`<button class="tab ${this._weekOffset === 1 ? "active" : ""}" @click=${() => (this._weekOffset = 1)}>${this._t("next_week")}</button><button class="tab week-arrow" aria-label=${this._t("week_two")} @click=${() => (this._weekOffset = 2)}><ha-icon icon="mdi:chevron-right"></ha-icon></button>`}
      ${days && student ? html`<button class="tab print-button" title=${this._t("print")} aria-label=${this._t("print")} @click=${() => this._printWeek(days, student)}><ha-icon icon="mdi:printer-outline"></ha-icon></button>` : ""}
    </div>`;
  }

  _weekLabel() {
    if (this._weekOffset === 0) return this._t("this_week");
    if (this._weekOffset === 1) return this._t("next_week");
    return `${this._weekOffset} ${this._t("weeks")}`;
  }

  _printWeek(days, student) {
    const popup = window.open("", "_blank");
    if (!popup) { this._notify(this._t("popup_blocked")); return; }
    const workState = this._state(student.upcoming_work_entity) || this._relatedState(student, (state) => Array.isArray(state.attributes?.items) && !state.attributes?.config_entry_id);
    const workItems = workState?.attributes?.items || [];
    const cells = LESSON_PERIOD_SLOTS.map(([period, start, end]) => `<tr><th>${period}<small>${start}–${end}</small></th>${days.map((day) => { const lesson = (day.lessons || []).find((item) => Number(item.period_start ?? item.period) === period || String(item.start || "").slice(11, 16) === start); return lesson ? `<td class="${lesson.cancelled ? "cancelled" : ""}"><strong>${escapeHtml(lesson.subject || lesson.subject_short || "")}</strong><small>${escapeHtml(lesson.teacher || "")}${lesson.location ? ` · ${escapeHtml(lesson.location)}` : ""}</small></td>` : "<td class=empty>Geen les</td>"; }).join("")}</tr>`).join("");
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(this._config.title)} – ${escapeHtml(this._weekLabel())}</title><style>@page{size:landscape;margin:12mm}body{font:12px Arial;color:#111}h1{margin:0 0 4px}p{margin:0 0 14px;color:#555}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #999;padding:6px;vertical-align:top}thead th{background:#e8eef5}tbody th{width:70px;background:#f3f3f3}small{display:block;margin-top:3px;color:#555}.empty{color:#999;background:#fafafa}.cancelled{text-decoration:line-through;background:#ffe8e8}</style></head><body><h1>${escapeHtml(this._config.title)}</h1><p>${escapeHtml(student.name || "")} · ${escapeHtml(this._weekLabel())}</p><table><thead><tr><th>Uur</th>${days.map((day) => `<th>${escapeHtml(formatDate(day.date, this._locale()))}</th>`).join("")}</tr></thead><tbody>${cells}</tbody></table><script>window.onload=()=>{window.print()}<\/script></body></html>`);
    LESSON_PERIOD_SLOTS.forEach(([period, start], rowIndex) => {
      days.forEach((day, dayIndex) => {
        const lesson = (day.lessons || []).find((item) => Number(item.period_start ?? item.period) === period || String(item.start || "").slice(11, 16) === start);
        const cell = popup.document.querySelectorAll("tbody tr")[rowIndex]?.children[dayIndex + 1];
        for (const item of lesson ? workForLesson(lesson, workItems) : []) {
          cell?.insertAdjacentHTML("beforeend", `<span style="display:inline-block;margin:5px 4px 0 0;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:bold;color:${item.type === "homework" ? "#176b35" : "#8a3f00"};background:${item.type === "homework" ? "#b9f6ca" : "#ffd5a6"}">${escapeHtml(item.type === "homework" ? this._t("homework") : this._t("test"))}</span>`);
        }
      });
    });
    const visibleDates = new Set(days.map((day) => day.date));
    const printWork = workItems.filter((item) => visibleDates.has(String(item.due || "").slice(0, 10)));
    if (printWork.length) {
      popup.document.body.insertAdjacentHTML("beforeend", `<section style="margin-top:12px"><h2 style="font-size:14px;margin:0 0 6px">${escapeHtml(this._t("schoolwork"))}</h2>${printWork.map((item) => `<span style="display:inline-block;margin:0 6px 5px 0;padding:4px 8px;border-radius:12px;font-weight:bold;color:${item.type === "homework" ? "#176b35" : "#8a3f00"};background:${item.type === "homework" ? "#b9f6ca" : "#ffd5a6"}">${escapeHtml(item.type === "homework" ? this._t("homework") : this._t("test"))}: ${escapeHtml(item.subject || "")} · ${escapeHtml(formatDate(item.due, this._locale()))} ${escapeHtml(formatTime(item.due, this._locale()))}</span>`).join("")}</section>`);
    }
    popup.document.close();
  }

  _renderTomorrow(student) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const key = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    for (const state of [
      this._state(student.week_entity),
      this._weekState(student, 1),
    ]) {
      if (!isEntityUsable(state)) continue;
      const day = normalizeWeekDays(state.attributes.days).find((item) => item.date === key);
      if (day) return this._renderDayColumn(day, null, student);
    }
    return tomorrow.getDay() > 0 && tomorrow.getDay() < 6
      ? this._renderDayColumn({ date: key, lessons: [], missing: [] }, null, student)
      : this._empty("no_data");
  }

  _renderDay(student) {
    const todayState = this._state(student.today_entity);
    if (isEntityUsable(todayState)) {
      const attrs = todayState.attributes;
      return this._renderDayColumn(
        {
          date: attrs.date || todayState.state,
          lessons: attrs.lessons || [],
          missing: [],
        },
        this._state(student.current_lesson_entity), student,
      );
    }

    const weekState = this._state(student.week_entity);
    if (isEntityUsable(weekState)) {
      const today = findDay(weekState.attributes.days);
      if (today) {
        return this._renderDayColumn(
          today,
          this._state(student.current_lesson_entity), student,
        );
      }
    }

    const state = this._state(student.day_entity);
    if (!isEntityUsable(state))
      return this._empty(state ? "unavailable" : "no_data");
    const attrs = state.attributes;
    const day = {
      date: attrs.date || attrs.first_lesson?.start,
      lessons: attrs.lessons || [],
      missing: [],
    };
    return this._renderDayColumn(
      day,
      this._state(student.current_lesson_entity), student,
    );
  }

  _renderDayColumn(day, currentState = null, student = this._student()) {
    const lessons = [...(day.lessons || [])].sort(compareLessonTime);
    const missing = [...(day.missing || [])].sort(
      (a, b) => (a.period || 0) - (b.period || 0),
    );
    const planner = this._plannerState(student);
    const date = String(day.date || "").slice(0, 10);
    const appointments = (planner?.attributes?.items || []).filter((item) => String(item.start).slice(0, 10) === date);
    const timeline = buildSchoolDayTimeline(date, lessons, appointments);
    return html`<section class="day-column">
      <div class="day-title">
        <span>${formatDate(day.date, this._locale())}</span
        ><span class="count">${lessons.length}</span>
      </div>
      ${planner ? this._edgeButton(this._t("before_school"), date, lessons[0]?.start, true, planner) : ""}
      ${timeline.map((entry) => entry.type === "lesson" ? this._lessonButton(entry.item, currentState, student) : entry.type === "empty_lesson" ? this._emptyLessonButton(entry, planner) : entry.type === "appointment" ? this._appointmentButton(entry.item, planner) : this._gapButton(entry, planner))}
      ${missing.map((lesson) => this._lessonButton({ ...lesson, _missing: true }))}
      ${planner ? this._edgeButton(this._t("after_school"), date, lessons.at(-1)?.end, false, planner) : ""}
    </section>`;
  }

  _plannerState(student) {
    const configured = this._state(student.planner_entity);
    if (configured) return configured;
    return this._relatedState(student, (state) => state.attributes?.config_entry_id && Array.isArray(state.attributes?.items));
  }

  _relatedState(student, predicate) {
    const references = Object.values(student).filter((value) => typeof value === "string" && value.startsWith("sensor."));
    const candidates = Object.values(this._hass.states).filter((state) => state.attributes?.student_id && predicate(state));
    return candidates.sort((a, b) => Math.max(...references.map((id) => commonPrefix(id, b.entity_id))) - Math.max(...references.map((id) => commonPrefix(id, a.entity_id))))[0] || null;
  }

  _gapButton(gap, planner) {
    return html`<div class="gap ${gap.kind}"><span>${this._t(gap.kind)} · ${gap.minutes} min · ${formatTime(gap.start, this._locale())}–${formatTime(gap.end, this._locale())}</span>${gap.minutes >= 45 ? html`<button class="add" @click=${() => this._addAppointment(planner, gap.start, gap.end)}>+ ${this._t("add")}</button>` : ""}</div>`;
  }

  _emptyLessonButton(slot, planner) {
    return html`<div class="lesson empty-lesson"><span class="lesson-head"><span>${this._t("period")} ${slot.period}</span><span>${this._t("no_lesson")}</span></span><span class="meta"><span>${formatTime(slot.start, this._locale())}–${formatTime(slot.end, this._locale())}</span></span>${planner ? html`<button class="add" @click=${() => this._addAppointment(planner, slot.start, slot.end)}>+ ${this._t("add")}</button>` : ""}</div>`;
  }

  _edgeButton(label, date, boundary, before, planner) {
    if (!date) return "";
    const start = before ? `${date}T07:30:00` : boundary || `${date}T08:30:00`;
    const end = before ? boundary || `${date}T08:30:00` : `${date}T17:00:00`;
    return html`<div class="day-edge"><span>${label}</span><button class="add" @click=${() => this._addAppointment(planner, start, end)}>+ ${this._t("add")}</button></div>`;
  }

  _appointmentButton(item, planner) {
    return html`<button class="lesson appointment" @click=${() => (this._dialog = { type: "appointment", item, planner })}><span class="lesson-head"><span>${item.title}</span><span class="badge">${this._t("appointment")}</span></span><span class="meta">${formatTime(item.start, this._locale())}–${formatTime(item.end, this._locale())}</span></button>`;
  }

  async _addAppointment(planner, start, end) {
    const title = window.prompt(this._t("appointment_title"));
    if (!title) return;
    try {
      await this._hass.callService("somtoday", "planner_add", { config_entry_id: planner.attributes.config_entry_id, student_id: planner.attributes.student_id, title, start, end });
    } catch (error) { this._notify(error?.message || this._t("not_allowed")); }
  }

  async _deleteAppointment(item, planner) {
    try {
      await this._hass.callService("somtoday", "planner_delete", { config_entry_id: planner.attributes.config_entry_id, item_id: item.id });
      this._dialog = null;
    } catch (error) { this._notify(error?.message || this._t("not_allowed")); }
  }

  _notify(message) { this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true })); }

  _lessonButton(lesson, currentState, student = this._student()) {
    const deviation = lesson._missing ? "missing" : lessonDeviation(lesson);
    const current =
      currentState?.attributes?.start &&
      currentState.attributes.start === lesson.start;
    const color = subjectColor(
      lesson.subject || lesson.subject_short,
      this._colors(),
    );
    const classes = [
      "lesson",
      deviation === "cancelled" ? "cancelled" : "",
      deviation && deviation !== "cancelled" ? "changed" : "",
      lesson._missing ? "missing" : "",
      current ? "current" : "",
    ].join(" ");
    const workState = this._state(student.upcoming_work_entity) || this._relatedState(student, (state) => Array.isArray(state.attributes?.items) && !state.attributes?.config_entry_id);
    const fallbackItems = [
      ...(this._state(student.homework_entity)?.attributes?.homework || []),
      ...(this._state(student.next_test_entity)?.attributes?.due ? [this._state(student.next_test_entity).attributes] : []),
    ];
    const work = workForLesson(lesson, workState?.attributes?.items || fallbackItems);
    return html`<button
      class=${classes}
      style=${color ? `--subject-color:${color}` : ""}
      @click=${() => (this._dialog = { type: "lesson", item: lesson, deviation })}
    >
      <span class="lesson-head"
        ><span>${lesson.subject || lesson.subject_short || "—"}</span
        >${deviation ? html`<span class="badge">${this._t(deviation)}</span>` : ""}</span
      >
      <span class="meta"
        ><span
          >${lesson.period || lesson.period_start ? `${this._t("period")} ${lesson.period || lesson.period_start}` : ""}</span
        ><span
          >${lesson.start ? `${formatTime(lesson.start, this._locale())}–${formatTime(lesson.end, this._locale())}` : `${lesson.start_time || ""}–${lesson.end_time || ""}`}</span
        ><span>${lesson.location || ""}</span><span>${lesson.teacher || ""}</span></span
      >
      ${work.length ? html`<span class="work-chips">${work.map((item) => html`<span role="button" class="work-chip ${item.type}" @click=${(event) => { event.stopPropagation(); this._dialog = { type: item.type === "homework" ? "homework" : "test", item }; }}>${item.type === "homework" ? this._t("homework") : this._t("test")}</span>`)}</span>` : ""}
    </button>`;
  }

  _renderHomework(student) {
    const state = this._state(student.homework_entity);
    if (!isEntityUsable(state))
      return this._empty(state ? "unavailable" : "no_homework");
    const items = sortHomework(state.attributes.homework || []);
    return items.length
      ? html`<div class="list">
          ${items.map((item) => this._itemButton(item, "homework"))}
        </div>`
      : this._empty("no_homework");
  }

  _renderTests(student) {
    const state = this._state(student.next_test_entity);
    if (!isEntityUsable(state))
      return this._empty(state ? "unavailable" : "no_tests");
    return this._itemButton(state.attributes, "test");
  }

  _itemButton(item, type) {
    return html`<button
      class="item ${type === "test" ? "urgent" : ""}"
      @click=${() => (this._dialog = { type, item })}
    >
      <span class="item-head"
        ><span>${item.subject || "—"}</span
        ><span class="badge">${item.type || type}</span></span
      >
      <div>${item.topic || ""}</div>
      ${item.description ? html`<div class="description">${item.description}</div>` : ""}
      <div class="meta">
        ${item.due ? html`<span>${this._t("due")}: ${formatDate(item.due, this._locale())} ${formatTime(item.due, this._locale())}</span>` : ""}
      </div>
    </button>`;
  }

  _empty(key) {
    return html`<div class=${key === "unavailable" ? "error" : "empty"}>
      <ha-icon
        icon=${key === "unavailable" ? "mdi:cloud-alert-outline" : "mdi:calendar-blank-outline"}
      ></ha-icon
      >${this._t(key)}
    </div>`;
  }

  _renderDialog() {
    if (!this._dialog) return "";
    const { item, deviation } = this._dialog;
    const rows = [
      [
        this._t("status"),
        deviation ? this._t(deviation) : item.status || item.type,
      ],
      [this._t("period"), item.period || item.period_start],
      [this._t("teacher"), item.teacher],
      [this._t("location"), item.location],
      [
        this._t("due"),
        item.due
          ? `${formatDate(item.due, this._locale())} ${formatTime(item.due, this._locale())}`
          : null,
      ],
      [this._t("description"), item.description],
    ].filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    );
    return html`<ha-dialog
      open
      @closed=${() => {
        this._dialog = null;
      }}
      .heading=${item.subject || item.topic || this._t("title")}
      ><div class="dialog-content">
        ${item.topic ? html`<p>${item.topic}</p>` : ""}
        <dl class="dialog-grid">
          ${rows.map(
            ([label, value]) =>
              html`<dt>${label}</dt>
                <dd>${value}</dd>`,
          )}
        </dl>
      </div>
      <ha-button slot="primaryAction" dialogAction="close"
        >${this._t("close")}</ha-button
      >${this._dialog.type === "appointment" ? html`<ha-button slot="secondaryAction" @click=${() => this._deleteAppointment(item, this._dialog.planner)}>${this._t("delete")}</ha-button>` : ""}</ha-dialog
    >`;
  }

  getCardSize() {
    return this._view === "week" ? 6 : 4;
  }
}

class SomtodayCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, _config: { state: true } };
  static styles = css`
    .editor {
      display: grid;
      gap: 12px;
      padding: 8px 0;
    }
    ha-textfield,
    ha-select {
      width: 100%;
    }
    .student {
      border: 1px solid var(--divider-color);
      border-radius: 10px;
      padding: 12px;
      display: grid;
      gap: 10px;
    }
    h3 {
      margin: 4px 0;
    }
  `;
  setConfig(config) {
    this._config = { ...config, students: normalizeStudents(config) };
  }
  _set(key, value) {
    this._config = { ...this._config, [key]: value };
    fireConfigChanged(this, this._config);
  }
  _studentSet(index, key, value) {
    const students = this._config.students.map((student, i) =>
      i === index ? { ...student, [key]: value } : student,
    );
    this._config = { ...this._config, students };
    fireConfigChanged(this, this._config);
  }
  render() {
    if (!this._config) return html``;
    const entities = [
      ["week_entity", "Week sensor"],
      ["today_entity", "Today sensor"],
      ["day_entity", "School day sensor"],
      ["current_lesson_entity", "Current lesson sensor"],
      ["next_lesson_entity", "Next lesson sensor"],
      ["homework_entity", "Homework sensor"],
      ["next_test_entity", "Next test sensor"],
      ["base_schedule_entity", "Base schedule sensor (optional)"],
      ["planner_entity", "Planner sensor (optional)"],
      ["next_week_entity", "Next week sensor"],
      ["upcoming_work_entity", "Upcoming schoolwork sensor"],
    ];
    return html`<div class="editor">
      <ha-textfield
        label="Title"
        .value=${this._config.title || "Somtoday"}
        @change=${(event) => this._set("title", event.target.value)}
      ></ha-textfield
      ><ha-select
        label="Default view"
        .value=${this._config.default_view || "week"}
        @selected=${(event) => this._set("default_view", event.target.value)}
        >${VIEWS.map((view) => html`<mwc-list-item .value=${view}>${view}</mwc-list-item>`)}</ha-select
      >${(this._config.students || []).map(
        (student, index) =>
          html`<div class="student">
            <h3>${student.name || `Student ${index + 1}`}</h3>
            <ha-textfield
              label="Student name"
              .value=${student.name || ""}
              @change=${(event) => this._studentSet(index, "name", event.target.value)}
            ></ha-textfield
            >${entities.map(([key, label]) => html`<ha-entity-picker .hass=${this.hass} .value=${student[key] || ""} .label=${label} .includeDomains=${["sensor"]} @value-changed=${(event) => this._studentSet(index, key, event.detail.value)}></ha-entity-picker>`)}
          </div>`,
      )}
    </div>`;
  }
}

if (!customElements.get("somtoday-card"))
  customElements.define("somtoday-card", SomtodayCard);
if (!customElements.get("somtoday-card-editor"))
  customElements.define("somtoday-card-editor", SomtodayCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "somtoday-card",
  name: "Somtoday Card",
  description: "Somtoday schedule, homework and tests",
  preview: true,
  documentationURL: "https://github.com/jonisnet/ha-somtoday-card",
});
console.info(
  `%c SOMTODAY-CARD %c v${VERSION} `,
  "color:white;background:#03a9f4;font-weight:bold",
  "color:#03a9f4;background:white;font-weight:bold",
);
