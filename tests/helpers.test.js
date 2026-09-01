import { describe, expect, it } from "vitest";
import {
  buildDayTimeline,
  buildSchoolDayTimeline,
  formatTime,
  findDay,
  groupLessonsByDay,
  lessonDeviation,
  normalizeWeekDays,
  sortHomework,
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
