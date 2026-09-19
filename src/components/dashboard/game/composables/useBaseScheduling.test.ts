jest.mock('@/services/baseSchedulingData', () => ({ loadSchedulingData: jest.fn() }));
import { effectScope, ref } from 'vue';
import { loadSchedulingData } from '@/services/baseSchedulingData';
import { decodeSchedulingData } from '@/utils/baseScheduling/data';
import { solveSchedule } from '@/utils/baseScheduling/solver';
import type { ScheduleWorker } from '@/utils/baseScheduling/runner';
import type { SchedulingRosterSource } from '@/utils/baseSchedulingInput';
import { useBaseScheduling } from './useBaseScheduling';
const resource = () => decodeSchedulingData({
  schemaVersion: 1, source: { revision: 'a'.repeat(40), sha256: 'b'.repeat(64) }, payloadSha256: 'c'.repeat(64),
  rooms: { manufacturing: [1], trading: [1], power: [1] },
  operators: { alpha: [[{ skillId: 'm', elite: 0, level: 1 }]] },
  skills: { m: { roomType: 'manufacturing', description: '进驻制造站时，生产力+15%', efficiency: 15 } },
});
const sourceValue = (): SchedulingRosterSource => ({ status: 'received', response: { code: 1, data: { troop: { chars: { '1': { charId: 'alpha', evolvePhase: 0, level: 1 } } } } } });
function setup() {
  const source = ref<SchedulingRosterSource | null>(sourceValue());
  const worker: ScheduleWorker = { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
  const scope = effectScope();
  const state = scope.run(() => useBaseScheduling(source, () => worker))!;
  state.rooms.value = [{ roomId: 'm', type: 'manufacturing', level: 1, slotCount: 1 }]; state.shiftCount.value = 1;
  return { state, source, worker, scope };
}
beforeEach(() => { jest.resetAllMocks(); jest.mocked(loadSchedulingData).mockResolvedValue(resource()); });
test('从完整响应到实际计算及独立校验，不向Worker传账号响应', async () => {
  const { state, worker, scope } = setup(); await state.load(); state.generate();
  const input = jest.mocked(worker.postMessage).mock.calls[0][0];
  expect(Object.keys(input).sort()).toEqual(['candidates', 'operators', 'reserved', 'rooms', 'shifts']);
  worker.onmessage?.(new MessageEvent('message', { data: solveSchedule(input) }));
  expect(state.result.value?.status).toBe('complete'); expect(state.result.value?.score).toBe(180);
  state.shiftHours.value = 6; expect(state.result.value).toBeNull(); scope.stop();
});
test('账号或配置改变同步清除结果，旧Worker结果无效', async () => {
  const { state, source, worker, scope } = setup(); await state.load(); state.generate(); const late = worker.onmessage;
  source.value = null; late?.(new MessageEvent('message', { data: {} }));
  expect(state.result.value).toBeNull(); expect(state.running.value).toBe(false); expect(worker.terminate).toHaveBeenCalled(); scope.stop();
});
test('资源404后重试，旧加载晚到不覆盖', async () => {
  const { state, scope } = setup(); jest.mocked(loadSchedulingData).mockRejectedValueOnce(new Error('http-404'));
  await state.load(); expect(state.error.value).toContain('尚未发布');
  await state.load(); expect(state.data.value?.schemaVersion).toBe(1);
  let done!: (v: ReturnType<typeof resource>) => void;
  jest.mocked(loadSchedulingData).mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const old = state.load(); await state.load(); const stale = resource(); stale.source.revision = 'd'.repeat(40); done(stale); await old;
  expect(state.data.value?.source.revision).toBe('a'.repeat(40)); scope.stop();
});
test('卸载终止Worker，阻止未完成资源覆盖状态', async () => {
  const { state, worker, scope } = setup(); await state.load(); state.generate(); scope.stop();
  expect(worker.terminate).toHaveBeenCalled();
  const other = setup(); let done!: (v: ReturnType<typeof resource>) => void;
  jest.mocked(loadSchedulingData).mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const pending = other.state.load(); other.scope.stop(); done(resource()); await pending;
  expect(other.state.data.value).toBeNull();
});
test('资料缺失、容量错误、损坏结果拒绝，取消可重算', async () => {
  const { state, source, worker, scope } = setup(); await state.load();
  source.value = { status: 'received', response: { code: 1, data: {} } }; state.generate(); expect(worker.postMessage).not.toHaveBeenCalled();
  source.value = sourceValue(); state.rooms.value[0].slotCount = 3; state.generate(); expect(state.error.value).toContain('容量');
  state.rooms.value[0].slotCount = 1; state.generate(); state.cancel(); expect(state.error.value).toContain('取消');
  state.generate(); worker.onmessage?.(new MessageEvent('message', { data: { status: 'complete', assignments: [], score: 0, vacancies: 0 } }));
  expect(state.error.value).toContain('独立校验'); expect(state.result.value).toBeNull(); scope.stop();
});
