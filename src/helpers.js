export const VIEWS = [
  "day",
  "tomorrow",
  "week",
  "homework",
  "assignments",
  "tests",
  "changes",
  "grades",
  "absences",
  "messages",
];

// A link such as /lovelace/school?somtoday_view=grades&somtoday_student=1234
// opens the card on that tab and child, so a notification can lead straight to
// what it is about. Unknown values are ignored.
export function parseCardLink(search = "") {
  const params = new URLSearchParams(search);
  const view = params.get("somtoday_view");
  const student = params.get("somtoday_student");
  return {
    view: VIEWS.includes(view) ? view : null,
    studentId:
      student !== null && student !== "" && Number.isFinite(Number(student))
        ? Number(student)
        : null,
  };
}

export function validateConfig(config) {
  if (!config || typeof config !== "object")
    throw new Error("Configuration is required");
  const students = normalizeStudents(config);
  if (!students.length) throw new Error("Configure at least one student");
  for (const student of students) {
    if (!student.week_entity && !student.today_entity && !student.day_entity) {
      throw new Error(
        "Each student needs a today_entity, week_entity or day_entity",
      );
    }
  }
  if (config.default_view && !VIEWS.includes(config.default_view)) {
    throw new Error(`Unknown default_view: ${config.default_view}`);
  }
  if (config.student_order && !STUDENT_ORDERS.includes(config.student_order)) {
    throw new Error(`Unknown student_order: ${config.student_order}`);
  }
  return true;
}

// The integration and this card are both ours, so the link between a card field
// and an entity is fixed. It is expressed as a translation_key rather than as
// entity_id text on purpose: Home Assistant builds entity_ids from the
// *translated* entity name, in the user's own language, for 40 languages with
// Dutch and German among them. A guess like `_deze_week` is therefore only
// correct on a Dutch install, while a translation_key never changes at all.
export const STUDENT_ENTITY_KEYS = {
  week_entity: "active_week",
  next_week_entity: "next_week",
  today_entity: "today",
  day_entity: "next_school_day",
  planner_entity: "planner",
  homework_entity: "open_homework",
  upcoming_work_entity: "upcoming_work",
  current_lesson_entity: "current_lesson",
  next_lesson_entity: "next_lesson",
  next_test_entity: "next_test",
  base_schedule_entity: "base_week",
  last_update_entity: "last_update",
  changes_entity: "schedule_changes",
  next_holiday_entity: "next_holiday",
  school_class_entity: "school_class",
  assignments_entity: "assignments",
  announcements_entity: "announcements",
};

const SOMTODAY_PLATFORM = "somtoday";

// Last-resort guess for installs old enough to lack `hass.entities`. The
// trailing (?:_\d+)? tolerates Home Assistant's own disambiguation suffix,
// which it appends when an entity_id would collide with a stale one left behind
// by a reinstall.
const WEEK_ID_PATTERN =
  /^sensor\.somtoday_.+_(?:deze_week|this_week)(?:_\d+)?$/;

// The integration names one device per student, `Somtoday (Full Name)`, so the
// child's name is read from the device rather than parsed out of an entity_id.
export function studentNameFromDevice(deviceName) {
  if (!deviceName) return "";
  const match = /^Somtoday\s*\((.+)\)\s*$/.exec(deviceName);
  return (match ? match[1] : deviceName).trim();
}

// Returns one entry per Somtoday student found in the entity registry, ready to
// be used as card config. Empty when the registry is unavailable, so callers can
// fall back; empty is also the honest answer when the integration is not set up.
export function detectStudents(hass) {
  const registry = hass?.entities;
  if (!registry) return [];

  const byDevice = new Map();
  for (const [entityId, entry] of Object.entries(registry)) {
    if (!entityId.startsWith("sensor.")) continue;
    if (entry?.platform !== SOMTODAY_PLATFORM) continue;
    // Keyed on entity_id when a device is somehow missing, so such an entity
    // still forms a group of its own instead of being dropped.
    const key = entry.device_id || entityId;
    if (!byDevice.has(key)) byDevice.set(key, new Map());
    const found = byDevice.get(key);
    // First one wins: `future_week` is shared by seven entities, and none of
    // them is in the mapping anyway.
    if (entry.translation_key && !found.has(entry.translation_key)) {
      found.set(entry.translation_key, entityId);
    }
  }

  const students = [];
  for (const [deviceId, found] of byDevice) {
    const student = {};
    const device = hass.devices?.[deviceId];
    const name = studentNameFromDevice(device?.name_by_user || device?.name);
    if (name) student.name = name;
    for (const [field, translationKey] of Object.entries(STUDENT_ENTITY_KEYS)) {
      const entityId = found.get(translationKey);
      if (entityId) student[field] = entityId;
    }
    // A device that yielded no usable sensor is not a student we can render.
    if (Object.keys(student).some((key) => key.endsWith("_entity"))) {
      students.push(student);
    }
  }
  // Stable order, so two children do not swap places between page loads.
  students.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return students;
}

