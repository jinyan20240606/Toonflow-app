# Toonflow 提示词架构文档

---

## 零、多参模式（Multi-Parameter Mode）是什么

**多参模式**是视频生成时传入参考资料的方式，决定了视频模型接受哪些输入类型和数量。

### 0.1 模式类型对比

在代码中（`src/utils/ai.ts`），`VideoMode` 类型定义如下：

```typescript
type VideoMode =
  | "singleImage"          // 单图参考（一张图作为参考帧）
  | "startEndRequired"     // 首尾帧（首帧和尾帧都必须提供）
  | "endFrameOptional"     // 首尾帧（尾帧可选，可只传首帧）
  | "startFrameOptional"   // 首尾帧（首帧可选，可只传尾帧）
  | "text"                 // 纯文本（不需要任何参考图）
  | Array<"videoReference:N" | "imageReference:N" | "audioReference:N">;
  //       ↑ 多参模式：JSON 数组，每个元素指定一类参考资料及其数量上限
```

**判断是否为多参**（`src/agents/productionAgent/index.ts`）：
```typescript
const isRef = Array.isArray(videoMode) ? true : false;
```

| 模式类型 | mode 值示例 | 能传什么参考资料 | 代表模型 |
|---------|-----------|--------------|---------|
| 多参模式 | `["imageReference:5", "videoReference:1"]` | 最多5张图 + 1段视频 | KlingOmni |
| 首尾帧 | `"startEndRequired"` | 仅首帧图 + 尾帧图 | Seedance 1.5 Pro |
| 单图 | `"singleImage"` | 仅一张参考图 | 部分旧模型 |

### 0.2 实际效果对比示例

同一个分镜（沈辞在城楼上望远，资产：角色图@图1、场景图@图2、分镜构图@图3）：

**多参模式（KlingOmni）生成的视频提示词**：
```
[References]
@图1 : [沈辞参考图]      ← 角色一致性参考图（衍生资产图）
@图2 : [城楼参考图]      ← 场景一致性参考图（衍生资产图）
@图3 : [分镜图1]         ← 分镜构图参考图（AI 生成的分镜图）

[Instruction]
Based on the storyboard @图3 :
@图1 standing alone atop the city wall, hands clasped behind back, robes billowing in the wind,
set in the ancient city wall environment of @图2 ,
wide establishing shot, static camera, cinematic,
resolute determination,
no dialogue,
wind howling, fabric flapping rhythmically.
```
> AI 模型会同时"看"三张参考图：知道沈辞长什么样、城楼长什么样、这个分镜的构图是什么，角色一致性强。

**首尾帧模式（Seedance 1.5 Pro）生成的视频提示词**：
```
[Visual]
Shen Ci: male, dark flowing robes, hair tied up, standing alone atop city wall,
hands clasped behind back, silent.
Ancient city wall, vast open land beyond, dusk sky fading.
Cinematic, photorealistic, 4K, high contrast.

[Motion]
0s-4s: Shen Ci stands still on city wall edge, robes flutter in wind,
gaze fixed on distant horizon.

[Camera]
Wide establishing shot, static camera, single continuous take, no cuts.

[Audio]
0s-4s: Wind howling across wall, fabric flapping rhythmically. No dialogue.
Shen Ci — silent.

[Narrative]
Lone figure on city wall. Tension and determination. Single continuous take.
```
> 不含任何 `@图N` 引用，靠纯文字描述角色外貌。模型看不到参考图，角色一致性完全依赖文字。

### 0.3 使用场景选择

| 场景 | 推荐模式 | 原因 |
|-----|---------|-----|
| 需要角色面容高度一致（如真实人物、固定角色形象） | 多参模式（KlingOmni 等）| 可以传入角色参考图，模型直接感知外貌 |
| 追求运动流畅性，有明确首帧/尾帧构图要求 | 首尾帧模式 | 首帧控制起始画面，尾帧控制结束画面，中间过渡由模型生成 |
| 高质量中文台词口型同步（国产视频模型）| Seedance 2.0 多参 | 专属格式，支持 `@图N` + 台词音色9维度描述 |
| 追求电影感单镜叙事，无角色一致性需求 | Wan 2.6 首帧 | 叙事式英文提示词，单图首帧，画面质感好 |

