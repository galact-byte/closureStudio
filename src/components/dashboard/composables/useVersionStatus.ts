import { computed, onScopeDispose, ref } from 'vue';
import { checkVersion } from '@/checkVersion';

export function useVersionStatus(current: number | null) {
  const status = ref<'checking' | 'latest' | 'update-available' | 'error' | 'unknown'>('unknown');
  const latest = ref<number | null>(null);
  let request = 0;
  let controller: AbortController | null = null;
  let disposed = false;
  async function check() {
    if (disposed) return;
    const id = ++request;
    controller?.abort(); controller = new AbortController();
    status.value = 'checking';
    try {
      const value = await checkVersion(controller.signal);
      if (id !== request) return;
      latest.value = value;
      status.value = current === null ? 'unknown' : current < value ? 'update-available' : 'latest';
    } catch {
      if (id === request) status.value = 'error';
    } finally {
      if (id === request && status.value === 'checking') status.value = 'error';
    }
  }
  onScopeDispose(() => { disposed = true; request++; controller?.abort(); });
  return { status, latest, loading: computed(() => status.value === 'checking'), check };
}
