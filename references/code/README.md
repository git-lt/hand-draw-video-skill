# Remotion 代码模板

本目录是 `hand-draw-video-skill` 默认动画方案的可复用代码模板，对应
**SKILL.md 第 3.2 节「核心动画」**。

## 文件

| 文件 | 说明 |
|------|------|
| `SceneEraser.tsx` | 圆形擦头累积擦除显色动画的单场组件 + 数据类型 |

> 封面图（成片开头静态 1s）不需要单独组件，用一条内联 `<Sequence>` 包全屏 `<Img>`
> 即可（见下方「使用方法」示例），不套 `SceneEraser`。封面图素材由 SKILL.md 第 1.5.0 节生成。

## 动画方案

三阶段（按帧依次触发）：

1. **文字扫入**（0 → 1.0s，30 帧）
2. **灰度图圆形擦除显现**（1.0 → 2.5s，默认 1.5s）
3. **彩色图圆形擦除显色**（2.5 → 4.0s，默认 1.5s）

原理：一个柔软的圆形擦头沿**蛇形扫描路径**（左上 → 右下，逐行往返）移动，
把"已走过的擦头圆心点序列"画成带羽化的圆叠加进 SVG mask，形成连续累积擦痕。
灰度层和彩色层共用同一条路径，各自独立的 progress 与 maskId。

## 配套素材要求（由 SKILL.md 第 1.5.3 节生成）

每个场景需要两张图，**同场景、同尺寸、同构图**：

- 彩色原图：`public/images/<image>`
- 灰度图：    `public/images/<去掉扩展名>-lineart.png`（由彩色图去色得到）

推荐去色方式（灰度图，几何天然 100% 对齐）：

```bash
magick color.png -grayscale Rec709Luma lineart.png
# 或
python3 -c "from PIL import Image; Image.open('color.png').convert('L').save('lineart.png')"
```

## 使用方法

把 `SceneEraser.tsx` 复制到故事项目里（如 `src/SceneEraser.tsx`），再写入口。
**成片开头先放封面图（静态 1s，无动画），之后才是各场擦除动画。** 总时长 =
封面 30 帧 + Σ各场帧数。

```tsx
// src/index.tsx
import {
  Composition,
  Sequence,
  AbsoluteFill,
  Img,
  staticFile,
  registerRoot,
} from "remotion";
import { SceneEraser, EraserSceneData } from "./SceneEraser";

const COVER_IMAGE = "00-cover.png"; // public/images/ 下的封面图，标题/小字已画在图上
const COVER_FRAMES = 30; // 封面静态 1s（无动画）

const SCENES: EraserSceneData[] = [
  {
    image: "01-national-road.png", // public/images/ 下的彩色图文件名
    title: "国道上的兄妹",
    text: "国道上，车很多。\n8岁的哥哥抱着妹妹往前走。",
    lineartDuration: 1.5, // 可省略，默认 1.5s
    colorDuration: 1.5, // 可省略，默认 1.5s
  },
  // ...更多场景
];

const SCENE_FRAMES = 138; // 每场总帧数；默认 4.6s = 文字1.0+灰度1.5+彩色1.5+静止0.6

const Story: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#fff" }}>
    {/* 封面：静态全屏 1s，不套 SceneEraser，无动画 */}
    <Sequence from={0} durationInFrames={COVER_FRAMES}>
      <AbsoluteFill>
        <Img
          src={staticFile(`images/${COVER_IMAGE}`)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    </Sequence>

    {/* 各场擦除动画，from 偏移累加封面帧数 */}
    {SCENES.map((scene, i) => (
      <Sequence
        key={i}
        from={COVER_FRAMES + i * SCENE_FRAMES}
        durationInFrames={SCENE_FRAMES}
      >
        <SceneEraser {...scene} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

const Root: React.FC = () => (
  <Composition
    id="Story"
    component={Story}
    durationInFrames={COVER_FRAMES + SCENE_FRAMES * SCENES.length}
    fps={30}
    width={1080}
    height={1920}
  />
);

registerRoot(Root);
```

> 封面文字（标题 + 「根据社会新闻纪实改编」小字）已在 1.5.0 生成时画进 `00-cover.png`，
> Remotion 中直接展示图片即可，无需再叠加文字层。

## 可调参数

在 `SceneEraser.tsx` 顶部常量区调整：

| 常量 | 默认 | 作用 |
|------|------|------|
| `TEXT_REVEAL` | 30 | 文字扫入帧数（1.0s） |
| `DEFAULT_LINEART_SECS` | 1.5 | 灰度擦除默认秒数 |
| `DEFAULT_COLOR_SECS` | 1.5 | 彩色擦除默认秒数 |
| `TEXT_HEIGHT` | 33 | 文字区高度百分比（图片顶部 33%） |
| `ILLUSTRATION_TOP` | 40 | 插画区起始百分比 |
| `ERASER_RADIUS` | 75 | 擦头基准半径 px |

## 依赖

```json
{
  "dependencies": {
    "react": ">=18",
    "remotion": ">=4.0"
  }
}
```

## 避坑（与 SKILL.md「常见陷阱」联动）

- **封面忘了加进总时长 / 各场 from 偏移没累加封面帧数** → 成片开头被第 1 场盖住、或出现黑帧 → `durationInFrames` 和各场 `from` 都要 `+ COVER_FRAMES(30)`
- **封面套了 SceneEraser** → 封面被当成场景做擦除动画 → 封面用独立 `<Sequence>` 包全屏 `<Img>`，不套擦除组件
- **擦头半径太小 / 行间距过大** → 出现横向条纹空隙 → 行间距必须 ≈ 半径 × 1.3
- **路径 / 半径无抖动** → 擦痕过于规整 → 位置和半径都要加固定种子随机抖动
- 本方案不使用 `mix-blend-mode: multiply`，不会出现"填色后画面变脏"问题（旧扫入方案陷阱 18）

