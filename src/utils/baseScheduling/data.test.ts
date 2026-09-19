import { decodeSchedulingData, prepareCandidates } from './data';

export const fixture = () => ({
  schemaVersion: 1, source: { revision: 'a'.repeat(40), sha256: 'b'.repeat(64) }, payloadSha256: 'c'.repeat(64),
  rooms: { manufacturing: [1, 2, 3], trading: [1, 2, 3], power: [1, 1, 1] },
  operators: { alpha: [[{ skillId: 'm1', elite: 0, level: 1 }, { skillId: 'm2', elite: 1, level: 1 }]], beta: [[{ skillId: 'p', elite: 0, level: 1 }]] },
  skills: {
    m1: { roomType: 'manufacturing', description: '进驻制造站时，生产力+15%', efficiency: 15 },
    m2: { roomType: 'manufacturing', description: '进驻制造站时，生产力<@cc.vup>+25%</>', efficiency: 25 },
    p: { roomType: 'power', description: '进驻发电站时，无人机充能速度+10%', efficiency: 10 },
  },
});
const roster = [{ charId: 'alpha', elite: 1 as const, level: 1 }, { charId: 'beta', elite: 0 as const, level: 1 }];
test('解锁替换，只保留最小候选', () => {
  const data = decodeSchedulingData(fixture());
  expect(prepareCandidates(data, roster).candidates).toEqual([
    { charId: 'alpha', type: 'manufacturing', bonus: 25 }, { charId: 'beta', type: 'power', bonus: 10 },
  ]);
});
test('阶段更高不要求前阶段等级，无解锁则排除', () => {
  const raw = fixture(); raw.operators.alpha[0][1].level = 70;
  expect(prepareCandidates(decodeSchedulingData(raw), roster).candidates[0].bonus).toBe(15);
  expect(prepareCandidates(decodeSchedulingData(raw), [{ charId: 'alpha', elite: 2, level: 1 }]).candidates[0].bonus).toBe(25);
});
test.each(['进驻制造站时，生产力+15%，心情每小时消耗+1', '每有一个干员，生产力+15%', '<script>15</script>', '进驻制造站时，生产力+20%'])('未知、复合或数值冲突不猜测 %s', description => {
  const raw = fixture(); raw.skills.m1.description = description;
  expect(prepareCandidates(decodeSchedulingData(raw), [{ charId: 'alpha', elite: 0, level: 1 }]).candidates).toEqual([]);
});
test('同房间未知副技能排除该房间，不忽略', () => {
  const raw = fixture(); raw.operators.alpha.push([{ skillId: 'm1', elite: 0, level: 1 }]); raw.skills.m1.description = '条件效果';
  expect(prepareCandidates(decodeSchedulingData(raw), roster).candidates.map(c => c.charId)).toEqual(['beta']);
});
test('缺数据、模板、保留人员有诊断', () => {
  const raw = { ...fixture(), operators: { ...fixture().operators, template: null } };
  const result = prepareCandidates(decodeSchedulingData(raw), [...roster, { charId: 'absent', elite: 0, level: 1 }, { charId: 'template', elite: 0, level: 1 }], ['beta']);
  expect(result.candidates).toHaveLength(1);
  expect(result.excluded.map(x => x.reason)).toEqual(expect.arrayContaining(['reserved', 'missing-rules', 'unsupported-template']));
});
test('同组相同条件歧义排除', () => {
  const raw = fixture(); raw.operators.alpha[0][1].elite = 0;
  expect(prepareCandidates(decodeSchedulingData(raw), roster).candidates.map(c => c.charId)).not.toContain('alpha');
});
test.each([null, [], {}, { ...fixture(), schemaVersion: 2 }, { ...fixture(), source: {} }, { ...fixture(), rooms: {} }, { ...fixture(), skills: {} }])('拒绝损坏契约 %#', input => expect(() => decodeSchedulingData(input)).toThrow());
test('输出不修改源输入、不透传额外属性', () => {
  const raw = { ...fixture(), secret: 'secret' }; const before = JSON.stringify(raw);
  expect(JSON.stringify(decodeSchedulingData(raw))).not.toContain('secret');
  expect(JSON.stringify(raw)).toBe(before);
});
