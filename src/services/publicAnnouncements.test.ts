import { decodeAnnouncements, loadAnnouncements } from './publicAnnouncements';
const snapshot = () => ({schemaVersion: 1, generatedAt: '2026-09-19T00:00:00Z', lastAttemptAt: null, lastSuccessAt: null, status: 'unavailable', errorCode: null, events: []});
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
test('校验快照，剔除额外字段', () => {
  expect(decodeAnnouncements({...snapshot(), secret: 'not public'})).toEqual(snapshot());
  expect(() => decodeAnnouncements({...snapshot(), schemaVersion: 2})).toThrow();
  expect(() => decodeAnnouncements({...snapshot(), status: 'ready', lastSuccessAt: 'yesterday'})).toThrow();
});
test('拒绝非官方来源、不存在日期和倒序窗口', () => {
  const window = {kind: 'stage', sectionLabel: '关卡', startAt: '2026-09-20T12:00:00+08:00', endAt: '2026-09-21T03:59:00+08:00', timezone: 'Asia/Shanghai', rawTimeText: '证据', parseStatus: 'parsed'};
  const event = {newsId: '001', sourceUrl: 'https://ak.hypergryph.com/news/001', title: '活动', publishedAt: null, fetchedAt: '2026-09-19T00:00:00Z', windows: [window]};
  expect(() => decodeAnnouncements({...snapshot(), events: [{...event, sourceUrl: 'javascript:alert(1)'}]})).toThrow();
  expect(() => decodeAnnouncements({...snapshot(), events: [{...event, windows: [{...window, startAt: '2026-02-30T12:00:00+08:00'}]}]})).toThrow();
  expect(() => decodeAnnouncements({...snapshot(), events: [{...event, windows: [{...window, endAt: '2026-09-19T03:59:00+08:00'}]}]})).toThrow();
});
test('匿名有界读取，不携带凭据', async () => {
  global.fetch = jest.fn().mockResolvedValue(Response.json(snapshot()));
  expect((await loadAnnouncements('https://public.test/public/announcements', new AbortController().signal)).status).toBe('unavailable');
  expect(global.fetch).toHaveBeenCalledWith('https://public.test/public/announcements', expect.objectContaining({credentials: 'omit', referrerPolicy: 'no-referrer'}));
});
test.each(['http', 'size', 'schema'])('拒绝 %s 后可重试', async kind => {
  global.fetch = jest.fn().mockResolvedValueOnce(kind === 'http' ? new Response('', {status: 500}) : kind === 'size' ? new Response(' '.repeat(1024 * 1024 + 1)) : Response.json({})).mockResolvedValueOnce(Response.json(snapshot()));
  await expect(loadAnnouncements('https://public.test', new AbortController().signal)).rejects.toThrow();
  await expect(loadAnnouncements('https://public.test', new AbortController().signal)).resolves.toMatchObject({schemaVersion: 1});
});
test('超时结束并支持取消', async () => {
  jest.useFakeTimers(); global.fetch = jest.fn((_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
  const pending = expect(loadAnnouncements('https://public.test', new AbortController().signal)).rejects.toThrow('timeout');
  await jest.advanceTimersByTimeAsync(15000); await pending;
});
