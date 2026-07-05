# Toonflow 代码逻辑梳理文档

> 面向开发者的完整代码逻辑拆解，以"做了什么"为主线，从入口方法递归展开。

---

## 1. 应用启动入口

**入口文件**：`src/app.ts` → `startServe()`

### 1.1 启动前置检查
- **检查数据目录读写权限** → `checkPermissions()`
  - 非 Electron 环境直接跳过
  - Electron 环境：尝试在 userData 目录创建测试文件
  - 失败则弹出系统对话框提示权限不足，点击确认后退出应用

### 1.2 写入版本信息
- 调用 `u.writeVersion()` 将当前版本号写入本地文件

### 1.3 初始化 Socket.IO 服务
- 基于 HTTP 服务创建 `Server(socket.io)`
- 调用 `socketInit(io)` 注册所有 Socket 命名空间
  - 注册 `/api/socket/productionAgent` → 生产 Agent 通道
  - 注册 `/api/socket/scriptAgent` → 剧本 Agent 通道

### 1.4 开发环境自动生成路由文件
- 仅 `NODE_ENV == "dev"` 时触发
- 调用 `buildRoute()` → 扫描 `src/routes/**/*.ts`，按目录/文件名规则生成 `src/router.ts`
  - 文件名 → HTTP 路径映射规则：`[param]` → `:param`，`[...param]` → `*`，`index` → `/`
  - 内容 hash 相同时跳过重写（增量更新）

### 1.5 注册 Express 中间件（按顺序）
1. **日志中间件**：morgan dev 模式输出请求日志
2. **跨域**：`cors({ origin: "*" })`
3. **请求体解析**：JSON + urlencoded，限制 100mb
4. **OSS 静态资源服务** → `/oss/*`
   - 支持 `?size=WxH`（等比压缩到指定宽高）或 `?size=30%`（百分比缩放）
   - 调用 `ensureThumbnail()` 生成缩略图，命中缓存直接返回
   - 其余直接 `express.static` 提供原图
5. **Skills 静态资源服务** → `/skills/*`（仅允许图片格式访问）
6. **Assets 静态资源服务** → `/assets/*`
7. **前端静态网站** → `/`（`data/web` 目录）

### 1.6 JWT 鉴权中间件
- 从 `Authorization` Header 或 `?token` query 参数提取 token
- 白名单：`/api/login/login` 直接放行
- 其余路由：从 `o_setting` 表读取 `tokenKey`，用 `jwt.verify()` 校验
- 校验失败返回 401

### 1.7 加载业务路由
- 动态 import `src/router.ts`，将所有 `src/routes/**` 挂载到 `/api/*`

### 1.8 错误兜底处理
- 404 中间件：未匹配路由返回 404
- 全局错误中间件：捕获所有异常，返回 500

### 1.9 启动监听
- 默认端口 `10588`；`randomPort=true` 时使用随机端口（Electron 内部使用）
- 控制台打印服务地址

---

## 2. 数据库初始化

**入口**：`src/utils/db.ts` → 模块加载时自动执行

### 2.1 创建 SQLite 连接
- 数据库文件路径：`getPath("db2.sqlite")`（userData 目录或本地开发目录）
- 使用 `knex + better-sqlite3`

### 2.2 初始化表结构
- 调用 `initDB(db)`（`src/lib/initDB.ts`）
  - 遍历所有 `TableSchema` 定义，逐一检查表是否存在
  - 不存在则 `createTable` + 执行 `initData`（插入初始数据）
  - **核心数据表**：
    - `o_user`：用户（默认 admin/admin123）
    - `o_project`：项目
    - `o_agentDeploy`：Agent 部署配置（scriptAgent / productionAgent / 各子 Agent）
    - `o_setting`：系统配置键值对（tokenKey / 记忆参数 / 开发工具开关等）
    - `o_tasks`：任务中心记录
    - `o_prompt`：提示词模板（事件提取 / 剧本资产提取 / 视频提示词生成 / 音色绑定）
    - `o_novel`：小说章节原文
    - `o_script`：剧本
    - `o_assets`：资产（角色/场景/道具/衍生）
    - `o_image`：生成图片记录
    - `o_storyboard`：分镜
    - `o_artStyle`：画风配置
    - `o_vendorConfig`：AI 供应商配置
    - `memories`：Agent 记忆（短期/摘要/向量）

### 2.3 迁移修复
- 调用 `fixDB(db)`（`src/lib/fixDB.ts`）：对旧版本数据库做字段补丁（addColumn 等 alter 操作）

### 2.4 开发环境自动生成 TypeScript 类型
- `NODE_ENV == "dev"` 时调用 `initKnexType(db)`
- 通过 `@rmp135/sql-ts` 读取 SQLite schema，自动生成 `src/types/database.d.ts`
- 内容 hash 相同时跳过重写

---

## 3. Socket.IO Agent 通信层

**入口**：`src/socket/index.ts`

两个 Agent 共享相同的连接处理模式，以 `scriptAgent` 为例展开：

### 3.1 连接鉴权
- 从 `socket.handshake.auth.token` 取 JWT，查 `o_setting` 验证
- 验证失败或缺少 `isolationKey`（会话隔离 key）→ 强制断开