### 0.4 对提示词模板选择的影响

`batchGeneratePrompt` 接口根据 model 名称和 mode 自动选择提示词模板：

| 判断条件 | 使用模板 |
|---------|---------|
| 模型名含 `wan2.6` | `wan2.6Single-imageFirstFrameMode.md` |
| 模型名含 `seedance2.0` | `seedance2Multi-parameterMode.md` |
| `mode` 为 `"startEndRequired"` / `"endFrameOptional"` / `"startFrameOptional"` | `universalFirstAndLastFrameMode.md`（纯文本五维度格式）|
| `mode` 为 JSON 数组字符串 | `universalMulti-parameterMode.md`（`@图N` 引用格式）|

---

> 本文档以"一个完整的生产 Agent 执行示例"为主线，展示每个 Agent 调用时携带的完整提示词组织方式。
> 目标：让开发者能够脱离项目代码，直接在任意大模型对话界面手动复现相同效果。

---

## 一、AI 调用模式：单次调用 vs ReAct 循环

### 1.1 两种调用模式的区分

项目中存在两种 AI 文本调用模式：

| 调用方式 | SDK 方法 | 工具调用 | 本质 | 使用场景 |
|---------|---------|---------|-----|---------|
| **单次调用（invoke）** | `generateText()` | 无/有（但不循环）| 一次请求，一次响应 | 简单文本生成任务 |
| **ReAct 循环（stream）** | `streamText()` + tools | 多次循环调用 | 多步推理，自主调用工具 | Agent 决策/执行 |

**单次调用（invoke）的使用场景**（全部在 HTTP 路由层，不在 Agent 中）：
```
u.Ai.Text("universalAi").invoke(...)
```
- `cleanNovel.ts`：清洗小说文本（调用事件提取提示词，单次分析一章）
- `memory.ts`：生成记忆摘要（单次压缩多条对话）、判断摘要相关性
- `batchGenerateAssetsImage.ts`：生成资产图片提示词
- `polishAssetsPrompt.ts` / `batchPolishAssetsPrompt.ts`：润色资产提示词
- `extractAssets.ts`：从剧本中提取资产列表
- `getAiRegex.ts`：生成 AI 正则规则
- `batchBindAudio.ts`：音色匹配
- `extractStylePrompt.ts`：提取画风提示词
- `batchGeneratePrompt.ts`：视频提示词生成
- `generateVideoPrompt.ts`：单条视频提示词生成
- `textTest.ts`：模型连通性测试

**ReAct 循环（stream）的使用场景**（仅在 Agent 层）：
- `agents/productionAgent/index.ts`：决策层 + 所有子 Agent
- `agents/scriptAgent/index.ts`：决策层 + 所有子 Agent
- `routes/setting/vendorConfig/modelTest.ts`：模型测试（流式展示效果，但无工具）

### 1.2 ReAct 循环原理

Agent（决策层、执行层子 Agent）使用 Vercel AI SDK 的 `streamText` 驱动，底层是标准的 **ReAct（Reasoning + Acting）循环**：

```
AI 思考 → 决定调用工具 → 工具执行 → 结果返回给 AI → AI 继续思考 → 决定调用下一个工具 → ... → AI 输出最终文本，本轮结束
```

**代码中的关键配置**（`src/utils/ai.ts`）：
```typescript
return streamText({
  ...(input.tools && { stopWhen: stepCountIs(Object.keys(input.tools).length * 50) }),
  // ↑ 工具数 × 50 步上限，防止无限循环
  ...input,
  model: await this.resolveModel(...),
});
```

一个 Agent 在一次用户请求中可以 **多次调用工具**，例如分镜面板写入子 Agent 对一集 10 条分镜，会循环调用 10 次 `add_flowData_storyboard`。

### 1.2 两层 Agent 的不同循环策略

| Agent 层 | 循环策略 | 典型执行步数 |
|---------|---------|------------|
| 决策层（decisionAgent）| 一次请求中调用 1-3 个子 Agent 工具（每个子 Agent 是同步工具调用，等待子 Agent 完成） | 1-3 步工具调用 |
| 执行层子 Agent | 多次调用工作区读/写工具（先读现状，再循环写入每条数据） | 1次读 + N次写（N=数据条数）|
| 记忆工具 | AI 自主决定是否调用，不强制 | 0-2 步 |

