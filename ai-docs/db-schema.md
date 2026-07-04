# Toonflow 数据库表结构与实体关系

> 数据源：[`src/lib/initDB.ts`](../src/lib/initDB.ts)  
> 数据库：SQLite（单文件，存于 `data/` 目录）

---

## 一、核心实体关系图（文字版）

```
o_user
  └── 登录认证，无业务关联

o_project（项目）
  ├── o_novel（原著章节）
  │     ├── o_event（事件）
  │     └── o_eventChapter（事件-章节关联）
  ├── o_script（剧本集）
  │     ├── o_scriptAssets（剧本-资产关联）
  │     ├── o_storyboard（分镜）
  │     │     ├── o_assets2Storyboard（分镜-资产关联）
  │     │     └── o_videoTrack（视频轨道）
  │     │           └── o_video（视频片段）
  │     └── o_agentWorkData（Agent工作流数据）
  └── o_assets（资产：角色/场景/道具/素材/音频）
        ├── o_image（生成图片）
        ├── o_imageFlow（图片工作流）
        └── o_assetsRole2Audio（角色-音频绑定）

o_vendorConfig（供应商配置）
o_agentDeploy（Agent模型配置）
o_setting（系统设置）
o_prompt（提示词模板）
o_modelPrompt（模型绑定提示词）
o_artStyle（画风）
o_skillList（Skill文件索引）
o_tasks（任务中心）
memories（Agent记忆）
```

---

## 二、各表详细说明

### 用户与认证

#### `o_user` — 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| name | text | 用户名（默认 admin） |
| password | text | 密码（默认 admin123） |

---

### 项目层

#### `o_project` — 项目表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键（时间戳） |
| name | text | 项目名称 |
| intro | text | 项目简介 |
| type | text | 题材类型 |
| artStyle | text | 画风标识（对应 art_skills 目录名） |
| projectType | string | 项目类型 |
| imageModel | string | 默认图像模型 |
| imageQuality | string | 默认图像分辨率 |
| videoModel | string | 默认视频模型 |
| videoRatio | text | 视频比例（16:9 / 9:16） |
| directorManual | text | 导演手册内容 |
| mode | text | 视频生成模式 |
| createTime | integer | 创建时间戳 |
| userId | integer | 所属用户 |

**产品意义：** 所有内容（原著/剧本/资产/分镜/视频）都挂在项目下，项目是整条生产链的根节点。

---

### 内容层（原著 → 剧本）

#### `o_novel` — 原著章节表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| projectId | integer | 所属项目 |
| chapterIndex | integer | 章节序号 |
| chapter | text | 章节标题 |
| chapterData | text | 章节正文 |
| reel | text | 卷/册信息 |
| eventState | integer | 事件提取状态（0=提取中，1=完成，-1=失败） |
| event | text | 提取的事件结构化数据 |
| errorReason | text | 错误原因 |
| createTime | integer | 创建时间 |

**设计说明：`o_novel` 命名是"小说"，但每条记录实际是一个章节**

虽然表名叫 `o_novel`（小说），但**每一行存的是一个章节**，没有独立的"小说"实体表。一部小说的所有章节通过 `projectId` 归属同一个项目，用 `chapterIndex` 排序——即"项目 = 小说"的设计。

例如导入《斗破苍穹》前 3 章，会在 `o_novel` 里生成 3 条记录：

```
id: 40  projectId: 1  chapterIndex: 1  reel: "正文卷"  chapter: "天才少年"      event: "| 第1章 ... |"  eventState: 1
id: 41  projectId: 1  chapterIndex: 2  reel: "正文卷"  chapter: "废材的逆袭"    event: "| 第2章 ... |"  eventState: 1
id: 42  projectId: 1  chapterIndex: 3  reel: "正文卷"  chapter: "萧炎觉醒异火"  event: "| 第3章 萧炎觉醒异火 | 萧炎、药老 | 萧炎感应到异火波动，药老指引完成初步觉醒 | 师徒信任建立 | 高 | 3分钟 | 热血 |"  eventState: 1
```

- `chapterData`：原始长文本，只在 `get_novel_text` 工具被调用时才读取
- `event`：AI 压缩后的一行摘要，scriptAgent 默认优先读这个字段
- `eventState`：控制前端"事件"列显示：`1`=显示摘要，`-1`=显示"生成失败"，`0`=进行中

#### `o_event` — 事件表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| name | string | 事件名称 |
| detail | string | 事件详情 |
| createTime | integer | 创建时间 |

#### `o_eventChapter` — 事件-章节关联表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| eventId | integer | 关联事件 |
| novelId | integer | 关联章节 |