### 3.2 初始化 ResTool（消息推送工具）
- 创建 `ResTool` 实例（`src/socket/resTool.ts`），绑定 socket 和项目上下文（projectId / scriptId）
- `ResTool.newMessage()` → 向客户端 emit `message` 事件，返回 `MessageBuilder`
- `MessageBuilder` 各方法（`text()` / `thinking()` / `toolCall()` 等）→ emit `content:add` / `content:update` 事件，实时推送流式内容

### 3.3 监听 chat 事件 → 触发 Agent 决策
- 收到 `chat` 消息后：
  - 取消上一次未完成的请求（`abortController.abort()`）
  - 新建 `AbortController`
  - 构造 `AgentContext`
  - 调用 `agent.runDecisionAI(ctx)`

### 3.4 监听 updateThinkConfig 事件
- 更新深度思考配置（是否启用 think 模式 + 思考深度等级 0-3）

### 3.5 监听 stop 事件
- 调用 `abortController.abort()` 中止当前 AI 流

---

## 4. AI 供应商调用层

**入口**：`src/utils/ai.ts`，对外暴露 `Ai.Text()` / `Ai.Image()` / `Ai.Video()` / `Ai.Audio()`

### 4.1 模型名解析 → `resolveModelName()`
- 输入：`AiType`（如 `"scriptAgent:decisionAgent"`）或直接的 `"vendorId:modelName"` 字符串
- 对于内置 `AiType`：
  - 读取 `o_setting.agentUseMode`
    - `"1"（高级配置）`：从 `o_agentDeploy` 按精确 key 查找 modelName
    - `"0"（简易配置）`：只取 key 的第一段（如 `scriptAgent`），查父级配置
  - 返回 `"vendorId:modelName"` 格式字符串
- 已是 `"vendorId:modelName"` 格式则直接返回

### 4.2 供应商模板函数加载 → `getVendorTemplateFn()`
- 根据 vendorId 查 `o_vendorConfig`，获取供应商配置
- 读取 `data/vendor/{id}.ts` 供应商代码
- 用 `sucrase` 将 TypeScript 转为 JS，用 `u.vm()`（vm2 沙盒）执行
- 从执行结果中取对应函数（`textRequest` / `imageRequest` / `videoRequest` / `ttsRequest`）
- `textRequest` 返回的是 `@ai-sdk` 兼容的模型实例

### 4.3 文本模型调用 → `AiText`
- `AiText.stream()` → 调用 Vercel AI SDK `streamText()`
  - 自动包裹 `extractReasoningMiddleware`（解析 `<reasoning_content>` 思考块）
  - 若 `switchAiDevTool=1` 则额外包裹 `devToolsMiddleware`（接入 AI 调试面板）
  - 传入 tools 时自动设置 `stopWhen: stepCountIs(工具数 × 50)` 防止无限循环
- `AiText.invoke()` → 调用 `generateText()`（非流式，用于记忆摘要等场景）

### 4.4 图像模型调用 → `AiImage`
- `AiImage.run()` → 执行供应商 `imageRequest` 函数
- 若返回 URL 则自动下载转 base64
- `AiImage.save()` → 写入 oss 目录

### 4.5 视频/音频模型调用 → `AiVideo` / `AiAudio`
- 同 AiImage 模式，调用对应供应商函数
- 均支持 `TaskRecord`（会自动记录任务到 `o_tasks` 表，成功/失败状态更新）

---

## 5. 剧本 Agent（scriptAgent）工作流

**入口**：`src/agents/scriptAgent/index.ts` → `runDecisionAI(ctx)`

### 5.1 记忆写入
- 创建 `Memory("scriptAgent", isolationKey)` 实例
- 将用户消息写入 `memories` 表，同时做向量 embedding

### 5.2 加载决策层 System Prompt
- 读取 `data/skills/script_agent_decision.md`（可在设置页修改）

### 5.3 构建记忆上下文 → `buildMemPrompt()`
- 从 `memories` 表查询：
  - RAG 向量召回（与当前消息相似度最高的历史记忆）
  - 最近 N 条摘要
  - 最近 M 条短期对话
- 拼接为 `[相关记忆] / [历史摘要] / [近期对话]` 格式传入消息

### 5.4 加载项目信息
- 查询 `o_project`：小说名称、类型、简介、画风、视频比例
- 查询 `o_novel`：章节数量

### 5.5 决策层 AI 流式推理 → 挂载工具集
- 调用 `u.Ai.Text("scriptAgent:decisionAgent").stream()` 启动推理
- 挂载工具集（3 类）：
  - **记忆工具**：`memory.getTools()` → AI 可主动写入/查询记忆
  - **查询工具**：`useTools()` → 查小说事件/章节原文/剧本内容/工作区数据
  - **子 Agent 工具**：`createSubAgent(ctx)` → AI 可调度子 Agent 执行具体任务

### 5.6 子 Agent 工具集（决策层可调用）→ `createSubAgent()`

