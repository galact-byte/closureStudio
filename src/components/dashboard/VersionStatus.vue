<template>
  <section class="my-5 bg-info/5 shadow-md px-4 py-5 flex flex-col relative rounded-lg" aria-labelledby="version-heading">
    <h2 id="version-heading" class="font-bold text-2xl">欢迎来到可露希尔线上零售店</h2>
    <div class="mt-6 flex flex-wrap items-center gap-4 relative z-10">
      <span>当前版本：{{ version ?? '未知' }}</span>
      <span>最新版本：{{ latest ?? '未知' }}</span>
      <span role="status" aria-live="polite">{{ labels[status] }}</span>
      <button type="button" class="btn btn-outline min-h-11" :disabled="loading" @click="check">{{ loading ? '检查中…' : '重新检查' }}</button>
      <button v-if="status === 'update-available'" type="button" class="btn btn-info min-h-11" @click="refreshPage">刷新页面</button>
    </div>
    <p v-if="status === 'update-available'" class="mt-3 text-sm">发现网站更新。请先保存未提交的内容，再主动刷新；不会限制当前操作。</p>
    <img class="absolute right-0 bottom-0 w-28 md:w-36 opacity-10 rounded-t-full rounded-bl-full pointer-events-none" src="/assets/closure.ico" alt="" />
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { parseBuildVersion } from '@/checkVersion';
import { useVersionStatus } from './composables/useVersionStatus';
const version = parseBuildVersion(import.meta.env.VITE_APP_VERSION);
const { status, latest, loading, check } = useVersionStatus(version);
const labels = { checking: '正在检查版本', latest: '已是最新版本', 'update-available': '有可用更新', error: '检查失败，请重试', unknown: '当前构建版本未知' };
function refreshPage() { window.location.reload(); }
onMounted(check);
</script>
