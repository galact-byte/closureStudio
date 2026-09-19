import type { ScheduleInput } from './solver';
export interface ScheduleWorker {
  postMessage: (input: ScheduleInput) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}
type Outcome = { status: 'result'; value: unknown } | { status: 'error'; code: string };
export function createScheduleRunner(factory: () => ScheduleWorker, receive: (outcome: Outcome) => void) {
  let version = 0, worker: ScheduleWorker | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    version++; clearTimeout(timer);
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); worker = null; }
  };
  return {
    cancel,
    start(input: ScheduleInput) {
      cancel(); const current = version;
      const finish = (outcome: Outcome) => { if (version !== current) return; cancel(); receive(outcome); };
      try {
        worker = factory();
        worker.onmessage = event => finish({ status: 'result', value: event.data });
        worker.onerror = () => finish({ status: 'error', code: 'worker-failed' });
        timer = setTimeout(() => finish({ status: 'error', code: 'timeout' }), 10000);
        worker.postMessage(input);
      } catch { finish({ status: 'error', code: 'worker-failed' }); }
    },
  };
}
