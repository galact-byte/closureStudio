jest.mock('@/constants/api', () => ({ VERSION_API_URL: 'https://version.test' }));
jest.mock('axios');
import axios from 'axios';
import { checkVersion, parseBuildVersion } from './checkVersion';

test.each([undefined, '', ' ', '-1', '1.5', 'NaN', '9007199254740992', 'v1', null])('当前构建 %s 无效而不是0', value => {
  expect(parseBuildVersion(value)).toBeNull();
});
test('接受非负安全整数构建', () => { expect(parseBuildVersion('123')).toBe(123); expect(parseBuildVersion('0')).toBe(0); });
test.each(['1', -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null, undefined])('拒绝接口非法版本 %s', async version => {
  jest.mocked(axios.get).mockResolvedValue({ data: { version } });
  await expect(checkVersion()).rejects.toThrow();
});
test('检查版本有超时并传递取消，不刷新页面', async () => {
  jest.mocked(axios.get).mockResolvedValue({ data: { version: 4 } });
  const controller = new AbortController();
  expect(await checkVersion(controller.signal)).toBe(4);
  expect(axios.get).toHaveBeenLastCalledWith('https://version.test', expect.objectContaining({ timeout: 15000, signal: controller.signal }));
});
