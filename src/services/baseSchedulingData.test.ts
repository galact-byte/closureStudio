import { createHash, webcrypto } from 'node:crypto';
import { loadSchedulingData } from './baseSchedulingData';
const raw = () => {
  const payload = { rooms: { manufacturing: [1], trading: [1], power: [1] }, operators: {}, skills: {} };
  return { schemaVersion: 1, source: { revision: 'a'.repeat(40), sha256: 'b'.repeat(64) }, payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), ...payload };
};
const originalFetch = global.fetch;
beforeAll(() => { Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true }); });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
test('匿名加载并验证摘要，不发送凭据', async () => {
  const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify(raw()))); global.fetch = fetcher;
  expect((await loadSchedulingData(new AbortController().signal)).schemaVersion).toBe(1);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
  expect(fetcher.mock.calls[0][0]).toContain('base_scheduling.v1.json');
});
test.each([404, 500])('HTTP %s 不回退为缺员，允许重试', async status => {
  global.fetch = jest.fn().mockResolvedValueOnce(new Response('', { status })).mockResolvedValueOnce(new Response(JSON.stringify(raw())));
  await expect(loadSchedulingData(new AbortController().signal)).rejects.toThrow(`http-${status}`);
  await expect(loadSchedulingData(new AbortController().signal)).resolves.toMatchObject({ schemaVersion: 1 });
});
test.each(['html', 'digest', 'version', 'size'])('拒绝 %s', async kind => {
  const value = raw(); if (kind === 'digest') value.payloadSha256 = 'f'.repeat(64); if (kind === 'version') value.schemaVersion = 2;
  global.fetch = jest.fn().mockResolvedValue(new Response(kind === 'html' ? '<html>' : JSON.stringify(value), { headers: kind === 'size' ? { 'Content-Length': '99999999' } : {} }));
  await expect(loadSchedulingData(new AbortController().signal)).rejects.toThrow();
});
test('无Content-Length的超大流也拒绝', async () => {
  global.fetch = jest.fn().mockResolvedValue(new Response(' '.repeat(4 * 1024 * 1024 + 1)));
  await expect(loadSchedulingData(new AbortController().signal)).rejects.toThrow('response-too-large');
});
test('预先取消不发请求', async () => {
  global.fetch = jest.fn(); const controller = new AbortController(); controller.abort();
  await expect(loadSchedulingData(controller.signal)).rejects.toThrow(); expect(global.fetch).not.toHaveBeenCalled();
});
test('超时中止请求', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
  const promise = expect(loadSchedulingData(new AbortController().signal)).rejects.toThrow('timeout');
  await jest.advanceTimersByTimeAsync(15000); await promise;
});