**产品意义：** 原著章节经过 AI 提取后，生成结构化事件图谱，供 scriptAgent 改编时精准调用上下文。

具体来说：
- 每个章节（`o_novel`）导入后，系统用 AI 提取该章的核心剧情摘要（角色、核心事件、情绪强度等），存入 `o_novel.event` 字段
- 同时将跨章节的宏观事件（如"主角获得宝物"、"反派登场"）抽象为独立的 `o_event` 记录
- `o_eventChapter` 负责维护 `o_event` 与 `o_novel` 的多对多关系，一个宏观事件可横跨多个章节

这样 scriptAgent 在做改编时，不需要逐字读原文，而是先通过 `get_novel_events` 工具快速扫描各章事件摘要，定位关键章节，再按需拉取原文——相当于把一部长篇小说的"目录+剧情索引"前置提取出来。

---

#### `o_script` — 剧本表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| projectId | integer | 所属项目 |
| name | text | 剧本名称（集名） |
| content | text | 剧本正文 |
| extractState | integer | 资产提取状态（2=等待，0=提取中，1=成功，-1=失败） |
| errorReason | text | 错误原因 |
| createTime | integer | 创建时间 |

**产品意义：** 一个项目可以有多个剧本（多集），每个剧本对应一集的内容，是分镜生成的上游输入。

#### `o_scriptAssets` — 剧本-资产关联表
| 字段 | 类型 | 说明 |
|------|------|------|
| scriptId | integer | 关联剧本 |
| assetId | integer | 关联资产 |

**产品意义：** 记录某集剧本里用到了哪些角色/场景/道具资产，是"塑角造景"批量出图的数据来源。

---

### 资产层

#### `o_assets` — 资产表（核心表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| projectId | integer | 所属项目 |
| name | text | 资产名称 |
| type | text | 类型：`role`/`scene`/`tool`/`clip`/`audio` |
| describe | text | 资产描述 |
| prompt | text | 生成提示词 |
| remark | text | 备注 |
| assetsId | integer | 父资产ID（null=父级，非null=衍生变体） |
| imageId | integer | 关联图片记录（→ o_image） |
| flowId | integer | 关联图片工作流（→ o_imageFlow） |
| scriptId | integer | 关联剧本 |
| promptState | string | 提示词生成状态 |
| audioBindState | integer | 音频绑定状态 |
| promptErrorReason | text | 提示词生成错误原因 |
| startTime | integer | 创建时间 |

**父子结构：**
- `assetsId = null`：父级资产（主设定）
- `assetsId = 父ID`：衍生变体（不同表情/角度/光线等）

**type 枚举：**
- `role` — 角色
- `scene` — 场景
- `tool` — 道具
- `clip` — 视频素材片段
- `audio` — 音频/配音

#### `o_image` — 生成图片表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| assetsId | integer | 关联资产 |
| filePath | text | 图片文件路径（OSS） |
| type | text | 图片类型 |
| model | text | 生成模型 |
| resolution | text | 分辨率 |
| state | text | 状态：`生成中`/`已完成`/`生成失败` |
| errorReason | text | 错误原因 |

**产品意义：** 一个资产可以有多张候选图（历史生成记录），`o_assets.imageId` 指向当前选中的那张。

#### `o_imageFlow` — 图片工作流表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| flowData | text | 工作流节点数据（JSON） |

**产品意义：** 存储图片精调工作流的节点配置，支持对分镜图进行节点化精调。

#### `o_assetsRole2Audio` — 角色-音频绑定表
| 字段 | 类型 | 说明 |
|------|------|------|
| assetsRoleId | integer | 角色资产ID |
| assetsAudioId | integer | 音频资产ID |

**产品意义：** 把角色和对应的配音音色绑定，生成视频提示词时自动带入音色参数。

---

### 分镜层

#### `o_storyboard` — 分镜表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| scriptId | integer | 所属剧本 |
| projectId | integer | 所属项目 |
| prompt | text | 分镜图生成提示词 |
| videoDesc | text | 视频描述（12维结构化描述） |
| filePath | text | 分镜图文件路径 |
| duration | text | 推荐时长（秒） |
| state | text | 状态：`生成中`/`已完成`/`未生成`/`生成失败` |
| trackId | integer | 关联视频轨道（→ o_videoTrack） |
| track | text | 轨道分组标识 |
| shouldGenerateImage | integer | 是否需要生成分镜图（0=否，1=是） |
| flowId | integer | 关联图片工作流 |
| index | integer | 排序序号 |
| reason | text | 失败原因 |
| createTime | integer | 创建时间 |

