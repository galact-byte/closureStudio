<template>
  <section class="space-y-4" aria-label="排班建议配置">
    <p class="text-sm">只读建议 · 有限技能支持。心情恢复、全基建联动与长期收支未认证，不会自动换班。</p>
    <div class="flex flex-wrap items-center gap-3">
      <button class="btn btn-outline min-h-11" :disabled="loading" @click="load">{{ loading ? '加载基建数据中…' : data ? '刷新基建数据' : '加载基建数据' }}</button>
      <span v-if="data" class="text-sm break-all">数据版本 {{ data.source.revision.slice(0, 8) }} · schema {{ data.schemaVersion }}</span>
    </div>
    <p v-if="roster?.status !== 'ready'" role="status">{{ roster?.status === 'empty-roster' ? '该账号没有干员，无法生成建议。' : '完整干员资料不可用，请刷新游戏详情后重试。' }}</p>
    <template v-if="data">
      <fieldset class="space-y-3">
        <legend class="font-semibold mb-2">生产房间（按实际布局添加）</legend>
        <div v-for="(room, index) in rooms" :key="room.roomId" class="flex flex-wrap items-end gap-3 border-b border-base-300 pb-3">
          <label class="flex flex-col gap-1">房间 {{ index + 1 }}
            <select v-model="room.type" class="select select-bordered min-h-11" @change="room.level = 0; room.slotCount = 0">
              <option v-for="type in productionTypes" :key="type" :value="type">{{ labels[type] }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">房间 {{ index + 1 }} 等级
            <select v-model.number="room.level" class="select select-bordered min-h-11" @change="setCapacity(room)">
              <option :value="0" disabled>请选择等级</option>
              <option v-for="(capacity, level) in capacities(room)" :key="level" :value="level + 1">{{ level + 1 }} 级 · {{ capacity }} 人</option>
            </select>
          </label>
          <button class="btn btn-ghost min-h-11" :aria-label="`移除房间 ${index + 1}`" @click="rooms.splice(index, 1)">移除</button>
        </div>
        <button class="btn btn-outline min-h-11" :disabled="rooms.length >= 12" @click="addRoom">添加生产房间</button>
      </fieldset>
      <fieldset class="flex flex-wrap gap-4">
        <legend class="font-semibold mb-2">班次（从周期第 0 小时起）</legend>
        <label class="flex flex-col gap-1">班次数
          <input v-model.number="shiftCount" class="input input-bordered w-28 min-h-11" type="number" min="1" max="4" step="1" />
        </label>
        <label class="flex flex-col gap-1">每班小时数
          <input v-model.number="shiftHours" class="input input-bordered w-28 min-h-11" type="number" min="1" max="24" step="1" />
        </label>
      </fieldset>
      <p class="text-sm">每名干员每周期最多安排一个班次；这不保证心情能坚持到班末。未安排干员也不等于已获得宿舍恢复。</p>
      <details class="border-y border-base-300 py-2">
        <summary class="cursor-pointer min-h-11 flex items-center font-semibold">保留干员（{{ reserved.length }} 人，不参与生产排班）</summary>
        <label class="flex flex-col gap-1 my-2">搜索干员
          <input v-model="search" class="input input-bordered min-h-11 w-full" type="search" placeholder="干员名称或编号" />
        </label>
        <div class="max-h-64 overflow-y-auto grid sm:grid-cols-2 gap-2">
          <label v-for="op in filteredOperators" :key="op.charId" class="flex items-center gap-2 min-h-11 break-all">
            <input v-model="reserved" type="checkbox" class="checkbox" :value="op.charId" />{{ name(op.charId) }}
          </label>
        </div>
      </details>
      <p class="text-sm">持有 {{ operators.length }} 人；可识别生产技能 {{ supportedCount }} 人。未知效果不会按零加成静默补位。</p>
      <p v-if="configError" class="text-sm" role="status">{{ configError }}</p>
      <div class="flex flex-wrap gap-3">
        <button class="btn btn-primary min-h-11" :disabled="running || loading || !!configError || roster?.status !== 'ready'" @click="generate">{{ running ? '正在计算…' : '生成排班建议' }}</button>
        <button v-if="running" class="btn btn-outline min-h-11" @click="cancel">取消计算</button>
      </div>
    </template>
    <p v-if="error" class="text-error break-words" role="alert">{{ error }}</p>
    <section v-if="result" aria-label="排班建议结果" class="space-y-3" aria-live="polite">
      <h3 class="font-semibold">{{ result.status === 'complete' ? '岗位已排满（仅通过本模型约束）' : result.status === 'partial' ? '部分排班 · 仍有缺员' : '无法排班 · 无可用候选' }}</h3>
      <p>空缺 {{ result.vacancies }} 个岗位 · 模型评分 {{ result.score.toFixed(2) }}（加成百分点 × 小时，非实际收益）</p>
      <p>仅计入无条件固定技能加成。各设施等权不代表等价货币收益，不认证可持续循环。</p>
      <div v-for="room in rooms" :key="room.roomId" class="border-t border-base-300 pt-3 space-y-2">
        <h4 class="font-semibold">{{ room.roomId }} · {{ labels[room.type as ProductionType] }} · {{ room.level }} 级</h4>
        <div v-for="shift in shiftCount" :key="shift">
          <p class="text-sm font-medium">第 {{ shift }} 班 · {{ (shift - 1) * shiftHours }}–{{ shift * shiftHours }} 小时</p>
          <ul class="list-disc pl-5 break-words">
            <li v-for="assignment in assignments(room.roomId, shift - 1)" :key="assignment.charId">{{ name(assignment.charId) }} · 固定加成 +{{ assignment.bonus }}%</li>
          </ul>
          <p v-if="assignments(room.roomId, shift - 1).length < room.slotCount" class="text-sm">缺 {{ room.slotCount - assignments(room.roomId, shift - 1).length }} 人：可识别、未保留且本周期未占用的干员不足。</p>
        </div>
      </div>
    </section>
    <details v-if="prepared.excluded.length" class="border-t border-base-300 pt-2">
      <summary class="min-h-11 flex items-center cursor-pointer">未纳入计算的资格（{{ prepared.excluded.length }} 条）</summary>
      <ul class="max-h-64 overflow-y-auto text-sm space-y-2 break-words">
        <li v-for="(entry, i) in prepared.excluded" :key="i">{{ name(entry.charId) }}{{ entry.type ? ` · ${labels[entry.type]}` : '' }}：{{ reasons[entry.reason] || '未知技能条件' }}</li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { assets } from '@/services/assets';
import { productionTypes, type ProductionType } from '@/utils/baseScheduling/data';
import type { SchedulingRoom, SchedulingRosterSource } from '@/utils/baseSchedulingInput';
import { useBaseScheduling } from './composables/useBaseScheduling';
const props = defineProps<{ source: SchedulingRosterSource | null; active: boolean }>();
const { data, loading, running, error, result, rooms, reserved, shiftCount, shiftHours, roster, operators, prepared, configError, load, generate, cancel } = useBaseScheduling(
  toRef(props, 'source'), () => new Worker(new URL('../../../workers/baseScheduling.worker.ts', import.meta.url), { type: 'module' }),
);
const labels: Record<ProductionType, string> = { manufacturing: '制造站', trading: '贸易站', power: '发电站' };
const reasons: Record<string, string> = { reserved: '已保留', 'missing-rules': '缺少技能数据', 'unsupported-template': '特殊形态尚不支持', 'ambiguous-unlock': '技能解锁条件有歧义', 'no-supported-skill': '没有已解锁的受支持技能', 'unsupported-effect': '包含尚未支持的条件或复合效果' };
const name = (id: string) => {
  const value = assets.value.getCharName(id);
  return !value || value === '未知干员' ? id : value;
};
const search = ref('');
const filteredOperators = computed(() => operators.value.filter(o => `${name(o.charId)} ${o.charId}`.includes(search.value.trim())));
const supportedCount = computed(() => new Set(prepared.value.candidates.map(c => c.charId)).size);
let nextRoom = 0;
function addRoom() { rooms.value.push({ roomId: `生产房间${++nextRoom}`, type: 'manufacturing', level: 0, slotCount: 0 }); }
const capacities = (room: SchedulingRoom) => data.value?.rooms[room.type as ProductionType] ?? [];
function setCapacity(room: SchedulingRoom) { room.slotCount = capacities(room)[room.level - 1] ?? 0; }
const assignments = (roomId: string, shift: number) => result.value?.assignments.filter(a => a.roomId === roomId && a.shift === shift) ?? [];
watch(() => props.active, active => { if (active && !data.value && !loading.value) void load(); }, { immediate: true });
</script>

<style scoped>
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 3px;
}
</style>