#### 5.6.1 `run_sub_agent_storySkeleton` → 故事骨架生成子 Agent
- 加载 `data/skills/script_execution_skeleton.md` 作为 system prompt
- 要求输出 `<storySkeleton>...</storySkeleton>` XML 格式
- 调用 `runAgent()` 启动独立推理流

#### 5.6.2 `run_sub_agent_adaptationStrategy` → 改编策略生成子 Agent
- 加载 `data/skills/script_execution_adaptation.md`
- 要求输出 `<adaptationStrategy>...</adaptationStrategy>`

#### 5.6.3 `run_sub_agent_script` → 剧本生成子 Agent
- 加载 `data/skills/script_execution_script.md`
- 注入当前项目已有剧本列表 + 章节数量作为上下文
- 要求输出 `<scriptItem name="剧本名称">内容</scriptItem>` 格式

#### 5.6.4 `run_supervision_agent` → 监督层子 Agent
- 加载 `data/skills/script_agent_supervision.md`
- 用于审核/评估其他子 Agent 的输出

### 5.7 子 Agent 通用执行器 → `runAgent()`
- 完结当前消息块（`parentCtx.msg.complete()`）
- 创建新消息块显示子 Agent 名称
- 调用 `u.Ai.Text(key).stream()` 推理，挂载查询工具
- 消费流 → `consumeFullStream()` 逐 chunk 推送到前端
- 完成后将响应写入 memory（去除 XML 标签后存储）
- 返回 parentCtx 重置为父级消息

### 5.8 流消费器 → `consumeFullStream()`
- 逐块处理 AI 流事件：
  - `reasoning-start/delta/end`：创建/追加/完成 thinking 内容块，计算耗时
  - `text-delta`：追加文本，同时累积 fullResponse
  - `error`：抛出异常
- 完成后 `msg.complete()`，返回完整文本

---

## 6. 生产 Agent（productionAgent）工作流

**入口**：`src/agents/productionAgent/index.ts` → `runDecisionAI(ctx)`

> 整体结构与 scriptAgent 相同，以下仅列出差异点

### 6.1 额外加载模型信息
- 查询项目的 `imageModel` / `videoModel`
- 查询 `o_vendorConfig` 获取视频模式（单参/多参 isRef 标记）
- 将模型信息注入 AI 上下文

### 6.2 子 Agent 工具集（生产链路专用）→ `createSubAgent()`

> **技能上下文说明**：生产 Agent 的子 Agent 在启动前会预先加载"技能上下文"注入到 assistant 消息，让 AI 知道当前项目的画风约束和叙事风格。技能上下文分两种组合：
>
> - **画风技能（Art Skills）上下文** = `art_skills/{artName}/driector_skills/*.md` + `story_skills/{storyName}/driector_skills/*.md`
>   - `artName` 来自 `o_project.artStyle`（如 `2D_90s_japanese_anime`）
>   - `storyName` 来自 `o_project.directorManual`（如 `Sweet_romance_novel`）
>   - art_skills 每个画风目录下固定 3 个技能文件：
>     - `director_planning_style.md`：色调/光影/质感等视觉风格约束（适用于拍摄计划阶段）
>     - `director_storyboard_table_style.md`：分镜表的风格化填写规范
>     - `director_storyboard.md`：分镜图提示词的风格锚定词、情绪映射、光影词库
>   - story_skills 每个叙事类型目录下固定 2 个技能文件：
>     - `director_planning_narrative.md`：叙事节奏/情感设计/场景情绪规划（适用于拍摄计划阶段）
>     - `director_storyboard_table_narrative.md`：分镜表的叙事化填写规范
>
> - **生产技能（Production Skills）上下文** = 画风技能上下文 + `production_skills/*.md`
>   - `production_skills` 目录下目前有 2 个通用技能文件：
>     - `storyboard_prompt_techniques.md`：通用分镜提示词技法（景别词库、提示词结构框架、图像资产标注规则等）
>     - `storyboard_table_techniques.md`：通用分镜表技法（分镜拆分原则、视觉连续性铁律、字段填写指引等）
>
> 技能文件均以 `---` YAML frontmatter 开头，包含 `name` 和 `description` 字段。AI 收到的是技能清单（`<available_skills>` XML），需主动调用 `activate_skill` 工具才能加载完整技能内容（懒加载）。

#### 6.2.1 `run_sub_agent_derive_assets` → 衍生资产分析与信息写入
- 加载 `data/skills/production_execution_derive_assets.md`
- 携带 **画风技能上下文**（art_skills 画风约束 + story_skills 叙事风格）

#### 6.2.2 `run_sub_agent_generate_assets` → 衍生资产图片生成
- 加载 `data/skills/production_execution_generate_assets.md`
- 携带 **画风技能上下文**

#### 6.2.3 `run_sub_agent_director_plan` → 导演拍摄计划
- 加载 `data/skills/production_execution_director_plan.md`
- 要求输出 `<scriptPlan>...</scriptPlan>`
- 携带 **画风技能上下文**（此阶段主要激活 `director_planning_style` + `director_planning_narrative` 两类技能）

#### 6.2.4 `run_sub_agent_storyboard_gen` → 分镜图生成
- 加载 `data/skills/production_execution_storyboard_gen.md`
- 携带 **画风技能上下文**（此阶段主要激活 `director_storyboard` 风格锚定词技能）

