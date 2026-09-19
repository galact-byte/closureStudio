<template>
  <section class="my-5 rounded-lg bg-base-300 p-4" aria-labelledby="public-announcements-heading">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="public-announcements-heading" class="text-xl font-bold">国服运维与活动时间</h2>
      <button v-if="endpoint" type="button" class="btn btn-outline min-h-11" :disabled="loading" @click="load">{{ loading ? '读取中…' : '重新读取' }}</button>
    </div>
    <p class="mt-3" role="status" aria-live="polite">{{ labels[status] }}</p>
    <p v-if="error" class="mt-2">{{ error }}</p>
    <template v-if="data">
      <p class="mt-2 text-sm">最近采集：{{ formatTime(data.lastAttemptAt) }} · 最后完整成功：{{ formatTime(data.lastSuccessAt) }}</p>
      <p v-if="data.errorCode" class="mt-2 text-sm">{{ errors[data.errorCode] ?? '信息需要核实，请查看官网。' }}</p>
      <p v-if="status === 'ready' && !data.events.length" class="mt-3">本次采集范围内暂无活动时间信息。</p>
      <ul class="mt-4 space-y-4">
        <li v-for="event in data.events" :key="event.newsId" class="border-t border-base-content/20 pt-3 break-words">
          <a class="link link-info inline-flex min-h-11 items-center" :href="event.sourceUrl" target="_blank" rel="noopener noreferrer">{{ event.title }}（官网原文）</a>
          <p class="text-sm">此公告采集：{{ formatTime(event.fetchedAt) }}</p>
          <ul class="mt-2 space-y-3">
            <li v-for="(window, index) in event.windows" :key="index">
              <p class="font-semibold">{{ kinds[window.kind] }} · {{ window.sectionLabel }}</p>
              <p v-if="window.parseStatus === 'pending'">待核实，请以官网原文为准</p>
              <p v-else>{{ formatTime(window.startAt) }} 至 {{ formatTime(window.endAt) }} <span v-if="window.endAt && Date.parse(window.endAt) < Date.now()">（计划窗口已结束）</span></p>
              <details class="mt-1"><summary class="cursor-pointer min-h-11 flex items-center">原始时间证据</summary><p class="whitespace-pre-wrap select-text">{{ window.rawTimeText }}</p></details>
            </li>
          </ul>
        </li>
      </ul>
    </template>
    <p class="mt-4 text-sm">时间均为 UTC+8（北京时间）。仅覆盖规则支持及有界采集范围；计划维护结束不代表服务已恢复。此面板不会控制游戏登录或托管。</p>
  </section>
</template>
<script setup lang="ts">
import { onMounted } from 'vue';
import { usePublicAnnouncements } from './composables/usePublicAnnouncements';
const endpoint = import.meta.env.VITE_PUBLIC_ANNOUNCEMENTS_URL?.trim() ?? '';
const {data, loading, error, status, load} = usePublicAnnouncements(endpoint);
const labels = {disabled: '公开公告信息源未启用。', unavailable: '暂无可用快照，不能据此判断当前无维护或活动。', ready: '采集正常', partial: '部分信息不完整或待核实', stale: '数据已陈旧，请核对官网并重试'};
const kinds = {downtime: '停机维护', brief_disconnect: '闪断更新', activity: '活动', stage: '关卡', shop: '商店', reward: '领奖', sale: '售卖', other: '其他'};
const errors: Record<string, string> = {source_failed: '官网读取失败。', rate_limited: '官网限流，采集将在退避后重试。', limit_reached: '已达到采集或展示上限，信息可能不全。', parse_pending: '部分章节格式暂不支持，请核实原文。', storage_failed: '快照暂不可用。'};
function formatTime(value: string | null) {
  if (!value) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(value));
}
onMounted(load);
</script>
