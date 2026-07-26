/**
 * 主题对比度守护测试。
 *
 * 背景：亮色主题曾出现 197 条低对比（同一 alpha 阶梯套两套主题、
 * -content 手填白色、品牌黄当文字色）。此测试对 tailwind.config.ts
 * 的两套 daisyUI 主题和 tokens.css 的语义 alpha 令牌做 WCAG 断言，
 * 任何回归会在 CI 直接失败。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import tailwindConfig from "../../tailwind.config";

type ThemeColors = Record<string, string>;

const themes = (
  tailwindConfig as unknown as {
    daisyui: { themes: Array<Record<string, ThemeColors>> };
  }
).daisyui.themes;

const doodle = themes[0].doodle;
const doodleDark = themes[1]["doodle-dark"];

const tokensCss = readFileSync(
  resolve(__dirname, "./tokens.css"),
  "utf-8",
);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: [number, number, number], bg: [number, number, number]) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** 前景带 alpha 时先与背景做 sRGB 合成，再算对比度 */
function alphaContrast(fg: string, alpha: number, bg: string) {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const composited: [number, number, number] = [
    f[0] * alpha + b[0] * (1 - alpha),
    f[1] * alpha + b[1] * (1 - alpha),
    f[2] * alpha + b[2] * (1 - alpha),
  ];
  return contrast(composited, b);
}

/** 从 tokens.css 提取某主题块下令牌的 alpha 或 hex 值 */
function tokenValue(block: "root" | "dark", name: string): string {
  const source =
    block === "root"
      ? tokensCss.slice(0, tokensCss.indexOf('[data-theme="doodle-dark"]'))
      : tokensCss.slice(tokensCss.indexOf('[data-theme="doodle-dark"]'));
  const m = source.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`tokens.css 中找不到 ${name}`);
  return m[1].trim();
}

function tokenAlpha(block: "root" | "dark", name: string): number {
  const v = tokenValue(block, name);
  const m = v.match(/\/\s*([\d.]+)\)/);
  if (!m) throw new Error(`${name} 不是带 alpha 的 oklch 令牌: ${v}`);
  return parseFloat(m[1]);
}

const SEMANTIC_PAIRS = [
  "primary",
  "secondary",
  "accent",
  "neutral",
  "info",
  "success",
  "warning",
  "error",
] as const;

const BASE_SURFACES = ["base-100", "base-200", "base-300"] as const;

describe.each([
  ["doodle", doodle, "root" as const],
  ["doodle-dark", doodleDark, "dark" as const],
])("主题 %s", (_name, theme, block) => {
  it.each(SEMANTIC_PAIRS.map((k) => [k]))(
    "%s 底 + 对应 -content 文字 ≥ 4.5:1",
    (key) => {
      const bg = hexToRgb(theme[key]);
      const fg = hexToRgb(theme[`${key}-content`]);
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(BASE_SURFACES.map((s) => [s]))(
    "base-content 满不透明度在 %s 上 ≥ 7:1",
    (surface) => {
      expect(
        contrast(hexToRgb(theme["base-content"]), hexToRgb(theme[surface])),
      ).toBeGreaterThanOrEqual(7);
    },
  );

  it.each(BASE_SURFACES.map((s) => [s]))(
    "--bc-muted（次级正文）在 %s 上 ≥ 4.5:1",
    (surface) => {
      const alpha = tokenAlpha(block, "--bc-muted");
      expect(
        alphaContrast(theme["base-content"], alpha, theme[surface]),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(BASE_SURFACES.map((s) => [s]))(
    "--bc-subtle（装饰标签）在 %s 上 ≥ 3:1",
    (surface) => {
      const alpha = tokenAlpha(block, "--bc-subtle");
      expect(
        alphaContrast(theme["base-content"], alpha, theme[surface]),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(BASE_SURFACES.map((s) => [s]))(
    "--primary-ink（品牌黄的文字形态）在 %s 上 ≥ 4.5:1",
    (surface) => {
      const ink = tokenValue(block, "--primary-ink");
      expect(
        contrast(hexToRgb(ink), hexToRgb(theme[surface])),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("error 作为文字色在 base-100 上 ≥ 4.5:1（GRADE_COLORS 等 text-error 用法）", () => {
    expect(
      contrast(hexToRgb(theme.error), hexToRgb(theme["base-100"])),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
