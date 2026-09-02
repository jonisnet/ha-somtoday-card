import { describe, expect, it } from "vitest";
import {
  buildDayTimeline,
  buildSchoolDayTimeline,
  buildStubConfig,
  detectStudents,
  formatTime,
  guessWeekEntity,
  findDay,
  groupLessonsByDay,
  lessonDeviation,
  normalizeWeekDays,
  sortHomework,
  STUDENT_ENTITY_KEYS,
  subjectColor,
  validateConfig,
  workForLesson,
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
