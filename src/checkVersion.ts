import axios from 'axios';
import { VERSION_API_URL } from '@/constants/api';

export function parseBuildVersion(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) && version >= 0 ? version : null;
}

export async function checkVersion(signal?: AbortSignal): Promise<number> {
  const response = await axios.get<unknown>(VERSION_API_URL, { timeout: 15000, signal });
  const data = response.data;
  if (!data || typeof data !== 'object' || !('version' in data) || typeof data.version !== 'number' || !Number.isSafeInteger(data.version) || data.version < 0) {
    throw new Error('invalid-version');
  }
  return data.version;
}
