import React, { useId } from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * 圆形擦头累积擦除显色动画（hand-draw-video-skill 默认方案，对应 SKILL.md 第 3.2 节）。
 *
 * 三阶段（按帧依次触发）：
 *   1. 文字扫入（0 → 1.0s，默认 30 帧）
 *   2. 灰度图圆形擦除显现（1.0 → 2.5s，默认 1.5s / 45 帧）
 *   3. 彩色图圆形擦除显色（2.5 → 4.0s，默认 1.5s / 45 帧）
 *
 * 原理：一个柔软的圆形擦头沿蛇形扫描路径（左上→右下，逐行往返）移动，
 * 把"已走过的擦头圆心点序列"画成带羽化的圆叠加进 SVG mask，
 * 形成连续的累积擦痕。灰度层和彩色层共用同一条路径，各自独立 progress 与 maskId。
 *
 * 可调参数（顶部常量）：
 *   - TEXT_REVEAL          文字扫入帧数（默认 30 = 1.0s）
 *   - DEFAULT_LINEART_SECS 灰度擦除默认秒数（默认 1.5s；可被场景数据覆盖）
 *   - DEFAULT_COLOR_SECS   彩色擦除默认秒数（默认 1.5s；可被场景数据覆盖）
 *   - TEXT_HEIGHT          文字区高度百分比（默认 33，对应图片顶部 33%）
 *   - ILLUSTRATION_TOP     插画区起始百分比（默认 40）
 *   - ERASER_RADIUS        擦头基准半径 px（默认 75；行间距 = 半径 × 1.3）
 *
 * 配套要求（由 SKILL.md 第 1.5.3 节生成）：
 *   - 彩色原图：public/images/<image>
 *   - 灰度图：   public/images/<去掉扩展名>-lineart.png（由彩色图去色得到）
 *
 * 使用：见 references/code/README.md。
 */

const FPS = 30;
const TEXT_REVEAL = 30; // 文字扫入：1.0s
const DEFAULT_LINEART_SECS = 1.5; // 灰度擦除默认 1.5s
const DEFAULT_COLOR_SECS = 1.5; // 彩色擦除默认 1.5s
const TEXT_HEIGHT = 33;
const ILLUSTRATION_TOP = 40;
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const ILLUSTRATION_HEIGHT = CANVAS_HEIGHT * (1 - ILLUSTRATION_TOP / 100);
const ERASER_RADIUS = 75;

export type EraserSceneData = {
  /** 彩色原图文件名（public/images/ 下） */
  image: string;
  title: string;
  text: string;
  /** 灰度图擦除时长，秒。省略用 DEFAULT_LINEART_SECS。 */
  lineartDuration?: number;
  /** 彩色图擦除时长，秒。省略用 DEFAULT_COLOR_SECS。 */
  colorDuration?: number;
  backgroundColor?: string;
};

