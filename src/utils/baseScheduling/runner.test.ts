import { createScheduleRunner, type ScheduleWorker } from './runner';
import type { ScheduleInput } from './solver';
const input: ScheduleInput = { operators: [], candidates: [], reserved: [], rooms: [], shifts: [] };
function worker(): ScheduleWorker {
  return { postMessage: jest.fn(), terminate: jest.fn(), onmessage: null, onerror: null };
}
afterEach(() => jest.useRealTimers());
test('每次计算独立Worker，取消后丢弃晚到结果', () => {
  const w = worker(), receive = jest.fn(); const runner = createScheduleRunner(() => w, receive);
  runner.start(input); const late = w.onmessage; runner.cancel();
  late?.(new MessageEvent('message', { data: { assignments: [] } }));
  expect(w.terminate).toHaveBeenCalled(); expect(receive).not.toHaveBeenCalled();
});
test('重算终止旧Worker，只有最新结果有效', () => {
  const a = worker(), b = worker(), receive = jest.fn();
  const runner = createScheduleRunner(jest.fn().mockReturnValueOnce(a).mockReturnValueOnce(b), receive);
  runner.start(input); const late = a.onmessage; runner.start(input);
  late?.(new MessageEvent('message', { data: 'old' })); b.onmessage?.(new MessageEvent('message', { data: 'new' }));
  expect(receive).toHaveBeenCalledTimes(1); expect(receive).toHaveBeenCalledWith({ status: 'result', value: 'new' });
  expect(b.terminate).toHaveBeenCalled();
});
test('错误、创建失败及超时不会假装无解', () => {
  jest.useFakeTimers(); const w = worker(), receive = jest.fn(); const runner = createScheduleRunner(() => w, receive);
  runner.start(input); jest.advanceTimersByTime(10000);
  expect(receive).toHaveBeenLastCalledWith({ status: 'error', code: 'timeout' });
  runner.start(input); w.onerror?.(Object.assign(new Event('error'), { message: '合成错误', filename: '', lineno: 0, colno: 0, error: null })); expect(receive).toHaveBeenLastCalledWith({ status: 'error', code: 'worker-failed' });
  createScheduleRunner(() => { throw new Error('denied'); }, receive).start(input);
  expect(receive).toHaveBeenLastCalledWith({ status: 'error', code: 'worker-failed' });
});
