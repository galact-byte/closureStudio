import { API_RESPONSE_CODE } from "@/constants/api";

export interface SchedulingIssue {
  code: "request-failed" | "business-failed" | "missing-field" | "invalid-field" | "duplicate-id" | "overlapping-shift";
  path: string;
}

type InvalidInput = { status: "invalid-data"; issues: SchedulingIssue[] };
type Unverified = { layoutFeasibility: "unverified"; morale: "unverified" };
export interface SchedulingOperator {
  charId: string;
  level: number;
  elite: 0 | 1 | 2;
}
export type SchedulingRosterSource =
  | { status: "request-failed" }
  | { status: "received"; response: unknown };
export type SchedulingRosterResult =
  | { status: "request-failed" | "business-failed" | "missing-data"; issues: SchedulingIssue[] }
  | InvalidInput
  | { status: "empty-roster"; operators: SchedulingOperator[] }
  | ({ status: "ready"; operators: SchedulingOperator[] } & Unverified);

export type SchedulingRoomType = "manufacturing" | "trading" | "power" | "control" | "meeting" | "office" | "dormitory";
export interface SchedulingRoom {
  roomId: string;
  type: SchedulingRoomType;
  level: number;
  slotCount: number;
}
export interface SchedulingShift {
  startHour: number;
  endHour: number;
}
export type SchedulingLayoutResult = InvalidInput | ({
  status: "ready";
  rooms: SchedulingRoom[];
  shifts: SchedulingShift[];
  period: SchedulingShift & { durationHours: number };
} & Unverified);

function isRoomType(value: unknown): value is SchedulingRoomType {
  return value === "manufacturing" || value === "trading" || value === "power"
    || value === "control" || value === "meeting" || value === "office" || value === "dormitory";
}

/** 只验证显式结构；不推断房间上限、供电或心情恢复。 */
export function validateSchedulingLayout(roomInput: unknown, shiftInput: unknown): SchedulingLayoutResult {
  if (!Array.isArray(roomInput) || roomInput.length === 0) return invalid("rooms");
  const rooms: SchedulingRoom[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < roomInput.length; index++) {
    const entry: unknown = roomInput[index];
    const path = `rooms[${index}]`;
    if (!isRecord(entry)) return invalid(path);
    const { roomId, type, level, slotCount } = entry;
    if (!isId(roomId)) return invalid(`${path}.roomId`);
    if (!isRoomType(type)) return invalid(`${path}.type`);
    if (!isPositiveInteger(level)) return invalid(`${path}.level`);
    if (!isPositiveInteger(slotCount)) return invalid(`${path}.slotCount`);
    if (ids.has(roomId)) return { status: "invalid-data", issues: [{ code: "duplicate-id", path: `${path}.roomId` }] };
    ids.add(roomId);
    rooms.push({ roomId, type, level, slotCount });
  }
  if (!Array.isArray(shiftInput) || shiftInput.length === 0) return invalid("shifts");
  const indexedShifts: (SchedulingShift & { index: number })[] = [];
  for (let index = 0; index < shiftInput.length; index++) {
    const entry: unknown = shiftInput[index];
    const path = `shifts[${index}]`;
    if (!isRecord(entry)) return invalid(path);
    const { startHour, endHour } = entry;
    if (typeof startHour !== "number" || !Number.isFinite(startHour) || startHour < 0) return invalid(`${path}.startHour`);
    if (typeof endHour !== "number" || !Number.isFinite(endHour) || endHour <= startHour) return invalid(`${path}.endHour`);
    indexedShifts.push({ startHour, endHour, index });
  }
  indexedShifts.sort((a, b) => a.startHour - b.startHour);
  for (let i = 1; i < indexedShifts.length; i++) {
    if (indexedShifts[i].startHour < indexedShifts[i - 1].endHour) {
      return { status: "invalid-data", issues: [{ code: "overlapping-shift", path: `shifts[${indexedShifts[i].index}]` }] };
    }
  }
  const shifts = indexedShifts.map(({ startHour, endHour }) => ({ startHour, endHour }));
  const startHour = shifts[0].startHour;
  const endHour = shifts[shifts.length - 1].endHour;
  return {
    status: "ready", rooms, shifts, period: { startHour, endHour, durationHours: endHour - startHour },
    layoutFeasibility: "unverified", morale: "unverified",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function invalid(path: string): InvalidInput {
  return { status: "invalid-data", issues: [{ code: "invalid-field", path }] };
}

/** 仅适配 JSON 详情响应，不读取缓存；ready 不表示排班可行。 */
export function adaptSchedulingRoster(source: SchedulingRosterSource): SchedulingRosterResult {
  if (source.status === "request-failed") {
    return { status: "request-failed", issues: [{ code: "request-failed", path: "source" }] };
  }
  const response = source.response;
  if (!isRecord(response)) return invalid("response");
  if (typeof response.code !== "number" || !Number.isSafeInteger(response.code)) return invalid("response.code");
  if (response.code !== API_RESPONSE_CODE.SUCCESS) {
    return { status: "business-failed", issues: [{ code: "business-failed", path: "response.code" }] };
  }
  let current: Record<string, unknown> = response;
  let path = "response";
  for (const key of ["data", "troop", "chars"]) {
    path += `.${key}`;
    const value = Object.hasOwn(current, key) ? current[key] : undefined;
    if (value === undefined) {
      return { status: "missing-data", issues: [{ code: "missing-field", path }] };
    }
    if (!isRecord(value)) return invalid(path);
    current = value;
  }
  const operators: SchedulingOperator[] = [];
  const ids = new Set<string>();
  // 使用序号而非外部实例键，避免诊断泄漏任意响应内容。
  for (const [index, entry] of Object.values(current).entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) return invalid(entryPath);
    const { charId, level, evolvePhase } = entry;
    if (!isId(charId)) return invalid(`${entryPath}.charId`);
    if (!isPositiveInteger(level)) return invalid(`${entryPath}.level`);
    if (evolvePhase !== 0 && evolvePhase !== 1 && evolvePhase !== 2) return invalid(`${entryPath}.evolvePhase`);
    if (ids.has(charId)) {
      return { status: "invalid-data", issues: [{ code: "duplicate-id", path: `${entryPath}.charId` }] };
    }
    ids.add(charId);
    operators.push({ charId, level, elite: evolvePhase });
  }
  return operators.length === 0
    ? { status: "empty-roster", operators }
    : { status: "ready", operators, layoutFeasibility: "unverified", morale: "unverified" };
}
