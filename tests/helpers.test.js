import { describe, expect, it } from "vitest";
import {
  buildDayTimeline,
  gradeLevels,
  lessonName,
  buildSchoolDayTimeline,
  buildStubConfig,
  bundleVersion,
  cardResourceUrl,
  detectStudents,
  formatTime,
  guessWeekEntity,
  findDay,
  groupLessonsByDay,
  lessonDeviation,
  normalizeWeekDays,
  orderStudents,
  parseCardLink,
  sortHomework,
  STUDENT_ENTITY_KEYS,
  subjectColor,
  validateConfig,
  workForLesson,
  workKind,
} from "../src/helpers.js";

describe("lesson-bound schoolwork", () => {
  it("assigns work at 09:15 only to period 2, not period 1", () => {
    const work = [
      {
        subject: "mens en maatschappij",
        due: "2026-09-07T09:15:00+02:00",
        type: "homework",
      },
    ];
    const first = {
      subject: "mens en maatschappij",
      start: "2026-09-07T08:30:00+02:00",
      end: "2026-09-07T09:15:00+02:00",
    };
    const second = {
      subject: "mens en maatschappij",
      start: "2026-09-07T09:15:00+02:00",
      end: "2026-09-07T10:00:00+02:00",
    };
    expect(workForLesson(first, work)).toHaveLength(0);
    expect(workForLesson(second, work)).toHaveLength(1);
  });
});

describe("day timeline", () => {
  it("always contains all ten lesson periods", () => {
    const items = buildSchoolDayTimeline("2026-09-01", [
      {
        period_start: 3,
        start: "2026-09-01T10:00:00+02:00",
        end: "2026-09-01T10:45:00+02:00",
        subject: "Biologie",
      },
    ]);
    expect(
      items.filter((item) => ["lesson", "empty_lesson"].includes(item.type)),
    ).toHaveLength(10);
    expect(items.find((item) => item.period === 3)).toMatchObject({
      type: "lesson",
      item: { subject: "Biologie" },
    });
    expect(items.find((item) => item.period === 4)).toMatchObject({
      type: "empty_lesson",
    });
  });
  it("recognises the official 15 and 30 minute breaks", () => {
    const items = buildDayTimeline([
      { start: "2026-09-01T10:00:00+02:00", end: "2026-09-01T10:45:00+02:00" },
      { start: "2026-09-01T11:00:00+02:00", end: "2026-09-01T11:45:00+02:00" },
      { start: "2026-09-01T12:00:00+02:00", end: "2026-09-01T12:30:00+02:00" },
      { start: "2026-09-01T13:00:00+02:00", end: "2026-09-01T13:45:00+02:00" },
    ]);
    expect(
      items.filter((item) => item.type === "gap").map((item) => item.kind),
    ).toEqual(["short_break", "gap", "long_break"]);
  });

  it("splits a 75 minute opening into lunch break and a free period", () => {
    const items = buildDayTimeline([
      { start: "2026-09-01T11:45:00+02:00", end: "2026-09-01T12:30:00+02:00" },
      { start: "2026-09-01T13:45:00+02:00", end: "2026-09-01T14:30:00+02:00" },
    ]);
    expect(
      items
        .filter((item) => item.type === "gap")
        .map(({ kind, minutes }) => ({ kind, minutes })),
    ).toEqual([
      { kind: "long_break", minutes: 30 },
      { kind: "free_period", minutes: 45 },
    ]);
  });

  it("marks a gap of at least one lesson as a free period", () => {
    const items = buildDayTimeline([
      { start: "2026-09-01T09:15:00+02:00", end: "2026-09-01T10:00:00+02:00" },
      { start: "2026-09-01T10:45:00+02:00", end: "2026-09-01T11:30:00+02:00" },
    ]);
    expect(items[1]).toMatchObject({
      type: "gap",
      minutes: 45,
      kind: "free_period",
    });
  });
});