**产品意义：** 分镜是整条链路的核心枢纽，它连接了剧本（上游）和视频生成（下游），同时关联资产（视觉一致性）。

#### `o_assets2Storyboard` — 分镜-资产关联表
| 字段 | 类型 | 说明 |
|------|------|------|
| storyboardId | integer | 关联分镜 |
| assetId | integer | 关联资产 |

**产品意义：** 记录每个分镜用到了哪些角色/场景/道具，是"塑角造景"批量出图和视频提示词生成的数据来源。

---

### 视频层

#### `o_videoTrack` — 视频轨道表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键（时间戳） |
| projectId | integer | 所属项目 |
| scriptId | integer | 所属剧本 |
| videoId | integer | 当前选中的视频ID（→ o_video） |
| prompt | text | 视频生成提示词 |
| state | text | 提示词生成状态 |
| reason | text | 失败原因 |
| duration | integer | 时长（秒） |

**产品意义：** 每个分镜对应一条轨道，轨道上可以有多个候选视频，`videoId` 指向最终选中的那条。

#### `o_video` — 视频片段表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| projectId | integer | 所属项目 |
| scriptId | integer | 所属剧本 |
| videoTrackId | integer | 所属轨道（→ o_videoTrack） |
| filePath | text | 视频文件路径（OSS） |
| state | text | 状态：`生成中`/`生成成功`/`生成失败` |
| errorReason | text | 错误原因 |
| time | integer | 生成时间戳 |

**产品意义：** 同一轨道可以有多条候选视频，用户从中选一条作为最终片段。

---

### Agent 工作流层

#### `o_agentWorkData` — Agent工作流数据表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| projectId | integer | 所属项目 |
| episodesId | integer | 所属剧本（集） |
| key | string | 类型标识（`scriptAgent`/`productionAgent`） |
| data | string | 工作流状态数据（JSON） |
| createTime | integer | 创建时间 |
| updateTime | integer | 更新时间 |

**产品意义：** 保存 Agent 在无限画布上的工作流节点状态，支持断点续作和状态恢复。

---

### 配置层

#### `o_agentDeploy` — Agent模型配置表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| key | string | Agent标识（如 `scriptAgent`、`productionAgent:decisionAgent`） |
| name | string | 显示名称 |
| desc | string | 功能描述 |
| model | string | 模型标识 |
| modelName | string | 模型名称 |
| vendorId | text | 供应商ID（→ o_vendorConfig） |
| temperature | integer | 温度参数 |
| maxOutputTokens | integer | 最大输出 token |
| disabled | boolean | 是否禁用 |

**内置 Agent 列表：**

| key | 名称 | 说明 |
|-----|------|------|
| `scriptAgent` | 剧本Agent | 统筹决策 |
| `productionAgent` | 生产Agent | 制作决策 |
| `universalAi` | 通用AI | 事件提取/提示词生成等边缘功能 |
| `ttsDubbing` | TTS配音 | 配音（默认禁用） |
| `scriptAgent:decisionAgent` | 剧本Agent:决策层 | 决策子Agent |
| `scriptAgent:supervisionAgent` | 剧本Agent:监督层 | 监督子Agent |
| `scriptAgent:storySkeletonAgent` | 剧本Agent:故事骨架 | 骨架生成 |
| `scriptAgent:adaptationStrategyAgent` | 剧本Agent:改编策略 | 改编策略 |
| `scriptAgent:scriptAgent` | 剧本Agent:剧本生成 | 剧本生成 |
| `productionAgent:decisionAgent` | 生产Agent:决策层 | 决策子Agent |
| `productionAgent:supervisionAgent` | 生产Agent:监督层 | 监督子Agent |
| `productionAgent:deriveAssetsAgent` | 生产Agent:衍生资产 | 衍生资产分析 |
| `productionAgent:generateAssetsAgent` | 生产Agent:生成资产 | 资产图生成 |
| `productionAgent:directorPlanAgent` | 生产Agent:导演规划 | 拍摄计划 |
| `productionAgent:storyboardGenAgent` | 生产Agent:分镜生成 | 分镜图生成 |
| `productionAgent:storyboardPanelAgent` | 生产Agent:分镜面板 | 分镜面板写入 |
| `productionAgent:storyboardTableAgent` | 生产Agent:分镜表格 | 分镜表构建 |

#### `o_vendorConfig` — 供应商配置表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 供应商标识（如 `openai`、`deepseek`） |
| inputValues | text | 认证信息（API Key等，JSON） |
| models | text | 模型列表（JSON） |
| enable | integer | 是否启用（0/1） |

