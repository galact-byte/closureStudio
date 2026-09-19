import { adaptSchedulingRoster, validateSchedulingLayout } from "./baseSchedulingInput";

const room = (overrides: Record<string, unknown> = {}) => ({
  roomId: "room_1", type: "manufacturing", level: 3, slotCount: 3, ...overrides,
});
const shifts = [{ startHour: 0, endHour: 12 }, { startHour: 12, endHour: 24 }];

const operator = (overrides: Record<string, unknown> = {}) => ({
  charId: "char_low_star", level: 1, evolvePhase: 0, rarity: 1, ...overrides,
});
const roster = (chars: unknown) => ({ code: 1, data: { troop: { chars } } });
const adapt = (response: unknown) => adaptSchedulingRoster({ status: "received", response });

describe("布局及班次结构", () => {
  test("排序副本并记录周期，合法结构不等于游戏可行", () => {
    const rooms = Object.freeze([Object.freeze(room({ level: 99, slotCount: 99, token: "secret" }))]);
    const times = Object.freeze([
      Object.freeze({ startHour: 24, endHour: 48, token: "secret" }),
      Object.freeze({ startHour: 0, endHour: 24 }),
    ]);
    expect(validateSchedulingLayout(rooms, times)).toEqual({
      status: "ready", rooms: [{ roomId: "room_1", type: "manufacturing", level: 99, slotCount: 99 }],
      shifts: [{ startHour: 0, endHour: 24 }, { startHour: 24, endHour: 48 }],
      period: { startHour: 0, endHour: 48, durationHours: 48 },
      layoutFeasibility: "unverified", morale: "unverified",
    });
    expect(times[0].startHour).toBe(24);
  });

  test.each(["manufacturing", "trading", "power", "control", "meeting", "office", "dormitory"])(
    "接受支持的房间类型 %s", type => {
      expect(validateSchedulingLayout([room({ type })], shifts).status).toBe("ready");
    },
  );
  test.each([
    undefined, null, {}, [], [null], [[]], [room({ roomId: "" })], [room({ roomId: " a" })],
    [room({ type: "secret" })], [room({ level: undefined })], [room({ level: 0 })],
    [room({ level: 1.5 })], [room({ slotCount: "3" })], [room({ slotCount: Infinity })],
    [room({ slotCount: Number.MAX_SAFE_INTEGER + 1 })], [room({ slotCount: -1 })],
  ])("拒绝缺失/非法房间而不填默认值：%p", rooms => {
    const result = validateSchedulingLayout(rooms, shifts);
    expect(result.status).toBe("invalid-data");
    expect(result).not.toHaveProperty("rooms");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  test("重复房间诊断使用索引，不泄漏ID", () => {
    expect(validateSchedulingLayout([room({ roomId: "secret" }), room({ roomId: "secret" })], shifts)).toEqual({
      status: "invalid-data", issues: [{ code: "duplicate-id", path: "rooms[1].roomId" }],
    });
  });
  test.each([
    undefined, null, {}, [], [null], [[]], [{}],
    [{ startHour: -1, endHour: 12 }], [{ startHour: 0, endHour: 0 }],
    [{ startHour: 12, endHour: 0 }], [{ startHour: "0", endHour: 12 }],
    [{ startHour: 0, endHour: Infinity }], [{ startHour: NaN, endHour: 12 }],
    [{ startHour: 0, endHour: 12 }, { startHour: 11, endHour: 24 }],
    [{ startHour: 12, endHour: 24 }, { startHour: 0, endHour: 13 }],
    [{ startHour: 0, endHour: 24 }, { startHour: 1, endHour: 2 }],
  ])("拒绝无效时段与重叠：%p", times => {
    expect(validateSchedulingLayout([room()], times).status).toBe("invalid-data");
  });
  test("重叠诊断指向原始输入位置", () => {
    expect(validateSchedulingLayout([room()], [
      { startHour: 12, endHour: 24 }, { startHour: 0, endHour: 13 },
    ])).toEqual({ status: "invalid-data", issues: [{ code: "overlapping-shift", path: "shifts[0]" }] });
  });
  test("允许小数时间及间隔，但周期不是驻员总时长", () => {
    const result = validateSchedulingLayout([room()], [
      { startHour: 2.5, endHour: 4 }, { startHour: 6, endHour: 8.5 },
    ]);
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.period).toEqual({ startHour: 2.5, endHour: 8.5, durationHours: 6 });
  });
});

describe("排班完整阵容输入", () => {
  test("请求失败与业务失败分开，不输出错误正文", () => {
    expect(adaptSchedulingRoster({ status: "request-failed" })).toEqual({
      status: "request-failed", issues: [{ code: "request-failed", path: "source" }],
    });
    expect(adapt({ code: 0, message: "secret", data: null })).toEqual({
      status: "business-failed", issues: [{ code: "business-failed", path: "response.code" }],
    });
    expect(adapt({ code: 2 }).status).toBe("business-failed");
  });

  test.each([null, [], "secret", {}, { code: "1" }, { code: NaN }, { code: Infinity }, { code: 0.5 }])(
    "无效响应或业务码不误判为空阵容：%p", response => {
      expect(adapt(response).status).toBe("invalid-data");
    },
  );

  test.each([{ code: 1 }, { code: 1, data: {} }, { code: 1, data: { troop: {} } }])(
    "缺失资料不是空阵容：%p", response => {
      expect(adapt(response).status).toBe("missing-data");
    },
  );

  test.each([
    { code: 1, data: null }, { code: 1, data: [] },
    { code: 1, data: { troop: null } }, { code: 1, data: { troop: [] } },
    roster(null), roster([]), roster("secret"), roster(new Date()),
  ])("显式错误结构拒绝：%p", response => {
    expect(adapt(response).status).toBe("invalid-data");
  });

  test("只有明确空对象表示空阵容", () => {
    expect(adapt(roster({}))).toEqual({ status: "empty-roster", operators: [] });
  });

  test("不筛低星或未知ID，映射练度，仅返回白名单且不修改源", () => {
    const chars = Object.freeze({
      "42": Object.freeze(operator({ token: "secret", skills: ["secret"], currentTmpl: "secret" })),
      "43": Object.freeze(operator({ charId: "future_operator", level: 90, evolvePhase: 2 })),
      "44": Object.freeze(operator({ charId: "elite_one", level: 50, evolvePhase: 1 })),
    });
    const response = roster(chars);
    const before = JSON.stringify(response);
    expect(adapt(response)).toEqual({
      status: "ready",
      operators: [
        { charId: "char_low_star", level: 1, elite: 0 },
        { charId: "future_operator", level: 90, elite: 2 },
        { charId: "elite_one", level: 50, elite: 1 },
      ],
      layoutFeasibility: "unverified", morale: "unverified",
    });
    expect(JSON.stringify(response)).toBe(before);
  });

  test.each([
    null, [], "secret", {},
    operator({ charId: "" }), operator({ charId: " x" }), operator({ charId: 42 }),
    operator({ level: 0 }), operator({ level: -1 }), operator({ level: 1.5 }),
    operator({ level: "1" }), operator({ level: Infinity }), operator({ level: Number.MAX_SAFE_INTEGER + 1 }),
    operator({ evolvePhase: -1 }), operator({ evolvePhase: 3 }), operator({ evolvePhase: 1.5 }),
    operator({ evolvePhase: "1" }), operator({ evolvePhase: undefined }),
  ])("有非法干员时整份拒绝而不静默过滤：%p", invalid => {
    const result = adapt(roster({ valid: operator(), "secret-key": invalid }));
    expect(result.status).toBe("invalid-data");
    expect(result).not.toHaveProperty("operators");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("重复干员不拼接或选择练度，诊断不带实例ID", () => {
    expect(adapt(roster({ a: operator(), secret: operator({ level: 50 }) }))).toEqual({
      status: "invalid-data",
      issues: [{ code: "duplicate-id", path: "response.data.troop.chars[1].charId" }],
    });
  });
});