describe("configuration", () => {
  it("accepts one configured student", () => {
    expect(validateConfig({ students: [{ week_entity: "sensor.week" }] })).toBe(
      true,
    );
  });
  it("accepts the dedicated today sensor without a week sensor", () => {
    expect(
      validateConfig({ students: [{ today_entity: "sensor.today" }] }),
    ).toBe(true);
  });
  it("rejects missing entities", () => {
    expect(() => validateConfig({ students: [{ name: "Student" }] })).toThrow(
      /today_entity, week_entity or day_entity/,
    );
  });
  it("rejects unknown views", () => {
    expect(() =>
      validateConfig({ week_entity: "sensor.week", default_view: "year" }),
    ).toThrow(/default_view/);
  });
});

describe("schedule shaping", () => {
  it("sorts week days without mutating missing lessons", () => {
    const days = normalizeWeekDays([
      { date: "2026-09-03" },
      { date: "2026-09-02", missing: [{ period: 3 }] },
    ]);
    expect(days.map((day) => day.date)).toEqual(["2026-09-02", "2026-09-03"]);
    expect(days[0].missing).toHaveLength(1);
  });
  it("groups lessons per local ISO date", () => {
    const days = groupLessonsByDay([
      { subject: "English", start: "2026-09-03T09:00:00+02:00" },
      { subject: "Math", start: "2026-09-02T08:30:00+02:00" },
    ]);
    expect(days[0].date).toBe("2026-09-02");
    expect(days[1].lessons[0].subject).toBe("English");
  });
  it("classifies cancelled and changed lessons", () => {
    expect(lessonDeviation({ cancelled: true })).toBe("cancelled");
    expect(
      lessonDeviation({ deviates: true, deviation: "different_room" }),
    ).toBe("different_room");
    expect(lessonDeviation({})).toBeNull();
  });

  it("selects today from the week after the last bell", () => {
    const days = [
      { date: "2026-09-01", lessons: [{ subject: "Today" }] },
      { date: "2026-09-02", lessons: [{ subject: "Tomorrow" }] },
    ];
    expect(findDay(days, "2026-09-01").lessons[0].subject).toBe("Today");
  });

  it("returns null when today is not in the active week", () => {
    expect(findDay([{ date: "2026-09-02" }], "2026-09-01")).toBeNull();
  });
});

describe("homework and time", () => {
  it("places undated homework last", () => {
    expect(
      sortHomework([
        { topic: "later" },
        { topic: "first", due: "2026-09-02T08:00:00+02:00" },
      ])[0].topic,
    ).toBe("first");
  });
  it("honours explicit offsets around daylight-saving changes", () => {
    expect(formatTime("2026-03-29T08:30:00+02:00", "nl-NL")).toMatch(
      /08:30|06:30/,
    );
    expect(formatTime("2026-10-25T08:30:00+01:00", "nl-NL")).toMatch(
      /08:30|07:30/,
    );
  });
  it("handles empty time data", () => expect(formatTime(null, "en")).toBe("—"));
});

describe("subject colours", () => {
  it("uses explicit mappings before generated colours", () => {
    expect(subjectColor("ne", { ne: "#123456" })).toBe("#123456");
  });

  it("generates stable school-specific fallback colours", () => {
    expect(subjectColor("lo_kic")).toBe(subjectColor("LO_KIC"));
    expect(subjectColor("lo_kic")).not.toBe(subjectColor("plus_uur"));
  });
});

