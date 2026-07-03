# Toonflow-app

## 当前工作方式

- `master`：只跟官方开源项目
- `custom/local-work`：只放我的二开改动
- 平时开发：一直在 `custom/local-work`
- 官方更新：先同步到 `master`，再 rebase 到 `custom/local-work`

## 快速命令

### 一次性更新

```bash
git checkout master
cd waoowaoo && git remote add upstream https://github.com/HBAI-Ltd/Toonflow-app && git fetch upstream

git fetch upstream
git merge upstream/master
git checkout custom/local-work
git rebase master
```

### 推送自己的分支

```bash
git push origin custom/local-work
```

---

## 🚀 快速开始

### 前置依赖

| 工具 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | 23.11.1+ | 运行后端服务 |
| Yarn | 1.x | 包管理器 |
| Docker（可选）| 20.10+ | 容器化部署 |

### 方式一：本机安装包（推荐普通用户）

1. 从 [GitHub Releases](https://github.com/HBAI-Ltd/Toonflow-app/releases) 下载对应系统安装包
2. 安装并启动
3. 默认账号：`admin` / `admin123`
4. 进入「设置中心」配置模型供应商

> macOS 用户：需在「系统设置 → 隐私与安全性」中允许运行

### 方式二：开发环境启动

```bash
git clone https://github.com/HBAI-Ltd/Toonflow-app.git
cd Toonflow-app
yarn install

# 仅启动后端 API（端口 10588，无前端页面）
yarn dev

# 启动 Electron 桌面客户端（后端 + 内置前端，推荐开发用）
yarn dev:gui
```

访问 `http://localhost:10588/index.html`（Docker/服务器模式）或直接使用 Electron 窗口。

### 方式三：Docker 部署

```bash
git clone https://github.com/HBAI-Ltd/Toonflow-app.git
cd Toonflow-app

# 本地构建并启动
yarn docker:local

# 或手动构建
docker build -t toonflow .
docker run -d -p 10588:10588 -v $(pwd)/data:/app/data toonflow
```

### 方式四：云端服务器部署（PM2）

```bash
# 安装 Node.js 24 + Yarn + PM2
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 24
npm install -g yarn pm2

# 部署
cd /opt && git clone https://github.com/HBAI-Ltd/Toonflow-app.git
cd Toonflow-app && yarn install && yarn build

# 创建 pm2.json 并启动
pm2 start pm2.json
pm2 startup && pm2 save
```

**pm2.json 示例：**

```json
{
  "name": "toonflow-app",
  "script": "data/serve/app.js",
  "instances": "max",
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "prod",
    "PORT": 10588,
    "OSSURL": "http://127.0.0.1:10588/"
  }
}
```

---

## ⚙️ 系统配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境（`dev` / `prod`）| 自动检测 |
| `PORT` | 服务监听端口 | `10588` |
| `OSSURL` | 文件存储访问地址（静态资源） | `http://127.0.0.1:10588/` |

> 数据文件（SQLite 数据库、上传文件）默认存储在 `data/` 目录，Docker 部署时挂载此目录持久化数据。

### 模型供应商配置（设置中心）

启动后进入「设置中心」，配置以下模型：

| 模型类型 | 用途 | 支持供应商 |
|---------|------|-----------|
| 文本/LLM | 剧本生成、Agent 决策 | OpenAI、Anthropic、DeepSeek、通义千问、智谱、MiniMax、xAI 等 |
| 图像模型 | 分镜图生成 | GPT Image 2、Nano Banana Pro 等 |
| 视频模型 | 视频片段生成 | Seedance 2.0、豆包视频、Sora 等 |

> 供应商逻辑支持在设置中心直接编写 TypeScript 代码并即时生效，无需重启。

---

## 🏗️ 整体架构

### 1. 技术栈

| 层次 | 技术 |
|------|------|
| 后端框架 | Express 5 |
| 语言 | TypeScript 5.x |
| 数据库 | SQLite（better-sqlite3 + knex）|
| AI 集成 | Vercel AI SDK（多供应商统一接口）|
| 本地推理 | @huggingface/transformers（ONNX 向量检索）|
| 实时通信 | Socket.IO |
| 桌面客户端 | Electron 40 |
| 图像处理 | Sharp |
| 容器化 | Docker |

### 2. 目录结构

```text
Toonflow-app/
├── src/
│   ├── app.ts              # 服务入口（Express + Socket.IO 初始化）
│   ├── router.ts           # 自动生成的路由注册表
│   ├── core.ts             # 路由构建器（dev 模式动态扫描）
│   ├── env.ts              # 环境变量初始化（Electron 兼容）
│   ├── agents/             # AI Agent 核心逻辑
│   │   ├── scriptAgent/    # 剧本 Agent（统筹角色）
│   │   └── productionAgent/# 制作 Agent（视频策划角色）
│   ├── routes/             # REST API 路由（按业务模块分目录）
│   │   ├── assets/         # 素材管理（角色/场景/道具/音频）
│   │   ├── novel/          # 原著管理 + 章节事件提取
│   │   ├── login/          # 认证
│   │   ├── modelSelect/    # 模型供应商管理
│   │   └── ...             # 其他业务路由
│   ├── socket/             # Socket.IO 实时通信
│   │   ├── index.ts        # 命名空间注册
│   │   ├── resTool.ts      # 消息构建工具（流式输出封装）
│   │   └── routes/
│   │       ├── scriptAgent.ts     # /api/socket/scriptAgent
│   │       └── productionAgent.ts # /api/socket/productionAgent
│   ├── lib/                # 工具库（LLM 调用、OSS、DB 等）
│   ├── middleware/         # Express 中间件（鉴权、参数校验）
│   └── types/              # TypeScript 类型定义
├── data/                   # 运行时数据（SQLite DB、上传文件、构建产物）
├── scripts/                # 构建脚本（Electron 主进程、打包）
└── docs/                   # 文档资源
```

### 3. 整体架构分层

```text
前端（Toonflow-web / Electron 内置）
  ↓ HTTP REST + Socket.IO
Express 服务层（router.ts 注册所有路由）
  ↓
业务路由层（routes/）
  ├── 普通 CRUD → 直接操作 SQLite（knex）
  └── AI 任务 → 调用 agents/
       ↓
Agent 层（scriptAgent / productionAgent）
  ├── 决策层：runDecisionAI（LLM 决策工具调用）
  ├── 执行层：工具函数（生图、生视频、写 DB）
  └── 监督层：质量审阅与修订
       ↓
Vercel AI SDK（统一多供应商 LLM 接口）
  ↓
外部模型 API（OpenAI / Anthropic / DeepSeek / 通义 / 视频模型等）
```

### 4. Socket.IO 实时通信机制

Agent 执行过程通过 Socket.IO 流式推送到前端，命名空间：

| 命名空间 | 用途 |
|---------|------|
| `/api/socket/scriptAgent` | 剧本 Agent（统筹角色）|
| `/api/socket/productionAgent` | 制作 Agent（视频策划角色）|

**连接鉴权**：握手时携带 `auth.token`（JWT）和 `auth.isolationKey`（会话隔离键）。

**消息协议**（由 [`ResTool`](src/socket/resTool.ts) 封装）：

```text
socket.emit("message", { id, role, name, status, content: [] })
  ↓ 流式追加内容
socket.emit("content:add", { messageId, content: { type, id, data } })
socket.emit("content:update", { messageId, contentId, type, data, strategy, status })
  ↓ 完成
socket.emit("message:update", { id, status: "complete" })
```

支持的内容类型：`text`、`markdown`、`thinking`（自动解析 `<think>` 标签）、`image`、`search`、`suggestion`、`toolcall`、`activity`、`reasoning`

### 5. 核心业务流程

```text
1. 导入原著
   ↓ POST /api/novel/addNovel
   ↓ 章节事件提取（generateEvents）→ 结构化存储事件图谱

2. ScriptAgent（剧本生成）
   ↓ Socket /api/socket/scriptAgent → chat 事件
   ↓ runDecisionAI → 工具调用（生成故事骨架、改编策略、结构化剧本）
   ↓ 流式推送进度到前端

3. ProductionAgent（制作策划）
   ↓ Socket /api/socket/productionAgent → chat 事件
   ↓ runDecisionAI → 工具调用（分镜规划、素材生成、视频合成）
   ↓ 流式推送进度到前端

4. 素材管理
   ↓ REST /api/assets/* → 角色/场景/道具/音频 CRUD
   ↓ 图像生成：/api/assetsGenerate/* → 调用图像模型 API
   ↓ 轮询状态：pollingImageAssets / pollingPromptAssets

5. 视频合成
   ↓ cornerScape 路由 → 绑定音频、合成视频片段
   ↓ 导出最终视频
```

### 6. 素材（Assets）数据模型

素材表 `o_assets` 支持父子层级结构：

| 字段 | 说明 |
|------|------|
| `type` | `role`（角色）/ `scene`（场景）/ `tool`（道具）/ `audio`（音频）|
| `assetsId` | 父素材 ID（null 为父级，非 null 为子级变体）|
| `imageId` | 关联图片记录 |
| `projectId` | 所属项目 |

查询时父子一起返回，子素材挂在父素材的 `sonAssets` 字段下。

---

## 🧩 Agent 详细架构

### 三层嵌套调用结构

```text
决策层（runDecisionAI）
  ↓ Tool Call 派发任务
执行层（createSubAgent 中的各子 Agent）
  ↓ 输出 XML 写入工作区
监督层（run_supervision_agent）
  ↓ 审阅修订
```

**决策层**：主 LLM 调用，读取项目上下文 + 记忆，通过 Tool Call 决定调用哪个子 Agent，本身不直接执行业务。

**执行层**：每种具体任务对应一个子 Agent 工具，独立读取对应 Markdown Skill 文件作为 System Prompt，单独调用一次 LLM，输出 XML 格式写入工作区：

| 子 Agent | 职责 | Skill 文件 |
|---------|------|-----------|
| `storySkeletonAgent` | 故事骨架 | `script_execution_skeleton.md` |
| `adaptationStrategyAgent` | 改编策略 | `script_execution_adaptation.md` |
| `scriptAgent` | 剧本生成 | `script_execution_script.md` |
| `directorPlanAgent` | 拍摄计划 | `production_execution_director_plan.md` |
| `storyboardPanelAgent` | 分镜面板写入 | `production_execution_storyboard_panel.md` |
| `storyboardTableAgent` | 分镜表构建 | `production_execution_storyboard_table.md` |
| `storyboardGenAgent` | 分镜图生成 | `production_execution_storyboard_gen.md` |
| `deriveAssetsAgent` | 衍生资产分析 | `production_execution_derive_assets.md` |
| `generateAssetsAgent` | 衍生资产图片生成 | `production_execution_generate_assets.md` |

**监督层**：`supervisionAgent`，读取 `*_agent_supervision.md`，专门负责质量审阅与修订。

### 记忆系统（Memory + ONNX）

`Memory` 类实现三层记忆召回，每次决策前自动注入上下文：

| 类型 | 实现 | 用途 |
|------|------|------|
| `shortTerm` | SQLite 最近 N 条未总结消息 | 近期对话原文 |
| `summaries` | 每 N 条消息触发 LLM 压缩一次摘要 | 中期记忆压缩 |
| `rag` | ONNX 向量化 + 余弦相似度搜索 | 语义相关历史检索 |

**ONNX 模型（`all-MiniLM-L6-v2`）的作用**：把每条消息和每次查询转成 384 维向量存入 SQLite，检索时按余弦相似度排序，召回最相关的历史记忆喂给决策层。它不替代远程 LLM API，只负责记忆的语义索引，完全本地运行，无需 API Key。

### Skill 懒加载机制（productionAgent）

`createArtSkills()` 扫描 `art_skills/<画风>/driector_skills/*.md`，只把 Skill 名称和描述列给 LLM，LLM 需要时再调用 `activate_skill` 工具按需加载完整 Skill 内容——避免把所有 Prompt 堆满上下文。

### 关键设计特点

- **每个子 Agent 是一次独立 LLM 调用**，父 Agent 通过 Tool Call 返回值拿到结果
- **XML 结构化输出**：子 Agent 输出 `<scriptItem>` / `<storyboardItem>` 等 XML，由 `tools.ts` 解析后写入 DB
- **AbortController 贯穿所有层**：前端 `stop` 事件可立即中止任意层级的 LLM 调用
- **isolationKey 会话隔离**：Memory 按 `agentType + isolationKey` 分区，多用户并发不串扰

---

## 🔑 Agent 快速说明

| Agent | Socket 命名空间 | 角色 | 核心能力 |
|-------|---------------|------|---------|
| `scriptAgent` | `/api/socket/scriptAgent` | 统筹 | 故事骨架、改编策略、结构化剧本生成 |
| `productionAgent` | `/api/socket/productionAgent` | 视频策划 | 分镜规划、素材调度、视频合成编排 |

两个 Agent 均支持：
- `chat` 事件：发送用户消息，触发 AI 决策
- `stop` 事件：中止当前生成（AbortController）
- `updateThinkConfig` 事件：切换思考模式（think: true/false，thinlLevel: 0-3）
- `updateContext` 事件（productionAgent）：切换当前项目/剧本上下文

---

## ❓ 常见问题

**Q: 启动后访问 `http://localhost:10588` 看不到页面？**  
A: `yarn dev` 只启动后端 API，无前端。需要用 `yarn dev:gui`（Electron）或单独部署 [Toonflow-web](https://github.com/HBAI-Ltd/Toonflow-web) 前端，或使用 Docker 方式（内置前端）。

**Q: 数据存在哪里？**  
A: 本机安装包存在 Electron `userData` 目录；Docker/服务器模式存在 `data/` 目录。迁移时备份整个 `data/` 即可。

**Q: 如何添加新的模型供应商？**  
A: 进入「设置中心 → 供应商管理」，直接编写 TypeScript 供应商逻辑，保存后即时生效，无需重启服务。

**Q: Agent 生成卡住了怎么办？**  
A: 发送 `stop` 事件中止当前生成，或刷新页面重新连接 Socket。

**Q: macOS 安装包无法打开？**  
A: 前往「系统设置 → 隐私与安全性 → 安全性」，点击「仍要打开」。参考：[知乎解决方案](https://www.zhihu.com/question/433389276)

---

## 🧠 关键设计约定

- **路由自动生成**：`router.ts` 由 `core.ts` 在 dev 模式下扫描 `routes/` 目录自动生成，生产构建时静态化
- **SQLite 单文件数据库**：无需额外数据库服务，适合桌面客户端和轻量部署
- **isolationKey 会话隔离**：每个 Socket 连接携带 `isolationKey`，Agent 内存和上下文按此隔离，支持多用户并发
- **Vercel AI SDK 统一接口**：所有 LLM 调用通过 AI SDK 抽象，切换供应商只需改配置
- **ONNX 本地向量检索**：Agent 记忆系统使用 `@huggingface/transformers` 在本地运行 ONNX 模型，无需外部向量数据库
- **Skill 文件化**：Agent 提示词外化为 Markdown Skill 文件，支持在线编辑，不改源码即可调优

---

## 📊 项目评估

### 功能完整度

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| 原著导入 + 章节事件提取 | ✅ 完整 | 结构化事件图谱，精准上下文调用 |
| ScriptAgent 剧本生成 | ✅ 完整 | 故事骨架、改编策略、结构化剧本，三层 Agent 协作 |
| ProductionAgent 制作策划 | ✅ 完整 | 无限画布，分镜/素材/视频节点化编排 |
| 角色/场景/道具素材 | ✅ 完整 | CRUD + AI 生成 + 批量生成 + 轮询状态 |
| 图像生成 | ✅ 完整 | 支持 GPT Image、Nano Banana Pro 等 |
| 视频生成 | ✅ 完整 | 支持 Seedance、豆包视频、Sora 等 |
| TTS 音频 / 配音 | ✅ 完整 | cornerScape 音频绑定 |
| 画风管理 | ✅ 完整 | artStyle 路由，多画风切换 |
| 持久化 Agent 记忆 | ✅ 完整 | ONNX 本地向量检索，跨会话记忆 |
| 多模型供应商 | ✅ 完整 | 设置中心可编写 TypeScript 供应商逻辑 |
| 可编程 Skill | ✅ 完整 | Agent 提示词外化为 Markdown，在线编辑 |
| 桌面客户端 | ✅ 完整 | Electron 40，三端安装包 |
| Docker 部署 | ✅ 完整 | 单容器，数据目录挂载 |
| 多语言界面 | ✅ 完整 | 7 种语言 |
| 多用户 | ✅ 完整 | JWT 认证，isolationKey 会话隔离 |

**总体完整度**：功能链路完整闭环，版本 v1.1.8，相对成熟，有 AtomGit G-Star、Gitee GVP 认证，实际可用性较高。Demo 完整展示了 2 小时内生产 2 分钟短剧的全流程。

### 开源情况

- **许可证**：`Apache-2.0` + 补充商业协议（双证）
- **开源范围**：后端（Toonflow-app）完整开源；前端（Toonflow-web）独立仓库开源
- **限制**：
  - 个人/研究/内部使用：✅ 完全免费
  - 内容创作分账：✅ 完全免费
  - ≤5 个法人联合内部运营：✅ 免费
  - 对外分发给 ≥2 个独立第三方：❌ 需商业授权
  - 年销售额 <10 万：✅ 申请即可免费授权
- **前端独立**：前端 Toonflow-web 单独开源，可完全替换自己的前端实现

> **结论**：Apache-2.0 是真正的开源许可证，比 waoowaoo 的 CC BY-NC-SA 更友好。个人和小团队内部使用完全自由，SaaS 对外分发才需要授权。**年销售额 <10 万还可免费申请授权**，对早期项目非常友好。

### 二次开发潜力

**优势：**
- 后端前端完全解耦，可独立替换前端（Toonflow-web 独立仓库）
- 供应商逻辑可在界面直接编写 TypeScript，无需重启，极易扩展新模型
- Agent Skill 提示词外化为文件，调优不改源码
- SQLite 单文件，轻量无依赖，本地/私有化部署门槛极低
- Electron 桌面客户端，无需服务器即可使用
- Express 5 + TypeScript 后端结构清晰，路由按业务模块化
- Apache-2.0 + 补充协议商业友好，年销 <10 万可免费授权
- v1.1.8 版本相对稳定，有 AtomGit/Gitee 认证背书

**挑战：**
- 无限画布 UI 在前端（Toonflow-web）单独仓库，前后端联调需要同时运行两套项目
- ONNX 本地推理模型需要首次下载，冷启动时间较长
- Agent 决策逻辑（三层协作）学习曲线相对陡峭
- 补充商业协议在 Apache-2.0 基础上额外限制，需仔细阅读

**最适合的二开场景：**
1. 私有化部署（自用/团队内部）：SQLite + Electron/Docker 开箱即用
2. 扩展新模型供应商（无需改代码，界面直接配）
3. 自定义 Agent Skill 提示词优化生成质量
4. 替换/二开前端界面（前端独立仓库，后端 API 稳定）
5. 新增业务路由扩展功能（Express 路由模块化，新增文件即注册）
6. 打包自有品牌桌面客户端（Apache-2.0 允许修改分发）

---