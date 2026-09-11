export type ThemeMode = "light" | "dark" | "system";
export type ChatSkin = "workbench" | "rounded";
export interface ChatColors {
  canvas: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  onAccent: string;
  accentText: string;
  focus: string;
  userBackground: string;
  userText: string;
  danger: string;
  disabledBackground: string;
  disabledText: string;
}
export interface ChatTokens extends ChatColors {
  fontFamily: string;
  fontSize: number;
  smallFontSize: number;
  controlHeight: number;
  controlRadius: number;
  messageRadius: number;
  panelRadius: number;
  space: number;
  panelWidth: number;
  panelHeight: number;
  breakpoint: number;
  motionMs: number;
  zIndex: number;
}
export interface ChatThemeOptions {
  mode?: ThemeMode;
  skin?: ChatSkin;
  accent?: string;
  tokens?: Partial<ChatTokens>;
}
export const primitiveColors = {
  black: "#000000",
  white: "#ffffff",
  navy: "#172b42",
  muted: "#48596a",
  line: "#dce2e8",
  surface: "#f6f8fa",
  blue: "#0758a0",
  selected: "#e1edf8",
  error: "#99252c",
  dark: "#111b28",
  darkSurface: "#1d2a3b",
  darkText: "#edf3fa",
  darkMuted: "#b2c2d6",
  darkLine: "#4d6075",
  darkBlue: "#8ec5ff",
  darkSelected: "#263d55",
  darkError: "#ffadb1",
} as const;
const p = primitiveColors;
export const lightColors: ChatColors = {
  canvas: p.white,
  surface: p.surface,
  text: p.navy,
  muted: p.muted,
  border: p.line,
  accent: p.blue,
  onAccent: p.white,
  accentText: p.blue,
  focus: p.blue,
  userBackground: p.selected,
  userText: p.navy,
  danger: p.error,
  disabledBackground: p.surface,
  disabledText: p.muted,
};
export const darkColors: ChatColors = {
  canvas: p.dark,
  surface: p.darkSurface,
  text: p.darkText,
  muted: p.darkMuted,
  border: p.darkLine,
  accent: p.darkBlue,
  onAccent: p.dark,
  accentText: p.darkBlue,
  focus: p.darkBlue,
  userBackground: p.darkSelected,
  userText: p.darkText,
  danger: p.darkError,
  disabledBackground: p.darkSurface,
  disabledText: p.darkMuted,
};
export const layoutTokens = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 16,
  smallFontSize: 13,
  controlHeight: 44,
  controlRadius: 6,
  messageRadius: 12,
  panelRadius: 12,
  space: 16,
  panelWidth: 420,
  panelHeight: 680,
  breakpoint: 600,
  motionMs: 160,
  zIndex: 1000,
};
export const skins: Record<
  ChatSkin,
  Pick<ChatTokens, "controlRadius" | "messageRadius" | "panelRadius" | "space">
> = {
  workbench: {
    controlRadius: 6,
    messageRadius: 12,
    panelRadius: 12,
    space: 16,
  },
  rounded: { controlRadius: 14, messageRadius: 20, panelRadius: 20, space: 20 },
};
function luminance(hex: string) {
  const c = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const colorKeys = Object.keys(lightColors) as (keyof ChatColors)[];
export function resolveChatTheme(
  options: ChatThemeOptions = {},
  systemDark = false,
): ChatTokens {
  if (options.mode === "system") {
    const light = resolveChatTheme({ ...options, mode: "light" });
    const dark = resolveChatTheme({ ...options, mode: "dark" });
    return systemDark ? dark : light;
  }
  if (options.mode && !["light", "dark", "system"].includes(options.mode))
    throw Error("CHAT_INVALID_THEME");
  if (options.skin && !Object.hasOwn(skins, options.skin))
    throw Error("CHAT_INVALID_SKIN");
  const dark = options.mode === "dark";
  const colors = { ...(dark ? darkColors : lightColors) };
  const accent = options.accent ?? options.tokens?.accent;
  if (accent) {
    if (!/^#[a-f0-9]{6}$/i.test(accent)) throw Error("CHAT_INVALID_COLOR");
    colors.accent = accent;
    colors.onAccent =
      contrast(accent, p.white) >= contrast(accent, p.black)
        ? p.white
        : p.black;
    colors.accentText =
      contrast(accent, colors.canvas) >= 4.5 ? accent : colors.text;
    colors.focus = contrast(accent, colors.canvas) >= 3 ? accent : colors.text;
  }
  const result = {
    ...layoutTokens,
    ...colors,
    ...skins[options.skin ?? "workbench"],
    ...options.tokens,
  };
  for (const key of colorKeys)
    if (!/^#[a-f0-9]{6}$/i.test(result[key])) throw Error("CHAT_INVALID_COLOR");
  for (const [key, value] of Object.entries(result))
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0))
      throw Error("CHAT_INVALID_TOKEN");
  if (
    result.fontSize < 14 ||
    result.smallFontSize < 12 ||
    result.controlHeight < 44 ||
    result.panelWidth < 300 ||
    result.panelHeight < 320 ||
    result.breakpoint < 320 ||
    result.motionMs > 1000
  )
    throw Error("CHAT_INVALID_TOKEN");
  for (const [foreground, background] of [
    [result.text, result.canvas],
    [result.muted, result.canvas],
    [result.text, result.surface],
    [result.muted, result.surface],
    [result.onAccent, result.accent],
    [result.userText, result.userBackground],
    [result.danger, result.canvas],
  ])
    if (contrast(foreground!, background!) < 4.5)
      throw Error("CHAT_THEME_CONTRAST");
  return result;
}
export const tokenVariable = (key: string) =>
  "--ae-chat-" + key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
export function applyChatTheme(
  element: HTMLElement,
  options: ChatThemeOptions = {},
  onChange?: (tokens: ChatTokens) => void,
) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  let current = structuredClone(options);
  const apply = () => {
    const tokens = resolveChatTheme(current, media.matches);
    for (const [key, value] of Object.entries(tokens))
      element.style.setProperty(
        tokenVariable(key),
        typeof value === "number"
          ? String(value) +
              (key === "zIndex" ? "" : key === "motionMs" ? "ms" : "px")
          : value,
      );
    element.style.colorScheme =
      current.mode === "dark" || (current.mode === "system" && media.matches)
        ? "dark"
        : "light";
    onChange?.(tokens);
    return tokens;
  };
  apply();
  media.addEventListener("change", apply);
  return {
    update: (next: ChatThemeOptions) => {
      resolveChatTheme(next, media.matches);
      current = structuredClone(next);
      return apply();
    },
    destroy: () => media.removeEventListener("change", apply),
  };
}
