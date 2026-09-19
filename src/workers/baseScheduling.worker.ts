import { solveSchedule, type ScheduleInput } from '@/utils/baseScheduling/solver';
self.onmessage = (event: MessageEvent<ScheduleInput>) => {
  self.postMessage(solveSchedule(event.data));
};