#### 6.2.5 `run_sub_agent_storyboard_panel` → 分镜面板写入
- 加载 `data/skills/production_execution_storyboard_panel.md`
- 携带 **生产技能上下文**（= 画风技能 + `storyboard_prompt_techniques` + `storyboard_table_techniques`）
- 要求输出 `<storyboardItem videoDesc=... prompt=... track=... shouldGenerateImage=...>` 格式

#### 6.2.6 `run_sub_agent_storyboard_table` → 分镜表构建
- 加载 `data/skills/production_execution_storyboard_table.md`
- 携带 **生产技能上下文**（= 画风技能 + `storyboard_table_techniques` 通用分镜表技法）
- 要求输出 `<storyboardTable>...</storyboardTable>`

#### 6.2.7 `run_sub_agent_supervision` → 监督层子 Agent
- 加载 `data/skills/production_agent_supervision.md`
- 不携带技能上下文（监督层只做质量评估，不需要风格约束）

### 6.3 生产 Agent 工具集（查询 + 写入工作区）→ `useTools()`（`src/agents/productionAgent/tools.ts`）

| 工具名 | 语义 | 核心操作 |
|--------|------|---------|
| `get_flowData` | 获取工作区当前数据 | emit `getFlowData` 拉取前端工作区状态 |
| `add_deriveAsset` | 新增/更新衍生资产 | 写 `o_assets` + emit `addDeriveAsset` 通知前端 |
| `del_deriveAsset` | 删除衍生资产 | 删 `o_assets` + emit `delDeriveAsset` |
| `generate_deriveAsset` | 触发衍生资产图片生成 | emit `generateDeriveAsset` → 前端异步生成 |
| `generate_storyboard` | 触发分镜图片生成 | emit `generateStoryboard`（串行队列，防并发假死）|
| `add_flowData_storyboard` | 新增分镜到工作区 | emit `addStoryboard`（串行队列）|

> 注：生产工具对 Socket 操作使用 `createSocketQueue(800ms)` 串行队列，每次操作间隔 800ms，防止前端 React 状态更新过快导致假死

---

## 7. 记忆系统

**入口**：`src/utils/agent/memory.ts` → `class Memory`

### 7.1 写入记忆 → `memory.add(role, content)`
- 对 content 生成向量 embedding（ONNX `all-MiniLM-L6-v2` 模型，本地推理）
- 写入 `memories` 表（type = `"message"`，summarized = 0）
- 检查未总结消息数量，满足 `messagesPerSummary` 阈值时触发批量摘要
  - 调用 `u.Ai.Text(agentType).invoke()` 压缩为摘要
  - 摘要写入 `memories`（type = `"summary"`），原始消息标记 `summarized = 1`

### 7.2 查询记忆 → `memory.get(queryText)`
- 对 queryText 生成 embedding
- 在 `memories` 中向量相似搜索，返回 Top-N 相关消息（RAG）
- 返回最近 N 条摘要
- 返回最近 M 条短期对话（未被总结的近期消息）

### 7.3 记忆工具（AI 可主动调用）→ `memory.getTools()`
- `save_memory`：AI 主动保存重要信息到长期记忆
- `query_memory`：AI 主动检索记忆中的历史信息

---

## 8. 技能目录结构与加载机制

**入口**：`createArtSkills()` / `useProductionSkills()`（`src/agents/productionAgent/index.ts`）

### 8.1 三个技能目录的数据结构

#### 8.1.1 `data/skills/art_skills/` — 画风技能库
每个子目录对应一种画风，目录名即 `o_project.artStyle` 字段的值：

```
art_skills/
├── 2D_90s_japanese_anime/          # 90年代日式动画
│   ├── README.md                   # 画风说明（非技能文件）
│   ├── prefix.md                   # 画风前缀提示词（非技能文件）
│   ├── images/                     # 画风示例图
│   ├── driector_skills/            # 导演技能（被 Agent 加载）
│   │   ├── director_planning_style.md        # 色调/光影/质感全局约束（拍摄计划阶段用）
│   │   ├── director_storyboard_table_style.md # 分镜表风格化填写规范
│   │   └── director_storyboard.md            # 分镜图提示词风格锚定词/情绪映射/光影词库
│   └── art_prompt/                 # 资产图生成提示词模板（HTTP 路由层使用）
│       ├── art_character.md        # 角色图提示词模板
│       ├── art_character_derivative.md  # 衍生角色图提示词模板
│       ├── art_scene.md            # 场景图提示词模板
│       ├── art_scene_derivative.md
│       ├── art_prop.md             # 道具图提示词模板
│       ├── art_prop_derivative.md
│       └── art_storyboard_video.md # 分镜视频提示词模板
├── 2D_chinese_guofeng/             # 中国风
├── 2D_flat_design/                 # 扁平设计
├── 3D_anime_render/                # 3D 动漫渲染
└── ...（其他画风）
```

#### 8.1.2 `data/skills/story_skills/` — 叙事风格技能库
每个子目录对应一种叙事类型，目录名即 `o_project.directorManual` 字段的值：