// Falls back to the text guess only when the registry told us nothing.
export function guessWeekEntity(hass) {
  return (
    Object.keys(hass?.states || {}).find((id) => WEEK_ID_PATTERN.test(id)) || ""
  );
}

// The config a freshly dropped card starts with. One child stays flat, because
// that is the config people read, edit and paste; several children become a
// `students` array. normalizeStudents() accepts both shapes.
export function buildStubConfig(hass) {
  const base = { type: "custom:somtoday-card", default_view: "week" };
  const students = detectStudents(hass);
  if (students.length === 1) return { ...base, ...students[0] };
  if (students.length > 1) return { ...base, students };
  // Nothing detected: an install without `hass.entities`, or the integration is
  // not set up yet. Leave something editable rather than an empty card.
  return {
    ...base,
    week_entity: guessWeekEntity(hass) || "sensor.somtoday_student_deze_week",
  };
}

export function normalizeStudents(config = {}) {
  if (Array.isArray(config.students)) return config.students.filter(Boolean);
  const keys = [
    "name",
    "week_entity",
    "today_entity",
    "day_entity",
    "current_lesson_entity",
    "next_lesson_entity",
    "homework_entity",
    "next_test_entity",
    "base_schedule_entity",
    "planner_entity",
    "next_week_entity",
    "upcoming_work_entity",
    "last_update_entity",
    "changes_entity",
    "next_holiday_entity",
    "school_class_entity",
    "assignments_entity",
    "announcements_entity",
    "student_id",
  ];
  const student = {};
  for (const key of keys) if (config[key]) student[key] = config[key];
  return Object.keys(student).length ? [student] : [];
}

export const STUDENT_ORDERS = ["manual", "name"];

// The order the children appear in the card. "manual" keeps the order of the
// `students` list, which the editor lets a parent rearrange; "name" sorts
// alphabetically at render time, so a renamed child moves along by itself.
// Manual is the default because it is what every existing configuration
// already does.
export function orderStudents(config = {}) {
  const students = normalizeStudents(config);
  if (config.student_order !== "name") return students;
  return [...students].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, {
      sensitivity: "base",
    }),
  );
}

export function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(value, locale = "en") {
  const date = parseTimestamp(value);
  return date
    ? new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
    : "—";
}

export function formatDate(value, locale = "en") {
  const date = parseTimestamp(value);
  return date
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(date)
    : "—";
}