### 1.3 子 Agent 工具是同步阻塞的

决策层调用 `run_sub_agent_storyboard_panel` 时，该工具内部会启动一个完整的 `streamText` 推理流程并等待完成（`await consumeFullStream(...)`），**期间决策层的 ReAct 循环暂停**，直到子 Agent 返回结果后，决策层才继续下一步。

```
决策层循环：
  Step 1: 思考 → 调用 run_sub_agent_storyboard_panel(prompt)
  [等待中...]
    子 Agent 循环：
      Step 1: 读 get_flowData("storyboardTable")
      Step 2: 激活 activate_skill("director_storyboard")
      Step 3: 调用 add_flowData_storyboard({分镜1...})
      Step 4: 调用 add_flowData_storyboard({分镜2...})
      ...
      Step N: 输出确认文本，循环结束
  [返回结果]
  Step 2: 决策层根据返回结果决定下一步（如派发 run_sub_agent_storyboard_gen）
```

### 1.4 停止条件

每个 Agent 的 ReAct 循环有三种停止方式：
1. **AI 自然停止**：AI 判断任务完成，不再调用工具，输出最终文字后结束
2. **步数上限**：达到 `工具数 × 50` 步（防死循环保护）
3. **用户中止**：前端发送 `stop` 事件 → `abortController.abort()` → 抛出 `AbortError`

---

## 二、提示词架构总览

每次 AI 调用都由以下几层消息组成（按 messages 数组顺序）：

```
[system]   → Agent 角色定义 + 核心职责 + 执行规则（来自 data/skills/*.md）
[assistant] → 上下文注入（记忆 + 项目信息 + 技能清单）
[user]     → 用户/决策层的实际指令
```

---

## 二、完整示例：生产 Agent 执行"分镜面板写入"

### 场景设定

- 项目：《穿越古代的霸道总裁》
- 画风：`2D_90s_japanese_anime`（90年代日式动画）
- 叙事类型：`Sweet_romance_novel`（甜宠言情）
- 视频模型：KlingOmni（多参模式）
- 图像模型：Seedream

---

### 第一层：决策层 Agent 调用

**调用时机**：用户在聊天框发送"帮我生成分镜面板"

#### messages 结构

```
[system]
  ← data/skills/production_agent_decision.md 全文

[assistant]
  ← 记忆上下文（Memory）
  ← 模型信息

[user]
  ← "帮我生成分镜面板"
```

#### [system] 内容（来自 `data/skills/production_agent_decision.md`）

```
# 决策层 Agent 技能指令

你是视频制作项目的**决策层 Agent**，**只负责决策和任务派发**：理解用户意图、拆解任务、调度执行层与监督层、把控质量。
你是唯一与用户直接对接的 Agent，执行层和监督层只接收你派发的指令。

**核心原则：**
- **决策层不执行具体任务**，不读取工作区数据（不调用 get_flowData）...

## 制作流水线
六个阶段必须按顺序执行：
阶段1: 导演规划 → 阶段2: 衍生资产分析 → ... → 阶段5: 分镜面板写入 → 阶段6: 分镜图生成

...（完整文件内容）
```

#### [assistant] 内容（代码动态拼装）

```
## Memory
以下是你对用户的记忆，可作为参考但不要主动提及：
[相关记忆]
用户上次确认了6集、每集3分钟的配置，覆盖第1-20章

[历史摘要]
1. 用户完成了导演规划阶段，拍摄计划已写入工作区
2. 衍生资产分析完成，共识别出12个衍生资产

[近期对话]
user: 衍生资产生成完了吗
assistant:decision: 衍生资产已全部生成完毕，可以进入下一阶段

项目使用的模型如下：
图像模型：Seedream
视频模型：KlingOmni
多参：是
```

#### [user] 内容

```
帮我生成分镜面板
```

#### 决策层可用工具（代码注入）