describe("auto-detecting students from the entity registry", () => {
  // Mirrors how Home Assistant builds entity_ids: from the translated entity
  // name in the user's own language. The German ids below are what a German
  // install produces, and no code should have to know that.
  const registryFor = (deviceId, prefix, suffixes) =>
    Object.fromEntries(
      Object.entries(suffixes).map(([translationKey, suffix]) => [
        `sensor.${prefix}_${suffix}`,
        {
          platform: "somtoday",
          device_id: deviceId,
          translation_key: translationKey,
        },
      ]),
    );

  const DUTCH = {
    active_week: "deze_week",
    next_week: "volgende_week",
    today: "vandaag",
    next_school_day: "eerstvolgende_schooldag",
    planner: "eigen_afspraken",
    open_homework: "openstaand_huiswerk",
    upcoming_work: "aankomend_schoolwerk",
    current_lesson: "huidige_les",
    next_lesson: "volgende_les",
    next_test: "volgende_toets",
    base_week: "basisrooster",
    last_update: "laatste_update",
    schedule_changes: "roosterwijzigingen",
    next_holiday: "volgende_vakantie",
    school_class: "klas",
    assignments: "inleveropdrachten",
    announcements: "meldingen",
  };

  it("fills every card field for a single student", () => {
    const hass = {
      entities: registryFor("dev1", "somtoday_anna_de_vries", DUTCH),
      devices: { dev1: { name: "Somtoday (Anna de Vries)" } },
    };
    const [student] = detectStudents(hass);
    expect(student.name).toBe("Anna de Vries");
    expect(Object.keys(STUDENT_ENTITY_KEYS).every((key) => student[key])).toBe(
      true,
    );
    expect(student.week_entity).toBe("sensor.somtoday_anna_de_vries_deze_week");
    expect(student.homework_entity).toBe(
      "sensor.somtoday_anna_de_vries_openstaand_huiswerk",
    );
  });

  it("works on a German install, where every suffix differs", () => {
    const german = {
      active_week: "diese_woche",
      today: "heute",
      next_test: "nachste_prufung",
    };
    const hass = {
      entities: registryFor("dev1", "somtoday_max_muller", german),
      devices: { dev1: { name: "Somtoday (Max Müller)" } },
    };
    const [student] = detectStudents(hass);
    expect(student.week_entity).toBe("sensor.somtoday_max_muller_diese_woche");
    expect(student.today_entity).toBe("sensor.somtoday_max_muller_heute");
    expect(student.next_test_entity).toBe(
      "sensor.somtoday_max_muller_nachste_prufung",
    );
  });

  it("returns one entry per child, in a stable order", () => {
    const hass = {
      entities: {
        ...registryFor("dev_b", "somtoday_zoe", DUTCH),
        ...registryFor("dev_a", "somtoday_bram", DUTCH),
      },
      devices: {
        dev_a: { name: "Somtoday (Bram)" },
        dev_b: { name: "Somtoday (Zoe)" },
      },
    };
    const students = detectStudents(hass);
    expect(students.map((s) => s.name)).toEqual(["Bram", "Zoe"]);
    expect(students[0].week_entity).toBe("sensor.somtoday_bram_deze_week");
    expect(students[1].week_entity).toBe("sensor.somtoday_zoe_deze_week");
  });

  it("ignores other integrations and non-sensor entities", () => {
    const hass = {
      entities: {
        ...registryFor("dev1", "somtoday_anna", DUTCH),
        "sensor.postnl_anna_deze_week": {
          platform: "postnl",
          device_id: "dev2",
          translation_key: "active_week",
        },
        "binary_sensor.somtoday_anna_vandaag": {
          platform: "somtoday",
          device_id: "dev1",
          translation_key: "today",
        },
      },
      devices: { dev1: { name: "Somtoday (Anna)" }, dev2: { name: "PostNL" } },
    };
    const students = detectStudents(hass);
    expect(students).toHaveLength(1);
    expect(students[0].today_entity).toBe("sensor.somtoday_anna_vandaag");
  });

  it("prefers a renamed device over the integration's own name", () => {
    const hass = {
      entities: registryFor("dev1", "somtoday_anna", DUTCH),
      devices: {
        dev1: { name: "Somtoday (Anna de Vries)", name_by_user: "Anna" },
      },
    };
    expect(detectStudents(hass)[0].name).toBe("Anna");
  });

  it("skips a device that yielded no usable sensor", () => {
    const hass = {
      entities: {
        "sensor.somtoday_anna_week_3": {
          platform: "somtoday",
          device_id: "dev1",
          translation_key: "future_week",
        },
      },
      devices: { dev1: { name: "Somtoday (Anna)" } },
    };
    expect(detectStudents(hass)).toEqual([]);
  });

  it("returns nothing when the registry is unavailable", () => {
    expect(detectStudents({ states: {} })).toEqual([]);
    expect(detectStudents(undefined)).toEqual([]);
  });
});

