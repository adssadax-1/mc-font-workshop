// Minecraft § 格式码解析：把带格式码的文本拆成可渲染的样式片段

export interface FormatSegment {
  text: string;
  color: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  obfuscated: boolean;
}

export const MC_COLORS: Record<string, string> = {
  "0": "#000000",
  "1": "#0000AA",
  "2": "#00AA00",
  "3": "#00AAAA",
  "4": "#AA0000",
  "5": "#AA00AA",
  "6": "#FFAA00",
  "7": "#AAAAAA",
  "8": "#555555",
  "9": "#5555FF",
  a: "#55FF55",
  b: "#55FFFF",
  c: "#FF5555",
  d: "#FF55FF",
  e: "#FFFF55",
  f: "#FFFFFF",
};

/** 解析 §x 格式码，返回样式片段列表（§ 本身不输出） */
export function parseMinecraftFormat(text: string | undefined | null): FormatSegment[] {
  if (typeof text !== "string" || text.length === 0) return [];
  const segs: FormatSegment[] = [];
  let cur: FormatSegment = {
    text: "",
    color: null,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    obfuscated: false,
  };

  const apply = (code: string) => {
    if (code in MC_COLORS) {
      cur.color = MC_COLORS[code];
    } else {
      switch (code) {
        case "l":
          cur.bold = true;
          break;
        case "o":
          cur.italic = true;
          break;
        case "n":
          cur.underline = true;
          break;
        case "m":
          cur.strikethrough = true;
          break;
        case "k":
          cur.obfuscated = true;
          break;
        case "r":
          cur = {
            text: "",
            color: null,
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false,
            obfuscated: false,
          };
          break;
      }
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "§" && i + 1 < text.length) {
      if (cur.text) {
        segs.push(cur);
        cur = { ...cur, text: "" };
      }
      apply(text[i + 1].toLowerCase());
      i += 2;
    } else {
      cur.text += ch;
      i++;
    }
  }
  if (cur.text) segs.push(cur);
  return segs;
}

/** §k 乱码：基于文本做稳定伪随机替换 */
function obfuscate(s: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let seed = 0;
  for (const c of s) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out += chars[seed % chars.length];
  }
  return out;
}

/** 渲染为 React 节点（用于实时预览） */
export function renderSegments(segs: FormatSegment[], keyPrefix = ""): React.ReactNode[] {
  return segs.map((s, i) => {
    const decorations = [
      s.underline ? "underline" : null,
      s.strikethrough ? "line-through" : null,
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <span
        key={`${keyPrefix}${i}`}
        style={{
          color: s.color ?? "#FFFFFF",
          fontWeight: s.bold ? 700 : 400,
          fontStyle: s.italic ? "italic" : "normal",
          textDecoration: decorations || "none",
          textShadow: "1px 1px 0 rgba(0,0,0,0.35)",
        }}
      >
        {s.obfuscated ? obfuscate(s.text) : s.text}
      </span>
    );
  });
}