```
memory.getTools()：
  - save_memory(content)：保存重要信息到长期记忆
  - deepRetrieve(keyword)：深度检索历史记忆

useTools()：
  - get_flowData(key)：获取工作区数据（script/scriptPlan/assets/storyboard/storyboardTable）

createSubAgent()：
  - run_sub_agent_director_plan(prompt)：派发导演规划任务
  - run_sub_agent_derive_assets(prompt)：派发衍生资产分析任务
  - run_sub_agent_generate_assets(prompt)：派发衍生资产图片生成任务
  - run_sub_agent_storyboard_table(prompt)：派发分镜表构建任务
  - run_sub_agent_storyboard_panel(prompt)：派发分镜面板写入任务  ← 本次触发
  - run_sub_agent_storyboard_gen(prompt)：派发分镜图生成任务
  - run_sub_agent_supervision(prompt)：派发监督层审核任务
```

**决策层 AI 输出**：调用 `run_sub_agent_storyboard_panel({ prompt: "根据分镜表，为第1集生成完整的分镜面板，每条分镜调用 add_flowData_storyboard 写入" })`

---

### 第二层：分镜面板写入子 Agent 调用

**调用时机**：决策层调用 `run_sub_agent_storyboard_panel` 工具

#### messages 结构

```
[system]
  ← data/skills/production_execution_storyboard_panel.md 全文
  ← 格式约束追加（代码拼接）

[assistant]
  ← 生产技能上下文（技能清单 XML）
  ← 模型信息

[user]
  ← 决策层传入的 prompt
```

#### [system] 内容

**主体**（来自 `data/skills/production_execution_storyboard_panel.md`）：
```
# 执行层 Agent — 分镜面板写入

你是视频制作项目的**执行层 Agent**，接收决策层派发的任务指令并执行。

## 通用规则
- 执行前先调用 get_flowData 确认工作区状态...

## 五、分镜面板写入

### 工具
| 操作 | 调用 |
|------|------|
| 读取剧本 | get_flowData("script") |
| 读取分镜表 | get_flowData("storyboardTable") |
| 写入分镜面板（逐条） | add_flowData_storyboard({ ... }) |

...（完整文件内容）
```

**代码追加的格式约束**（`addPrompt`）：
```
你必须使用如下XML格式写入工作区：
<storyboardItem videoDesc='视频描述' prompt=提示词内容 track='分组' shouldGenerateImage='true/false' duration='视频推荐时间' associateAssetsIds='[该分镜所需的资产ID列表]'></storyboardItem>
```

#### [assistant] 内容（生产技能上下文）

**来源**：`useProductionSkills(artName="2D_90s_japanese_anime", storyName="Sweet_romance_novel")` 扫描三个目录后构建

```
## Skills
以下技能提供了专业任务的专用指令。
当任务与某个技能的描述匹配时，调用 activate_skill 工具并传入技能名称来加载完整指令。

<available_skills>
  <skill>
    <name>director_planning_style</name>
    <description>日式动画约束 — 定义90年代日式动画在色调体系、光影方案、质感方向、场景空间元素、乐器选择与环境音上的全局约束。适用于任何叙事类型。</description>
  </skill>
  <skill>
    <name>director_storyboard_table_style</name>
    <description>日式动画分镜表风格约束 — 定义90年代日式动画在分镜表字段填写上的风格化规范...</description>
  </skill>
  <skill>
    <name>director_storyboard</name>
    <description>日式动画分镜图提示词技法 — 风格锚定词、情绪映射、光影词库、场景质感...</description>
  </skill>
  <skill>
    <name>director_planning_narrative</name>
    <description>叙事手法技法 · 甜宠言情 — 定义甜宠言情类型在主题立意、情感节奏、场景情绪设计与声音方向上的叙事规划方法。</description>
  </skill>
  <skill>
    <name>director_storyboard_table_narrative</name>
    <description>分镜表叙事化填写规范 · 甜宠言情 — ...</description>
  </skill>
  <skill>
    <name>storyboard_prompt_techniques</name>
    <description>通用分镜提示词技法参考。涵盖提示词解析映射规则、景别词库、输出格式规范、提示词结构框架、画质规范、图像资产标注规则、人物位置连贯性规则等。</description>
  </skill>
  <skill>
    <name>storyboard_table_techniques</name>
    <description>通用分镜表技法参考。涵盖分镜拆分原则、定场与镜头合并规则、视觉连续性铁律、字段填写指引、转场规则等。</description>
  </skill>
</available_skills>

项目使用的模型如下：
图像模型：Seedream
视频模型：KlingOmni
多参：是
```

