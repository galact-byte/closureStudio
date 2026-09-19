import { decodeSchedulingData } from '@/utils/baseScheduling/data';
import { getArkDataUrl } from '@/utils/resource';

const MAX_BYTES = 4 * 1024 * 1024;
/** 独立按需加载，不携带账号信息，也不影响现有三张资源表。 */
export async function loadSchedulingData(signal: AbortSignal) {
  signal.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    const response = await fetch(getArkDataUrl('base_scheduling.v1.json'), {
      signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`http-${response.status}`);
    if (Number(response.headers.get('Content-Length')) > MAX_BYTES) throw new Error('response-too-large');
    if (!response.body) throw new Error('empty-response');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error('response-too-large');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    controller.signal.throwIfAborted();
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    const data = decodeSchedulingData(raw);
    const canonical = JSON.stringify({ rooms: data.rooms, operators: data.operators, skills: data.skills });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (hex !== data.payloadSha256) throw new Error('integrity-mismatch');
    controller.signal.throwIfAborted();
    return data;
  } catch (error) {
    if (timedOut) throw new Error('timeout');
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
