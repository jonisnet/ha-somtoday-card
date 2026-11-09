import { describe, expect, it, vi } from "vitest";
import {
  absenceKindKey,
  ABSENCE_KINDS,
  activeMeasures,
  assignmentStatus,
  ASSIGNMENT_STATUSES,
  daysBetween,
  entityForStudent,
  fetchRecords,
  formatGrade,
  holidayText,
  latestGrades,
  recordsFromResponse,
  schoolYearProgress,
  sortAssignments,
  studentMatch,
} from "../src/helpers.js";
import { TRANSLATIONS } from "../src/translations.js";

// Every name below is made up.
const NL = TRANSLATIONS.nl;
const EN = TRANSLATIONS.en;

describe("holiday countdown", () => {
  const christmas = {
    name: "Kerstvakantie",
    start: "2026-12-19",
    end: "2027-01-03",
  };

  it("counts down in Dutch and English", () => {
    expect(holidayText(christmas, NL, "nl", "2026-12-07")).toBe(
      "Nog 12 dagen tot de Kerstvakantie",
    );
    expect(holidayText(christmas, EN, "en", "2026-12-07")).toBe(
      "12 days until Kerstvakantie",
    );
  });

  it("uses the singular the day before", () => {
    expect(holidayText(christmas, NL, "nl", "2026-12-18")).toBe(
      "Nog 1 dag tot de Kerstvakantie",
    );
  });

  it("shows the last day during the holiday", () => {
    expect(holidayText(christmas, NL, "nl", "2026-12-19")).toBe(
      "Kerstvakantie t/m 3 jan",
    );
    expect(holidayText(christmas, NL, "nl", "2027-01-03")).toBe(
      "Kerstvakantie t/m 3 jan",
    );
  });

  it("says nothing once the holiday is over or data is missing", () => {
    expect(holidayText(christmas, NL, "nl", "2027-01-04")).toBe("");
    expect(holidayText({}, NL, "nl", "2026-12-07")).toBe("");
    expect(holidayText(undefined, NL, "nl", "2026-12-07")).toBe("");
  });

  it("counts calendar days across a DST change", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("nonsense", "2026-03-30")).toBeNull();
  });

  it("clamps the school-year progress", () => {
    expect(schoolYearProgress({ school_year_progress: 34 })).toBe(34);
    expect(schoolYearProgress({ school_year_progress: 140 })).toBe(100);
    expect(schoolYearProgress({ school_year_progress: -3 })).toBe(0);
    expect(schoolYearProgress({})).toBeNull();
    expect(schoolYearProgress({ school_year_progress: "x" })).toBeNull();
  });
});

