jest.mock('@/services/publicAnnouncements', () => ({ loadAnnouncements: jest.fn() }));
import { effectScope } from 'vue';
import { loadAnnouncements, type PublicSnapshot } from '@/services/publicAnnouncements';
import { usePublicAnnouncements } from './usePublicAnnouncements';
const value = (): PublicSnapshot => ({schemaVersion: 1, generatedAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), status: 'ready', errorCode: null, events: []});
afterEach(() => jest.resetAllMocks());
test('无配置不请求；失败保留快照并可重试', async () => {
  const scope = effectScope(); const disabled = scope.run(() => usePublicAnnouncements(''))!;
  await disabled.load(); expect(disabled.status.value).toBe('disabled'); expect(loadAnnouncements).not.toHaveBeenCalled();
  const state = scope.run(() => usePublicAnnouncements('https://public.test'))!;
  jest.mocked(loadAnnouncements).mockResolvedValue(value()); await state.load(); expect(state.status.value).toBe('ready');
  jest.mocked(loadAnnouncements).mockRejectedValueOnce(new Error('offline')); await state.load(); expect(state.status.value).toBe('stale'); expect(state.data.value).not.toBeNull();
  await state.load(); expect(state.status.value).toBe('ready'); scope.stop();
});
test('过期及旧响应、卸载后响应不覆盖', async () => {
  const scope = effectScope(); const state = scope.run(() => usePublicAnnouncements('https://public.test'))!;
  let done!: (v: PublicSnapshot) => void;
  jest.mocked(loadAnnouncements).mockImplementationOnce(() => new Promise(resolve => {done = resolve;})).mockResolvedValue({...value(), lastSuccessAt: '2020-01-01T00:00:00Z'});
  const old = state.load(); await state.load(); done(value()); await old; expect(state.status.value).toBe('stale');
  jest.mocked(loadAnnouncements).mockImplementationOnce(() => new Promise(resolve => {done = resolve;}));
  const pending = state.load(); scope.stop(); done(value()); await pending; expect(state.status.value).toBe('stale');
});