#### [user] 内容

```
根据分镜表，为第1集生成完整的分镜面板，每条分镜调用 add_flowData_storyboard 写入

你必须使用如下XML格式写入工作区：
<storyboardItem videoDesc='视频描述' prompt=提示词内容 track='分组' shouldGenerateImage='true/false' duration='视频推荐时间' associateAssetsIds='[该分镜所需的资产ID列表]'></storyboardItem>
```

#### 子 Agent 可用工具

```
useTools()：
  - get_flowData(key)：获取工作区数据
  - add_deriveAsset(...)：新增/更新衍生资产
  - del_deriveAsset(...)：删除衍生资产
  - generate_deriveAsset(ids)：触发衍生资产图片生成
  - generate_storyboard(ids)：触发分镜图片生成
  - add_flowData_storyboard(...)：新增分镜到工作区  ← 本次主要使用

activate_skill(name)：按需加载技能完整内容
read_skill_file(filePath)：读取技能资源文件
```

#### 子 Agent 执行过程

1. 调用 `get_flowData("storyboardTable")` 读取分镜表
2. 调用 `activate_skill("director_storyboard")` 加载日式动画分镜图提示词技法
3. 调用 `activate_skill("storyboard_prompt_techniques")` 加载通用分镜提示词技法
4. 逐条调用 `add_flowData_storyboard({...})` 写入每条分镜

---

## 三、如何手动在大模型复现

### 3.1 复现决策层

在大模型对话界面：

**System（系统提示词）**：
```
粘贴 data/skills/production_agent_decision.md 的完整内容
```

**第一条 Assistant 消息**（模拟记忆和项目信息）：
```
## Memory
以下是你对用户的记忆，可作为参考但不要主动提及：
[近期对话]
user: 分镜表已经生成完了
assistant:decision: 好的，分镜表已完成，可以进入分镜面板写入阶段

项目使用的模型如下：
图像模型：Seedream
视频模型：KlingOmni
多参：是
```

**User 消息**：
```
帮我生成分镜面板
```

> 注意：手动复现时，工具调用（`run_sub_agent_storyboard_panel` 等）无法真正执行，但 AI 会告诉你它会调用哪个工具、传什么参数，你可以据此手动进入下一层。

---

### 3.2 复现分镜面板写入子 Agent

**System（系统提示词）**：
```
粘贴 data/skills/production_execution_storyboard_panel.md 的完整内容

（末尾追加）
你必须使用如下XML格式写入工作区：
<storyboardItem videoDesc='视频描述' prompt=提示词内容 track='分组' shouldGenerateImage='true/false' duration='视频推荐时间' associateAssetsIds='[该分镜所需的资产ID列表]'></storyboardItem>
```

**第一条 Assistant 消息**（模拟技能清单 + 模型信息）：
```
## Skills
以下技能提供了专业任务的专用指令。
当任务与某个技能的描述匹配时，调用 activate_skill 工具并传入技能名称来加载完整指令。

<available_skills>
  <skill>
    <name>director_storyboard</name>
    <description>日式动画分镜图提示词技法 — 风格锚定词、情绪映射、光影词库...</description>
  </skill>
  <skill>
    <name>storyboard_prompt_techniques</name>
    <description>通用分镜提示词技法参考。涵盖提示词解析映射规则、景别词库...</description>
  </skill>
  ...（其他技能）
</available_skills>

项目使用的模型如下：
图像模型：Seedream
视频模型：KlingOmni
多参：是
```

**User 消息**：
```
根据以下分镜表，生成完整的分镜面板：

（粘贴分镜表内容）

以下是当前资产列表：
（粘贴资产列表，格式：ID | 名称 | 类型）

你必须使用如下XML格式写入工作区：
<storyboardItem videoDesc='视频描述' prompt=提示词内容 track='分组' shouldGenerateImage='true/false' duration='视频推荐时间' associateAssetsIds='[该分镜所需的资产ID列表]'></storyboardItem>
```