describe("assignment status chips", () => {
  it("keeps the four known statuses", () => {
    for (const status of ASSIGNMENT_STATUSES) {
      expect(assignmentStatus(status)).toBe(status);
    }
  });

  it("shows anything unknown as open, never as handed in", () => {
    expect(assignmentStatus("something_new")).toBe("open");
    expect(assignmentStatus(undefined)).toBe("open");
  });

  it("puts late work first and handed-in work last", () => {
    const sorted = sortAssignments([
      { uid: "a", status: "handed_in", deadline: "2026-11-01T23:59:00+01:00" },
      { uid: "b", status: "open", deadline: "2026-11-20T23:59:00+01:00" },
      { uid: "c", status: "upcoming", deadline: "2026-11-12T23:59:00+01:00" },
      { uid: "d", status: "late", deadline: "2026-11-05T23:59:00+01:00" },
    ]);
    expect(sorted.map((item) => item.uid)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("matching the card's child", () => {
  it("prefers an explicit student_id", () => {
    expect(studentMatch({}, { student_id: "42", name: "Fien" })).toEqual({
      studentId: 42,
      configEntryId: null,
      name: "Fien",
    });
  });

  it("reads student_id and config_entry_id from the child's sensors", () => {
    const hass = {
      states: {
        "sensor.planner": {
          attributes: { student_id: 1001, config_entry_id: "entry1" },
        },
      },
    };
    expect(
      studentMatch(hass, { planner_entity: "sensor.planner" }),
    ).toMatchObject({ studentId: 1001, configEntryId: "entry1" });
  });

  it("falls back to the device identifier", () => {
    const hass = {
      states: { "sensor.week": { attributes: {} } },
      entities: { "sensor.week": { device_id: "dev1" } },
      devices: { dev1: { identifiers: [["somtoday", "2002"]] } },
    };
    expect(studentMatch(hass, { week_entity: "sensor.week" }).studentId).toBe(
      2002,
    );
  });

  it("finds a new sensor on the same device for an older config", () => {
    const hass = {
      entities: {
        "sensor.week": {
          platform: "somtoday",
          device_id: "dev1",
          translation_key: "active_week",
        },
        "sensor.other_holiday": {
          platform: "somtoday",
          device_id: "dev2",
          translation_key: "next_holiday",
        },
        "sensor.holiday": {
          platform: "somtoday",
          device_id: "dev1",
          translation_key: "next_holiday",
        },
      },
    };
    expect(
      entityForStudent(hass, { week_entity: "sensor.week" }, "next_holiday"),
    ).toBe("sensor.holiday");
    expect(entityForStudent({}, { week_entity: "sensor.week" }, "x")).toBe(
      null,
    );
  });
});

describe("reading a get_records response", () => {
  const response = {
    generated: "2026-11-09T07:00:00+00:00",
    entries: [
      {
        config_entry_id: "entry1",
        access: {
          grades: true,
          absences: true,
          measures: false,
          messages: true,
        },
        messages: [
          {
            uid: "m1",
            subject: "Ouderavond",
            unread: true,
            sent: "2026-11-02",
          },
          { uid: "m2", subject: "Excursie", unread: false, sent: "2026-11-05" },
        ],
        unread_messages: 1,
        students: [
          {
            student_id: 1001,
            name: "Fien Voorbeeld",
            grades: [
              { uid: "g1", result: "7,5", entered: "2026-10-01T10:00:00Z" },
              {
                uid: "g2",
                result: "4,8",
                sufficient: false,
                entered: "2026-11-01T10:00:00Z",
              },
            ],
            averages: [{ subject: "Wiskunde", result: "6,8" }],
            overall_average: 6.9,
            absences: null,
          },
          {
            student_id: 1002,
            name: "Teun Voorbeeld",
            grades: [],
            averages: [],
            overall_average: null,
            absences: [{ uid: "a1", kind: "late" }],
          },
        ],
      },
    ],
  };

  it("picks the right child by student_id", () => {
    const fien = recordsFromResponse(response, { studentId: 1001 });
    expect(fien.found).toBe(true);
    expect(fien.grades).toHaveLength(2);
    expect(fien.averages).toHaveLength(1);
    expect(fien.overallAverage).toBe(6.9);
    const teun = recordsFromResponse(response, { studentId: 1002 });
    expect(teun.absences).toHaveLength(1);
    expect(teun.overallAverage).toBeNull();
  });

  it("matches by name when no id is known, ignoring case and accents", () => {
    expect(
      recordsFromResponse(response, { name: "fién voorbeeld" }).grades,
    ).toHaveLength(2);
  });

  it("hides a category the school refuses (null)", () => {
    expect(
      recordsFromResponse(response, { studentId: 1001 }).absences,
    ).toBeNull();
  });

  it("hides a category the user has no access to (key absent)", () => {
    const records = recordsFromResponse(response, { studentId: 1001 });
    expect(records.measures).toBeNull();
  });

  it("ignores data the access flags do not cover", () => {
    const sneaky = JSON.parse(JSON.stringify(response));
    sneaky.entries[0].access.grades = false;
    expect(recordsFromResponse(sneaky, { studentId: 1001 }).grades).toBeNull();
    expect(
      recordsFromResponse(sneaky, { studentId: 1001 }).averages,
    ).toBeNull();
  });

  it("shares the account's messages with every child", () => {
    const records = recordsFromResponse(response, { studentId: 1002 });
    expect(records.messages).toHaveLength(2);
    expect(records.unreadMessages).toBe(1);
  });

  it("shows nothing for an unknown child on a multi-child account", () => {
    const records = recordsFromResponse(response, { studentId: 9999 });
    expect(records.found).toBe(false);
    expect(records.grades).toBeNull();
    // Messages are account-wide, so the single entry still provides them.
    expect(records.messages).toHaveLength(2);
  });

  it("copes with no access at all, and with garbage", () => {
    const none = {
      entries: [
        {
          config_entry_id: "entry1",
          access: {
            grades: false,
            absences: false,
            measures: false,
            messages: false,
          },
          students: [{ student_id: 1001, name: "Fien Voorbeeld" }],
        },
      ],
    };
    const records = recordsFromResponse(none, { studentId: 1001 });
    expect([
      records.grades,
      records.averages,
      records.absences,
      records.measures,
      records.messages,
    ]).toEqual([null, null, null, null, null]);
    expect(recordsFromResponse(null, {}).found).toBe(false);
    expect(recordsFromResponse({ entries: "x" }, {}).grades).toBeNull();
  });

  it("sorts the latest grades first", () => {
    const records = recordsFromResponse(response, { studentId: 1001 });
    expect(latestGrades(records.grades).map((grade) => grade.uid)).toEqual([
      "g2",
      "g1",
    ]);
    expect(latestGrades(records.grades, 1)).toHaveLength(1);
  });

  it("keeps only measures that are still running", () => {
    expect(
      activeMeasures([
        { uid: "x", completed: true },
        { uid: "y", completed: false },
      ]).map((item) => item.uid),
    ).toEqual(["y"]);
    expect(activeMeasures(null)).toEqual([]);
  });

  it("formats grades as given, or the local way", () => {
    expect(formatGrade("7,5", 7.5, "nl")).toBe("7,5");
    expect(formatGrade("G", null, "nl")).toBe("G");
    expect(formatGrade(null, 6.85, "nl")).toBe("6,9");
    expect(formatGrade(null, null, "nl")).toBe("—");
  });
});

describe("calling the get_records service", () => {
  it("uses callService with returnResponse", async () => {
    const hass = {
      callService: vi.fn(async () => ({
        context: {},
        response: { entries: [] },
      })),
      callWS: vi.fn(),
    };
    expect(await fetchRecords(hass)).toEqual({ entries: [] });
    expect(hass.callService).toHaveBeenCalledWith(
      "somtoday",
      "get_records",
      {},
      undefined,
      false,
      true,
    );
    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("falls back to the websocket command on an older frontend", async () => {
    const hass = {
      callService: vi.fn(async () => {
        throw new Error("requires responses");
      }),
      callWS: vi.fn(async () => ({ response: { entries: [1] } })),
    };
    expect(await fetchRecords(hass)).toEqual({ entries: [1] });
    expect(hass.callWS).toHaveBeenCalledWith({
      type: "call_service",
      domain: "somtoday",
      service: "get_records",
      service_data: {},
      return_response: true,
    });
  });
});

describe("translations", () => {
  const keys = (language) => Object.keys(TRANSLATIONS[language]).sort();

  it("has the same keys in Dutch and English", () => {
    expect(keys("nl")).toEqual(keys("en"));
  });

  it("labels every absence kind and assignment status", () => {
    for (const language of ["nl", "en"]) {
      for (const kind of ABSENCE_KINDS) {
        expect(TRANSLATIONS[language][absenceKindKey(kind)]).toBeTruthy();
      }
      expect(TRANSLATIONS[language][absenceKindKey("new_kind")]).toBeTruthy();
      for (const status of ASSIGNMENT_STATUSES) {
        expect(TRANSLATIONS[language][`status_${status}`]).toBeTruthy();
      }
    }
  });

  it("has a tab label for every view", async () => {
    const { VIEWS } = await import("../src/helpers.js");
    for (const view of VIEWS) {
      expect(TRANSLATIONS.nl[view]).toBeTruthy();
      expect(TRANSLATIONS.en[view]).toBeTruthy();
    }
  });
});