```
story_skills/
├── Sweet_romance_novel/            # 甜宠言情
│   ├── README.md
│   ├── images/
│   └── driector_skills/            # 导演技能（被 Agent 加载）
│       ├── director_planning_narrative.md       # 叙事节奏/情感设计/场景情绪规划（拍摄计划阶段用）
│       └── director_storyboard_table_narrative.md # 分镜表叙事化填写规范
├── Xianxia_fantasy/                # 仙侠玄幻
├── Historical_epic/                # 历史史诗
├── Mystery_thriller/               # 悬疑惊悚
├── Hot_blooded_action/             # 热血动作
├── Comedy_humor/                   # 喜剧幽默
├── Horror_supernatural/            # 恐怖超自然
├── Psychological_drama/            # 心理剧
├── Scifi_post_apocalypse/          # 科幻末世
├── Urban_workplace_drama/          # 都市职场
├── Family_warmth/                  # 家庭温情
└── Coming_of_age/                  # 成长青春
```

#### 8.1.3 `data/skills/production_skills/` — 通用生产技能库
与项目无关的通用技法，固定加载：

```
production_skills/
├── storyboard_prompt_techniques.md  # 通用分镜提示词技法
│   # 内容：提示词解析映射规则、景别词库、输出格式规范、
│   #       提示词结构框架、画质规范、图像资产标注规则、人物位置连贯性规则
└── storyboard_table_techniques.md   # 通用分镜表技法
    # 内容：分镜拆分原则、定场与镜头合并规则、视觉连续性铁律、
    #       字段填写指引、转场规则
```

### 8.2 技能文件格式（统一规范）
每个技能 `.md` 文件必须以 YAML frontmatter 开头：

```markdown
---
name: director_planning_style
description: 日式动画约束 — 定义90年代日式动画在色调体系、光影方案...
---

# 正文内容（完整技法指令）
...
```

- `name`：技能唯一标识，AI 调用 `activate_skill` 时传入此值
- `description`：技能简介，用于构建 `<available_skills>` 清单让 AI 判断是否需要激活

### 8.3 技能加载流程

1. **扫描目录** → `scanSkills(glob)` 获取所有 `.md` 文件路径列表
2. **解析 Frontmatter** → `parseFrontmatter()` 提取每个文件的 `name` + `description`
3. **构建技能清单 Prompt** → 生成 `<available_skills>` XML，注入 assistant 消息
4. **创建 `activate_skill` 工具** → AI 按需调用，传入 `name` 后读取完整文件内容返回
   - 含路径安全校验（`is-path-inside` 防止路径穿越攻击）
   - 技能内容懒加载，不会一次性把所有技能文件塞入上下文

### 8.4 两种技能上下文组合

| 组合名 | 包含来源 | 使用场景 |
|--------|---------|---------|
| **画风技能上下文** | `art_skills/{artName}/driector_skills/` + `story_skills/{storyName}/driector_skills/` | 衍生资产分析、图片生成、导演规划、分镜图生成 |
| **生产技能上下文** | 画风技能上下文 + `production_skills/` | 分镜面板写入、分镜表构建 |

---

## 9. HTTP 路由层（REST API）

**路由文件目录**：`src/routes/`，自动映射到 `/api/` 前缀

### 9.1 认证模块
- `POST /api/login/login` → 用户名密码登录，返回 JWT token

### 9.2 项目管理
- 增删改查 `o_project`
- 管理导演手册（`directorManual`）和视觉手册（`visualManual`）

### 9.3 小说管理（Novel）
- 上传/管理小说章节（`o_novel`）
- 批量提取章节事件（调用 `universalAi` 模型，读取 `o_prompt.type=eventExtraction` 提示词）
- 查询小说事件状态轮询

### 9.4 剧本管理（Script）
- CRUD 操作 `o_script`
- `extractAssets`：从剧本内容中提取资产（调用 `universalAi`，读取 `scriptAssetExtraction` 提示词）
- `exportScript`：导出剧本为文件

### 9.5 剧本 Agent 数据面板
- `GET/SET /api/scriptAgent/getPlanData` → 工作区数据（storySkeleton / adaptationStrategy / script）
- `updateData`：Agent 写入解析后的 XML 内容到对应字段

### 9.6 资产管理（Assets）
- CRUD 操作 `o_assets`
- 批量生成资产提示词（`polishAssetsPrompt`）
- 批量生成资产图片（`batchGenerateImageAssets`）
- 轮询生成状态

### 9.7 生产工作台（Production）

#### 9.7.1 工作区数据 → `getFlowData` / `saveFlowData`

**数据结构（`FlowData`）**：
```typescript
{
  script: string;             // 剧本文本内容（只读，来自 o_script.content）
  scriptPlan: string;         // 导演拍摄计划（Agent 写入）
  storyboardTable: string;    // 分镜表文本（Agent 写入）
  assets: AssetItem[];        // 资产列表（从 o_assets + o_image JOIN 实时合并）
  storyboard: StoryboardItem[]; // 分镜面板（从 o_storyboard 实时合并）
}
```

