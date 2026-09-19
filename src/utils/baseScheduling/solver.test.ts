import { solveSchedule, validateSchedule, validateScheduleAgainstData, type ScheduleInput } from './solver';
function input(): ScheduleInput {
  return {
    operators: [{ charId: 'a', elite: 0, level: 1 }, { charId: 'b', elite: 0, level: 1 }], reserved: [],
    candidates: [{ charId: 'a', type: 'manufacturing', bonus: 30 }, { charId: 'a', type: 'trading', bonus: 25 }, { charId: 'b', type: 'manufacturing', bonus: 20 }],
    rooms: [{ roomId: 'm', type: 'manufacturing', level: 1, slotCount: 1 }, { roomId: 't', type: 'trading', level: 1, slotCount: 1 }],
    shifts: [{ startHour: 0, endHour: 12 }],
  };
}
test('残余路径重新分配稀缺人员，优先填满而非单房间贪心', () => {
  const i = input(), result = solveSchedule(i);
  expect(result.status).toBe('complete'); expect(result.score).toBe(540);
  expect(result.assignments.map(a => [a.roomId, a.charId])).toEqual([['m', 'b'], ['t', 'a']]);
  expect(validateSchedule(i, result)).toBe(true);
});
test('保留、缺员、空候选以及周期唯一', () => {
  const i = input(); i.reserved = ['a'];
  expect(solveSchedule(i).status).toBe('partial');
  i.shifts.push({ startHour: 12, endHour: 24 });
  expect(solveSchedule(i).assignments).toHaveLength(1);
  i.candidates = []; expect(solveSchedule(i).status).toBe('unavailable');
});
test('独立规则复核拒绝未解锁候选与虚构容量', () => {
  const i = input();
  const data: import('./data').SchedulingData = {
    schemaVersion: 1, source: { revision: 'a'.repeat(40), sha256: 'b'.repeat(64) }, payloadSha256: 'c'.repeat(64),
    rooms: { manufacturing: [1], trading: [1], power: [1] },
    operators: { a: [[{ skillId: 't', elite: 2, level: 1 }]], b: [[{ skillId: 'm', elite: 0, level: 1 }]] },
    skills: { t: { roomType: 'trading', description: '进驻贸易站时，订单获取效率+25%', efficiency: 25 }, m: { roomType: 'manufacturing', description: '进驻制造站时，生产力+20%', efficiency: 20 } },
  };
  const result = solveSchedule(i);
  expect(validateScheduleAgainstData(i, result, data)).toBe(false);
  i.operators[0].elite = 2;
  expect(validateScheduleAgainstData(i, result, data)).toBe(true);
  i.rooms[0].slotCount = 2;
  expect(validateScheduleAgainstData(i, solveSchedule(i), data)).toBe(false);
});
test('确定性、不修改输入', () => {
  const i = input(), original = JSON.stringify(i);
  expect(solveSchedule(i)).toEqual(solveSchedule(i)); expect(JSON.stringify(i)).toBe(original);
});
test.each(['duplicate', 'unknown', 'reserved', 'capacity', 'time', 'score', 'qualification', 'empty', 'status'])('独立检查拒绝污染 %s', kind => {
  const i = input(), result = solveSchedule(i);
  switch (kind) {
    case 'duplicate': result.assignments[1].charId = result.assignments[0].charId; break;
    case 'unknown': result.assignments[0].charId = 'unknown'; break;
    case 'reserved': i.reserved = ['b']; break;
    case 'capacity': result.assignments[1].roomId = 'm'; break;
    case 'time': result.assignments[0].endHour = 13; break;
    case 'score': result.score++; break;
    case 'qualification': result.assignments[0].bonus++; break;
    case 'empty': result.assignments = []; break;
    case 'status': result.status = 'unavailable'; break;
  }
  expect(validateSchedule(i, result)).toBe(false);
});
test('逐一穷举三人两岗位的线性目标，与独立基线比较', () => {
  for (let seed = 0; seed < 24; seed++) {
    const i = input(); i.operators.push({ charId: 'c', elite: 0, level: 1 });
    i.candidates = i.operators.flatMap((o, k) => [
      { charId: o.charId, type: 'manufacturing' as const, bonus: (seed * 7 + k * 11) % 31 + 1 },
      { charId: o.charId, type: 'trading' as const, bonus: (seed * 13 + k * 3) % 29 + 1 },
    ]);
    let best = 0;
    for (const a of i.candidates.filter(c => c.type === 'manufacturing')) {
      for (const b of i.candidates.filter(c => c.type === 'trading' && c.charId !== a.charId)) best = Math.max(best, (a.bonus + b.bonus) * 12);
    }
    const baseline = (i.candidates[0].bonus + i.candidates[3].bonus) * 12; // a 制造、b 贸易：相同两岗位的固定人工方案
    const result = solveSchedule(i);
    expect(result.score).toBe(best);
    expect(result.score).toBeGreaterThanOrEqual(baseline);
  }
});
test('拒绝错时段、重复候选、超限和未持有候选', () => {
  const i = input(); i.shifts[0].endHour = Infinity; expect(() => solveSchedule(i)).toThrow();
  const j = input(); j.candidates.push(j.candidates[0]); expect(() => solveSchedule(j)).toThrow();
  const k = input(); k.candidates[0].charId = 'not-held'; expect(() => solveSchedule(k)).toThrow();
});
