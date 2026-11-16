# 太阳线会员电商系统

以会员礼包为入口、以团队业绩为计酬基础的会员分销与电商一体化系统。包含**管理后台、会员端 H5、合伙人端 H5** 三套前端与一套 NestJS 后端，覆盖商品/档位/订单、五条奖金线日结、三种资产账务、双人复核审批与功能开关中心。

> 本项目为**业务系统演示与工程实现**，不含真实支付、提现与资金流出通道。上线前请务必完成合规评审与安全加固，详见 [合规声明](#14-合规声明)。

---

## 目录

- [1. 项目简介](#1-项目简介)
- [2. 核心功能](#2-核心功能)
- [3. 业务机制](#3-业务机制)
- [4. 技术栈](#4-技术栈)
- [5. 仓库结构](#5-仓库结构)
- [6. 快速开始](#6-快速开始)
- [7. 环境变量](#7-环境变量)
- [8. 数据库](#8-数据库)
- [9. 测试与质量](#9-测试与质量)
- [10. 接口规范](#10-接口规范)
- [11. 权限与审批](#11-权限与审批)
- [12. 部署](#12-部署)
- [13. 常见问题](#13-常见问题)
- [14. 合规声明](#14-合规声明)
- [15. 路线与已知待办](#15-路线与已知待办)

---

## 1. 项目简介

系统以「会员礼包」为门槛商品，会员购买后获得资格与**权益值**；通过推广获得直推奖励；团队业绩每日累加达标后**自动升级**，按职级费率获得团队奖、平级奖、领导奖，高层级另享全网分红池。

**系统边界**（明确不做的事）：

| 项 | 状态 |
|---|---|
| 退款 | 不支持，订单支付后不可退 |
| 提现 | 不支持，奖金仅可平台内消费或转给他人 |
| 资金流出 | 无，平台只有资金流入 |
| 会员间转账 | 支持（权益值 + 钱包余额） |
| 微信支付 | 预留接口占位，未接入真实商户号 |

**角色**：

| 角色 | 定义 | 收益来源 |
|---|---|---|
| 普通用户 | 已注册未购买礼包 | 无 |
| 会员 | 已购买礼包 | 权益值、直推奖 |
| 高等级会员 | 团队业绩达门槛自动升级 | 团队奖、平级奖、领导奖、分红池 |
| 运营 | 平台员工 | — |
| 合伙人 | 达到准入等级的会员 | 等级/团队/分红查看（独立端） |

---

## 2. 核心功能

### 2.1 四端

| 端 | 技术 | 端口 | 说明 |
|---|---|---|---|
| 管理后台 `apps/admin` | React 18 + Vite + Tailwind | 5174 | 深色实心卡片风格，15 个功能页面 |
| 会员端 `apps/member` | Vue 3 + Vite + Pinia + TDesign Mobile | 5173 | 底部 Tab：商城 / 分享 / 收益 / 我的 |
| 合伙人端 `apps/partner` | Vue 3 + Vite + Pinia | 5175 | 金色主题，等级 / 团队 / 收益 / 分红 |
| 后端 `apps/api` | NestJS 10 + Prisma 5 | 3000 | REST API，全局前缀 `/api` |

### 2.2 管理后台模块

工作台、档位与商品、分类、文件管理、订单（列表/详情/发货）、会员（列表/详情/团队树/等级调整/冻结/换绑审批）、奖金（日结单/五类明细/直推奖计划/分红池/手工调整）、等级（配置/升级记录/人数分布）、钱包、权益值、数权、风控、功能开关、报表、系统（配置/审计）、审批中心、日结管理。

### 2.3 会员端模块

首页、商城、商品详情、订单、档位礼包、我的等级、我的团队、收益明细、资产（钱包/权益值/数权）、推广中心、分享海报、我的（实名/地址/客服）。所有入口均可由后端功能开关独立控制，前端按 `store.has(code)` 过滤、路由守卫兜底。

---

## 3. 业务机制

### 3.1 五条收益线

| 线 | 触发条件 | 计算依据 | 频次 |
|---|---|---|---|
| 直推奖 | 推荐他人购买礼包 | 被推者礼包价 × 100% | 分 20 期释放 |
| 团队奖 | 伞下产生新增业绩 | 当日新增业绩 × 自己费率 | 日结 |
| 平级奖 | 直推下级追平或超过自己 | 下级当日团队奖 × 100% | 日结 |
| 领导奖 | 直推下级产生团队奖 | 下级当日团队奖 × 50% | 日结 |
| 分红池 | 等级为副总/总经理/总裁 | 全网业绩 × 比例 ÷ 该级人数 | 日结 |

### 3.2 三种资产

| 资产 | 来源 | 用途 | 有效期 | 可转账 | 可提现 |
|---|---|---|---|---|---|
| 权益值 | 购买/升级礼包（价 × 3） | 消费抵扣 | 12 个月 | ✅ | ❌ |
| 钱包余额 | 奖金的 70% | 消费支付 | 永久 | ✅ | ❌ |
| 数权 | 奖金的 30% | 仅记账 | — | ❌ | ❌ |

权益值采用 **FIFO 批次扣减**，每批记录 `balanceAfter`，支持批次到期与转账。

### 3.3 每日结算（日结）

默认每日 `02:00` 执行，**11 步流水线**，支持**断点续跑**与**幂等重跑**：

```
 1 生成/锁定结算批次           2 快照当日订单业绩
 3 归集群树累计业绩            4 判定并写入等级
 5 计算直推奖（分期计划）      6 计算团队奖
 7 计算平级奖（含锁定判定）    8 计算领导奖
 9 计算分红池（按级人数均分） 10 奖金拆分 70/30 入账
11 写审计与批次结果
```

重跑时用**每日快照 SUM 重算**累计业绩，不做内存叠加，避免重复计酬。

### 3.4 关键机制

- **幂等**：`IdempotencyKey` 表 + 唯一约束，重复请求返回首次结果。
- **快照一致性**：日结基于当日快照，重跑不叠加。
- **断点续跑**：批次步骤状态落库，异常后可从失败步骤继续。
- **双人复核**：等级手工调整、奖金手工调整、日结重跑需「运营申请 → 财务复核」；超管直通；**不可自审**。
- **功能开关中心**：前端 `store.has()` + 路由守卫，后端 `assertEnabled` 二次校验，切换写审计日志、立即生效。
- **对账**：每日 `04:00` 账务对账（`RECONCILE_HOUR`）。

### 3.5 系统架构

```mermaid
flowchart LR
  subgraph 前端
    A1[管理后台<br/>React 5174]
    A2[会员端 H5<br/>Vue3 5173]
    A3[合伙人端 H5<br/>Vue3 5175]
  end
  subgraph 后端["后端 API · NestJS :3000"]
    B1[鉴权 / 权限守卫]
    B2[业务模块<br/>user order catalog<br/>settlement bonus equity<br/>wallet transfer token]
    B3[审批 / 调整 / 审计]
  end
  subgraph 数据层
    C1[(PostgreSQL 55432)]
    C2[(Redis 6379)]
    C3[对象存储目录<br/>uploads]
  end
  A1 & A2 & A3 --> B1 --> B2 --> B3
  B2 --> C1
  B2 --> C2
  B3 --> C1
```

---

## 4. 技术栈

| 层 | 选型 |
|---|---|
| 后端 | NestJS 10、Prisma 5、PostgreSQL 16、Redis 7、BullMQ、Passport JWT、class-validator |
| 管理后台 | React 18、Vite 5、Tailwind CSS 3、React Router 6、Recharts、TDesign React、lucide-react |
| 会员端 | Vue 3、Vite 5、Pinia、Vue Router 4、TDesign Mobile Vue、Sass |
| 合伙人端 | Vue 3、Vite 5、Pinia、Vue Router 4 |
| 共享包 | `@solar/shared`：错误码、枚举、档位/等级/配置种子、功能开关定义（前后端共用，禁止硬编码业务数值） |
| 工程化 | pnpm workspace、TypeScript 5.6、Vitest、Docker Compose |

---

## 5. 仓库结构

```
.
├── apps/
│   ├── api/                 # NestJS 后端
│   │   ├── prisma/          # schema.prisma / migrations / seed.ts
│   │   ├── scripts/smoke.ts # 端到端烟雾脚本（20 项）
│   │   ├── src/             # 26 个业务模块
│   │   └── test/            # Vitest 单元测试
│   ├── admin/               # 管理后台（React）
│   ├── member/              # 会员端 H5（Vue3）
│   └── partner/             # 合伙人端 H5（Vue3）
├── packages/shared/         # 前后端共享常量与类型
├── docs/                    # 完整架构文档
├── docker-compose.yml       # postgres + redis
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 6. 快速开始

### 6.1 环境要求

- Node.js **≥ 20**
- pnpm **≥ 9**
- Docker Desktop（用于 PostgreSQL / Redis）

### 6.2 启动步骤

```bash
# 1. 安装依赖
pnpm install

# 2. 准备环境变量（后端 + 根目录各一份）
cp apps/api/.env.example apps/api/.env
cp .env.example .env

# 3. 启动数据库（postgres + redis）
pnpm db:up

# 4. 初始化数据库结构 + 生成 Prisma Client + 写入种子数据
pnpm db:push
pnpm db:generate
pnpm db:seed
```

另开终端启动各端：

```bash
pnpm dev:api      # http://localhost:3000/api
pnpm dev:admin    # http://localhost:5174
pnpm dev:member   # http://localhost:5173
pnpm dev:partner  # http://localhost:5175
```

### 6.3 端口一览

| 服务 | 端口 | 备注 |
|---|---|---|
| 后端 API | 3000 | 全局前缀 `/api` |
| 管理后台 | 5174 | |
| 会员端 H5 | 5173 | |
| 合伙人端 H5 | 5175 | |
| PostgreSQL | **55432** | 刻意避开本机常用 5432，可在 `.env` 调整 |
| Redis | 6379 | |

### 6.4 演示账号

密码统一为 `123456`。

| 端 | 账号 | 说明 |
|---|---|---|
| 管理后台 | `13800138000` | 管理员 |
| 会员端 | `13900000001` ~ `13900000004` | 种子会员 |

---

## 7. 环境变量

### 7.1 根目录 `.env`（Docker Compose 读取）

| 变量 | 默认 | 说明 |
|---|---|---|
| `POSTGRES_USER` | `solar` | 数据库用户 |
| `POSTGRES_PASSWORD` | `solar_dev_2026` | 数据库密码 |
| `POSTGRES_DB` | `solar_member` | 库名 |
| `POSTGRES_PORT` | `55432` | 宿主机映射端口 |
| `REDIS_PORT` | `6379` | Redis 映射端口 |

### 7.2 后端 `apps/api/.env`

| 变量 | 示例 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://solar:solar_dev_2026@127.0.0.1:55432/solar_member?schema=public` | 必须与 `POSTGRES_PORT` 保持一致 |
| `REDIS_HOST` / `REDIS_PORT` | `127.0.0.1` / `6379` | |
| `API_PORT` | `3000` | |
| `JWT_SECRET` | — | **生产必须替换为长随机串** |
| `JWT_EXPIRES_IN` | `7d` | Token 有效期 |
| `H5_BASE_URL` | `http://localhost:5173` | 邀请链接等场景使用 |

> ⚠️ `.env` 已被 `.gitignore` 排除，仓库中仅保留 `.env.example` 占位模板。

---

## 8. 数据库

### 8.1 修改 schema 的正确流程

Windows 下 PostgreSQL 会占用 `prisma/db push` 所需的 DLL，**必须先停掉 3000 端口的 API 进程**再执行：

```bash
# 停掉运行中的 API（Windows 示例）
# 任务管理器结束 node.exe，或：
#   Get-Process node | Stop-Process -Force

pnpm db:push        # 同步 schema
pnpm db:generate    # 生成 Prisma Client
pnpm db:seed        # 写入演示数据（含序列校正）
```

### 8.2 数据模型

当前 Prisma 运行模型 **34 张**，核心域：

- 用户与关系：`User`、`UserAuth`、`UserAddress`
- 商品：`Package`、`ProductCategory`、`Product`、`ProductPackage`、`FileAsset`
- 订单与业绩：`Order`、`OrderItem`、`OrderPerformance`、`TeamPerformance`
- 资产：`EquityAccount`、`EquityLot`、`EquityTransaction`、`EquityTransfer`、`Wallet`、`WalletTransaction`、`WalletTransfer`、`TokenLot`
- 奖金：`BonusPlan`、`BonusStage`、`BonusRecord`、`Dividend`
- 等级：`Rank`、`RankLog`、`RankSnapshot`
- 治理：`Config`、`FeatureFlag`、`AuditLog`、`IdempotencyKey`、`RiskEvent`、`SettleBatch`、`Approval`

字段级定义见 `apps/api/prisma/schema.prisma`，业务口径见 `docs/太阳线会员系统-完整架构文档.md`。

---

## 9. 测试与质量

```bash
pnpm test           # 各包单元测试（当前 16/16 通过）
pnpm smoke          # API 端到端烟雾脚本（当前 20/20 通过）
pnpm build          # 全量构建
```

- 结算纯函数已抽离至 `apps/api/src/settlement/engines.ts`，覆盖除零、平级锁定、70/30 拆分等边界。
- 烟雾脚本覆盖登录、下单、日结、审批流、转账、功能开关等关键链路。

---

## 10. 接口规范

统一响应结构：

```json
{ "code": 0, "message": "ok", "data": {}, "traceId": "..." }
```

| code 区间 | 含义 |
|---|---|
| `0` | 成功 |
| `1001–1099` | 参数校验 |
| `2001–2099` | 鉴权 / 权限（含 `2005` 功能未开启） |
| `3001–3099` | 业务拒绝（余额不足、状态冲突、风控拒绝等） |
| `4001–4099` | 资源不存在 |
| `5000` | 系统错误 |

示例：

```bash
POST /api/orders
{ "type": 1, "packageId": 2, "useEquity": true, "useBalance": true }
```

---

## 11. 权限与审批

| 功能 | 超管 | 运营 | 财务 | 客服 |
|---|---|---|---|---|
| 查看会员 | ✅ | ✅ | ✅ | ✅ |
| 等级手工调整 | ✅ | 申请 | 复核 | ❌ |
| 奖金手工调整 | ✅ | 申请 | 复核 | ❌ |
| 日结重跑 | ✅ | 申请 | 复核 | ❌ |
| 转账风控审核 | ✅ | ✅ | ❌ | ❌ |
| 功能开关配置 | ✅ | ❌ | ❌ | ❌ |
| 等级配置 | ✅ | ❌ | ❌ | ❌ |
| 查看报表 | ✅ | ✅ | ✅ | 仅业绩 |
| 系统配置 | ✅ | ❌ | ❌ | ❌ |

合伙人端独立准入：默认要求等级 ≥ Lv.1（配置项 `access.partner_min_level`），未达标访问会被拒绝。

---

## 12. 部署

1. 构建：`pnpm build`
2. 后端以 `node dist/main.js` 方式常驻运行（容器内推荐 PM2 或直接 `node`）。
3. 前端为纯静态产物，交由 Nginx / CDN / 对象存储托管。
4. 生产环境必须：替换 `JWT_SECRET`、关闭演示账号、配置真实对象存储、接入 HTTPS。
5. 数据库建议使用托管 PostgreSQL，并配置定时备份与日结监控告警。

---

## 13. 常见问题

**Q：`pnpm db:push` 报 DLL / 数据库文件被占用？**
Windows 上 3000 端口的 API 进程持有 PostgreSQL 客户端 DLL，先停止 API 再执行 `db:push`。

**Q：Docker Compose 提示项目名异常或冲突？**
中文路径会导致 Compose 默认项目名异常，建议显式指定：

```bash
docker compose -p solar up -d postgres redis
```

**Q：端口 5432 被本机 PostgreSQL 占用？**
本系统默认使用 **55432**。如需改回，同时修改根目录 `.env` 的 `POSTGRES_PORT` 与 `apps/api/.env` 的 `DATABASE_URL`。

**Q：修改了 schema 后前端类型不更新？**
执行 `pnpm db:generate`，Prisma Client 与相关类型会重新生成。

**Q：登录提示「手机号或密码错误」？**
确认已执行 `pnpm db:seed`，且密码为 `123456`；若仍失败，检查 `UserAuth` 表是否存在对应记录。

---

## 14. 合规声明

本系统实现了团队计酬、分级费率、分红池等机制。此类模式在多数司法辖区受严格监管，**可能被认定为传销或非法金融活动**。

- 本系统**仅用于技术学习与工程演示**，不构成任何商业运营建议。
- 系统**不含**真实支付、提现、资金流出通道，不存在资金归集。
- 任何单位或个人若拟将其用于真实业务，**须自行完成法律合规评估**，取得相应资质，并对全部法律后果负责。
- 项目中所有数据均为**演示种子数据**，不含任何真实个人信息。

---

## 15. 路线与已知待办

**已实现**：四端骨架与核心业务链路、日结引擎、审批流、功能开关、商品与文件管理、烟雾与单元测试。

**待完善**：

- 管理端会员管理增强：账号/密码重置、推荐人（上级）编辑与换绑、状态与等级的批量操作
- 监控告警与对账异常通知
- 微信支付真实接入（当前为占位）
- 订单超时自动关闭 / 自动确认收货
- 敏感字段加密存储（AES）
- 幂等键由前端统一注入
- APP 原生端方案与桥接能力（规划中；当前渠道为 H5）
- 结算引擎性能压测与大数据量验证

---

## 许可

本项目为私有项目，未经授权请勿用于商业用途。