- **`assets` 结构**（实时从数据库组装，不存入 o_agentWorkData）：
  ```typescript
  {
    id: number;        // 资产 ID（o_assets.id）
    name: string;
    type: "role" | "tool" | "scene" | "clip";
    prompt: string;    // 图片生成提示词
    desc: string;      // 资产描述
    src: string|null;  // 缩略图 URL（OSS 路径 + size 参数）
    derive: DeriveAsset[]; // 衍生资产列表（parent assetsId 不为 null 的子记录）
  }
  ```

- **`storyboard` 结构**（实时从数据库组装，不存入 o_agentWorkData）：
  ```typescript
  {
    id: number;
    index: number;               // 排序索引
    duration: number;            // 视频时长（秒）
    prompt: string;              // 分镜图生成提示词
    videoDesc: string;           // 结构化视频描述（多字段 / 分隔）
    associateAssetsIds: number[];// 关联资产 ID（来自 o_assets2Storyboard 关联表）
    src: string|null;            // 分镜图 URL（缩略图）
    state: string;               // 生成状态
    shouldGenerateImage: 0|1;    // 是否需要生成分镜图
    reason: string;              // 失败原因
  }
  ```

- **存储机制**：`script` / `scriptPlan` / `storyboardTable` 等文本字段序列化存入 `o_agentWorkData.data`（JSON）；`assets` 和 `storyboard` 每次 get 时从数据库实时组装覆盖，不依赖 `o_agentWorkData`

**输入**：`{ projectId: number, episodesId: number（= scriptId）}`
**输出**：组装后的完整 `FlowData` 对象

#### 9.7.2 分镜图批量生成 → `batchGenerateImage`

**输入**：
```typescript
{
  storyboardIds: number[];   // 要生成的分镜 ID 列表
  projectId: number;
  scriptId: number;
  concurrentCount?: number;  // 并发数，默认 5
  compulsory?: boolean;      // 强制重新生成（忽略 shouldGenerateImage=0 标记）
}
```

**处理流程**：
1. 将目标分镜状态更新为 `"生成中"`（或 `"未生成"` for shouldGenerateImage=0）
2. 查询分镜关联的资产图片（`o_assets2Storyboard` → `o_assets.imageId` → `o_image.filePath`）
3. **立即返回响应**（异步后台执行生成任务，不阻塞）
4. 并发执行图片生成：
   - 读取资产图片 → base64 编码 → 作为 `referenceList` 参考图
   - 调用 `u.Ai.Image(projectData.imageModel).run()`，传入 `prompt` + `referenceList` + 尺寸/比例配置
   - 生成结果存为 JPG → 写入 OSS → 更新 `o_storyboard.filePath` + `state="已完成"`

**输出**（立即返回）：
```typescript
[{ id, prompt, associateAssetsIds, src: null, state, videoDesc, shouldGenerateImage }]
```

#### 9.7.3 视频轨道（Track）概念说明

**`o_videoTrack` 是视频工作台的核心调度单元**，代表"一次视频生成任务的配置"：

```
o_videoTrack（视频轨道）
├── id：轨道 ID（Date.now() 生成）
├── projectId / scriptId：归属项目和剧本
├── prompt：视频提示词（由 batchGeneratePrompt 写入）
├── state：生成状态（生成中 / 已完成 / 生成失败）
├── duration：视频时长
└── selectVideoId：用户选中的最终视频 ID（从多次生成中选一个）

o_video（视频生成记录，一个 track 可多次生成）
├── id
├── videoTrackId：关联的轨道 ID
├── filePath：生成的视频文件路径
└── state：生成状态
```

**Track 的创建时机（自动创建，无需手动）**：

- **情况一：单条分镜写入（Agent 驱动）** → 调用路径：
  ```
  productionAgent tools.ts
    └─ add_flowData_storyboard 工具执行
         └─ socket.emit("addStoryboard", data, callback)
              └─ 前端监听 addStoryboard 事件
                   └─ 调用 POST /api/production/storyboard/addStoryboard
                        └─ 插入 o_storyboard + 同步新建 o_videoTrack（Date.now() 为 id）
  ```
  - **输入**（前端调用 addStoryboard 接口）：`{ prompt, duration, state, videoDesc, shouldGenerateImage, src, scriptId, projectId }`
  - **输出**：`{ id: number }`（新分镜 ID）

- **情况二：批量分镜导入（前端直接调用）** → `POST /api/production/storyboard/batchAddStoryboardInfo`
  - **调用者**：前端页面（通常是用户导入/粘贴分镜表数据时）
  - **输入**：
    ```typescript
    {
      data: Array<{
        prompt: string;
        duration: number;
        track: string;          // 分组名（如 "A", "B" 或剧情分组名称）
        state: string;
        src: string | null;
        videoDesc: string;
        shouldGenerateImage: number;
        associateAssetsIds: number[];
      }>;
      scriptId: number;
      projectId: number;
    }
    ```
  - **处理逻辑**：批量插入分镜 → 按 `track` 分组名合并创建/复用 `o_videoTrack`（同名分组复用，不同名新建）→ 更新 `o_storyboard.trackId`
  - **输出**：完整分镜列表（含 trackId、associateAssetsIds、src 缩略图等）