function lineartName(image: string): string {
  const dot = image.lastIndexOf(".");
  if (dot === -1) return `${image}-lineart`;
  return `${image.slice(0, dot)}-lineart${image.slice(dot)}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** 固定种子扰动，渲染时确定一致、不闪烁。 */
function jitter(seed: number, amount: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return ((value - Math.floor(value)) * 2 - 1) * amount;
}

function makeDiagonalRevealMask(progress: number): string {
  if (progress <= 0) {
    return "linear-gradient(135deg, transparent 0%, transparent 100%)";
  }
  if (progress >= 1) {
    return "linear-gradient(135deg, #000 0%, #000 100%)";
  }

  const edge = progress * 100;
  const solidEdge = Math.max(0, edge - 5);
  return `linear-gradient(135deg, #000 0%, #000 ${solidEdge}%, rgba(0,0,0,0.62) ${edge}%, transparent ${Math.min(100, edge + 2.5)}%, transparent 100%)`;
}

type EraserPoint = { x: number; y: number; r: number };

/**
 * 蛇形扫描路径：从左上角出发，水平往返逐行向下，覆盖整个插画区。
 * 行间距 = 半径 × 1.3，保证相邻行擦痕重叠、无横向条纹空隙。
 * 每个采样点带位置抖动 + 半径随机（55–95px），擦痕边缘参差自然、不规整。
 */
function createEraserPath(): EraserPoint[] {
  const rowGap = ERASER_RADIUS * 1.3;
  const marginX = 60;
  const top = 40;
  const bottom = ILLUSTRATION_HEIGHT - 40;
  const rows = Math.max(2, Math.round((bottom - top) / rowGap) + 1);
  const path: EraserPoint[] = [];

  for (let row = 0; row < rows; row += 1) {
    const leftToRight = row % 2 === 0;
    const y = top + row * rowGap + jitter(row + 1, 14);
    const startX = leftToRight ? marginX : CANVAS_WIDTH - marginX;
    const endX = leftToRight ? CANVAS_WIDTH - marginX : marginX;

    if (row === 0) {
      path.push({ x: startX, y, r: ERASER_RADIUS + jitter(row * 9 + 1, 20) });
    }
    // 每行加密采样点，相邻圆心距 ≤ 半径，擦痕水平方向连续不漏
    const samples = 30;
    for (let s = 1; s <= samples; s += 1) {
      const t = s / samples;
      path.push({
        x: startX + (endX - startX) * t + jitter(row * 20 + s, 34),
        y: y + jitter(row * 30 + s * 2, 26),
        r: ERASER_RADIUS + jitter(row * 50 + s * 3, 20),
      });
    }

    if (row < rows - 1) {
      const nextY = top + (row + 1) * rowGap + jitter(row + 2, 14);
      path.push({
        x: endX + jitter(row * 40 + 1, 22),
        y: (y + nextY) / 2,
        r: ERASER_RADIUS + jitter(row * 70 + 1, 20),
      });
      path.push({
        x: endX,
        y: nextY,
        r: ERASER_RADIUS + jitter(row * 80 + 1, 20),
      });
    }
  }

  return path;
}

const ERASER_PATH = createEraserPath();

/** 沿路径按 progress(0~1) 采样，返回到当前进度为止的所有擦头圆心（含连续插值的当前点）。 */
function getEraserTrail(progress: number): EraserPoint[] {
  if (progress <= 0) return [];
  const total = ERASER_PATH.length;
  const f = progress * (total - 1);
  const idx = Math.floor(f);
  const frac = f - idx;

  const trail: EraserPoint[] = ERASER_PATH.slice(0, idx + 1);
  if (idx < total - 1) {
    const a = ERASER_PATH[idx];
    const b = ERASER_PATH[idx + 1];
    trail.push({
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
      r: a.r + (b.r - a.r) * frac,
    });
  }
  return trail;
}

const CroppedImage: React.FC<{
  src: string;
  top: number;
  bottom: number;
  mask?: string;
}> = ({ src, top, bottom, mask }) => {
  const regionHeight = 100 - top - bottom;
  return (
    <div
      style={{
        position: "absolute",
        top: `${top}%`,
        right: 0,
        bottom: `${bottom}%`,
        left: 0,
        overflow: "hidden",
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    >
      <Img
        src={src}
        style={{
          position: "absolute",
          top: `${-(top / regionHeight) * 100}%`,
          left: 0,
          width: "100%",
          height: `${(100 / regionHeight) * 100}%`,
          objectFit: "cover",
        }}
      />
    </div>
  );
};

const EraserReveal: React.FC<{
  src: string;
  progress: number;
  maskId: string;
  zIndex: number;
}> = ({ src, progress, maskId, zIndex }) => {
  const trail = getEraserTrail(progress);
  const done = progress >= 0.995;

  return (
    <svg
      viewBox={`0 0 ${CANVAS_WIDTH} ${ILLUSTRATION_HEIGHT}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        top: `${ILLUSTRATION_TOP}%`,
        right: 0,
        bottom: 0,
        left: 0,
        width: "100%",
        height: `${100 - ILLUSTRATION_TOP}%`,
        zIndex,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      <defs>
        {/* 擦头羽化：45% 实心 → 100% 透明，边缘柔和 */}
        <radialGradient id={`${maskId}-feather`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="45%" stopColor="white" stopOpacity="1" />
          <stop offset="68%" stopColor="white" stopOpacity="0.85" />
          <stop offset="84%" stopColor="white" stopOpacity="0.5" />
          <stop offset="94%" stopColor="white" stopOpacity="0.2" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          maskContentUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={CANVAS_WIDTH}
          height={ILLUSTRATION_HEIGHT}
        >
          <rect
            width={CANVAS_WIDTH}
            height={ILLUSTRATION_HEIGHT}
            fill={done ? "white" : "black"}
          />
          {done
            ? null
            : trail.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={p.r}
                  fill={`url(#${maskId}-feather)`}
                />
              ))}
        </mask>
      </defs>

      <image
        href={src}
        x="0"
        y={-CANVAS_HEIGHT * (ILLUSTRATION_TOP / 100)}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        preserveAspectRatio="none"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
};

export const SceneEraser: React.FC<EraserSceneData> = ({
  image,
  lineartDuration = DEFAULT_LINEART_SECS,
  colorDuration = DEFAULT_COLOR_SECS,
  backgroundColor = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const safeId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const lineartMaskId = `eraser-lineart-${safeId}`;
  const colorMaskId = `eraser-color-${safeId}`;
  const lineartFrames = Math.max(1, Math.round(lineartDuration * FPS));
  const colorFrames = Math.max(1, Math.round(colorDuration * FPS));
  const colorStart = TEXT_REVEAL + lineartFrames;

  const textProgress = interpolate(frame, [0, TEXT_REVEAL], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lineartRawProgress = interpolate(
    frame,
    [TEXT_REVEAL, colorStart],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const lineartProgress = 1 - Math.pow(1 - lineartRawProgress, 1.25);
  const colorProgress =
    frame <= colorStart ? 0 : Math.min(1, (frame - colorStart) / colorFrames);
  const easedColorProgress = 1 - Math.pow(1 - colorProgress, 1.25);
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.022]);

  const colorSrc = staticFile(`images/${image}`);
  const lineartSrc = staticFile(`images/${lineartName(image)}`);

  return (
    <AbsoluteFill style={{ backgroundColor, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          transform: `scale(${scale})`,
        }}
      >
        {/* Layer 1: 灰度图圆形擦除显现（黑/白照片从白底擦出） */}
        <EraserReveal
          src={lineartSrc}
          progress={lineartProgress}
          maskId={lineartMaskId}
          zIndex={1}
        />

        {/* Layer 2: 彩色图圆形擦除显色（同一路径，把灰度替换为彩色） */}
        <EraserReveal
          src={colorSrc}
          progress={easedColorProgress}
          maskId={colorMaskId}
          zIndex={2}
        />

        {/* Layer 3: 文字区（彩色原图顶部 33%）+ 对角扫入 mask，最上层 */}
        <CroppedImage
          src={colorSrc}
          top={0}
          bottom={100 - TEXT_HEIGHT}
          mask={makeDiagonalRevealMask(textProgress)}
        />
      </div>
    </AbsoluteFill>
  );
};