> 手动复现时，当 AI 说"调用 activate_skill(director_storyboard)"，你需要手动将 `data/skills/art_skills/2D_90s_japanese_anime/driector_skills/director_storyboard.md` 的内容粘贴给它，模拟工具返回。

---

## 四、剧本 Agent 提示词架构（对比参考）

### 故事骨架生成子 Agent

```
[system]
  ← data/skills/script_execution_skeleton.md 全文
  ← 格式约束："\n你必须使用如下XML格式写入工作区：\n<storySkeleton>故事骨架内容</storySkeleton>"

[user]
  ← 决策层传入的 prompt + 格式约束
```

**无技能上下文**（剧本 Agent 的子 Agent 不加载 art_skills / story_skills）

**可用工具**：
- `get_planData(key)`：读取工作区（storySkeleton / adaptationStrategy / script）
- `get_novel_events(chapterIndexs)`：读取章节事件
- `get_novel_text(chapterIndex)`：读取章节原文
- `get_script_content(ids)`：读取剧本内容

---

## 五、提示词层级汇总表

| Agent | System 来源 | Assistant 注入内容 | 可用工具 |
|-------|------------|-------------------|---------|
| scriptAgent 决策层 | `script_agent_decision.md` | 记忆 + 项目信息 | 记忆工具 + 查询工具 + 4个子Agent工具 |
| scriptAgent 故事骨架 | `script_execution_skeleton.md` + 格式约束 | 无 | 查询工具（get_planData / get_novel_events / get_novel_text） |
| scriptAgent 改编策略 | `script_execution_adaptation.md` + 格式约束 | 无 | 查询工具 |
| scriptAgent 剧本生成 | `script_execution_script.md` + 格式约束 | 剧本列表 + 章节数 | 查询工具 |
| scriptAgent 监督层 | `script_agent_supervision.md` | 无 | 查询工具 |
| productionAgent 决策层 | `production_agent_decision.md` | 记忆 + 模型信息 | 记忆工具 + 查询工具 + 7个子Agent工具 |
| productionAgent 衍生资产分析 | `production_execution_derive_assets.md` | **画风技能清单** + 模型信息 | 工作区工具 + activate_skill |
| productionAgent 衍生资产生成 | `production_execution_generate_assets.md` | **画风技能清单** + 模型信息 | 工作区工具 + activate_skill |
| productionAgent 导演规划 | `production_execution_director_plan.md` + 格式约束 | **画风技能清单** + 模型信息 | 工作区工具 + activate_skill |
| productionAgent 分镜图生成 | `production_execution_storyboard_gen.md` | **画风技能清单** + 模型信息 | 工作区工具 + activate_skill |
| productionAgent 分镜面板写入 | `production_execution_storyboard_panel.md` + 格式约束 | **生产技能清单** + 模型信息 | 工作区工具 + activate_skill |
| productionAgent 分镜表构建 | `production_execution_storyboard_table.md` + 格式约束 | **生产技能清单** + 模型信息 | 工作区工具 + activate_skill |
| productionAgent 监督层 | `production_agent_supervision.md` | 无 | 工作区工具 |

> **画风技能清单** = art_skills/{artName}/driector_skills/ + story_skills/{storyName}/driector_skills/ 的技能 name+description 列表
> **生产技能清单** = 画风技能清单 + production_skills/ 的技能 name+description 列表

---

## 六、关键设计原则

1. **System 是角色定义**：告诉 AI "你是谁、你的职责是什么、你的约束是什么"，来自可编辑的 `.md` 文件
2. **Assistant 是上下文注入**：告诉 AI "当前项目的状态是什么、有哪些技能可用"，由代码动态拼装
3. **User 是任务指令**：来自用户输入或上层 Agent 的 prompt 参数
4. **技能是懒加载的**：AI 先看技能清单（description），判断需要时再调用 `activate_skill` 加载完整内容，避免一次性塞入过多 token
5. **格式约束追加在 system 末尾**：确保 AI 输出符合下游解析要求（XML 标签格式）
6. **工具是 AI 与系统的双向通道**：`get_flowData` 读取前端状态，`add_flowData_storyboard` 写入前端状态，实现 AI ↔ 前端的实时双向同步