export function normalizeWeekDays(days = []) {
  return [...days]
    .filter((day) => day && day.date)
    .map((day) => ({
      ...day,
      lessons: [...(day.lessons || [])],
      missing: [...(day.missing || [])],
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function localDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function findDay(days = [], date = localDateKey()) {
  return normalizeWeekDays(days).find((day) => day.date === date) || null;
}

export function groupLessonsByDay(lessons = []) {
  const grouped = new Map();
  for (const lesson of lessons) {
    const date = String(lesson.start || "").slice(0, 10);
    if (!date) continue;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(lesson);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({
      date,
      lessons: items.sort(compareLessonTime),
      missing: [],
    }));
}

export function compareLessonTime(a, b) {
  return String(a.start || a.start_time || "").localeCompare(
    String(b.start || b.start_time || ""),
  );
}

export function buildDayTimeline(lessons = [], appointments = []) {
  const ordered = [...lessons].sort(compareLessonTime);
  const timeline = [];
  ordered.forEach((lesson, index) => {
    timeline.push({ type: "lesson", start: lesson.start, item: lesson });
    const next = ordered[index + 1];
    const end = parseTimestamp(lesson.end);
    const start = parseTimestamp(next?.start);
    if (!end || !start || start <= end) return;
    timeline.push(...splitSchoolGap(lesson.end, next.start));
  });
  for (const item of appointments) {
    timeline.push({ type: "appointment", start: item.start, item });
  }
  return timeline.sort(
    (a, b) =>
      (parseTimestamp(a.start)?.getTime() || 0) -
      (parseTimestamp(b.start)?.getTime() || 0),
  );
}

export const LESSON_PERIOD_SLOTS = [
  [1, "08:30", "09:15"],
  [2, "09:15", "10:00"],
  [3, "10:00", "10:45"],
  [4, "11:00", "11:45"],
  [5, "11:45", "12:30"],
  [6, "13:00", "13:45"],
  [7, "13:45", "14:30"],
  [8, "14:30", "15:15"],
  [9, "15:30", "16:15"],
  [10, "16:15", "17:00"],
];

export function buildSchoolDayTimeline(date, lessons = [], appointments = []) {
  const sample = lessons.find((lesson) => lesson.start)?.start || "";
  const offset = String(sample).match(/(Z|[+-]\d\d:\d\d)$/)?.[1] || "";
  const timeline = [];
  LESSON_PERIOD_SLOTS.forEach(([period, startTime, endTime], index) => {
    const lesson = lessons.find((item) => {
      const first = Number(item.period_start ?? item.period);
      const last = Number(item.period_end ?? first);
      return (
        (first && first <= period && last >= period) ||
        String(item.start || "").slice(11, 16) === startTime
      );
    });
    const start = `${date}T${startTime}:00${offset}`;
    const end = `${date}T${endTime}:00${offset}`;
    timeline.push({
      type: lesson ? "lesson" : "empty_lesson",
      start,
      end,
      period,
      item: lesson,
    });
    const next = LESSON_PERIOD_SLOTS[index + 1];
    if (next && next[1] !== endTime) {
      timeline.push(...splitSchoolGap(end, `${date}T${next[1]}:00${offset}`));
    }
  });
  for (const item of appointments)
    timeline.push({ type: "appointment", start: item.start, item });
  return timeline.sort(
    (a, b) =>
      (parseTimestamp(a.start)?.getTime() || 0) -
      (parseTimestamp(b.start)?.getTime() || 0),
  );
}

export function splitSchoolGap(start, end) {
  const startDate = parseTimestamp(start);
  const endDate = parseTimestamp(end);
  if (!startDate || !endDate) return [];
  const source = String(start);
  const date = source.slice(0, 10);
  const offset = source.match(/(Z|[+-]\d\d:\d\d)$/)?.[1] || "";
  const breaks = [
    [10, 45, 11, 0, "short_break"],
    [12, 30, 13, 0, "long_break"],
    [15, 15, 15, 30, "short_break"],
  ];
  const boundaries = breaks
    .map(([sh, sm, eh, em, kind]) => {
      const from = new Date(
        `${date}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00${offset}`,
      );
      const until = new Date(
        `${date}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00${offset}`,
      );
      return { from, until, kind };
    })
    .filter(({ from, until }) => from >= startDate && until <= endDate);
  const segments = [];
  let cursor = startDate;
  for (const boundary of boundaries) {
    if (boundary.from > cursor)
      segments.push(gapSegment(cursor, boundary.from));
    segments.push(gapSegment(boundary.from, boundary.until, boundary.kind));
    cursor = boundary.until;
  }
  if (cursor < endDate) segments.push(gapSegment(cursor, endDate));
  return segments;
}

function gapSegment(start, end, fixedKind = null) {
  const minutes = Math.round((end - start) / 60000);
  return {
    type: "gap",
    start: start.toISOString(),
    end: end.toISOString(),
    minutes,
    kind: fixedKind || (minutes >= 45 ? "free_period" : "gap"),
  };
}

export function workForLesson(lesson, items = []) {
  const start = parseTimestamp(lesson.start);
  const end = parseTimestamp(lesson.end);
  if (!start || !end) return [];
  const subject = String(
    lesson.subject || lesson.subject_short || "",
  ).toLowerCase();
  return items.filter((item) => {
    const due = parseTimestamp(item.due);
    if (!due || due.toDateString() !== start.toDateString()) return false;
    if (due >= start && due < end) return true;
    // A precise Somtoday appointment belongs to exactly one half-open lesson
    // interval. Subject fallback is only for genuinely date-only homework.
    if (!String(item.due).includes("T00:00:00")) return false;
    return subject && String(item.subject || "").toLowerCase() === subject;
  });
}

// Somtoday study-guide item type → what the card shows. Only homework and
// tests used to exist; lesson material (LESSTOF) describes the lesson and is
// not work to hand in, and anything new must not pose as a test.
export function workKind(type) {
  if (type === "homework") return "homework";
  if (type === "test" || type === "large_test") return "test";
  if (type === "lesson_material") return "lesson_material";
  return "other";
}

export const WORK_KIND_COLORS = {
  homework: { color: "#176b35", background: "#b9f6ca" },
  test: { color: "#8a3f00", background: "#ffd5a6" },
  lesson_material: { color: "#0b4f8a", background: "#cfe5ff" },
  other: { color: "#444444", background: "#e0e0e0" },
};

export function sortHomework(items = []) {
  return [...items].sort((a, b) => {
    if (!a?.due) return 1;
    if (!b?.due) return -1;
    return String(a.due).localeCompare(String(b.due));
  });
}

export function lessonDeviation(lesson = {}) {
  if (lesson.cancelled || lesson.deviation === "cancelled") return "cancelled";
  return lesson.deviates ? lesson.deviation || "changed" : null;
}

export function isEntityUsable(state) {
  return Boolean(state && !["unknown", "unavailable"].includes(state.state));
}

export function subjectColor(subject, mapping = {}) {
  const needle = String(subject || "").toLowerCase();
  const entry = Object.entries(mapping).find(
    ([key]) => key.toLowerCase() === needle,
  );
  if (entry?.[1]) return entry[1];
  if (!needle) return null;

  // Subject abbreviations are school-specific. Generate a deterministic
  // fallback instead of maintaining a hardcoded list; explicit mappings win.
  let hash = 2166136261;
  for (const character of needle) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `hsl(${Math.abs(hash) % 360} 62% 48%)`;
}

// Every bundle starts with this banner (see scripts/build.mjs), which makes the
// version of a served file readable without executing it.
const BUNDLE_BANNER = /Somtoday Card v(\d+\.\d+\.\d+[^\s*]*)/;

export function bundleVersion(text = "") {
  return BUNDLE_BANNER.exec(String(text).slice(0, 400))?.[1] || null;
}

// The dashboard resource that loads this card. HACS appends ?hacstag=… and
// bumps it on every update; a manually added resource has no query at all.
export function cardResourceUrl(resources = []) {
  return (
    resources.find((resource) =>
      /\/somtoday-card\.js(\?|$)/.test(String(resource?.url || "")),
    )?.url || null
  );
}

// ---------------------------------------------------------------------------
// Holidays, the school year and the class
// ---------------------------------------------------------------------------

// A date-only ISO string ("2026-12-19") is midnight UTC to `new Date`, which is
// the previous evening west of Greenwich. Read it as local noon instead.
function localDate(value) {
  if (!value) return null;
  const text = String(value);
  return parseTimestamp(
    /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text,
  );
}

// Whole calendar days from one YYYY-MM-DD to another, immune to DST.
export function daysBetween(from, to) {
  const [a, b] = [from, to].map((value) => {
    const [year, month, day] = String(value || "")
      .slice(0, 10)
      .split("-")
      .map(Number);
    return Date.UTC(year, month - 1, day);
  });
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function formatShortDate(value, locale = "en") {
  const date = localDate(value);
  return date
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" })
        .format(date)
        .replace(/\.$/, "")
    : "—";
}

function fill(template, values) {
  return String(template || "").replace(
    /\{(\w+)\}/g,
    (_, key) => values[key] ?? "",
  );
}

// The countdown line of the next_holiday sensor, worked out from its dates
// against today rather than from `days_until`, which is only as fresh as the
// last poll. `strings` is one language of TRANSLATIONS.
export function holidayText(
  attrs = {},
  strings = {},
  locale = "en",
  today = localDateKey(),
) {
  const { name, start, end } = attrs || {};
  if (!name || !start) return "";
  const until = daysBetween(today, start);
  if (until === null) return "";
  if (until <= 0) {
    const left = end ? daysBetween(today, end) : 0;
    // Over, but the sensor has not moved on to the next holiday yet.
    if (left === null || left < 0) return "";
    return fill(strings.holiday_now, {
      name,
      end: formatShortDate(end || start, locale),
    });
  }
  return fill(
    until === 1 ? strings.holiday_countdown_one : strings.holiday_countdown,
    { name, days: until },
  );
}

export function schoolYearProgress(attrs = {}) {
  const raw = attrs?.school_year_progress;
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// ---------------------------------------------------------------------------
// Assignments (hand-in work)
// ---------------------------------------------------------------------------

export const ASSIGNMENT_STATUSES = ["late", "open", "upcoming", "handed_in"];

export const ASSIGNMENT_STATUS_COLORS = {
  late: { color: "#8c1d18", background: "#ffd6d2" },
  open: { color: "#0b4f8a", background: "#cfe5ff" },
  upcoming: { color: "#444444", background: "#e0e0e0" },
  handed_in: { color: "#176b35", background: "#b9f6ca" },
};

// Anything the card does not know yet is shown as open: it is safer to make a
// pupil look at work than to hide it as handed in.
export function assignmentStatus(status) {
  return ASSIGNMENT_STATUSES.includes(status) ? status : "open";
}

// Late first, then by deadline; work already handed in sinks to the bottom.
export function sortAssignments(items = []) {
  const rank = { late: 0, open: 1, upcoming: 1, handed_in: 2 };
  return [...(items || [])].sort(
    (a, b) =>
      rank[assignmentStatus(a?.status)] - rank[assignmentStatus(b?.status)] ||
      String(a?.deadline || "9999").localeCompare(
        String(b?.deadline || "9999"),
      ),
  );
}

// ---------------------------------------------------------------------------
// Confidential records (somtoday.get_records)
// ---------------------------------------------------------------------------

export const RECORD_CATEGORIES = ["grades", "absences", "measures", "messages"];

export const ABSENCE_KINDS = [
  "unauthorised_absence",
  "authorised_absence",
  "absence_observed",
  "late",
  "removed_from_class",
  "homework_not_done",
  "materials_missing",
];

export function absenceKindKey(kind) {
  return ABSENCE_KINDS.includes(kind) ? `absence_${kind}` : "absence_other";
}

const normalName = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const asId = (value) =>
  value === null || value === undefined || value === "" ? null : Number(value);

const entityIdsOf = (student = {}) =>
  Object.entries(student)
    .filter(([key, value]) => key.endsWith("_entity") && value)
    .map(([, value]) => value);

// How the card recognises its child in a get_records response: an explicit
// `student_id` in the config, else the `student_id` attribute several of the
// child's sensors carry, else the device identifier ("somtoday", "<id>"). The
// name is only the last resort.
export function studentMatch(hass, student = {}) {
  const ids = entityIdsOf(student);
  let studentId = Number.isFinite(asId(student.student_id))
    ? asId(student.student_id)
    : null;
  let configEntryId = null;
  for (const id of ids) {
    const attrs = hass?.states?.[id]?.attributes || {};
    if (studentId === null && Number.isFinite(asId(attrs.student_id))) {
      studentId = asId(attrs.student_id);
    }
    if (!configEntryId && attrs.config_entry_id) {
      configEntryId = attrs.config_entry_id;
    }
  }
  for (const id of studentId === null ? ids : []) {
    const device = hass?.devices?.[hass?.entities?.[id]?.device_id];
    const pair = [...(device?.identifiers || [])].find(
      (identifier) =>
        Array.isArray(identifier) && identifier[0] === SOMTODAY_PLATFORM,
    );
    if (pair && Number.isFinite(asId(pair[1]))) {
      studentId = asId(pair[1]);
      break;
    }
  }
  return { studentId, configEntryId, name: student.name || "" };
}

// The entity for one translation_key on the same device as the child's other
// sensors, for configurations written before that field existed.
export function entityForStudent(hass, student = {}, translationKey) {
  const registry = hass?.entities;
  if (!registry || !translationKey) return null;
  const devices = new Set(
    entityIdsOf(student)
      .map((id) => registry[id]?.device_id)
      .filter(Boolean),
  );
  if (!devices.size) return null;
  return (
    Object.entries(registry).find(
      ([entityId, entry]) =>
        entityId.startsWith("sensor.") &&
        entry?.platform === SOMTODAY_PLATFORM &&
        entry.translation_key === translationKey &&
        devices.has(entry.device_id),
    )?.[0] || null
  );
}

export const EMPTY_RECORDS = Object.freeze({
  found: false,
  grades: null,
  averages: null,
  overallAverage: null,
  absences: null,
  measures: null,
  messages: null,
  unreadMessages: 0,
});

// Picks one child's records out of a get_records response. Every section is
// either a list or null, and null means "do not show it": the user has no
// access (the key is absent), or the school does not share it (the value is
// null). The card does not tell those apart on screen.
export function recordsFromResponse(response, match = {}) {
  const entries = Array.isArray(response?.entries)
    ? response.entries.filter(Boolean)
    : [];
  const pairs = entries.flatMap((entry) =>
    (Array.isArray(entry.students) ? entry.students : [])
      .filter(Boolean)
      .map((student) => ({ entry, student })),
  );
  const wantedId = asId(match.studentId);
  const found =
    (wantedId !== null &&
      pairs.find(({ student }) => asId(student.student_id) === wantedId)) ||
    (match.name &&
      pairs.find(
        ({ student }) => normalName(student.name) === normalName(match.name),
      )) ||
    (wantedId === null && pairs.length === 1 ? pairs[0] : null);
  const entry =
    found?.entry ||
    (match.configEntryId &&
      entries.find((item) => item.config_entry_id === match.configEntryId)) ||
    (entries.length === 1 ? entries[0] : null);
  if (!entry) return { ...EMPTY_RECORDS };
  const student = found?.student || null;
  const allowed = (category) => entry.access?.[category] === true;
  const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : null);
  const grades = allowed("grades") && student ? list(student.grades) : null;
  const messages = allowed("messages") ? list(entry.messages) : null;
  return {
    found: Boolean(student),
    grades,
    averages: grades ? list(student.averages) || [] : null,
    overallAverage:
      grades && typeof student.overall_average === "number"
        ? student.overall_average
        : null,
    absences: allowed("absences") && student ? list(student.absences) : null,
    measures: allowed("measures") && student ? list(student.measures) : null,
    messages,
    unreadMessages: messages
      ? Number.isInteger(entry.unread_messages)
        ? entry.unread_messages
        : messages.filter((message) => message.unread).length
      : 0,
  };
}

const newestFirst = (key) => (a, b) =>
  String(b?.[key] || "").localeCompare(String(a?.[key] || ""));

export function latestGrades(grades = [], count = 10) {
  return [...(grades || [])].sort(newestFirst("entered")).slice(0, count);
}

export function sortAbsences(absences = []) {
  return [...(absences || [])].sort(newestFirst("start"));
}

export function activeMeasures(measures = []) {
  return [...(measures || [])]
    .filter((item) => item && !item.completed)
    .sort(newestFirst("date"));
}

export function sortMessages(messages = []) {
  return [...(messages || [])].sort(newestFirst("sent"));
}

// "7,5" stays "7,5"; a bare number is written the local way, one decimal.
export function formatGrade(result, value, locale = "en") {
  if (result !== null && result !== undefined && result !== "") {
    return String(result);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

// The get_records call. The frontend's callService takes returnResponse as its
// sixth argument (notifyOnError false keeps a refusal from popping a toast);
// older frontends ignore it, and then the websocket command is used directly.
export async function fetchRecords(hass) {
  try {
    const result = await hass.callService(
      "somtoday",
      "get_records",
      {},
      undefined,
      false,
      true,
    );
    if (result && typeof result === "object" && "response" in result) {
      return result.response;
    }
  } catch {
    // Fall through to the websocket call below.
  }
  const result = await hass.callWS({
    type: "call_service",
    domain: "somtoday",
    service: "get_records",
    service_data: {},
    return_response: true,
  });
  return result?.response ?? null;
}