describe("the text fallback, for installs without an entity registry", () => {
  it("finds a week sensor in either shipped language", () => {
    expect(
      guessWeekEntity({ states: { "sensor.somtoday_anna_deze_week": {} } }),
    ).toBe("sensor.somtoday_anna_deze_week");
    expect(
      guessWeekEntity({ states: { "sensor.somtoday_anna_this_week": {} } }),
    ).toBe("sensor.somtoday_anna_this_week");
  });

  it("tolerates Home Assistant's collision suffix after a reinstall", () => {
    expect(
      guessWeekEntity({ states: { "sensor.somtoday_anna_deze_week_2": {} } }),
    ).toBe("sensor.somtoday_anna_deze_week_2");
  });

  it("returns an empty string rather than a wrong guess", () => {
    expect(
      guessWeekEntity({ states: { "sensor.somtoday_anna_vandaag": {} } }),
    ).toBe("");
    expect(guessWeekEntity(undefined)).toBe("");
  });
});

describe("the config a freshly dropped card starts with", () => {
  const dutch = (deviceId, prefix) =>
    Object.fromEntries(
      Object.entries({
        active_week: "deze_week",
        today: "vandaag",
        open_homework: "openstaand_huiswerk",
      }).map(([translationKey, suffix]) => [
        `sensor.${prefix}_${suffix}`,
        {
          platform: "somtoday",
          device_id: deviceId,
          translation_key: translationKey,
        },
      ]),
    );

  it("stays flat for one child, and validates", () => {
    const config = buildStubConfig({
      entities: dutch("dev1", "somtoday_anna"),
      devices: { dev1: { name: "Somtoday (Anna)" } },
    });
    expect(config.students).toBeUndefined();
    expect(config.name).toBe("Anna");
    expect(config.week_entity).toBe("sensor.somtoday_anna_deze_week");
    expect(validateConfig(config)).toBe(true);
  });

  it("uses a students array for two children, and validates", () => {
    const config = buildStubConfig({
      entities: {
        ...dutch("dev1", "somtoday_anna"),
        ...dutch("dev2", "somtoday_bram"),
      },
      devices: {
        dev1: { name: "Somtoday (Anna)" },
        dev2: { name: "Somtoday (Bram)" },
      },
    });
    expect(config.students.map((s) => s.name)).toEqual(["Anna", "Bram"]);
    expect(validateConfig(config)).toBe(true);
  });

  it("falls back to a placeholder that still opens the editor", () => {
    const config = buildStubConfig({ states: {} });
    expect(config.week_entity).toBe("sensor.somtoday_student_deze_week");
    expect(validateConfig(config)).toBe(true);
  });
});

describe("order of the children", () => {
  const students = [
    { name: "Noor", week_entity: "sensor.noor" },
    { name: "ayla", week_entity: "sensor.ayla" },
    { name: "Bram", week_entity: "sensor.bram" },
  ];

  it("keeps the configured order by default", () => {
    expect(orderStudents({ students }).map((s) => s.name)).toEqual([
      "Noor",
      "ayla",
      "Bram",
    ]);
  });

  it("sorts alphabetically, ignoring case, when asked to", () => {
    expect(
      orderStudents({ students, student_order: "name" }).map((s) => s.name),
    ).toEqual(["ayla", "Bram", "Noor"]);
  });

  it("does not reorder the configuration itself", () => {
    orderStudents({ students, student_order: "name" });
    expect(students[0].name).toBe("Noor");
  });

  it("accepts a single child in the flat shape", () => {
    expect(
      orderStudents({ name: "Noor", week_entity: "sensor.noor" }),
    ).toHaveLength(1);
  });

  it("rejects an unknown order", () => {
    expect(() => validateConfig({ students, student_order: "age" })).toThrow(
      /student_order/,
    );
  });
});

describe("noticing a newer card version", () => {
  it("reads the version from the bundle banner", () => {
    expect(bundleVersion("/* Somtoday Card v0.3.1 */\n(() => {")).toBe("0.3.1");
    expect(bundleVersion("/* Somtoday Card v0.4.0-beta.1 */")).toBe(
      "0.4.0-beta.1",
    );
  });

  it("returns null for anything that is not the card", () => {
    expect(bundleVersion("<!doctype html>")).toBeNull();
    expect(bundleVersion("")).toBeNull();
  });

  it("finds the card among the dashboard resources", () => {
    const resources = [
      { url: "/hacsfiles/other-card/other-card.js?hacstag=1" },
      {
        url: "/hacsfiles/ha-somtoday-card/somtoday-card.js?hacstag=123030",
      },
    ];
    expect(cardResourceUrl(resources)).toBe(
      "/hacsfiles/ha-somtoday-card/somtoday-card.js?hacstag=123030",
    );
    expect(cardResourceUrl([{ url: "/local/somtoday-card.js" }])).toBe(
      "/local/somtoday-card.js",
    );
    expect(
      cardResourceUrl([{ url: "/local/not-somtoday-card.json" }]),
    ).toBeNull();
  });
});

