# 修改记录 — closureStudio

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
