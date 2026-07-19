# hand-draw-video-skill ✏️🎬

> 一个让 AI Agent（ZCode / Claude Code / Cursor 等）按可复用工作流，把一段中文故事做成「灰度扫入彩色」手绘风格竖版短视频（9:16）的 Skill。
> 完整覆盖：故事拆分 → 角色全家福参考图 → AI 生图（人物一致）→ Remotion 三层四遮罩动画 → 预览确认 → 渲染 MP4 → 抖音发布文案。

> An **AI-agent Skill** (a single `SKILL.md` + style reference prompts) that turns a Chinese short story into a vertical hand-drawn-style video: **text reveal → grayscale sweep → color sweep**, rendered with [Remotion](https://www.remotion.dev/) at 9:16 / 1080×1920 / 30fps, plus an auto-generated Douyin/TikTok caption. Built for the Chinese short-video audience (warm/healing/family stories). Ships with **4 locked art styles**.

---

## English Summary

`hand-draw-video-skill` is a reusable prompt/skill package (not a runnable app by itself). You drop it into any agent that understands the `SKILL.md` convention (ZCode, Claude Code, Cursor, etc.). Once loaded, you can simply tell the agent something like *"用这个 skill 帮我把下面这段故事做成手绘视频"* and it will drive the full pipeline:

1. **Split** the story into scenes (one image per scene, ≤3 lines / ≤20 chars per line).
2. **Generate a character group portrait** as a visual anchor for cross-scene consistency — *pauses for your confirmation* before going further.
3. **AI-generate each scene** in one of 4 locked styles (A coloring page / B light-color sketch / C Scandinavian gouache / D low-sat coloring page), 9:16, with the Chinese text baked into the top 33%.
4. **Compose in Remotion** using a 3-stage, 4-layer mask animation (`text reveal → grayscale sweep → color sweep`) on the *same source image* (grayscale is just desaturated, never a re-generation — otherwise faces "jump").
5. **Preview** in Remotion Studio → **render** MP4 → **write a Douyin caption**.

Requirements at runtime: Node.js + Remotion, any AI image generator, FFmpeg (optional, for audio mix). See [Dependencies](#依赖-dependencies).

---

## 适用场景

- 想批量做抖音/小红书「人间温暖」「治愈系」「亲子烟火」类手绘故事号的创作者
- 有故事/脚本，想用 AI Agent 一条龙产出竖版动画视频的人
- 想学习「灰度扫入彩色」这种竖版短视频动画原理的开发者

> ⚠️ 本仓库是 **Skill（提示词工程产物）**，不是一个能直接 `npm start` 的应用。它指导 AI Agent 去动态生成 Remotion 项目代码。运行时由 Agent 现场创建。

## 工作管线总览

```
故事拆分 → 角色全家福参考图 → AI生图(逐场,带参考图) → 场景清单(JSON)
       ↓
Remotion合成(四层遮罩: 文字扫入→灰度→彩色)
       ↓
预览确认 → 渲染MP4 → 生成抖音发布文案
```

**两个关键暂停点（skill 强制要求）**：
- 🅰️ 生成角色全家福后**暂停**，展示给用户确认人物形象无误，再继续逐场生图。
- 🅱️ Remotion 代码写完后**暂停**，启动 `npx remotion studio` 预览，用户确认动画效果后再渲染。

## 四种内置绘图风格

全片锁定一种。详细提示词见 `references/styles/*.md`。

| 风格 | 文件 | 视觉特征 | 适用故事类型 |
|------|------|----------|-------------|
| **A — 儿童涂色页** | `references/styles/A.md` | 粗黑马克笔线稿 + 蜡笔露白填色，越界手误 | 童趣、亲子、幼儿园向 |
| **B — 淡彩速写** | `references/styles/B.md` | 靛蓝钢笔线 + 大面积留白 + 单点高饱和橙 | 怀旧、温柔、家庭叙事 |
| **C — 北欧水粉** | `references/styles/C.md` | 矢车菊蓝 + 芥末黄克制配色，水粉干笔纹理 | 温馨、治愈、绘本感 |
| **D — 低饱和涂色** | `references/styles/D.md` | 笨拙线稿 + ≤4 色低饱和 + 单点橙红强调 | 质朴、烟火气、日常记录 |

## 核心动画原理：文字扫入 → 灰度 → 彩色

每场 6.6s（198 帧 @30fps），分三阶段，靠**同一张原图**叠四层 + 不同遮罩策略实现分区独立控制：

```
0s ─── 1.0s ──── 3.2s ─── 5.0s ─── 6.6s
│ 文字扫入 │ 灰度扫入 │ 彩色扫入 │ 静止 │
```

| Layer | 内容 | 遮罩策略 | 作用 |
|-------|------|----------|------|
| 0 | 白色背景 | — | 始终存在 |
| 1 | 原图去色 `grayscale(1)` | 左→右扫入 | 灰度扫入 |
| 2 | 原图彩色 | 左→右扫入 | 彩色扫入 |
| 3 | 原图裁剪上半 33% `clip-path` | 左→右扫入（最上层） | 文字区域永远保持彩色，不被灰度层"染灰" |

> ⚠️ **铁律**：灰度层和彩色层**必须用同一张原图**——灰度只是去色，不是再生成一张"更像线稿的图"，否则彩色扫入瞬间脸会跳。完整实现细节见 `SKILL.md` 第 3.2 节。

## 快速开始

### 1. 把 skill 装进你的 Agent

**ZCode / 任何支持 `~/.<agent>/skills/<name>/SKILL.md` 约定的工具**：
```bash
# 克隆到你的 skills 目录（路径以你的 agent 为准）
git clone https://github.com/git-lt/hand-draw-video-skill.git \
  ~/.zcode/skills/hand-draw-video-skill      # 或 ~/.agents/skills/ 等
```

**Claude Code / Cursor / 其它**：把仓库放到该工具约定的 skills 目录下即可（通常识别 `SKILL.md` frontmatter 里的 `name` 与 `description`）。

### 2. 让 Agent 触发它

装好后，直接对 Agent 说，例如：

> 用 hand-draw-video-skill，帮我把下面这段故事做成手绘视频，风格用 B（淡彩速写）：
>
> （在此粘贴你的故事……）

Agent 会读取 `SKILL.md`，按工作流推进，并在两个关键点暂停等你确认。

### 3. 准备运行环境

Agent 会在渲染阶段现场创建一个 Remotion 项目，所以你需要本机具备：
- Node.js（推荐 18+）
- 一个可用的 AI 图片生成工具（ImageGen / DALL·E / Nano Banana 等，看你的 Agent 接了什么）
- FFmpeg（可选，用于外部音频混音）

详见下一节。

## 依赖 Dependencies

| 依赖 | 用途 | 是否必需 |
|------|------|----------|
| [Node.js](https://nodejs.org/) 18+ | 运行 Remotion | ✅ 必需 |
| [Remotion](https://www.remotion.dev/) | 视频合成与渲染（由 Agent 现场安装到生成的项目） | ✅ 必需 |
| AI 图片生成工具 | 生成场景图与角色全家福 | ✅ 必需 |
| [FFmpeg](https://ffmpeg.org/) | 外部音频 / 人声混音 | ⭕ 可选 |

## 目录结构

```
hand-draw-video-skill/
├── SKILL.md                      # ← 核心文件：Agent 读取的工作流定义
├── README.md                     # 你正在看的这份
├── LICENSE                       # MIT
├── .gitignore
└── references/
    └── styles/
        ├── A.md                  # 风格 A — 儿童涂色页 提示词
        ├── B.md                  # 风格 B — 淡彩速写 提示词
        ├── C.md                  # 风格 C — 北欧水粉 提示词
        └── D.md                  # 风格 D — 低饱和涂色 提示词
```

> 运行时，Agent 生成的 Remotion 项目（`package.json` / `src/*.tsx` / `public/images/*.png` / `out/*.mp4` 等）是**临时产物**，不进本仓库（见 `.gitignore`）。

## 常见陷阱

1. **人物变脸**：灰度层和彩色层用了不同的图 → 必须用同一张原图。
2. **风格混用**：不同场景用了不同的绘图风格 → 全片必须锁定同一种（A/B/C/D）。
3. **生图失败**：AI 生成的图不合格 → 每场最多重试 3 次，换种子 / 微调提示词；仍不行则换风格。
4. **文字错位 / 过长**：超过 3 行或单行过长 → 每场 ≤3 行、每行 ≤20 字、总字数 ≤40；太长 AI 也容易产生错字 / 乱码。
5. **背景太脏**：原图背景复杂 → 换干净的原图。
6. **遮罩漏色**：`mask=0%` 时彩色层左侧透出颜色 → 用 `max(0%, mask - 4%)` 写法。
7. **并行生图覆盖**：多个生图调用同时写同一目录且 prompt 前缀相同会文件名冲突 → 串行生图。

更多细节见 `SKILL.md`。

## 抖音发布文案（Agent 自动生成）

渲染完成后，Agent 会按以下规格在项目目录生成 `douyin-caption.txt`：
- 总长 3–5 句、不超过 120 字
- 结构：钩子句 → 故事核心（不剧透）→ 情感收尾
- 末尾 3–5 个话题标签（含 `#原创动画 #手绘故事`）

## 许可证

[MIT](./LICENSE) © 2026 liutao

欢迎 Issue / PR：补充新风格（`references/styles/E.md`…）、改进动画时序、增加横版/方版输出等。
