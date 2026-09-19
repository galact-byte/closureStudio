jest.mock('@/checkVersion', () => ({ checkVersion: jest.fn() }));
import { effectScope } from 'vue';
import { checkVersion } from '@/checkVersion';
import { useVersionStatus } from './useVersionStatus';
afterEach(() => jest.resetAllMocks());
test('旧版本检查结束loading，重复检查和失败重试均可恢复', async () => {
  const scope = effectScope(); const state = scope.run(() => useVersionStatus(1))!;
  jest.mocked(checkVersion).mockResolvedValue(2);
  await state.check(); expect(state.status.value).toBe('update-available'); expect(state.loading.value).toBe(false);
  await state.check(); expect(state.loading.value).toBe(false);
  jest.mocked(checkVersion).mockRejectedValueOnce(new Error('offline'));
  await state.check(); expect(state.status.value).toBe('error');
  await state.check(); expect(state.status.value).toBe('update-available'); scope.stop();
});
test('未知构建不伪装为旧版或最新', async () => {
  const scope = effectScope(); const state = scope.run(() => useVersionStatus(null))!;
  jest.mocked(checkVersion).mockResolvedValue(2); await state.check(); expect(state.status.value).toBe('unknown'); scope.stop();
});
test('旧响应和卸载后响应不能覆盖状态', async () => {
  const scope = effectScope(); const state = scope.run(() => useVersionStatus(2))!;
  let done!: (value: number) => void;
  jest.mocked(checkVersion).mockImplementationOnce(() => new Promise(resolve => { done = resolve; })).mockResolvedValue(2);
  const old = state.check(); await state.check(); done(3); await old; expect(state.status.value).toBe('latest');
  jest.mocked(checkVersion).mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const pending = state.check(); scope.stop(); done(4); await pending; expect(state.latest.value).toBe(2);
});