- **情况三：手动添加轨道** → `addTrack` 接口（独立创建轨道，不绑定分镜，较少使用）

**结论**：正常业务流中，轨道都是由分镜写入时**自动创建**的，用户无需手动操作轨道

**Track 与分镜的关系**：
- `o_storyboard.trackId` 字段关联到 `o_videoTrack.id`
- 同一 `track` 分组名的多条分镜对应同一个视频轨道
- 一个轨道可以多次生成视频（`o_video` 多条记录），用户从中选一个作为最终结果（`o_videoTrack.selectVideoId`）

#### 9.7.4 视频批量生成 → `batchGenerateVideo`

**输入**：
```typescript
{
  projectId: number;
  scriptId: number;
  trackData: Array<{
    trackId: number;       // 视频轨道 ID（来自 o_videoTrack.id）
    uploadData: Array<{    // 参考资料（分镜图或资产图）
      id: number;
      sources: "assets" | "storyboard";
    }>;
    prompt: string;        // 视频提示词（来自 o_videoTrack.prompt）
    duration: number;      // 视频时长（秒）
  }>;
  model: string;           // "vendorId:modelName" 格式
  mode: string;            // 视频生成模式（首尾帧/多参等）
  resolution: string;      // 分辨率
  audio?: boolean;
}
```

**处理流程**：
1. 为每个 track 预建 `o_video` 记录（state = `"生成中"`），获得 videoId
2. **立即返回** `[{ videoId, trackId }]`
3. 后台并发执行：
   - 读取 uploadData 对应的图片（分镜图 / 资产图）→ base64 编码
   - 调用 `u.Ai.Video(model).run()` 传入 prompt / referenceList / mode / duration / aspectRatio
   - 成功 → `aiVideo.save(videoPath)` → 更新 `o_video.state="生成成功"`
   - 失败 → 更新 `o_video.state="生成失败"` + errorReason

#### 9.7.4 视频提示词批量生成 → `batchGeneratePrompt`

**输入**：
```typescript
{
  projectId: number;
  trackData: Array<{
    trackId: number;
    info: Array<{ id: number; sources: "assets" | "storyboard" }>;
  }>;
  model: string;    // "vendorId:modelName"
  mode: string;     // 视频模式（决定用哪个提示词模板）
  concurrentCount?: number;
}
```

**提示词模板选择逻辑（优先级递降）**：
1. 模型绑定的专属提示词（`o_modelPrompt` 表，`data/modelPrompt/` 目录）
2. 根据模型名 + mode 自动匹配（`data/modelPrompt/video/`）：
   - 含 `wan2.6` → `wan2.6Single-imageFirstFrameMode.md`
   - 含 `seedance2.0` → `seedance2Multi-parameterMode.md`
   - mode 为首尾帧 → `universalFirstAndLastFrameMode.md`
   - mode 为多参 JSON 数组 → `universalMulti-parameterMode.md`
3. 备选：`o_prompt.type=videoPromptGeneration` 中的通用提示词

**处理流程**：
1. 将目标轨道 state 更新为 `"生成中"`
2. 立即返回 `"开始生成提示词"`
3. 后台并发（pLimit 控制并发数）：
   - 查询 trackData 中各分镜的 `videoDesc` / `prompt` / `duration` / `associateAssetsIds`
   - 查询各资产的 `id` / `type` / `name`
   - 拼装提示词输入（模型名 + 资产信息 + `<storyboardItem>` XML 列表）
   - 调用 `u.Ai.Text("universalAi").invoke()` 生成视频提示词文本
   - 结果写入 `o_videoTrack.prompt`，state 更新为 `"已完成"`

### 9.8 供应商配置（VendorConfig）
- 管理 `o_vendorConfig`（AI 供应商接入配置）
- 管理供应商自定义代码（`data/vendor/{id}.ts`）
- 供应商模型测试（文本/图像/视频分别测试）

### 9.9 Agent 部署配置
- 查询/更新 `o_agentDeploy`（各 Agent 绑定的模型）
- 切换使用模式（简易/高级）

### 9.10 设置中心
- 系统配置读写（`o_setting`）
- 提示词模板管理（`o_prompt`）
- 技能内容管理（读写 `data/skills/*.md`）
- 数据导入/导出/清空
- 检查更新 / 下载新版本

---

## 10. 核心工具层（Utils）

| 模块 | 文件 | 作用 |
|------|------|------|
| `db` | `src/utils/db.ts` | Knex SQLite 封装，类型安全的表访问 |
| `Ai` | `src/utils/ai.ts` | 统一 AI 调用入口（Text/Image/Video/Audio）|
| `vendor` | `src/utils/vendor.ts` | 读写供应商代码、获取模型列表 |
| `vm` | `src/utils/vm.ts` | vm2 沙盒执行供应商 JS 代码 |
| `oss` | `src/utils/oss.ts` | 本地 OSS 文件读写（base64↔文件）|
| `getPath` | `src/utils/getPath.ts` | 统一解析各类数据目录路径（兼容 Electron/非 Electron）|
| `task` | `src/utils/taskRecord.ts` | AI 任务记录（写入 o_tasks，追踪成功/失败）|
| `error` | `src/utils/error.ts` | 统一错误序列化 |
| `cleanNovel` | `src/utils/cleanNovel.ts` | 小说文本清洗（去广告/空行等）|
| `getPrompts` | `src/utils/getPrompts.ts` | 从 `o_prompt` 表按 type 查询提示词模板 |
| `getArtPrompt` | `src/utils/getArtPrompt.ts` | 读取画风 art_prompt 目录下的专用提示词 |
| `replaceUrl` | `src/utils/replaceUrl.ts` | 将 AI 返回的 URL 替换为本地 OSS 路径 |
| `image` | `src/utils/image.ts` | sharp 图片缩略图生成（ensureThumbnail）|

