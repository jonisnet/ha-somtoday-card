/* Somtoday Card v0.4.0-beta.3 */
(() => {
  // src/helpers.js
  var VIEWS = [
    "day",
    "tomorrow",
    "week",
    "homework",
    "assignments",
    "tests",
    "changes",
    "grades",
    "absences",
    "messages"
  ];
  function parseCardLink(search = "") {
    const params = new URLSearchParams(search);
    const view = params.get("somtoday_view");
    const student = params.get("somtoday_student");
    return {
      view: VIEWS.includes(view) ? view : null,
      studentId: student !== null && student !== "" && Number.isFinite(Number(student)) ? Number(student) : null
    };
  }
  function validateConfig(config) {
    if (!config || typeof config !== "object")
      throw new Error("Configuration is required");
    const students = normalizeStudents(config);
    if (!students.length) throw new Error("Configure at least one student");
    for (const student of students) {
      if (!student.week_entity && !student.today_entity && !student.day_entity) {
        throw new Error(
          "Each student needs a today_entity, week_entity or day_entity"
        );
      }
    }
    if (config.default_view && !VIEWS.includes(config.default_view)) {
      throw new Error(`Unknown default_view: ${config.default_view}`);
    }
    if (config.student_order && !STUDENT_ORDERS.includes(config.student_order)) {
      throw new Error(`Unknown student_order: ${config.student_order}`);
    }
    for (const level of [
      config.grade_level,
      ...(config.students || []).map((s) => s?.grade_level)
    ]) {
      if (level && !GRADE_LEVELS.includes(level))
        throw new Error(`Unknown grade_level: ${level}`);
    }
    return true;
  }
  var STUDENT_ENTITY_KEYS = {
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
    announcements_entity: "announcements"
  };
  var SOMTODAY_PLATFORM = "somtoday";
  var WEEK_ID_PATTERN = /^sensor\.somtoday_.+_(?:deze_week|this_week)(?:_\d+)?$/;
  function studentNameFromDevice(deviceName) {
    if (!deviceName) return "";
    const match = /^Somtoday\s*\((.+)\)\s*$/.exec(deviceName);
    return (match ? match[1] : deviceName).trim();
  }
  function detectStudents(hass) {
    const registry = hass?.entities;
    if (!registry) return [];
    const byDevice = /* @__PURE__ */ new Map();
    for (const [entityId, entry] of Object.entries(registry)) {
      if (!entityId.startsWith("sensor.")) continue;
      if (entry?.platform !== SOMTODAY_PLATFORM) continue;
      const key = entry.device_id || entityId;
      if (!byDevice.has(key)) byDevice.set(key, /* @__PURE__ */ new Map());
      const found = byDevice.get(key);
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
      if (Object.keys(student).some((key) => key.endsWith("_entity"))) {
        students.push(student);
      }
    }
    students.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return students;
  }
  function guessWeekEntity(hass) {
    return Object.keys(hass?.states || {}).find((id) => WEEK_ID_PATTERN.test(id)) || "";
  }
  function buildStubConfig(hass) {
    const base = { type: "custom:somtoday-card", default_view: "week" };
    const students = detectStudents(hass);
    if (students.length === 1) return { ...base, ...students[0] };
    if (students.length > 1) return { ...base, students };
    return {
      ...base,
      week_entity: guessWeekEntity(hass) || "sensor.somtoday_student_deze_week"
    };
  }
  function normalizeStudents(config = {}) {
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
      "student_id"
    ];
    const student = {};
    for (const key of keys) if (config[key]) student[key] = config[key];
    return Object.keys(student).length ? [student] : [];
  }
  var STUDENT_ORDERS = ["manual", "name"];
  function orderStudents(config = {}) {
    const students = normalizeStudents(config);
    if (config.student_order !== "name") return students;
    return [...students].sort(
      (a, b) => (a.name || "").localeCompare(b.name || "", void 0, {
        sensitivity: "base"
      })
    );
  }
  function parseTimestamp(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatTime(value, locale = "en") {
    const date = parseTimestamp(value);
    return date ? new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(date) : "\u2014";
  }
  function formatDate(value, locale = "en") {
    const date = parseTimestamp(value);
    return date ? new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(date) : "\u2014";
  }
  function normalizeWeekDays(days = []) {
    return [...days].filter((day) => day && day.date).map((day) => ({
      ...day,
      lessons: [...day.lessons || []],
      missing: [...day.missing || []]
    })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  function localDateKey(now = /* @__PURE__ */ new Date()) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function findDay(days = [], date = localDateKey()) {
    return normalizeWeekDays(days).find((day) => day.date === date) || null;
  }
  function compareLessonTime(a, b) {
    return String(a.start || a.start_time || "").localeCompare(
      String(b.start || b.start_time || "")
    );
  }
  var LESSON_PERIOD_SLOTS = [
    [1, "08:30", "09:15"],
    [2, "09:15", "10:00"],
    [3, "10:00", "10:45"],
    [4, "11:00", "11:45"],
    [5, "11:45", "12:30"],
    [6, "13:00", "13:45"],
    [7, "13:45", "14:30"],
    [8, "14:30", "15:15"],
    [9, "15:30", "16:15"],
    [10, "16:15", "17:00"]
  ];
  function lessonName(lesson = {}) {
    return lesson.subject || lesson.subject_short || lesson.title || "\u2014";
  }
  function clock(value) {
    return String(value || "").slice(11, 16);
  }
  function lessonCovers(item, period, startTime, endTime) {
    const first = Number(item.period_start ?? item.period);
    if (first)
      return first <= period && Number(item.period_end ?? first) >= period || clock(item.start) === startTime;
    const start = clock(item.start);
    const end = clock(item.end);
    return Boolean(start) && start < endTime && (end ? end > startTime : start === startTime);
  }
  function buildSchoolDayTimeline(date, lessons = [], appointments = []) {
    const sample = lessons.find((lesson) => lesson.start)?.start || "";
    const offset = String(sample).match(/(Z|[+-]\d\d:\d\d)$/)?.[1] || "";
    const timeline = [];
    let previous = null;
    LESSON_PERIOD_SLOTS.forEach(([period, startTime, endTime], index) => {
      const lesson = lessons.find(
        (item) => lessonCovers(item, period, startTime, endTime)
      );
      const start = `${date}T${startTime}:00${offset}`;
      const end = `${date}T${endTime}:00${offset}`;
      if (lesson && previous?.item === lesson) {
        timeline.splice(timeline.indexOf(previous) + 1);
        previous.end = end;
        previous.period_end = period;
      } else {
        previous = {
          type: lesson ? "lesson" : "empty_lesson",
          start,
          end,
          period,
          period_end: period,
          item: lesson
        };
        timeline.push(previous);
      }
      const next = LESSON_PERIOD_SLOTS[index + 1];
      if (next && next[1] !== endTime) {
        timeline.push(...splitSchoolGap(end, `${date}T${next[1]}:00${offset}`));
      }
    });
    for (const item of appointments)
      timeline.push({ type: "appointment", start: item.start, item });
    return timeline.sort(
      (a, b) => (parseTimestamp(a.start)?.getTime() || 0) - (parseTimestamp(b.start)?.getTime() || 0)
    );
  }
  function splitSchoolGap(start, end) {
    const startDate = parseTimestamp(start);
    const endDate = parseTimestamp(end);
    if (!startDate || !endDate) return [];
    const source = String(start);
    const date = source.slice(0, 10);
    const offset = source.match(/(Z|[+-]\d\d:\d\d)$/)?.[1] || "";
    const breaks = [
      [10, 45, 11, 0, "short_break"],
      [12, 30, 13, 0, "long_break"],
      [15, 15, 15, 30, "short_break"]
    ];
    const boundaries = breaks.map(([sh, sm, eh, em, kind]) => {
      const from = /* @__PURE__ */ new Date(
        `${date}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00${offset}`
      );
      const until = /* @__PURE__ */ new Date(
        `${date}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00${offset}`
      );
      return { from, until, kind };
    }).filter(({ from, until }) => from >= startDate && until <= endDate);
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
    const minutes = Math.round((end - start) / 6e4);
    return {
      type: "gap",
      start: start.toISOString(),
      end: end.toISOString(),
      minutes,
      kind: fixedKind || (minutes >= 45 ? "free_period" : "gap")
    };
  }
  function workForLesson(lesson, items = []) {
    const start = parseTimestamp(lesson.start);
    const end = parseTimestamp(lesson.end);
    if (!start || !end) return [];
    const subject = String(
      lesson.subject || lesson.subject_short || ""
    ).toLowerCase();
    return items.filter((item) => {
      const due = parseTimestamp(item.due);
      if (!due || due.toDateString() !== start.toDateString()) return false;
      if (due >= start && due < end) return true;
      if (!String(item.due).includes("T00:00:00")) return false;
      return subject && String(item.subject || "").toLowerCase() === subject;
    });
  }
  function workKind(type) {
    if (type === "homework") return "homework";
    if (type === "test" || type === "large_test") return "test";
    if (type === "lesson_material") return "lesson_material";
    return "other";
  }
  var WORK_KIND_COLORS = {
    homework: { color: "#176b35", background: "#b9f6ca" },
    test: { color: "#8a3f00", background: "#ffd5a6" },
    lesson_material: { color: "#0b4f8a", background: "#cfe5ff" },
    other: { color: "#444444", background: "#e0e0e0" }
  };
  function sortHomework(items = []) {
    return [...items].sort((a, b) => {
      if (!a?.due) return 1;
      if (!b?.due) return -1;
      return String(a.due).localeCompare(String(b.due));
    });
  }
  function lessonDeviation(lesson = {}) {
    if (lesson.cancelled || lesson.deviation === "cancelled") return "cancelled";
    return lesson.deviates ? lesson.deviation || "changed" : null;
  }
  function isEntityUsable(state) {
    return Boolean(state && !["unknown", "unavailable"].includes(state.state));
  }
  function subjectColor(subject, mapping = {}) {
    const needle = String(subject || "").toLowerCase();
    const entry = Object.entries(mapping).find(
      ([key]) => key.toLowerCase() === needle
    );
    if (entry?.[1]) return entry[1];
    if (!needle) return null;
    let hash = 2166136261;
    for (const character of needle) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `hsl(${Math.abs(hash) % 360} 62% 48%)`;
  }
  var BUNDLE_BANNER = /Somtoday Card v(\d+\.\d+\.\d+[^\s*]*)/;
  function bundleVersion(text = "") {
    return BUNDLE_BANNER.exec(String(text).slice(0, 400))?.[1] || null;
  }
  function cardResourceUrl(resources = []) {
    return resources.find(
      (resource) => /\/somtoday-card\.js(\?|$)/.test(String(resource?.url || ""))
    )?.url || null;
  }
  function localDate(value) {
    if (!value) return null;
    const text = String(value);
    return parseTimestamp(
      /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T12:00:00` : text
    );
  }
  function daysBetween(from, to) {
    const [a, b] = [from, to].map((value) => {
      const [year, month, day] = String(value || "").slice(0, 10).split("-").map(Number);
      return Date.UTC(year, month - 1, day);
    });
    if (Number.isNaN(a) || Number.isNaN(b)) return null;
    return Math.round((b - a) / 864e5);
  }
  function formatShortDate(value, locale = "en") {
    const date = localDate(value);
    return date ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date).replace(/\.$/, "") : "\u2014";
  }
  function fill(template, values) {
    return String(template || "").replace(
      /\{(\w+)\}/g,
      (_, key) => values[key] ?? ""
    );
  }
  function holidayText(attrs = {}, strings = {}, locale = "en", today = localDateKey()) {
    const { name, start, end } = attrs || {};
    if (!name || !start) return "";
    const until = daysBetween(today, start);
    if (until === null) return "";
    if (until <= 0) {
      const left = end ? daysBetween(today, end) : 0;
      if (left === null || left < 0) return "";
      return fill(strings.holiday_now, {
        name,
        end: formatShortDate(end || start, locale)
      });
    }
    return fill(
      until === 1 ? strings.holiday_countdown_one : strings.holiday_countdown,
      { name, days: until }
    );
  }
  function schoolYearProgress(attrs = {}) {
    const raw = attrs?.school_year_progress;
    if (raw === void 0 || raw === null || raw === "") return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.min(100, Math.max(0, Math.round(value)));
  }
  var ASSIGNMENT_STATUSES = ["late", "open", "upcoming", "handed_in"];
  function assignmentStatus(status) {
    return ASSIGNMENT_STATUSES.includes(status) ? status : "open";
  }
  function sortAssignments(items = []) {
    const rank = { late: 0, open: 1, upcoming: 1, handed_in: 2 };
    return [...items || []].sort(
      (a, b) => rank[assignmentStatus(a?.status)] - rank[assignmentStatus(b?.status)] || String(a?.deadline || "9999").localeCompare(
        String(b?.deadline || "9999")
      )
    );
  }
  var ABSENCE_KINDS = [
    "unauthorised_absence",
    "authorised_absence",
    "absence_observed",
    "late",
    "removed_from_class",
    "homework_not_done",
    "materials_missing"
  ];
  function absenceKindKey(kind) {
    return ABSENCE_KINDS.includes(kind) ? `absence_${kind}` : "absence_other";
  }
  var normalName = (value) => String(value || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  var asId = (value) => value === null || value === void 0 || value === "" ? null : Number(value);
  var entityIdsOf = (student = {}) => Object.entries(student).filter(([key, value]) => key.endsWith("_entity") && value).map(([, value]) => value);
  function studentMatch(hass, student = {}) {
    const ids = entityIdsOf(student);
    let studentId = Number.isFinite(asId(student.student_id)) ? asId(student.student_id) : null;
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
      const pair = [...device?.identifiers || []].find(
        (identifier) => Array.isArray(identifier) && identifier[0] === SOMTODAY_PLATFORM
      );
      if (pair && Number.isFinite(asId(pair[1]))) {
        studentId = asId(pair[1]);
        break;
      }
    }
    return { studentId, configEntryId, name: student.name || "" };
  }
  function entityForStudent(hass, student = {}, translationKey) {
    const registry = hass?.entities;
    if (!registry || !translationKey) return null;
    const devices = new Set(
      entityIdsOf(student).map((id) => registry[id]?.device_id).filter(Boolean)
    );
    if (!devices.size) return null;
    return Object.entries(registry).find(
      ([entityId, entry]) => entityId.startsWith("sensor.") && entry?.platform === SOMTODAY_PLATFORM && entry.translation_key === translationKey && devices.has(entry.device_id)
    )?.[0] || null;
  }
  var EMPTY_RECORDS = Object.freeze({
    found: false,
    grades: null,
    averages: null,
    overallAverage: null,
    absences: null,
    measures: null,
    messages: null,
    unreadMessages: 0
  });
  function recordsFromResponse(response, match = {}) {
    const entries = Array.isArray(response?.entries) ? response.entries.filter(Boolean) : [];
    const pairs = entries.flatMap(
      (entry2) => (Array.isArray(entry2.students) ? entry2.students : []).filter(Boolean).map((student2) => ({ entry: entry2, student: student2 }))
    );
    const wantedId = asId(match.studentId);
    const found = wantedId !== null && pairs.find(({ student: student2 }) => asId(student2.student_id) === wantedId) || match.name && pairs.find(
      ({ student: student2 }) => normalName(student2.name) === normalName(match.name)
    ) || (wantedId === null && pairs.length === 1 ? pairs[0] : null);
    const entry = found?.entry || match.configEntryId && entries.find((item) => item.config_entry_id === match.configEntryId) || (entries.length === 1 ? entries[0] : null);
    if (!entry) return { ...EMPTY_RECORDS };
    const student = found?.student || null;
    const allowed = (category) => entry.access?.[category] === true;
    const list = (value) => Array.isArray(value) ? value.filter(Boolean) : null;
    const grades = allowed("grades") && student ? list(student.grades) : null;
    const messages = allowed("messages") ? list(entry.messages) : null;
    return {
      found: Boolean(student),
      grades,
      averages: grades ? list(student.averages) || [] : null,
      overallAverage: grades && typeof student.overall_average === "number" ? student.overall_average : null,
      absences: allowed("absences") && student ? list(student.absences) : null,
      measures: allowed("measures") && student ? list(student.measures) : null,
      messages,
      unreadMessages: messages ? Number.isInteger(entry.unread_messages) ? entry.unread_messages : messages.filter((message) => message.unread).length : 0
    };
  }
  var newestFirst = (key) => (a, b) => String(b?.[key] || "").localeCompare(String(a?.[key] || ""));
  function latestGrades(grades = [], count = 10) {
    return [...grades || []].sort(newestFirst("entered")).slice(0, count);
  }
  function sortAbsences(absences = []) {
    return [...absences || []].sort(newestFirst("start"));
  }
  function activeMeasures(measures = []) {
    return [...measures || []].filter((item) => item && !item.completed).sort(newestFirst("date"));
  }
  function sortMessages(messages = []) {
    return [...messages || []].sort(newestFirst("sent"));
  }
  function formatGrade(result, value, locale = "en") {
    if (result !== null && result !== void 0 && result !== "") {
      return String(result);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) return "\u2014";
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value);
  }
  async function fetchRecords(hass) {
    try {
      const result2 = await hass.callService(
        "somtoday",
        "get_records",
        {},
        void 0,
        false,
        true
      );
      if (result2 && typeof result2 === "object" && "response" in result2) {
        return result2.response;
      }
    } catch {
    }
    const result = await hass.callWS({
      type: "call_service",
      domain: "somtoday",
      service: "get_records",
      service_data: {},
      return_response: true
    });
    return result?.response ?? null;
  }
  var GRADE_LEVELS = [
    "both_main_first",
    "both_alt_first",
    "main",
    "alt"
  ];
  function gradeLevels(item = {}, level = "both_main_first") {
    const main = {
      level: item.level || null,
      result: item.result,
      value: item.value,
      sufficient: item.sufficient
    };
    const hasAlt = (item.alt_result ?? null) !== null || (item.alt_value ?? null) !== null;
    if (!hasAlt) return { primary: main, secondary: null };
    const alt = {
      level: item.alt_level || null,
      result: item.alt_result,
      value: item.alt_value,
      sufficient: item.alt_sufficient
    };
    if (level === "main") return { primary: main, secondary: null };
    if (level === "alt") return { primary: alt, secondary: null };
    if (level === "both_alt_first") return { primary: alt, secondary: main };
    return { primary: main, secondary: alt };
  }

  // src/translations.js
  var TRANSLATIONS = {
    en: {
      title: "Somtoday",
      day: "Day",
      tomorrow: "Tomorrow",
      week: "Week",
      this_week: "This week",
      next_week: "Next week",
      previous_week: "Previous week",
      week_two: "Week two",
      weeks: "weeks",
      homework: "Homework",
      tests: "Tests",
      all_students: "All children",
      student: "Child",
      test: "Test",
      lesson_material: "Lesson material",
      other: "Other",
      schoolwork: "Schoolwork",
      no_data: "No schedule data available",
      no_lesson: "No lesson",
      no_homework: "No outstanding homework",
      no_tests: "No upcoming test",
      unavailable: "Somtoday data is unavailable",
      location: "Room",
      teacher: "Teacher",
      period: "Period",
      status: "Status",
      due: "Due",
      description: "Description",
      missing: "Removed from timetable",
      cancelled: "Cancelled",
      changed: "Changed",
      different_room: "Different room",
      different_teacher: "Different teacher",
      different_time: "Different time",
      different_subject: "Different subject",
      extra: "Extra lesson",
      close: "Close",
      configure: "Configure the Somtoday entities",
      short_break: "Short break",
      long_break: "Long break",
      free_period: "Free period",
      gap: "Break",
      before_school: "Before school",
      after_school: "After school",
      add: "Add",
      appointment: "Appointment",
      appointment_title: "What would you like to add?",
      delete: "Delete",
      not_allowed: "You are not allowed to edit the planner",
      print: "Print",
      popup_blocked: "Allow pop-ups to print the timetable",
      changes: "Changes",
      update_available: "Somtoday Card {version} is installed",
      reload: "Reload",
      no_changes: "No timetable changes in the last {days} days",
      no_changes_sensor: "Needs the Schedule changes sensor (Somtoday 0.1.9 or newer)",
      came_in: "Came in",
      lesson: "Lesson",
      was: "was",
      change_cancelled: "Cancelled",
      change_reinstated: "Back on",
      change_moved: "Moved",
      change_room_changed: "Different room",
      change_teacher_changed: "Different teacher",
      change_added: "Added",
      change_removed: "Removed",
      assignments: "Assignments",
      grades: "Grades",
      absences: "Absences",
      messages: "Messages",
      holiday_countdown: "{days} days until {name}",
      holiday_countdown_one: "1 day until {name}",
      holiday_now: "{name} until {end}",
      school_year: "School year",
      class: "Class",
      status_late: "Late",
      status_open: "Open",
      status_upcoming: "Not open yet",
      status_handed_in: "Handed in",
      deadline: "Deadline",
      opens: "Opens",
      no_assignments: "No assignments to hand in",
      time_indication: "Time",
      links: "Links",
      latest_grades: "Latest grades",
      averages: "Averages",
      overall_average: "Overall average",
      weight: "weight",
      resit: "Resit",
      no_grades: "No grades yet",
      measures: "Measures",
      no_absences: "No absences registered",
      absence_unauthorised_absence: "Unauthorised absence",
      absence_authorised_absence: "Authorised absence",
      absence_absence_observed: "Absent",
      absence_late: "Late",
      absence_removed_from_class: "Removed from class",
      absence_homework_not_done: "Homework not done",
      absence_materials_missing: "Materials missing",
      absence_other: "Registration",
      authorised: "Authorised",
      handled: "Handled",
      no_messages: "No messages",
      unread: "Unread",
      from: "From",
      attachments: "attachments",
      notice: "Somtoday notice",
      editor_sections: "Sections",
      editor_show_holidays: "Holiday countdown",
      editor_show_school_year: "School-year progress",
      editor_show_school_class: "Class in the heading",
      editor_show_announcements: "Somtoday notices",
      editor_show_assignments: "Assignments",
      editor_show_grades: "Grades",
      editor_show_averages: "Averages",
      editor_grade_level: "Grade level (dual-level classes, e.g. BB/KB)",
      grade_level_both_main_first: "Both, first level on top",
      grade_level_both_alt_first: "Both, second level on top (e.g. KB)",
      grade_level_main: "Only the first level",
      grade_level_alt: "Only the second level (e.g. KB)",
      editor_show_absences: "Absences",
      editor_show_measures: "Measures",
      editor_show_messages: "Messages",
      editor_records_hint: "Grades, absences, measures and messages only appear for Home Assistant users the owner has given access in the Somtoday integration options."
    },
    nl: {
      title: "Somtoday",
      day: "Vandaag",
      tomorrow: "Morgen",
      week: "Week",
      this_week: "Deze week",
      next_week: "Volgende week",
      previous_week: "Vorige week",
      week_two: "Week twee",
      weeks: "weken",
      homework: "Huiswerk",
      tests: "Toetsen",
      all_students: "Alle kinderen",
      student: "Kind",
      test: "Toets",
      lesson_material: "Lesstof",
      other: "Overig",
      schoolwork: "Schoolwerk",
      no_data: "Geen roostergegevens beschikbaar",
      no_lesson: "Geen les",
      no_homework: "Geen openstaand huiswerk",
      no_tests: "Geen aankomende toets",
      unavailable: "Somtoday-gegevens zijn niet beschikbaar",
      location: "Lokaal",
      teacher: "Docent",
      period: "Lesuur",
      status: "Status",
      due: "Inleveren",
      description: "Omschrijving",
      missing: "Verdwenen uit het rooster",
      cancelled: "Vervallen",
      changed: "Gewijzigd",
      different_room: "Ander lokaal",
      different_teacher: "Andere docent",
      different_time: "Andere tijd",
      different_subject: "Ander vak",
      extra: "Extra les",
      close: "Sluiten",
      configure: "Configureer de Somtoday-entiteiten",
      short_break: "Korte pauze",
      long_break: "Lange pauze",
      free_period: "Tussenuur",
      gap: "Tijd tussen lessen",
      before_school: "Voor schooltijd",
      after_school: "Na schooltijd",
      add: "Toevoegen",
      appointment: "Afspraak",
      appointment_title: "Wat wil je toevoegen?",
      delete: "Verwijderen",
      not_allowed: "Je mag deze planning niet wijzigen",
      print: "Afdrukken",
      popup_blocked: "Sta pop-ups toe om het rooster af te drukken",
      changes: "Wijzigingen",
      update_available: "Somtoday Card {version} is ge\xEFnstalleerd",
      reload: "Herladen",
      no_changes: "Geen roosterwijzigingen in de afgelopen {days} dagen",
      no_changes_sensor: "Hiervoor is de sensor Roosterwijzigingen nodig (Somtoday 0.1.9 of nieuwer)",
      came_in: "Binnengekomen",
      lesson: "Les",
      was: "was",
      change_cancelled: "Vervallen",
      change_reinstated: "Gaat toch door",
      change_moved: "Verplaatst",
      change_room_changed: "Ander lokaal",
      change_teacher_changed: "Andere docent",
      change_added: "Toegevoegd",
      change_removed: "Verwijderd",
      assignments: "Inleveren",
      grades: "Cijfers",
      absences: "Afwezigheid",
      messages: "Berichten",
      holiday_countdown: "Nog {days} dagen tot de {name}",
      holiday_countdown_one: "Nog 1 dag tot de {name}",
      holiday_now: "{name} t/m {end}",
      school_year: "Schooljaar",
      class: "Klas",
      status_late: "Te laat",
      status_open: "Open",
      status_upcoming: "Nog niet open",
      status_handed_in: "Ingeleverd",
      deadline: "Deadline",
      opens: "Opent",
      no_assignments: "Geen opdrachten om in te leveren",
      time_indication: "Tijd",
      links: "Links",
      latest_grades: "Laatste cijfers",
      averages: "Gemiddelden",
      overall_average: "Totaalgemiddelde",
      weight: "weging",
      resit: "Herkansing",
      no_grades: "Nog geen cijfers",
      measures: "Maatregelen",
      no_absences: "Geen afwezigheid geregistreerd",
      absence_unauthorised_absence: "Ongeoorloofd afwezig",
      absence_authorised_absence: "Geoorloofd afwezig",
      absence_absence_observed: "Afwezig",
      absence_late: "Te laat",
      absence_removed_from_class: "Uit de les verwijderd",
      absence_homework_not_done: "Huiswerk niet gemaakt",
      absence_materials_missing: "Materiaal vergeten",
      absence_other: "Registratie",
      authorised: "Geoorloofd",
      handled: "Afgehandeld",
      no_messages: "Geen berichten",
      unread: "Ongelezen",
      from: "Van",
      attachments: "bijlagen",
      notice: "Melding van Somtoday",
      editor_sections: "Onderdelen",
      editor_show_holidays: "Aftellen naar de vakantie",
      editor_show_school_year: "Voortgang van het schooljaar",
      editor_show_school_class: "Klas in de kop",
      editor_show_announcements: "Meldingen van Somtoday",
      editor_show_assignments: "Inleveropdrachten",
      editor_show_grades: "Cijfers",
      editor_show_averages: "Gemiddelden",
      editor_grade_level: "Cijferniveau (klassen met twee niveaus, bijv. BB/KB)",
      grade_level_both_main_first: "Beide, eerste niveau groot",
      grade_level_both_alt_first: "Beide, tweede niveau groot (bijv. KB)",
      grade_level_main: "Alleen het eerste niveau",
      grade_level_alt: "Alleen het tweede niveau (bijv. KB)",
      editor_show_absences: "Afwezigheid",
      editor_show_measures: "Maatregelen",
      editor_show_messages: "Berichten",
      editor_records_hint: "Cijfers, afwezigheid, maatregelen en berichten verschijnen alleen voor Home Assistant-gebruikers die de eigenaar daar in de opties van de Somtoday-integratie toegang toe heeft gegeven."
    }
  };

  // src/somtoday-card.js
  var VERSION = true ? "0.4.0-beta.3" : "dev";
  var DAY_VIEWS = ["day", "tomorrow", "changes"];
  var ALL_STUDENTS = -1;
  var getLit = () => {
    const base = customElements.get("hui-masonry-view") || customElements.get("ha-panel-lovelace") || customElements.get("ha-app");
    const LitElement2 = base ? Object.getPrototypeOf(base) : window.LitElement;
    return {
      LitElement: LitElement2,
      html: LitElement2?.prototype?.html || window.html,
      css: LitElement2?.prototype?.css || window.css
    };
  };
  var { LitElement, html, css } = getLit();
  var UPDATE_CHECK_INTERVAL = 15 * 60 * 1e3;
  var RELOAD_GUARD_KEY = "somtoday-card-reloaded-for";
  var updateState = { lastCheck: 0, running: false, pending: null, cards: /* @__PURE__ */ new Set() };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") updateState.lastCheck = 0;
  });
  function readSession(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function writeSession(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
  async function checkForNewerCard(hass) {
    const now = Date.now();
    if (updateState.running || updateState.pending || VERSION === "dev") return;
    if (now - updateState.lastCheck < UPDATE_CHECK_INTERVAL) return;
    if (document.visibilityState === "hidden") return;
    updateState.lastCheck = now;
    updateState.running = true;
    try {
      let url = null;
      try {
        url = cardResourceUrl(await hass.callWS({ type: "lovelace/resources" }));
      } catch {
      }
      url ||= performance.getEntriesByType("resource").map((entry) => entry.name).find((name) => /\/somtoday-card\.js(\?|$)/.test(name));
      if (!url) return;
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) return;
      const served = bundleVersion((await response.text()).slice(0, 400));
      if (!served || served === VERSION) return;
      const editing = new URLSearchParams(window.location.search).has("edit");
      if (!editing && readSession(RELOAD_GUARD_KEY) !== served && writeSession(RELOAD_GUARD_KEY, served)) {
        window.location.reload();
        return;
      }
      updateState.pending = served;
      for (const card of updateState.cards) card.requestUpdate();
    } catch {
    } finally {
      updateState.running = false;
    }
  }
  var RECORDS_INTERVAL = 15 * 60 * 1e3;
  var RECORDS_ON_RETURN = 60 * 1e3;
  var RECORD_SECTIONS = [
    "show_grades",
    "show_averages",
    "show_absences",
    "show_measures",
    "show_messages"
  ];
  var recordsState = {
    at: 0,
    user: null,
    running: false,
    stale: false,
    response: null,
    cards: /* @__PURE__ */ new Set()
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - recordsState.at >= RECORDS_ON_RETURN) recordsState.stale = true;
    for (const card of recordsState.cards) card._maybeFetchRecords();
  });
  async function refreshRecords(hass) {
    const user = hass.user?.id || null;
    if (user !== recordsState.user) {
      recordsState.user = user;
      recordsState.response = null;
      recordsState.at = 0;
    }
    if (recordsState.running || document.visibilityState === "hidden") return;
    if (!recordsState.stale && Date.now() - recordsState.at < RECORDS_INTERVAL) return;
    recordsState.running = true;
    recordsState.stale = false;
    recordsState.at = Date.now();
    try {
      const response = await fetchRecords(hass);
      if (recordsState.user === user) recordsState.response = response;
    } catch {
    } finally {
      recordsState.running = false;
    }
    for (const card of recordsState.cards) card.requestUpdate();
  }
  function fireConfigChanged(element, config) {
    element.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true
      })
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
    const monday = /* @__PURE__ */ new Date(`${weekStart || days[0]?.date}T12:00:00`);
    if (Number.isNaN(monday.getTime())) return days;
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return Array.from({ length: 5 }, (_, offset) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + offset);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      return known.get(key) || { date: key, lessons: [], missing: [] };
    });
  }
  var SomtodayCard = class extends LitElement {
    static properties = {
      hass: { attribute: false },
      _view: { state: true },
      _studentIndex: { state: true },
      _compact: { state: true },
      _dialog: { state: true },
      _weekOffset: { state: true }
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
    .students-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
    }
    .student-column {
      min-width: 0;
    }
    .student-name {
      padding: 0 4px 6px;
      font-weight: 600;
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
    .student-tabs {
      padding: 8px 12px;
      border-bottom: 1px solid var(--divider-color);
    }
    .student-tabs .tab {
      padding: 5px 10px;
      font-size: 0.82rem;
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
    .update-notice {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin: 10px 14px 0;
      padding: 8px 10px;
      border-radius: 10px;
      font-size: 0.85rem;
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
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
      box-sizing: border-box;
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
    .work-chip.lesson_material { color: #0b4f8a; background: #cfe5ff; }
    .work-chip.other { color: #444444; background: #e0e0e0; }
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
    .item.change {
      cursor: default;
      border-left-color: var(--subject-color, var(--primary-color));
    }
    .item.change:hover {
      transform: none;
      box-shadow: none;
    }
    .change.cancelled .badge,
    .change.removed .badge {
      color: var(--error-color);
    }
    .came-in {
      align-items: center;
      gap: 4px;
    }
    .came-in ha-icon {
      --mdc-icon-size: 14px;
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
    .info-strip { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; margin: 10px 14px 0; font-size: 0.85rem; }
    .info-strip > span { display: inline-flex; align-items: center; gap: 6px; }
    .info-strip ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
    .year-progress { flex: 1 1 180px; min-width: 140px; }
    .year-progress .bar { flex: 1; height: 6px; border-radius: 999px; overflow: hidden; background: color-mix(in srgb, var(--primary-text-color) 12%, transparent); }
    .year-progress .bar > span { display: block; height: 100%; border-radius: inherit; background: var(--primary-color); }
    .year-progress small { color: var(--secondary-text-color); white-space: nowrap; }
    .notices { display: grid; gap: 6px; margin: 10px 14px 0; }
    .notice { --notice-color: var(--info-color, var(--primary-color)); display: flex; gap: 8px; padding: 8px 10px; border-radius: 10px; font-size: 0.85rem; border-left: 4px solid var(--notice-color); background: color-mix(in srgb, var(--notice-color) 14%, transparent); }
    .notice.warning { --notice-color: var(--warning-color); }
    .notice.error { --notice-color: var(--error-color); }
    .notice.positive { --notice-color: var(--success-color); }
    .notice ha-icon { --mdc-icon-size: 18px; color: var(--notice-color); flex: none; }
    .notice strong { display: block; }
    .status-chip { border-radius: 999px; padding: 2px 7px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
    .status-chip.late { color: #8c1d18; background: #ffd6d2; }
    .status-chip.open { color: #0b4f8a; background: #cfe5ff; }
    .status-chip.upcoming { color: #444444; background: #e0e0e0; }
    .status-chip.handed_in { color: #176b35; background: #b9f6ca; }
    .item.late { border-left-color: var(--error-color); }
    .item.handed_in { opacity: 0.7; }
    .links { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 6px; font-size: 0.8rem; }
    .links a { color: var(--primary-color); text-decoration: none; display: inline-flex; align-items: center; gap: 3px; overflow-wrap: anywhere; }
    .links a:hover { text-decoration: underline; }
    .links ha-icon, .meta ha-icon, .message ha-icon { --mdc-icon-size: 14px; }
    .section-title { margin: 14px 2px 8px; font-size: 0.95rem; font-weight: 600; }
    .section-title:first-child { margin-top: 0; }
    .record { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 4px 12px; padding: 8px 10px; border-radius: 9px; border-left: 4px solid var(--subject-color, var(--primary-color)); background: color-mix(in srgb, var(--subject-color, var(--primary-color)) 8%, var(--card-background-color)); }
    .record .result { min-width: 2.6em; text-align: center; font-size: 1.15rem; font-weight: 700; display: flex; flex-direction: column; align-items: center; line-height: 1.15; }
    .grade-main .level { font-size: 0.62rem; font-weight: 700; margin-right: 3px; opacity: .75; vertical-align: middle; }
    .grade-other { display: block; font-size: 0.68rem; font-weight: 600; color: var(--secondary-text-color); }
    .averages .grade-other { display: inline; margin-left: 6px; }
    .insufficient { color: var(--error-color); }
    .record .what { min-width: 0; }
    .record .what > div:first-child { font-weight: 600; overflow-wrap: anywhere; }
    .record .when { text-align: right; color: var(--secondary-text-color); font-size: 0.78rem; white-space: nowrap; }
    .averages { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    .averages td { padding: 6px 4px; border-bottom: 1px solid var(--divider-color); }
    .averages td:last-child { text-align: right; font-weight: 600; white-space: nowrap; }
    .averages tr.overall td { font-weight: 700; border-bottom-width: 2px; }
    .kind-chip { border-radius: 999px; padding: 2px 7px; font-size: 0.7rem; font-weight: 700; white-space: nowrap; color: var(--primary-text-color); background: color-mix(in srgb, var(--warning-color) 22%, transparent); }
    .kind-chip.unauthorised_absence, .kind-chip.removed_from_class { background: color-mix(in srgb, var(--error-color) 22%, transparent); }
    .kind-chip.authorised_absence { background: color-mix(in srgb, var(--success-color, #43a047) 22%, transparent); }
    details.message { border-radius: 9px; border-left: 4px solid var(--divider-color); background: color-mix(in srgb, var(--primary-color) 5%, var(--card-background-color)); }
    details.message.unread { border-left-color: var(--primary-color); }
    details.message summary { list-style: none; cursor: pointer; padding: 8px 10px; display: grid; grid-template-columns: auto 1fr auto; gap: 2px 10px; align-items: center; }
    details.message summary::-webkit-details-marker { display: none; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: transparent; }
    .unread .dot { background: var(--primary-color); }
    .message .subject { font-weight: 600; overflow-wrap: anywhere; }
    .unread .subject { font-weight: 700; }
    .message .sender { grid-column: 2; color: var(--secondary-text-color); font-size: 0.78rem; }
    .message .when { grid-row: 1; grid-column: 3; color: var(--secondary-text-color); font-size: 0.78rem; white-space: nowrap; }
    .message .body { padding: 0 12px 12px 28px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.88rem; }
    .tab .unread-count { display: inline-block; min-width: 1.3em; margin-left: 4px; padding: 0 4px; border-radius: 999px; font-size: 0.72rem; background: var(--error-color); color: white; }
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
        ...config
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
      const ids = normalizeStudents(this._config || {}).flatMap(
        (student) => Object.entries(student).filter(([key]) => key.endsWith("_entity")).map(([, id]) => id)
      );
      const automaticWeekIds = Object.values(value?.states || {}).filter((state) => Number.isInteger(state.attributes?.week_offset)).map((state) => state.entity_id);
      const integrationIds = Object.values(value?.entities || {}).filter((entry) => entry.platform === "somtoday").map((entry) => entry.entity_id);
      const relevant = [.../* @__PURE__ */ new Set([...ids, ...automaticWeekIds, ...integrationIds])].map((id) => `${id}:${value?.states?.[id]?.last_updated || ""}`).join("|");
      this._hass = value;
      if (value) checkForNewerCard(value);
      if (value) this._maybeFetchRecords();
      if (value && this.isConnected) this._applyLink();
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
      updateState.cards.add(this);
      recordsState.cards.add(this);
      this._onLocation = () => this._applyLink();
      window.addEventListener("location-changed", this._onLocation);
      window.addEventListener("popstate", this._onLocation);
      this._applyLink();
      this._recordsTimer = window.setInterval(() => this._maybeFetchRecords(), 60 * 1e3);
      this._maybeFetchRecords();
      this._observer = new ResizeObserver(([entry]) => {
        const compact = entry.contentRect.width < 1e3;
        if (compact !== this._compact) {
          this._compact = compact;
          this.toggleAttribute("compact", compact);
        }
      });
      this._observer.observe(this);
    }
    disconnectedCallback() {
      updateState.cards.delete(this);
      recordsState.cards.delete(this);
      window.clearInterval(this._recordsTimer);
      window.removeEventListener("location-changed", this._onLocation);
      window.removeEventListener("popstate", this._onLocation);
      this._observer?.disconnect();
      super.disconnectedCallback();
    }
    // Follow ?somtoday_view= / ?somtoday_student= once per address, so tapping a
    // notification opens the right tab while the tabs stay free to click after.
    _applyLink() {
      if (!this._config) return;
      const search = window.location.search;
      if (search === this._appliedLink) return;
      const link = parseCardLink(search);
      if (link.studentId !== null && !this._hass) return;
      this._appliedLink = search;
      if (link.view) this._view = link.view;
      if (link.studentId !== null) {
        const index = this._students().findIndex(
          (student) => studentMatch(this._hass, student).studentId === link.studentId
        );
        if (index >= 0) this._studentIndex = index;
      }
      if (link.view || link.studentId !== null) this.requestUpdate();
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
    _students() {
      return orderStudents(this._config);
    }
    // "All children" only exists for the day views, only when the option is on and
    // there is more than one child to show.
    _allAvailable() {
      return this._config.show_all_students === true && this._students().length > 1 && DAY_VIEWS.includes(this._view);
    }
    _showingAll() {
      return this._studentIndex === ALL_STUDENTS && this._allAvailable();
    }
    // Index of the child actually shown. "All" falls back to the first child on
    // views that are per child, so switching to Week never shows an empty card.
    _activeIndex() {
      return this._studentIndex === ALL_STUDENTS ? 0 : this._studentIndex;
    }
    _student() {
      return this._students()[this._activeIndex()] || {};
    }
    _colors() {
      return this._config.subject_colors || {};
    }
    // Every section toggle defaults to on.
    _on(option) {
      return this._config[option] !== false;
    }
    // A configured field wins; otherwise the sensor with the right
    // translation_key on the child's device, so cards made before 0.4.0 pick
    // the new sensors up without being edited.
    _studentState(student, field) {
      return this._state(
        student[field] || entityForStudent(this._hass, student, STUDENT_ENTITY_KEYS[field])
      );
    }
    _maybeFetchRecords() {
      if (!this._hass || !this._config || !this.isConnected) return;
      if (!RECORD_SECTIONS.some((key) => this._on(key))) return;
      if (this._hass.services && !this._hass.services.somtoday?.get_records) return;
      refreshRecords(this._hass);
    }
    _records(student) {
      if (!recordsState.response) return EMPTY_RECORDS;
      return recordsFromResponse(
        recordsState.response,
        studentMatch(this._hass, student)
      );
    }
    // Views without anything to show for this child and this user are left out
    // entirely: no access, a school that does not share it, a section turned off.
    _availableViews(student) {
      const records = this._records(student);
      return VIEWS.filter((view) => {
        if (view === "assignments") {
          return this._on("show_assignments") && isEntityUsable(this._studentState(student, "assignments_entity"));
        }
        if (view === "grades") {
          return (this._on("show_grades") || this._on("show_averages")) && records.grades !== null;
        }
        if (view === "absences") {
          return this._on("show_absences") && records.absences !== null || this._on("show_measures") && activeMeasures(records.measures).length > 0;
        }
        if (view === "messages") return this._on("show_messages") && records.messages !== null;
        return true;
      });
    }
    // The chosen view, or the week while it is not (or no longer) available —
    // for instance until the records have come in.
    _effectiveView(student) {
      return this._availableViews(student).includes(this._view) ? this._view : "week";
    }
    render() {
      if (!this._config || !this._hass) return html``;
      const students = this._students();
      const student = this._student();
      const all = this._showingAll();
      const views = this._availableViews(student);
      const view = all ? this._view : this._effectiveView(student);
      const records = this._records(student);
      const schoolClass = this._on("show_school_class") ? this._studentState(student, "school_class_entity") : null;
      const className = isEntityUsable(schoolClass) ? schoolClass.attributes?.class_name || schoolClass.state : "";
      return html`<ha-card>
      <div class="header">
        <ha-icon icon="mdi:school-outline"></ha-icon>
        <div class="heading">
          <h2>${this._config.title}</h2>
          <div class="subtitle">
            ${all ? this._t("all_students") : [student.name || this._t(view), className ? `${this._t("class")} ${className}` : "", className ? schoolClass.attributes?.programme : ""].filter(Boolean).join(" \xB7 ")}
          </div>
        </div>
      </div>
      ${this._config.show_view_tabs !== false ? html`<div class="view-tabs">
              ${views.map(
        (item) => html`<button
                    class="tab ${item === view ? "active" : ""}"
                    @click=${() => {
          this._view = item;
          this.requestUpdate();
        }}
                  >
                    ${this._t(item)}${item === "messages" && records.unreadMessages > 0 ? html`<span class="unread-count">${records.unreadMessages}</span>` : ""}
                  </button>`
      )}
            </div>` : ""}
      ${students.length > 1 ? this._renderStudentTabs(students) : ""}
      ${updateState.pending ? html`<div class="update-notice">
            <span>${this._t("update_available").replace("{version}", updateState.pending)}</span>
            <button class="tab active" @click=${() => window.location.reload()}>${this._t("reload")}</button>
          </div>` : ""}
      ${this._renderNotices(student)}
      ${all ? "" : this._renderInfoStrip(student)}
      <div class="content">
        ${all ? this._renderAllStudents(students) : this._renderView(student, view)}
      </div>
      ${this._renderDialog()}
    </ha-card>`;
    }
    // The children sit under the view buttons as a second, smaller row: the view is
    // the main choice, the child narrows it down. With one child there is nothing to
    // choose, so the row is left out entirely.
    _renderStudentTabs(students) {
      const active = this._showingAll() ? ALL_STUDENTS : this._activeIndex();
      const tab = (index, label) => html`<button
        class="tab ${index === active ? "active" : ""}"
        @click=${() => {
        this._studentIndex = index;
        this.requestUpdate();
      }}
      >
        ${label}
      </button>`;
      return html`<div class="student-tabs">
      ${this._allAvailable() ? tab(ALL_STUDENTS, this._t("all_students")) : ""}
      ${students.map(
        (item, index) => tab(index, item.name || `${this._t("student")} ${index + 1}`)
      )}
    </div>`;
    }
    // Today or tomorrow for every child, one column each, so a parent sees at a
    // glance who is where. Columns wrap underneath each other on a narrow card.
    _renderAllStudents(students) {
      return html`<div class="students-grid">
      ${students.map(
        (student, index) => html`<div class="student-column">
            <div class="student-name">
              ${student.name || `${this._t("student")} ${index + 1}`}
            </div>
            ${this._renderView(student)}
          </div>`
      )}
    </div>`;
    }
    _renderView(student, view = this._view) {
      if (view === "week") return this._renderWeek(student);
      if (view === "day") return this._renderDay(student);
      if (view === "tomorrow") return this._renderTomorrow(student);
      if (view === "homework") return this._renderHomework(student);
      if (view === "changes") return this._renderChanges(student);
      if (view === "assignments") return this._renderAssignments(student);
      if (view === "grades") return this._renderGrades(student);
      if (view === "absences") return this._renderAbsences(student);
      if (view === "messages") return this._renderMessages(student);
      return this._renderTests(student);
    }
    // Somtoday's own nationwide notices — an outage, maintenance. They are the
    // same for every child on the account, so one banner is enough.
    _renderNotices(student) {
      if (!this._on("show_announcements")) return "";
      const state = this._studentState(student, "announcements_entity");
      if (!isEntityUsable(state) || !(Number(state.state) > 0)) return "";
      const items = (state.attributes?.announcements || []).filter(Boolean);
      if (!items.length) return "";
      const icons = { info: "mdi:information-outline", warning: "mdi:alert-outline", error: "mdi:alert-circle-outline", positive: "mdi:check-circle-outline" };
      return html`<div class="notices" role="status">
      ${items.map(
        (item) => html`<div class="notice ${item.level || "info"}">
          <ha-icon icon=${icons[item.level] || icons.info}></ha-icon>
          <div><strong>${item.subject || this._t("notice")}</strong>${item.body ? html`<span>${item.body}</span>` : ""}</div>
        </div>`
      )}
    </div>`;
    }
    // Holiday countdown and how far the school year is, on one quiet line.
    _renderInfoStrip(student) {
      const state = this._studentState(student, "next_holiday_entity");
      if (!isEntityUsable(state)) return "";
      const attrs = state.attributes || {};
      const text = this._on("show_holidays") ? holidayText(attrs, TRANSLATIONS[this._locale()], this._locale()) : "";
      const progress = this._on("show_school_year") ? schoolYearProgress(attrs) : null;
      if (!text && progress === null) return "";
      return html`<div class="info-strip">
      ${text ? html`<span><ha-icon icon="mdi:beach"></ha-icon>${text}</span>` : ""}
      ${progress !== null ? html`<span class="year-progress" title=${attrs.school_year?.name || ""}>
            <small>${this._t("school_year")}</small>
            <span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${progress}><span style="width:${progress}%"></span></span>
            <small>${progress}%</small>
          </span>` : ""}
    </div>`;
    }
    _renderAssignments(student) {
      const state = this._studentState(student, "assignments_entity");
      if (!isEntityUsable(state)) return this._empty(state ? "unavailable" : "no_assignments");
      const items = sortAssignments(state.attributes?.assignments || []);
      if (!items.length) return this._empty("no_assignments");
      const locale = this._locale();
      return html`<div class="list">
      ${items.map((item) => {
        const status = assignmentStatus(item.status);
        const color = subjectColor(item.subject, this._colors());
        return html`<div
          class="item ${status}"
          role="button"
          tabindex="0"
          style=${color && status !== "late" ? `border-left-color:${color}` : ""}
          @click=${() => this._dialog = { type: "assignment", item }}
          @keydown=${(event) => this._activate(event, { type: "assignment", item })}
        >
          <span class="item-head"
            ><span>${item.subject || "\u2014"}</span
            ><span class="status-chip ${status}">${this._t(`status_${status}`)}</span></span
          >
          ${item.topic ? html`<div>${item.topic}</div>` : ""}
          ${item.description ? html`<div class="description">${item.description}</div>` : ""}
          <div class="meta">
            ${item.deadline ? html`<span>${this._t("deadline")}: ${formatDate(item.deadline, locale)} ${formatTime(item.deadline, locale)}</span>` : ""}
            ${item.opens && status === "upcoming" ? html`<span>${this._t("opens")}: ${formatDate(item.opens, locale)} ${formatTime(item.opens, locale)}</span>` : ""}
          </div>
        </div>`;
      })}
    </div>`;
    }
    _renderGrades(student) {
      const records = this._records(student);
      const locale = this._locale();
      const grades = this._on("show_grades") ? latestGrades(records.grades || [], 10) : [];
      const averages = this._on("show_averages") ? records.averages || [] : [];
      const overall = this._on("show_averages") ? records.overallAverage : null;
      if (!grades.length && !averages.length && overall === null) return this._empty("no_grades");
      return html`
      ${grades.length ? html`<div class="section-title">${this._t("latest_grades")}</div>
            <div class="list">
              ${grades.map((grade) => {
        const color = subjectColor(grade.subject || grade.subject_short, this._colors());
        return html`<div class="record" style=${color ? `--subject-color:${color}` : ""}>
                  <span class="result">${this._gradeCell(grade, locale, student)}</span>
                  <div class="what">
                    <div>${grade.subject || grade.subject_short || "\u2014"}</div>
                    <div class="meta">
                      ${grade.description ? html`<span>${grade.description}</span>` : ""}
                      ${grade.resit ? html`<span class="badge">${this._t("resit")}</span>` : ""}
                    </div>
                  </div>
                  <div class="when">
                    <div>${grade.entered ? formatDate(grade.entered, locale) : ""}</div>
                    ${grade.weight !== null && grade.weight !== void 0 && grade.weight !== "" ? html`<div>${this._t("weight")} ${grade.weight}×</div>` : ""}
                  </div>
                </div>`;
      })}
            </div>` : ""}
      ${averages.length || overall !== null ? html`<div class="section-title">${this._t("averages")}</div>
            <table class="averages">
              ${overall !== null ? html`<tr class="overall"><td>${this._t("overall_average")}</td><td class=${overall < 5.5 ? "insufficient" : ""}>${formatGrade(null, overall, locale)}</td></tr>` : ""}
              ${averages.map(
        (average) => html`<tr>
                  <td>${average.subject || average.subject_short || "\u2014"}</td>
                  <td>${this._gradeCell(average, locale, student)}</td>
                </tr>`
      )}
            </table>` : ""}
    `;
    }
    _renderAbsences(student) {
      const records = this._records(student);
      const locale = this._locale();
      const absences = this._on("show_absences") && records.absences !== null ? sortAbsences(records.absences) : null;
      const measures = this._on("show_measures") ? activeMeasures(records.measures) : [];
      return html`
      ${absences !== null ? html`<div class="section-title">${this._t("absences")}</div>
            ${absences.length ? html`<div class="list">
                  ${absences.map((item) => {
        const sameDay = String(item.start || "").slice(0, 10) === String(item.end || "").slice(0, 10);
        return html`<div class="item change">
                      <span class="item-head"
                        ><span>${formatDate(item.start, locale)}${item.start && String(item.start).includes("T") ? ` ${formatTime(item.start, locale)}${item.end && sameDay ? `\u2013${formatTime(item.end, locale)}` : ""}` : ""}</span
                        ><span class="kind-chip ${item.kind}">${this._t(absenceKindKey(item.kind))}</span></span
                      >
                      <div class="meta">
                        ${item.period ? html`<span>${this._t("period")} ${item.period}</span>` : ""}
                        ${item.subject ? html`<span>${item.subject}</span>` : ""}
                        ${item.authorised ? html`<span>${this._t("authorised")}</span>` : ""}
                        ${item.handled ? html`<span>${this._t("handled")}</span>` : ""}
                      </div>
                      ${item.description ? html`<div class="description">${item.description}</div>` : ""}
                    </div>`;
      })}
                </div>` : this._empty("no_absences")}` : ""}
      ${measures.length ? html`<div class="section-title">${this._t("measures")}</div>
            <div class="list">
              ${measures.map(
        (item) => html`<div class="item change" style="--subject-color:var(--warning-color)">
                  <span class="item-head"><span>${item.description || "\u2014"}</span><span class="count">${formatDate(item.date, locale)}</span></span>
                  ${item.remarks ? html`<div class="description">${item.remarks}</div>` : ""}
                </div>`
      )}
            </div>` : ""}
    `;
    }
    _renderMessages(student) {
      const messages = sortMessages(this._records(student).messages || []);
      if (!messages.length) return this._empty("no_messages");
      const locale = this._locale();
      return html`<div class="list">
      ${messages.map(
        (message) => html`<details class="message ${message.unread ? "unread" : ""}">
          <summary>
            <span class="dot" title=${message.unread ? this._t("unread") : ""}></span>
            <span class="subject">${message.subject || "\u2014"}${message.message_count > 1 ? ` (${message.message_count})` : ""}</span>
            <span class="when">${formatDate(message.sent, locale)}</span>
            <span class="sender">${message.sender || ""}${Array.isArray(message.attachments) && message.attachments.length ? html` · <ha-icon icon="mdi:paperclip"></ha-icon> ${message.attachments.length} ${this._t("attachments")}` : Number(message.attachments) > 0 ? ` \xB7 ${message.attachments} ${this._t("attachments")}` : ""}</span>
          </summary>
          ${message.body ? html`<div class="body">${message.body}</div>` : ""}
        </details>`
      )}
    </div>`;
    }
    _activate(event, dialog) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      this._dialog = dialog;
    }
    // Teacher-attached links open in a new tab; the click must not also open
    // the item's dialog.
    _renderLinks(links) {
      const safe = (links || []).filter((link) => /^https?:\/\//.test(String(link?.url || "")));
      if (!safe.length) return "";
      return html`<div class="links">
      ${safe.map(
        (link) => html`<a href=${link.url} target="_blank" rel="noopener noreferrer" @click=${(event) => event.stopPropagation()} @keydown=${(event) => event.stopPropagation()}
          ><ha-icon icon="mdi:open-in-new"></ha-icon>${link.title || link.url}</a
        >`
      )}
    </div>`;
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
      <button class="tab ${this._weekOffset === 0 ? "active" : ""}" @click=${() => this._weekOffset = 0}>${this._t("this_week")}</button>
      ${future ? html`<button class="tab week-arrow" aria-label=${this._t("previous_week")} @click=${() => this._weekOffset = Math.max(1, this._weekOffset - 1)}><ha-icon icon="mdi:chevron-left"></ha-icon></button><span class="tab active">${this._weekOffset} ${this._t("weeks")}</span>${this._weekOffset < 8 ? html`<button class="tab week-arrow" aria-label=${this._t("next_week")} @click=${() => this._weekOffset += 1}><ha-icon icon="mdi:chevron-right"></ha-icon></button>` : ""}` : html`<button class="tab ${this._weekOffset === 1 ? "active" : ""}" @click=${() => this._weekOffset = 1}>${this._t("next_week")}</button><button class="tab week-arrow" aria-label=${this._t("week_two")} @click=${() => this._weekOffset = 2}><ha-icon icon="mdi:chevron-right"></ha-icon></button>`}
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
      if (!popup) {
        this._notify(this._t("popup_blocked"));
        return;
      }
      const workState = this._state(student.upcoming_work_entity) || this._relatedState(student, (state) => Array.isArray(state.attributes?.items) && !state.attributes?.config_entry_id);
      const workItems = workState?.attributes?.items || [];
      const cells = LESSON_PERIOD_SLOTS.map(([period, start, end]) => `<tr><th>${period}<small>${start}\u2013${end}</small></th>${days.map((day) => {
        const lesson = (day.lessons || []).find((item) => Number(item.period_start ?? item.period) === period || String(item.start || "").slice(11, 16) === start);
        return lesson ? `<td class="${lesson.cancelled ? "cancelled" : ""}"><strong>${escapeHtml(lessonName(lesson))}</strong><small>${escapeHtml(lesson.teacher || "")}${lesson.location ? ` \xB7 ${escapeHtml(lesson.location)}` : ""}</small></td>` : "<td class=empty>Geen les</td>";
      }).join("")}</tr>`).join("");
      popup.document.write(`<!doctype html><html><head><title>${escapeHtml(this._config.title)} \u2013 ${escapeHtml(this._weekLabel())}</title><style>@page{size:landscape;margin:12mm}body{font:12px Arial;color:#111}h1{margin:0 0 4px}p{margin:0 0 14px;color:#555}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #999;padding:6px;vertical-align:top}thead th{background:#e8eef5}tbody th{width:70px;background:#f3f3f3}small{display:block;margin-top:3px;color:#555}.empty{color:#999;background:#fafafa}.cancelled{text-decoration:line-through;background:#ffe8e8}</style></head><body><h1>${escapeHtml(this._config.title)}</h1><p>${escapeHtml(student.name || "")} \xB7 ${escapeHtml(this._weekLabel())}</p><table><thead><tr><th>Uur</th>${days.map((day) => `<th>${escapeHtml(formatDate(day.date, this._locale()))}</th>`).join("")}</tr></thead><tbody>${cells}</tbody></table><script>window.onload=()=>{window.print()}<\/script></body></html>`);
      LESSON_PERIOD_SLOTS.forEach(([period, start], rowIndex) => {
        days.forEach((day, dayIndex) => {
          const lesson = (day.lessons || []).find((item) => Number(item.period_start ?? item.period) === period || String(item.start || "").slice(11, 16) === start);
          const cell = popup.document.querySelectorAll("tbody tr")[rowIndex]?.children[dayIndex + 1];
          for (const item of lesson ? workForLesson(lesson, workItems) : []) {
            cell?.insertAdjacentHTML("beforeend", `<span style="display:inline-block;margin:5px 4px 0 0;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:bold;color:${WORK_KIND_COLORS[workKind(item.type)].color};background:${WORK_KIND_COLORS[workKind(item.type)].background}">${escapeHtml(this._t(workKind(item.type)))}</span>`);
          }
        });
      });
      const visibleDates = new Set(days.map((day) => day.date));
      const printWork = workItems.filter((item) => visibleDates.has(String(item.due || "").slice(0, 10)));
      if (printWork.length) {
        popup.document.body.insertAdjacentHTML("beforeend", `<section style="margin-top:12px"><h2 style="font-size:14px;margin:0 0 6px">${escapeHtml(this._t("schoolwork"))}</h2>${printWork.map((item) => `<span style="display:inline-block;margin:0 6px 5px 0;padding:4px 8px;border-radius:12px;font-weight:bold;color:${WORK_KIND_COLORS[workKind(item.type)].color};background:${WORK_KIND_COLORS[workKind(item.type)].background}">${escapeHtml(this._t(workKind(item.type)))}: ${escapeHtml(item.subject || "")} \xB7 ${escapeHtml(formatDate(item.due, this._locale()))} ${escapeHtml(formatTime(item.due, this._locale()))}</span>`).join("")}</section>`);
      }
      popup.document.close();
    }
    _renderTomorrow(student) {
      const tomorrow = /* @__PURE__ */ new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const key = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
      for (const state of [
        this._state(student.week_entity),
        this._weekState(student, 1)
      ]) {
        if (!isEntityUsable(state)) continue;
        const day = normalizeWeekDays(state.attributes.days).find((item) => item.date === key);
        if (day) return this._renderDayColumn(day, null, student);
      }
      return tomorrow.getDay() > 0 && tomorrow.getDay() < 6 ? this._renderDayColumn({ date: key, lessons: [], missing: [] }, null, student) : this._empty("no_data");
    }
    _renderDay(student) {
      const todayState = this._state(student.today_entity);
      if (isEntityUsable(todayState)) {
        const attrs2 = todayState.attributes;
        return this._renderDayColumn(
          {
            date: attrs2.date || todayState.state,
            lessons: attrs2.lessons || [],
            missing: []
          },
          this._state(student.current_lesson_entity),
          student
        );
      }
      const weekState = this._state(student.week_entity);
      if (isEntityUsable(weekState)) {
        const today = findDay(weekState.attributes.days);
        if (today) {
          return this._renderDayColumn(
            today,
            this._state(student.current_lesson_entity),
            student
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
        missing: []
      };
      return this._renderDayColumn(
        day,
        this._state(student.current_lesson_entity),
        student
      );
    }
    _renderDayColumn(day, currentState = null, student = this._student()) {
      const lessons = [...day.lessons || []].sort(compareLessonTime);
      const missing = [...day.missing || []].sort(
        (a, b) => (a.period || 0) - (b.period || 0)
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
      ${timeline.map((entry) => entry.type === "lesson" ? this._lessonButton(entry.item, currentState, student, entry) : entry.type === "empty_lesson" ? this._emptyLessonButton(entry, planner) : entry.type === "appointment" ? this._appointmentButton(entry.item, planner) : this._gapButton(entry, planner))}
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
      return html`<button class="lesson appointment" @click=${() => this._dialog = { type: "appointment", item, planner }}><span class="lesson-head"><span>${item.title}</span><span class="badge">${this._t("appointment")}</span></span><span class="meta">${formatTime(item.start, this._locale())}–${formatTime(item.end, this._locale())}</span></button>`;
    }
    async _addAppointment(planner, start, end) {
      const title = window.prompt(this._t("appointment_title"));
      if (!title) return;
      try {
        await this._hass.callService("somtoday", "planner_add", { config_entry_id: planner.attributes.config_entry_id, student_id: planner.attributes.student_id, title, start, end });
      } catch (error) {
        this._notify(error?.message || this._t("not_allowed"));
      }
    }
    async _deleteAppointment(item, planner) {
      try {
        await this._hass.callService("somtoday", "planner_delete", { config_entry_id: planner.attributes.config_entry_id, item_id: item.id });
        this._dialog = null;
      } catch (error) {
        this._notify(error?.message || this._t("not_allowed"));
      }
    }
    _notify(message) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
    }
    _lessonButton(lesson, currentState, student = this._student(), entry = null) {
      const deviation = lesson._missing ? "missing" : lessonDeviation(lesson);
      const current = currentState?.attributes?.start && currentState.attributes.start === lesson.start;
      const color = subjectColor(
        lesson.subject || lesson.subject_short,
        this._colors()
      );
      const classes = [
        "lesson",
        deviation === "cancelled" ? "cancelled" : "",
        deviation && deviation !== "cancelled" ? "changed" : "",
        lesson._missing ? "missing" : "",
        current ? "current" : ""
      ].join(" ");
      const workState = this._state(student.upcoming_work_entity) || this._relatedState(student, (state) => Array.isArray(state.attributes?.items) && !state.attributes?.config_entry_id);
      const fallbackItems = [
        ...this._state(student.homework_entity)?.attributes?.homework || [],
        ...this._state(student.next_test_entity)?.attributes?.due ? [this._state(student.next_test_entity).attributes] : []
      ];
      const work = workForLesson(lesson, workState?.attributes?.items || fallbackItems);
      return html`<button
      class=${classes}
      style=${color ? `--subject-color:${color}` : ""}
      @click=${() => this._dialog = { type: "lesson", item: lesson, deviation }}
    >
      <span class="lesson-head"
        ><span>${lessonName(lesson)}</span
        >${deviation ? html`<span class="badge">${this._t(deviation)}</span>` : ""}</span
      >
      <span class="meta"
        ><span
          >${this._periodLabel(lesson, entry)}</span
        ><span
          >${lesson.start ? `${formatTime(lesson.start, this._locale())}\u2013${formatTime(lesson.end, this._locale())}` : `${lesson.start_time || ""}\u2013${lesson.end_time || ""}`}</span
        ><span>${lesson.location || ""}</span><span>${lesson.teacher || ""}</span></span
      >
      ${work.length ? html`<span class="work-chips">${work.map((item) => html`<span role="button" class="work-chip ${workKind(item.type)}" @click=${(event) => {
        event.stopPropagation();
        this._dialog = { type: workKind(item.type), item };
      }}>${this._t(workKind(item.type))}</span>`)}</span>` : ""}
    </button>`;
    }
    _periodLabel(lesson, entry) {
      const first = Number(lesson.period || lesson.period_start) || entry?.period || null;
      if (!first) return "";
      const last = Number(lesson.period_end) || entry?.period_end || first;
      return `${this._t("period")} ${last > first ? `${first}\u2013${last}` : first}`;
    }
    _gradeLevel(student = this._student()) {
      return student?.grade_level || this._config.grade_level || "both_main_first";
    }
    _gradeCell(item, locale, student) {
      const { primary, secondary } = gradeLevels(item, this._gradeLevel(student));
      return html`<span class="grade-main ${primary.sufficient === false ? "insufficient" : ""}"
        >${primary.level && secondary ? html`<small class="level">${primary.level}</small>` : ""}${formatGrade(primary.result, primary.value, locale)}</span
      >${secondary ? html`<small class="grade-other ${secondary.sufficient === false ? "insufficient" : ""}"
            >${secondary.level ? `${secondary.level} ` : ""}${formatGrade(secondary.result, secondary.value, locale)}</small
          >` : ""}`;
    }
    _renderHomework(student) {
      const state = this._state(student.homework_entity);
      if (!isEntityUsable(state))
        return this._empty(state ? "unavailable" : "no_homework");
      const items = sortHomework(state.attributes.homework || []);
      return items.length ? html`<div class="list">
          ${items.map((item) => this._itemButton(item, "homework"))}
        </div>` : this._empty("no_homework");
    }
    _renderTests(student) {
      const state = this._state(student.next_test_entity);
      if (!isEntityUsable(state))
        return this._empty(state ? "unavailable" : "no_tests");
      return this._itemButton(state.attributes, "test");
    }
    // Changes as they came in, newest first. Somtoday does not say when a lesson
    // was changed; "came in" is when the integration first saw it, which is the
    // best moment there is.
    _renderChanges(student) {
      const state = this._state(student.changes_entity) || this._relatedState(student, (candidate) => Array.isArray(candidate.attributes?.changes));
      if (!state) return this._empty("no_changes_sensor");
      if (state.state === "unavailable") return this._empty("unavailable");
      const changes = state.attributes.changes || [];
      if (!changes.length) {
        return html`<div class="empty">
        <ha-icon icon="mdi:calendar-check-outline"></ha-icon>${this._t("no_changes").replace("{days}", state.attributes.retention_days ?? 14)}
      </div>`;
      }
      return html`<div class="list">${changes.map((change) => this._changeItem(change))}</div>`;
    }
    _changeItem(change) {
      const locale = this._locale();
      const span = (start, end) => `${formatDate(start, locale)} ${formatTime(start, locale)}\u2013${formatTime(end, locale)}`;
      const previous = change.previous || {};
      const was = change.type === "moved" && previous.start ? span(previous.start, previous.end) : change.type === "room_changed" ? previous.location : change.type === "teacher_changed" ? previous.teacher : null;
      const color = subjectColor(change.subject || change.subject_short, this._colors());
      return html`<div class="item change ${change.type}" style=${color ? `--subject-color:${color}` : ""}>
      <span class="item-head"
        ><span>${lessonName(change)}</span
        ><span class="badge">${this._t(`change_${change.type}`)}</span></span
      >
      <div class="meta">
        <span>${this._t("lesson")}: ${span(change.start, change.end)}${change.period_start ? ` \xB7 ${this._t("period")} ${change.period_start}` : ""}</span>
        ${change.location ? html`<span>${change.location}</span>` : ""}
        ${change.teacher ? html`<span>${change.teacher}</span>` : ""}
      </div>
      ${was ? html`<div class="meta"><span>${this._t("was")}: ${was}</span></div>` : ""}
      <div class="meta came-in">
        <ha-icon icon="mdi:clock-outline"></ha-icon><span>${this._t("came_in")}: ${formatDate(change.detected_at, locale)} ${formatTime(change.detected_at, locale)}</span>
      </div>
    </div>`;
    }
    // A div acting as a button rather than a <button>, because a homework item
    // can carry links and a link inside a button does not work in every browser.
    _itemButton(item, type) {
      return html`<div
      class="item ${type === "test" ? "urgent" : ""}"
      role="button"
      tabindex="0"
      @click=${() => this._dialog = { type, item }}
      @keydown=${(event) => this._activate(event, { type, item })}
    >
      <span class="item-head"
        ><span>${item.subject || "\u2014"}</span
        ><span class="badge">${item.type ? this._t(workKind(item.type)) : type}</span></span
      >
      <div>${item.topic || ""}</div>
      ${item.description ? html`<div class="description">${item.description}</div>` : ""}
      <div class="meta">
        ${item.due ? html`<span>${this._t("due")}: ${formatDate(item.due, this._locale())} ${formatTime(item.due, this._locale())}</span>` : ""}
        ${item.time_indication ? html`<span><ha-icon icon="mdi:timer-outline"></ha-icon> ${item.time_indication}</span>` : ""}
      </div>
      ${this._renderLinks(item.links)}
    </div>`;
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
          deviation ? this._t(deviation) : this._dialog.type === "assignment" ? this._t(`status_${assignmentStatus(item.status)}`) : item.status || item.type
        ],
        [
          this._t("deadline"),
          item.deadline ? `${formatDate(item.deadline, this._locale())} ${formatTime(item.deadline, this._locale())}` : null
        ],
        [
          this._t("opens"),
          item.opens ? `${formatDate(item.opens, this._locale())} ${formatTime(item.opens, this._locale())}` : null
        ],
        [this._t("time_indication"), item.time_indication],
        [this._t("period"), item.period || item.period_start],
        [this._t("teacher"), item.teacher],
        [this._t("location"), item.location],
        [
          this._t("due"),
          item.due ? `${formatDate(item.due, this._locale())} ${formatTime(item.due, this._locale())}` : null
        ],
        [this._t("description"), item.description]
      ].filter(
        ([, value]) => value !== null && value !== void 0 && value !== ""
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
        ([label, value]) => html`<dt>${label}</dt>
                <dd>${value}</dd>`
      )}
        </dl>
        ${this._renderLinks(item.links)}
      </div>
      <ha-button slot="primaryAction" dialogAction="close"
        >${this._t("close")}</ha-button
      >${this._dialog.type === "appointment" ? html`<ha-button slot="secondaryAction" @click=${() => this._deleteAppointment(item, this._dialog.planner)}>${this._t("delete")}</ha-button>` : ""}</ha-dialog
    >`;
    }
    getCardSize() {
      return this._view === "week" ? 6 : 4;
    }
  };
  var SomtodayCardEditor = class extends LitElement {
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
    .student-head {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .student-head h3 {
      flex: 1;
    }
    .move {
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--primary-text-color);
      cursor: pointer;
      padding: 6px;
      display: inline-flex;
    }
    .move:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .help {
      color: var(--secondary-text-color);
      font-size: 0.85rem;
      margin: -4px 0 0;
    }
    .toggles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 4px 12px;
    }
  `;
    setConfig(config) {
      this._config = { ...config, students: normalizeStudents(config) };
    }
    _set(key, value) {
      this._config = { ...this._config, [key]: value };
      fireConfigChanged(this, this._config);
    }
    _moveStudent(index, delta) {
      const students = [...this._config.students];
      const target = index + delta;
      if (target < 0 || target >= students.length) return;
      [students[index], students[target]] = [students[target], students[index]];
      this._config = { ...this._config, students };
      fireConfigChanged(this, this._config);
    }
    _studentSet(index, key, value) {
      const students = this._config.students.map(
        (student, i) => i === index ? { ...student, [key]: value } : student
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
        ["changes_entity", "Schedule changes sensor"],
        ["next_holiday_entity", "Next holiday sensor"],
        ["school_class_entity", "Class sensor"],
        ["assignments_entity", "Assignments sensor"],
        ["announcements_entity", "Somtoday notices sensor"]
      ];
      const strings = TRANSLATIONS[this.hass?.locale?.language?.startsWith("nl") ? "nl" : "en"];
      const sections = [
        "show_holidays",
        "show_school_year",
        "show_school_class",
        "show_announcements",
        "show_assignments",
        "show_grades",
        "show_averages",
        "show_absences",
        "show_measures",
        "show_messages"
      ];
      const students = this._config.students || [];
      const several = students.length > 1;
      const manual = this._config.student_order !== "name";
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
      ><ha-select
        .label=${strings.editor_grade_level}
        .value=${this._config.grade_level || "both_main_first"}
        @selected=${(event) => this._set("grade_level", event.target.value)}
        @closed=${(event) => event.stopPropagation()}
        >${GRADE_LEVELS.map((level) => html`<mwc-list-item .value=${level}>${strings[`grade_level_${level}`]}</mwc-list-item>`)}</ha-select
      >${several ? html`<ha-formfield label="Show all children side by side on Today and Tomorrow">
              <ha-switch
                .checked=${this._config.show_all_students === true}
                @change=${(event) => this._set("show_all_students", event.target.checked)}
              ></ha-switch>
            </ha-formfield>
            <ha-select
              label="Order of the children"
              .value=${manual ? "manual" : "name"}
              @selected=${(event) => this._set("student_order", event.target.value)}
              @closed=${(event) => event.stopPropagation()}
            >
              <mwc-list-item value="manual">Own order</mwc-list-item>
              <mwc-list-item value="name">Alphabetical</mwc-list-item>
            </ha-select>
            ${manual ? html`<p class="help">Use the arrows next to each child to change the order.</p>` : ""}` : ""}<h3>${strings.editor_sections}</h3>
      <div class="toggles">
        ${sections.map(
        (key) => html`<ha-formfield .label=${strings[`editor_${key}`]}>
            <ha-switch
              .checked=${this._config[key] !== false}
              @change=${(event) => this._set(key, event.target.checked)}
            ></ha-switch>
          </ha-formfield>`
      )}
      </div>
      <p class="help">${strings.editor_records_hint}</p>${students.map(
        (student, index) => html`<div class="student">
            <div class="student-head">
              <h3>${student.name || `Student ${index + 1}`}</h3>
              ${several && manual ? html`<button class="move" title="Move up" aria-label="Move up" ?disabled=${index === 0} @click=${() => this._moveStudent(index, -1)}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
                    <button class="move" title="Move down" aria-label="Move down" ?disabled=${index === students.length - 1} @click=${() => this._moveStudent(index, 1)}><ha-icon icon="mdi:arrow-down"></ha-icon></button>` : ""}
            </div>
            <ha-textfield
              label="Student name"
              .value=${student.name || ""}
              @change=${(event) => this._studentSet(index, "name", event.target.value)}
            ></ha-textfield
            >${entities.map(([key, label]) => html`<ha-entity-picker .hass=${this.hass} .value=${student[key] || ""} .label=${label} .includeDomains=${["sensor"]} @value-changed=${(event) => this._studentSet(index, key, event.detail.value)}></ha-entity-picker>`)}
          </div>`
      )}
    </div>`;
    }
  };
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
    documentationURL: "https://github.com/jonisnet/ha-somtoday-card"
  });
  console.info(
    `%c SOMTODAY-CARD %c v${VERSION} `,
    "color:white;background:#03a9f4;font-weight:bold",
    "color:#03a9f4;background:white;font-weight:bold"
  );
})();
