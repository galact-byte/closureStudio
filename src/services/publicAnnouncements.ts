export type WindowKind = 'downtime' | 'brief_disconnect' | 'activity' | 'stage' | 'shop' | 'reward' | 'sale' | 'other';
export type PublicWindow = {kind: WindowKind; sectionLabel: string; startAt: string | null; endAt: string | null; timezone: 'Asia/Shanghai'; rawTimeText: string; parseStatus: 'parsed' | 'pending'};
export type PublicAnnouncement = {newsId: string; sourceUrl: string; title: string; publishedAt: string | null; fetchedAt: string; windows: PublicWindow[]};
export type PublicSnapshot = {schemaVersion: 1; generatedAt: string; lastAttemptAt: string | null; lastSuccessAt: string | null; status: 'ready' | 'partial' | 'stale' | 'unavailable'; errorCode: string | null; events: PublicAnnouncement[]};
function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid-snapshot');
  return raw as Record<string, unknown>;
}
function text(raw: unknown, max: number): string {
  if (typeof raw !== 'string' || raw.length > max) throw new Error('invalid-text');
  return raw;
}
function timestamp(raw: unknown): string {
  const value = text(raw, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+08:00)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('invalid-time');
  const local = new Date(Date.parse(value) + (value.endsWith('+08:00') ? 8 * 3600_000 : 0)).toISOString();
  if (local.slice(0, 19) !== value.slice(0, 19)) throw new Error('invalid-time');
  return value;
}
function nullableTime(raw: unknown): string | null { return raw === null ? null : timestamp(raw); }
function list(raw: unknown, max: number): unknown[] {
  if (!Array.isArray(raw) || raw.length > max) throw new Error('invalid-list');
  return raw;
}
function choice<T extends string>(raw: unknown, values: readonly T[]): T {
  const value = values.find(v => v === raw);
  if (value === undefined) throw new Error('invalid-choice');
  return value;
}
export function decodeAnnouncements(raw: unknown): PublicSnapshot {
  const root = object(raw);
  if (root.schemaVersion !== 1) throw new Error('unsupported-schema');
  return {schemaVersion: 1, generatedAt: timestamp(root.generatedAt), lastAttemptAt: nullableTime(root.lastAttemptAt), lastSuccessAt: nullableTime(root.lastSuccessAt),
    status: choice(root.status, ['ready', 'partial', 'stale', 'unavailable'] as const),
    errorCode: root.errorCode === null ? null : choice(root.errorCode, ['source_failed', 'rate_limited', 'limit_reached', 'parse_pending', 'storage_failed']),
    events: list(root.events, 100).map(rawEvent => {
      const event = object(rawEvent);
      const newsId = text(event.newsId, 100), sourceUrl = text(event.sourceUrl, 300);
      if (!/^\d+$/.test(newsId) || !/^https:\/\/ak\.hypergryph\.com\/news\/\d+(?:\.html)?$/.test(sourceUrl)) throw new Error('invalid-source');
      return {newsId, sourceUrl, title: text(event.title, 300), publishedAt: event.publishedAt === null ? null : text(event.publishedAt, 40), fetchedAt: timestamp(event.fetchedAt),
        windows: list(event.windows, 100).map(rawWindow => {
          const window = object(rawWindow);
          const startAt = nullableTime(window.startAt), endAt = nullableTime(window.endAt);
          if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) throw new Error('invalid-range');
          if (window.parseStatus === 'parsed' && (!startAt || !endAt)) throw new Error('incomplete-range');
          return {kind: choice(window.kind, ['downtime', 'brief_disconnect', 'activity', 'stage', 'shop', 'reward', 'sale', 'other'] as const),
            sectionLabel: text(window.sectionLabel, 300), startAt, endAt, timezone: choice(window.timezone, ['Asia/Shanghai'] as const),
            rawTimeText: text(window.rawTimeText, 2000), parseStatus: choice(window.parseStatus, ['parsed', 'pending'] as const)};
        })};
    })};
}

export async function loadAnnouncements(endpoint: string, signal: AbortSignal): Promise<PublicSnapshot> {
  signal.throwIfAborted();
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid-endpoint');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, {once: true});
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    const response = await fetch(url.href, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache', redirect: 'error'});
    if (!response.ok) throw new Error(`http-${response.status}`);
    if (Number(response.headers.get('Content-Length')) > 1024 * 1024) { await response.body?.cancel(); throw new Error('response-too-large'); }
    if (!response.body) throw new Error('empty-response');
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const {value, done} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 1024 * 1024) throw new Error('response-too-large');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    controller.signal.throwIfAborted();
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    return decodeAnnouncements(raw);
  } catch (error) {
    if (timedOut) throw new Error('timeout');
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
}
