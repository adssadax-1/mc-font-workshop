// 与 Rust 侧 serde 定义保持一致（snake_case 字段名）

export type FontFormat = "ttf" | "otf" | "woff" | "woff2";

export interface FontInfo {
  name: string;
  format: FontFormat;
  size_bytes: number;
}

export interface PackFormatInfo {
  single: number | null;
  min_format: number | null;
  max_format: number | null;
}

export interface FontItem {
  id: string;
  /** 实际使用的字体文件路径（非 TTF 转换后为转换产物 ttf） */
  path: string;
  /** 原始字体文件路径（转换前） */
  sourcePath: string;
  /** 展示用文件名（含扩展名） */
  fileName: string;
  /** 魔数校验出的格式（转换后固定为 ttf） */
  format: FontFormat;
  /** 文件大小（字节） */
  sizeBytes: number;
  /** 是否参与导出 */
  enabled: boolean;
  /** 是否经自动转换（OTF→TTF / WOFF·WOFF2 解包） */
  converted?: boolean;
  /** 是否校验失败 */
  invalid?: boolean;
}

export type OverwriteMode = "overwrite" | "custom";

/** 资源包封面配置（pack.png，128x128） */
export interface CoverConfig {
  mode: "none" | "image" | "text";
  /** 128x128 PNG 的 base64（不含 data: 前缀） */
  pngBase64?: string;
}

/** 全局封面生成模式 */
export type GlobalCoverMode = "auto" | "text" | "image" | "none";

/** 全局配置（应用到所有字体的资源包） */
export interface GlobalConfig {
  /** ttf 高级参数：文字大小（像素） */
  size: number;
  shiftX: number;
  shiftY: number;
  oversample: number;
  /** 目标游戏版本 */
  mcVersion: string;
  /** 手动指定 pack_format（优先于版本匹配） */
  packFormatOverride: number | null;
  /** 封面生成：auto=按字体名 / text=自定义文字 / image=自定义图片 / none=不生成 */
  coverMode: GlobalCoverMode;
  /** text 模式的封面文字 */
  coverText: string;
  /** image 模式的封面图片（128x128 PNG base64） */
  coverImage?: string;
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  size: 9,
  shiftX: 0,
  shiftY: 0,
  oversample: 8,
  mcVersion: "1.21.5",
  packFormatOverride: null,
  coverMode: "auto",
  coverText: "字",
  coverImage: undefined,
};

/** 单个字体的独立资源包配置（包名/namespace/覆盖模式/描述/封面） */
export interface FontConfig {
  /** 资源包名称（zip 文件名 + pack.name） */
  packName: string;
  namespace: string;
  mode: OverwriteMode;
  /** 自定义模式下 font json 名称 */
  fontJsonName: string;
  descriptionZh: string;
  descriptionEn: string;
  cover: CoverConfig;
}

/** 新字体的默认配置模板 */
export const DEFAULT_FONT_CONFIG: FontConfig = {
  packName: "",
  namespace: "minecraft",
  mode: "overwrite",
  fontJsonName: "custom",
  descriptionZh: "MC 字体包",
  descriptionEn: "",
  cover: { mode: "none" },
};

export interface ExportOptions {
  output_path: string;
  pack_name: string;
  namespace: string;
  font_json_name: string;
  mode: OverwriteMode;
  mc_version: string;
  pack_format_override: number | null;
  description_zh: string;
  description_en: string;
  cover_png: string | null;
  fonts: {
    path: string;
    file_name: string;
    format: FontFormat;
  }[];
  size: number;
  shift_x: number;
  shift_y: number;
  oversample: number;
}

export interface ExportResult {
  path: string;
  entries: string[];
  size_bytes: number;
  pack_format: number | null;
  min_format: number | null;
  max_format: number | null;
}

/** 单个字体的独立资源包配置（批量导出时使用） */
export interface PerFontItem {
  font: {
    path: string;
    file_name: string;
    format: FontFormat;
  };
  pack_name: string;
  description_zh: string;
  description_en: string;
}

/** 批量导出选项：每个字体一个资源包 */
export interface ExportMultiOptions {
  output_dir: string;
  base: ExportOptions;
  items: PerFontItem[];
}
