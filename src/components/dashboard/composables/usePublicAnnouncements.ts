import { computed, onScopeDispose, ref, shallowRef } from 'vue';
import { loadAnnouncements, type PublicSnapshot } from '@/services/publicAnnouncements';

export function usePublicAnnouncements(endpoint: string) {
  const data = shallowRef<PublicSnapshot | null>(null), loading = ref(false), error = ref('');
  const clock = ref(Date.now());
  let request = 0, controller: AbortController | null = null, disposed = false;
  // A local clock marks an open page stale without polling the source.
  const timer = setInterval(() => { clock.value = Date.now(); }, 60_000);
  const status = computed(() => {
    if (!endpoint) return 'disabled';
    if (!data.value) return 'unavailable';
    if (error.value) return 'stale';
    const success = data.value.lastSuccessAt;
    const reference = success ?? data.value.lastAttemptAt;
    if (reference && clock.value - Date.parse(reference) > 7_200_000) return 'stale';
    return data.value.status;
  });
  async function load() {
    if (!endpoint || disposed) return;
    const id = ++request;
    controller?.abort(); controller = new AbortController(); loading.value = true; error.value = '';
    try {
      const next = await loadAnnouncements(endpoint, controller.signal);
      if (id !== request) return;
      if (next.status === 'unavailable' && data.value?.events.length) error.value = '信息源暂不可用，保留上次快照，请稍后重试。';
      else data.value = next;
      clock.value = Date.now();
    } catch (cause) {
      if (id === request) error.value = cause instanceof Error && cause.message === 'timeout' ? '请求超时，请重试。' : '读取失败，请重试；不会影响托管操作。';
    } finally { if (id === request) loading.value = false; }
  }
  onScopeDispose(() => { disposed = true; request++; controller?.abort(); clearInterval(timer); });
  return {data, loading, error, status, load};
}
