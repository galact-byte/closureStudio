# 修改记录 — closureStudio

## 2026-09-19 — 公开运维信息与可恢复升级提醒（本地实现，未发布）

- 仪表盘新增 `PublicAnnouncements.vue`，保留原网站公告；展示官网来源、章节时间、待核实、最近采集/最后完整成功及陈旧状态。
- 新增 `services/publicAnnouncements.ts` 与 composable：可选构建配置 `VITE_PUBLIC_ANNOUNCEMENTS_URL`，匿名HTTPS读取、15秒超时、1MiB流限额、schema/官方来源/日期校验、失败保留与重试、旧响应及卸载隔离。
- 重写 `VersionStatus.vue` 状态接线，新增 `useVersionStatus.ts`；版本限非负安全整数，未知不当0，旧版检查结束loading，刷新仅用户点击触发，无自动循环或游戏操作阻断。
- 配套 ark-control-api 新增独立公开快照D1迁移、采集/章节解析、匿名 `GET /public/announcements` 与独立小时Alarm；原维护控制和管理员鉴权不变。
- 验证：前端31套件290测试、类型、变更文件lint、构建通过；后端112单测+14 Worker集成、迁移一致性、类型/lint/构建通过。后端全仓格式检查有既有基线失败，新模块格式通过。
- 浏览器真实组件＋全量外网mock：375/768/1440无横溢出，键盘检查、版本失败重试、公告失败保留/空/陈旧、用户主动刷新通过。未认证完整登录/托管E2E、真实官网布局或线上接口。
- 证据与后续：工作区 `.trellis/tasks/09-19-ops-config-research/verification.md`。未提交、推送、部署、真实调度、通知或远程迁移。
- 回滚：关闭新面板配置/接线，再撤销新后端公开路由与job；原维护链不动，独立新表保留。网站最低版本强限制和远程开关管理不在本阶段。

## 2026-09-19 — 独立基建排班建议（本地验收，尚未发布）

### 背景与目标
- 游戏详情新增可实际生成、查看的只读生产排班建议；自动加载基建资源，不要求用户编写或导入JSON，不复用一图流实现。

### 影响与兼容性
- 增加按需资源`/data/base_scheduling.v1.json`，由配套ArknightsGamedataPure生成/上传链供给；真实上传尚未执行，资源未发布时显示错误和重试。
- 不改变原API、认证、缓存或自动基建开关含义；计算在浏览器Worker中完成，不提交游戏配置。
- 回滚：移除GameDetailView新面板接线和新增排班模块；保留baseSchedulingInput。配套工作流可独立撤回新增生成/上传项；原三张表不变。无数据库迁移。

### 文件与实现
| 操作 | 路径 | 说明 |
|---|---|---|
| 新增 | src/utils/baseScheduling/ | 资源解码、白名单技能、最大流优先填岗/最小费用匹配、独立结果检查、取消生命周期及测试 |
| 新增 | src/services/baseSchedulingData.ts / .test.ts | 匿名加载、4MiB限额、15秒超时、schema和摘要检查 |
| 新增 | src/workers/baseScheduling.worker.ts | 独立计算，不携带账号或完整详情 |
| 新增 | src/components/dashboard/game/BaseSchedulingPanel.vue | 布局/班次/保留人员、结果、缺员和限制 |
| 新增 | src/components/dashboard/game/composables/useBaseScheduling.ts / .test.ts | 请求/结果版本隔离、取消、卸载与失效 |
| 修改 | src/views/dashboard/game/GameDetailView.vue | 完整详情响应接入，按账号重建面板 |

### 验证
- `.tmp`隔离副本全量产品Jest：27套件、261测试通过；额外本地游戏表探针1测试通过。
- `pnpm run typeCheck`、变更文件ESLint、`pnpm run build`通过。
- 真实组件＋真实Worker＋本地模拟详情/资源：正常、缺员、保留、404/坏数据重试、取消重算、账号切换、倒序返回及375/768/1440宽度检查通过；不是正式登录或线上验收。
- 配套数据生成器8测试通过；追加生成前后原三张表SHA-256不变。
- 证据在工作区`.trellis/tasks/09-19-independent-base-scheduling/verification.md`及`evidence/`。

### 已知限制与后续
- 首版仅支持三类无条件固定生产加成；本地429干员满练度样本可识别49人，不等于完整技能覆盖。
- 每人每周期最多一个班次；心情、长期循环、全基建联动、真实收益、供电约束未认证；不自动换班。
- 托管游戏数据的使用条件仍需核实。未上传、部署、推送；上线须单独批准。
