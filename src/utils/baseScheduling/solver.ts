import { validateSchedulingLayout, type SchedulingOperator, type SchedulingRoom, type SchedulingShift } from '../baseSchedulingInput';
import { isProductionType, prepareCandidates, type SchedulingData, type Candidate } from './data';
export interface ScheduleInput {
  operators: SchedulingOperator[]; candidates: Candidate[]; rooms: SchedulingRoom[];
  shifts: SchedulingShift[]; reserved: string[];
}
export interface Assignment { roomId: string; shift: number; startHour: number; endHour: number; charId: string; bonus: number }
export interface ScheduleResult { status: 'complete' | 'partial' | 'unavailable'; assignments: Assignment[]; score: number; vacancies: number }
interface Slot { room: SchedulingRoom; shift: number; time: SchedulingShift }
function checkInput(input: ScheduleInput): Slot[] {
  const layout = validateSchedulingLayout(input.rooms, input.shifts);
  if (layout.status !== 'ready' || input.operators.length > 1000 || input.rooms.length > 12 || input.shifts.length > 4 || input.candidates.length > 3000) throw new Error('invalid-input');
  const ids = new Set(input.operators.map(o => o.charId));
  if (ids.size !== input.operators.length || input.reserved.some(id => !ids.has(id))) throw new Error('invalid-input');
  const keys = new Set<string>();
  for (const c of input.candidates) {
    const key = JSON.stringify([c.charId, c.type]);
    if (!ids.has(c.charId) || !isProductionType(c.type) || keys.has(key) || c.bonus <= 0 || c.bonus > 1000 || !Number.isSafeInteger(c.bonus * 100)) throw new Error('invalid-input');
    keys.add(key);
  }
  for (const t of input.shifts) {
    if (!Number.isSafeInteger(t.startHour * 60) || !Number.isSafeInteger(t.endHour * 60) || t.endHour > 168) throw new Error('invalid-input');
  }
  if (input.rooms.some(r => !isProductionType(r.type) || r.slotCount > 10)) throw new Error('invalid-input');
  return input.rooms.flatMap(room => input.shifts.map((time, shift) => ({ room, time, shift })));
}
interface Edge { to: number; reverse: number; capacity: number; cost: number }
/** 最大流优先填岗；残余边支持撤销旧分配，费用仅代表线性模型。 */
export function solveSchedule(input: ScheduleInput): ScheduleResult {
  const slots = checkInput(input);
  const reserved = new Set(input.reserved);
  const ids = input.operators.map(o => o.charId).filter(id => !reserved.has(id)).sort();
  const sink = 1 + ids.length + slots.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const add = (from: number, to: number, capacity: number, cost: number) => {
    const forward = { to, reverse: graph[to].length, capacity, cost };
    const reverse = { to: from, reverse: graph[from].length, capacity: 0, cost: -cost };
    graph[from].push(forward); graph[to].push(reverse); return forward;
  };
  const links: { edge: Edge; assignment: Assignment }[] = [];
  const candidates = new Map(input.candidates.map(c => [JSON.stringify([c.charId, c.type]), c]));
  ids.forEach((id, index) => {
    add(0, index + 1, 1, 0);
    slots.forEach((slot, j) => {
      const c = candidates.get(JSON.stringify([id, slot.room.type]));
      if (!c) return;
      const minutes = Math.round((slot.time.endHour - slot.time.startHour) * 60);
      const cost = Math.round(c.bonus * 100) * minutes;
      const edge = add(index + 1, 1 + ids.length + j, 1, -cost);
      links.push({ edge, assignment: { roomId: slot.room.roomId, shift: slot.shift, ...slot.time, charId: id, bonus: c.bonus } });
    });
  });
  slots.forEach((slot, j) => add(1 + ids.length + j, sink, slot.room.slotCount, 0));
  // 有界规模，Bellman-Ford 可处理初始负费用及后续残余边。
  for (;;) {
    const distance = Array(graph.length).fill(Infinity);
    const previous: { from: number; index: number }[] = Array(graph.length);
    distance[0] = 0;
    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      graph.forEach((edges, from) => edges.forEach((edge, index) => {
        if (edge.capacity > 0 && distance[from] + edge.cost < distance[edge.to]) {
          distance[edge.to] = distance[from] + edge.cost; previous[edge.to] = { from, index }; changed = true;
        }
      }));
      if (!changed) break;
    }
    if (!Number.isFinite(distance[sink])) break;
    for (let node = sink; node !== 0;) {
      const { from, index } = previous[node]; const edge = graph[from][index];
      edge.capacity--; graph[node][edge.reverse].capacity++; node = from;
    }
  }
  const assignments = links.filter(l => l.edge.capacity === 0).map(l => l.assignment)
    .sort((a, b) => a.roomId.localeCompare(b.roomId) || a.shift - b.shift || a.charId.localeCompare(b.charId));
  const vacancies = slots.reduce((sum, s) => sum + s.room.slotCount, 0) - assignments.length;
  const score = assignments.reduce((sum, a) => sum + a.bonus * (a.endHour - a.startHour), 0);
  return { status: !assignments.length ? 'unavailable' : vacancies ? 'partial' : 'complete', assignments, score, vacancies };
}
/** 主线程按资源重新生成资格，不能信任传给求解器的候选本身。 */
export function validateScheduleAgainstData(input: ScheduleInput, result: unknown, data: SchedulingData): result is ScheduleResult {
  if (input.rooms.some(room => !isProductionType(room.type) || data.rooms[room.type][room.level - 1] !== room.slotCount)) return false;
  const { candidates } = prepareCandidates(data, input.operators, input.reserved);
  return validateSchedule({ ...input, candidates }, result);
}
/** 与求解器分离，按输入契约重算资格、占用和评分。 */
export function validateSchedule(input: ScheduleInput, value: unknown): value is ScheduleResult {
  try {
    if (!value || typeof value !== 'object' || !('assignments' in value) || !('score' in value) || !('status' in value) || !('vacancies' in value)) return false;
    const result = value;
    if (typeof result.score !== 'number') return false;
    const slots = checkInput(input);
    const held = new Set(input.operators.map(o => o.charId)), seen = new Set<string>();
    const counts = new Map<string, number>(); let score = 0;
    if (!Array.isArray(result.assignments)) return false;
    for (const a of result.assignments) {
      if (!held.has(a.charId) || seen.has(a.charId) || input.reserved.includes(a.charId)) return false;
      seen.add(a.charId);
      const slot = slots.find(s => s.room.roomId === a.roomId && s.shift === a.shift);
      if (!slot || a.startHour !== slot.time.startHour || a.endHour !== slot.time.endHour) return false;
      const c = input.candidates.find(c => c.charId === a.charId && c.type === slot.room.type);
      if (!c || c.bonus !== a.bonus) return false;
      const key = JSON.stringify([a.roomId, a.shift]);
      const count = (counts.get(key) ?? 0) + 1; counts.set(key, count);
      if (count > slot.room.slotCount) return false;
      score += c.bonus * (a.endHour - a.startHour);
    }
    const vacancies = slots.reduce((sum, s) => sum + s.room.slotCount, 0) - seen.size;
    const status = !seen.size ? 'unavailable' : vacancies ? 'partial' : 'complete';
    return result.status === status && result.vacancies === vacancies && Number.isFinite(result.score) && Math.abs(result.score - score) < 1e-7;
  } catch { return false; }
}
