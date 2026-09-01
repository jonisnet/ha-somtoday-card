export const VIEWS = ["day", "tomorrow", "week", "homework", "tests"];

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
  return true;
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
  ];
  const student = {};
  for (const key of keys) if (config[key]) student[key] = config[key];
  return Object.keys(student).length ? [student] : [];
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