---

## 11. 整体数据流图

```
用户 (前端)
    │
    ├─── HTTP REST ──→ src/routes/** ──→ 业务逻辑 ──→ utils/db (SQLite)
    │                                              └──→ utils/Ai (AI模型)
    │
    └─── WebSocket ──→ socket/routes/
                          ├── scriptAgent ──→ agents/scriptAgent/index.ts
                          │                     ├── Memory (向量记忆)
                          │                     ├── useTools (查询工具)
                          │                     └── createSubAgent (子Agent工具)
                          │                           └── runAgent() ──→ u.Ai.Text().stream()
                          │                                               └── 供应商代码(vm沙盒)
                          └── productionAgent ──→ agents/productionAgent/index.ts
                                                    ├── Memory
                                                    ├── useTools (查询+写入工具)
                                                    │     └── emit back to 前端 (双向通信)
                                                    ├── createSubAgent
                                                    └── Art/Production Skills (文件系统)
```

---

## 12. 向量化（Embedding）使用场景全览

**向量化引擎**：`src/utils/agent/embedding.ts`，使用本地 ONNX 模型 `all-MiniLM-L6-v2`（fp16 量化）离线推理，不调用任何外部 API。

### 12.1 使用点汇总

| 使用场景 | 数据表 | 触发时机 | 用途 |
|---------|--------|---------|------|
| Agent 记忆写入 | `memories` | 每次用户/Agent 发送消息 | 对消息内容生成 embedding，用于后续 RAG 检索 |
| Agent 记忆摘要写入 | `memories` | 累积消息达阈值时触发摘要压缩 | 对摘要内容生成 embedding，用于 deepRetrieve |
| Agent 记忆查询 | `memories` | 每次 `memory.get(queryText)` | 对查询文本生成 embedding，与历史消息做余弦相似度排序 |
| 技能列表初始化 | `o_skillList` | 数据库首次创建时（`initData`）| 对各技能 description 生成 embedding（为未来向量技能检索预留） |

### 12.2 当前实际启用的向量检索

只有 **`memories` 表的 RAG 检索**是真正在运行时使用向量检索的场景：

```
用户发消息
  └─ memory.add()  →  getEmbedding(content)  →  写入 memories.embedding
  └─ memory.get()  →  getEmbedding(queryText)
                        └─ vectorSearch(allMessages, queryEmbedding, ragLimit)
                             └─ cosineSimilarity(stored, query) → Top-N 排序 → 返回相关历史记忆
```

### 12.3 `o_skillList` 的向量化（预留机制，当前未实际用于检索）

- `o_skillList` 表在数据库初始化时对所有预置技能（script/production 系列技能文件）的 description 计算并存储 embedding
- 但当前代码中**技能激活路径不走向量检索**：
  - art_skills / story_skills / production_skills 目录下的技能通过 **文件系统扫描 + LLM 语义理解** 的方式激活（见第 8 章）
  - `o_skillList` 表和其 embedding 字段目前处于"数据已存储，但检索逻辑尚未接入"的状态，是一个为未来向量技能检索功能预留的基础设施

### 12.4 向量相似度计算方式

使用**余弦相似度**（cosine similarity），因为 `all-MiniLM-L6-v2` 输出的向量已做 L2 归一化（`normalize: true`），所以余弦相似度等价于点积：

```typescript
// src/utils/agent/embedding.ts
export function cosineSimilarity(a: number[], b: number[]): number {
  return a.reduce((dot, v, i) => dot + v * b[i], 0);
}
```

---

## 13. 供应商扩展机制

每个 AI 供应商通过写入 `data/vendor/{id}.ts` 接入，该文件需导出：

```typescript
// 必须导出的对象
export const vendor = {
  inputValues: { apiKey: "", baseUrl: "" }, // 用户配置字段
  models: [...],  // 内置模型列表
  version: "1.0", // 可选，影响参数格式
};

// 文本模型函数（必须）
export function textRequest(model, think, thinkLevel) {
  return createOpenAI({...})(model.modelName);
}

// 图像模型函数（可选）
export async function imageRequest(input: ImageConfig): Promise<string> { ... }

// 视频模型函数（可选）
export async function videoRequest(input: VideoConfig): Promise<string> { ... }

// TTS 函数（可选）
export async function ttsRequest(input): Promise<string> { ... }
```

> 所有供应商函数在 `vm2` 沙盒中执行，防止恶意代码访问系统资源