**内置供应商：** toonflow / deepseek / atlascloud / volcengine / minimax / openai / klingai / vidu

#### `o_setting` — 系统设置表
| key | 说明 |
|-----|------|
| tokenKey | JWT 签名密钥 |
| messagesPerSummary | 每N条消息触发一次摘要 |
| shortTermLimit | 短期记忆保留条数 |
| summaryMaxLength | 摘要最大长度 |
| summaryLimit | 摘要保留条数 |
| ragLimit | RAG 召回条数 |
| deepRetrieveSummaryLimit | 深度检索摘要条数 |
| modelOnnxFile | ONNX 模型文件路径 |
| modelDtype | ONNX 模型精度 |
| switchAiDevTool | 是否开启 AI 开发工具 |
| agentUseMode | Agent 使用模式 |

#### `o_prompt` — 提示词模板表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| name | string | 模板名称 |
| type | string | 类型标识 |
| data | text | 默认提示词内容 |
| useData | text | 用户自定义内容（覆盖 data） |

**内置模板：**
- `eventExtraction` — 事件提取
- `scriptAssetExtraction` — 剧本资产提取
- `videoPromptGeneration` — 视频提示词生成
- `audioBindPrompt` — 音色绑定

#### `o_modelPrompt` — 模型绑定提示词表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| vendorId | string | 供应商ID |
| model | string | 模型名称 |
| fileName | text | 提示词文件名 |
| path | text | 提示词文件路径 |

**产品意义：** 把特定视频模型和对应的提示词模板文件绑定，生成视频提示词时自动加载对应格式规则。

#### `o_artStyle` — 画风表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| name | string | 画风名称 |
| fileUrl | text | 预览图URL |
| label | text | 显示标签 |
| prompt | text | 画风提示词 |

#### `o_skillList` — Skill文件索引表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | text | 主键（MD5） |
| path | text | 文件路径 |
| name | text | 文件名 |
| description | text | AI生成的描述 |
| embedding | text | 向量嵌入（JSON） |
| type | text | `main`/`references` |
| md5 | text | 文件内容MD5 |
| state | integer | 状态（1=正常，0=生成中，-1=描述为空等） |

**产品意义：** 对 `data/skills/` 目录下所有 Skill 文件建立向量索引，支持 productionAgent 按需语义检索加载。

#### `o_tasks` — 任务中心表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| projectId | integer | 所属项目 |
| taskClass | string | 任务类型（如"视频生成"/"角色图生成"） |
| model | string | 使用的模型 |
| describe | text | 任务描述 |
| relatedObjects | string | 关联对象（JSON） |
| state | string | 任务状态 |
| startTime | integer | 开始时间 |
| reason | text | 失败原因 |

---

### 记忆层

#### `memories` — Agent记忆表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 主键 |
| isolationKey | text | 会话隔离键（`agentType:projectId:scriptId`） |
| type | text | 记忆类型：`message`/`summary`/`rag` |
| content | text | 记忆内容 |
| summarized | integer | 是否已被摘要（0/1） |
| embedding | text | 向量嵌入（JSON，用于RAG检索） |
| createTime | integer | 创建时间 |

- embedding字段的含义：就是content对应的向量
  - 向量是语义检索的唯一计算依据（必须持久保存）
  - content 是人类可读文本，但机器无法直接计算语义相似度；
  - embedding 是文本转成的浮点数组向量，只有靠它才能做余弦相似度匹配，实现 RAG 语义召回

**三层记忆机制：**
- `message` — 短期记忆（最近N条原始消息）
- `summary` — 中期摘要（每N条消息压缩一次）
- `rag` — 语义检索（ONNX向量化，余弦相似度召回）

---

## 三、关键关系总结

```
一个项目（o_project）
  → 多个原著章节（o_novel）→ 事件图谱（o_event + o_eventChapter）
  → 多个剧本集（o_script）
      → 剧本关联资产（o_scriptAssets → o_assets）
      → 多个分镜（o_storyboard）
          → 分镜关联资产（o_assets2Storyboard → o_assets）
          → 视频轨道（o_videoTrack）
              → 多个候选视频（o_video）
  → 项目级资产库（o_assets）
      → 生成图片（o_image，一对多，imageId指向选中的）
      → 图片工作流（o_imageFlow）
      → 音频绑定（o_assetsRole2Audio）
```

**最重要的三条关系链：**

1. **内容链：** `o_novel` → `o_event` → `o_script` → `o_storyboard`
2. **视觉链：** `o_assets` → `o_image` → `o_storyboard.filePath`
3. **视频链：** `o_storyboard` → `o_videoTrack` → `o_video` → 成片
