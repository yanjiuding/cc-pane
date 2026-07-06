// 终端字体规范化：xterm.js 按主字体测量固定格宽，若字体链缺少中文等宽
// fallback，CJK 字形会由浏览器随机 fallback 到非等宽字体，宽度与格宽不匹配
// 导致中文重叠碎裂。这里对不含 CJK 字体的链自动补 fallback，存量配置免迁移。

export const DEFAULT_TERMINAL_FONT_FAMILY =
  '"Maple Mono NF CN", "Maple Mono", "Cascadia Code", "Cascadia Mono", "JetBrains Mono", Consolas, "Sarasa Mono SC", "Microsoft YaHei UI", "PingFang SC", monospace';

// 追加到用户字体链末尾的 CJK fallback（generic monospace 之前）。
const CJK_FALLBACK_FONTS =
  '"Maple Mono NF CN", "Sarasa Mono SC", "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC"';

// 小写子串匹配：命中任一即认为字体链已具备 CJK 渲染能力。
const CJK_CAPABLE_HINTS = [
  "maple mono nf cn",
  "sarasa",
  "yahei",
  "pingfang",
  "noto sans sc",
  "noto sans cjk",
  "noto serif sc",
  "noto serif cjk",
  "source han",
  "simhei",
  "simsun",
  "nsimsun",
  "dengxian",
  "fangsong",
  "kaiti",
  "harmonyos",
  "wenquanyi",
  "heiti",
  "songti",
  "mono cn",
  "mono sc",
  "mono tc",
  "sc mono",
  "lxgw",
  "微软雅黑",
  "苹方",
  "黑体",
  "宋体",
  "等线",
];

export function fontFamilyHasCjkFallback(fontFamily: string): boolean {
  const lower = fontFamily.toLowerCase();
  return CJK_CAPABLE_HINTS.some((hint) => lower.includes(hint));
}

export function normalizeTerminalFontFamily(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_TERMINAL_FONT_FAMILY;
  if (fontFamilyHasCjkFallback(trimmed)) return trimmed;

  // 在末尾的 generic monospace 之前插入 CJK fallback，保持 generic 兜底在最后。
  const families = trimmed.split(",").map((f) => f.trim()).filter(Boolean);
  const genericIndex = families.findIndex((f) => /^monospace$/i.test(f));
  if (genericIndex >= 0) {
    families.splice(genericIndex, 0, CJK_FALLBACK_FONTS);
  } else {
    families.push(CJK_FALLBACK_FONTS, "monospace");
  }
  return families.join(", ");
}