describe("workKind", () => {
  it("keeps homework and both test flavours", () => {
    expect(workKind("homework")).toBe("homework");
    expect(workKind("test")).toBe("test");
    expect(workKind("large_test")).toBe("test");
  });
  it("gives lesson material its own kind", () => {
    expect(workKind("lesson_material")).toBe("lesson_material");
  });
  it("never shows an unknown type as a test", () => {
    expect(workKind("unknown")).toBe("other");
    expect(workKind(undefined)).toBe("other");
  });
});

describe("parseCardLink", () => {
  it("reads the tab and child from the address", () => {
    expect(
      parseCardLink("?somtoday_view=grades&somtoday_student=1234"),
    ).toEqual({
      view: "grades",
      studentId: 1234,
    });
  });
  it("ignores unknown tabs and missing values", () => {
    expect(parseCardLink("?somtoday_view=secrets")).toEqual({
      view: null,
      studentId: null,
    });
    expect(parseCardLink("")).toEqual({ view: null, studentId: null });
    expect(parseCardLink("?edit=1&somtoday_view=messages")).toEqual({
      view: "messages",
      studentId: null,
    });
  });
});

describe("blocks without a subject or period", () => {
  const starr = {
    title: "STARR",
    start: "2026-11-10T13:00:00+01:00",
    end: "2026-11-10T14:30:00+01:00",
    location: "Huiskamer",
  };

  it("shows the title when there is no subject", () => {
    expect(lessonName(starr)).toBe("STARR");
    expect(lessonName({ subject: "science", title: "207 - 1asc - roej" })).toBe(
      "science",
    );
    expect(lessonName({})).toBe("—");
  });

  it("covers every period it spans as one row", () => {
    const rows = buildSchoolDayTimeline("2026-11-10", [starr]).filter(
      (row) => row.type === "lesson" || row.type === "empty_lesson",
    );
    const lesson = rows.filter((row) => row.type === "lesson");
    expect(lesson).toHaveLength(1);
    expect([lesson[0].period, lesson[0].period_end]).toEqual([6, 7]);
    expect(rows.map((row) => row.period)).not.toContain(7);
    expect(rows.find((row) => row.period === 8).type).toBe("empty_lesson");
  });
});

describe("gradeLevels", () => {
  const science = {
    result: "5,3",
    value: 5.3,
    sufficient: false,
    level: "BB",
    alt_level: "KB",
    alt_result: "4,4",
    alt_value: 4.4,
    alt_sufficient: false,
  };

  it("keeps a single-level grade as it is", () => {
    expect(gradeLevels({ result: "7,5", value: 7.5 }, "alt")).toEqual({
      primary: {
        level: null,
        result: "7,5",
        value: 7.5,
        sufficient: undefined,
      },
      secondary: null,
    });
  });

  it("puts the chosen level first", () => {
    expect(gradeLevels(science).primary.result).toBe("5,3");
    expect(gradeLevels(science).secondary.level).toBe("KB");
    expect(gradeLevels(science, "both_alt_first").primary.result).toBe("4,4");
    expect(gradeLevels(science, "both_alt_first").secondary.result).toBe("5,3");
    expect(gradeLevels(science, "alt")).toMatchObject({
      primary: { result: "4,4" },
      secondary: null,
    });
    expect(gradeLevels(science, "main")).toMatchObject({
      primary: { result: "5,3" },
      secondary: null,
    });
  });

  it("rejects an unknown level in the config", () => {
    const base = {
      type: "custom:somtoday-card",
      students: [{ week_entity: "sensor.x" }],
    };
    expect(() => validateConfig({ ...base, grade_level: "kb" })).toThrow(
      /grade_level/,
    );
    expect(validateConfig({ ...base, grade_level: "both_alt_first" })).toBe(
      true,
    );
  });
});
