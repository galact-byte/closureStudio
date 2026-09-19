import type { SchedulingOperator } from '../baseSchedulingInput';

export type ProductionType = 'manufacturing' | 'trading' | 'power';
export const productionTypes: ProductionType[] = ['manufacturing', 'trading', 'power'];
export interface Unlock { skillId: string; elite: number; level: number }
export interface Skill { roomType: ProductionType | 'other'; description: string; efficiency: number }
export interface SchedulingData {
  schemaVersion: 1;
  source: { revision: string; sha256: string };
  payloadSha256: string;
  rooms: Record<ProductionType, number[]>;
  operators: Record<string, Unlock[][] | null>;
  skills: Record<string, Skill>;
}
export interface Candidate { charId: string; type: ProductionType; bonus: number }
export interface Exclusion { charId: string; type?: ProductionType; reason: string }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-data');
  return value as Record<string, unknown>;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('invalid-data');
  return value;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value || value.trim() !== value || value.length > max) throw new Error('invalid-data');
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('invalid-data');
  return value;
}
export function isProductionType(value: unknown): value is ProductionType {
  return value === 'manufacturing' || value === 'trading' || value === 'power';
}
export function decodeSchedulingData(input: unknown): SchedulingData {
  const raw = record(input);
  if (raw.schemaVersion !== 1) throw new Error('unsupported-schema');
  const source = record(raw.source);
  const revision = text(source.revision), sha256 = text(source.sha256), payloadSha256 = text(raw.payloadSha256);
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^[a-f0-9]{64}$/.test(sha256) || !/^[a-f0-9]{64}$/.test(payloadSha256)) throw new Error('invalid-data');
  const roomRaw = record(raw.rooms);
  const capacity = (type: ProductionType) => {
    const values = list(roomRaw[type], 10).map(n => integer(n, 1, 10));
    if (!values.length) throw new Error('invalid-data');
    return values;
  };
  const rooms = { manufacturing: capacity('manufacturing'), trading: capacity('trading'), power: capacity('power') };
  const skillEntries = Object.entries(record(raw.skills));
  if (skillEntries.length > 10000) throw new Error('invalid-data');
  const skills: Record<string, Skill> = Object.fromEntries(skillEntries.map(([id, value]) => {
    text(id); const s = record(value);
    if (!isProductionType(s.roomType) && s.roomType !== 'other') throw new Error('invalid-data');
    if (typeof s.efficiency !== 'number' || !Number.isFinite(s.efficiency)) throw new Error('invalid-data');
    return [id, { roomType: s.roomType, description: text(s.description, 10000), efficiency: s.efficiency }];
  }));
  const entries = Object.entries(record(raw.operators));
  if (entries.length > 5000) throw new Error('invalid-data');
  const operators: Record<string, Unlock[][] | null> = Object.fromEntries(entries.map(([id, value]) => {
    text(id);
    if (value === null) return [id, null];
    const groups = list(value, 20).map(group => list(group, 20).map(item => {
      const u = record(item), skillId = text(u.skillId);
      if (!Object.hasOwn(skills, skillId)) throw new Error('invalid-data');
      return { skillId, elite: integer(u.elite, 0, 2), level: integer(u.level, 1, 1000) };
    }));
    return [id, groups];
  }));
  return { schemaVersion: 1, source: { revision, sha256 }, payloadSha256, rooms, operators, skills };
}

const patterns: Record<ProductionType, RegExp> = {
  manufacturing: /^进驻制造站时，生产力\+(\d+(?:\.\d+)?)%$/,
  trading: /^进驻贸易站时，订单获取效率\+(\d+(?:\.\d+)?)%$/,
  power: /^进驻发电站时，无人机充能速度\+(\d+(?:\.\d+)?)%$/,
};
function fixedBonus(skill: Skill, type: ProductionType): number | null {
  const plain = skill.description.replace(/<@cc\.vup>|<\/>/g, '');
  const match = patterns[type].exec(plain);
  if (!match) return null;
  const bonus = Number(match[1]);
  if (bonus <= 0 || bonus > 1000 || !Number.isSafeInteger(bonus * 100) || Math.abs(bonus - skill.efficiency) > 1e-9) return null;
  return bonus;
}
/** 未知相关技能整体排除，不能靠忽略副作用提高表面支持率。 */
export function prepareCandidates(data: SchedulingData, roster: SchedulingOperator[], reserved: string[] = []) {
  const candidates: Candidate[] = [], excluded: Exclusion[] = [];
  const held = new Set(reserved);
  for (const operator of roster) {
    const { charId, elite, level } = operator;
    const reject = (reason: string) => excluded.push({ charId, reason });
    if (held.has(charId)) { reject('reserved'); continue; }
    if (!Object.hasOwn(data.operators, charId)) { reject('missing-rules'); continue; }
    const groups = data.operators[charId];
    if (groups === null) { reject('unsupported-template'); continue; }
    const active: Skill[] = [];
    let ambiguous = false;
    for (const group of groups) {
      const unlocked = group.filter(u => elite > u.elite || (elite === u.elite && level >= u.level))
        .sort((a, b) => b.elite - a.elite || b.level - a.level);
      if (unlocked.length > 1 && unlocked[0].elite === unlocked[1].elite && unlocked[0].level === unlocked[1].level) { ambiguous = true; break; }
      if (unlocked[0]) active.push(data.skills[unlocked[0].skillId]);
    }
    if (ambiguous) { reject('ambiguous-unlock'); continue; }
    for (const type of productionTypes) {
      const relevant = active.filter(s => s.roomType === type);
      const bonuses = relevant.map(s => fixedBonus(s, type));
      if (!bonuses.length) { excluded.push({ charId, type, reason: 'no-supported-skill' }); continue; }
      if (bonuses.some(b => b === null)) { excluded.push({ charId, type, reason: 'unsupported-effect' }); continue; }
      const bonus = bonuses.reduce<number>((sum, b) => sum + (b ?? 0), 0);
      if (bonus > 1000) { excluded.push({ charId, type, reason: 'unsupported-effect' }); continue; }
      candidates.push({ charId, type, bonus });
    }
  }
  return { candidates, excluded };
}
