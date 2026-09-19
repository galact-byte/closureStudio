import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue';
import { loadSchedulingData } from '@/services/baseSchedulingData';
import { prepareCandidates, type SchedulingData } from '@/utils/baseScheduling/data';
import { createScheduleRunner, type ScheduleWorker } from '@/utils/baseScheduling/runner';
import { validateScheduleAgainstData, type ScheduleInput, type ScheduleResult } from '@/utils/baseScheduling/solver';
import { adaptSchedulingRoster, validateSchedulingLayout, type SchedulingRoom, type SchedulingRosterSource } from '@/utils/baseSchedulingInput';

export function useBaseScheduling(
  source: Ref<SchedulingRosterSource | null>,
  factory: () => ScheduleWorker,
) {
  const data = shallowRef<SchedulingData | null>(null);
  const loading = ref(false), running = ref(false), error = ref('');
  const result = shallowRef<ScheduleResult | null>(null);
  const rooms = ref<SchedulingRoom[]>([]), reserved = ref<string[]>([]);
  const shiftCount = ref(2), shiftHours = ref(12);
  const roster = computed(() => source.value ? adaptSchedulingRoster(source.value) : null);
  const operators = computed(() => roster.value?.status === 'ready' ? roster.value.operators : []);
  const prepared = computed(() => data.value ? prepareCandidates(data.value, operators.value, reserved.value) : { candidates: [], excluded: [] });
  let snapshot: ScheduleInput | null = null;
  const runner = createScheduleRunner(factory, outcome => {
    running.value = false;
    if (outcome.status === 'error') { error.value = outcome.code === 'timeout' ? '计算超时，请减少房间或班次数后重试。' : '计算失败，请重试。'; return; }
    if (!snapshot || !data.value || !validateScheduleAgainstData(snapshot, outcome.value, data.value)) { error.value = '计算结果未通过独立校验，请重试。'; return; }
    result.value = outcome.value;
  });
  const invalidate = () => { runner.cancel(); snapshot = null; running.value = false; result.value = null; error.value = ''; };
  watch([source, rooms, reserved, shiftCount, shiftHours, data], invalidate, { deep: true, flush: 'sync' });
  let request = 0, controller: AbortController | null = null;
  async function load() {
    const current = ++request;
    controller?.abort(); controller = new AbortController();
    invalidate(); data.value = null; loading.value = true;
    try {
      const next = await loadSchedulingData(controller.signal);
      if (request !== current) return;
      data.value = next;
    } catch (cause) {
      if (request !== current) return;
      const code = cause instanceof Error ? cause.message : '';
      error.value = code === 'http-404' ? '基建数据尚未发布，请联系管理员或稍后重试。' : code === 'timeout' ? '基建数据加载超时，请重试。' : '基建数据加载失败或版本不兼容，请重试。';
    } finally { if (request === current) loading.value = false; }
  }
  const configError = computed(() => {
    if (!rooms.value.length) return '请添加至少一个生产房间，并选择实际等级。';
    if (!Number.isInteger(shiftCount.value) || shiftCount.value < 1 || shiftCount.value > 4 || !Number.isInteger(shiftHours.value) || shiftHours.value < 1 || shiftHours.value > 24) return '班次须为 1–4 班，每班 1–24 小时。';
    if (!data.value) return '请先加载基建数据。';
    for (const room of rooms.value) {
      const capacities = data.value.rooms[room.type as keyof SchedulingData['rooms']];
      if (!capacities || capacities[room.level - 1] !== room.slotCount) return '房间等级未选择或容量已变化，请重新选择等级。';
    }
    return '';
  });
  function generate() {
    invalidate();
    if (roster.value?.status !== 'ready') { error.value = '完整干员资料不可用，请刷新游戏详情。'; return; }
    if (configError.value) { error.value = configError.value; return; }
    const shifts = Array.from({ length: shiftCount.value }, (_, i) => ({ startHour: i * shiftHours.value, endHour: (i + 1) * shiftHours.value }));
    const layout = validateSchedulingLayout(rooms.value, shifts);
    if (layout.status !== 'ready') { error.value = '房间或班次配置无效，请检查。'; return; }
    snapshot = { operators: operators.value.map(o => ({ ...o })), candidates: prepared.value.candidates.map(c => ({ ...c })), rooms: layout.rooms, shifts: layout.shifts, reserved: [...reserved.value] };
    running.value = true; runner.start(snapshot);
  }
  function cancel() { invalidate(); error.value = '已取消计算。'; }
  onScopeDispose(() => { request++; controller?.abort(); runner.cancel(); });
  return { data, loading, running, error, result, rooms, reserved, shiftCount, shiftHours, roster, operators, prepared, configError, load, generate, cancel };
}
