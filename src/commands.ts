import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  ExportMultiOptions,
  ExportOptions,
  ExportResult,
  FontInfo,
  PackFormatInfo,
} from "./types";

/** 打开文件选择框（支持多选字体文件） */
export async function pickFontFiles(): Promise<string[]> {
  try {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "字体文件",
          extensions: ["ttf", "otf", "woff", "woff2"],
        },
      ],
    });
    if (!selected) return [];
    return (Array.isArray(selected) ? selected : [selected]).filter(
      (p): p is string => typeof p === "string"
    );
  } catch (e) {
    // Tauri v2 权限未配置时 invoke 会被拒绝，这里必须抛出给 UI 展示
    throw new Error(`打开文件对话框失败: ${String(e)}`);
  }
}

/** Rust：校验字体魔数，返回格式/大小 */
export function validateFont(path: string): Promise<FontInfo> {
  return invoke<FontInfo>("validate_font", { path });
}

export interface ConvertResult {
  path: string;
  size_bytes: number;
}

/** Rust：调用 convert_font.py 把非 TTF 字体转为 TTF（OTF→TTF / WOFF·WOFF2 解包） */
export function convertFont(path: string): Promise<ConvertResult> {
  return invoke<ConvertResult>("convert_font", { path });
}

/** Rust：读取字体 name 表全名（fullName） */

/** Rust：版本号 → pack_format */
export function packFormatForVersion(
  version: string
): Promise<PackFormatInfo> {
  return invoke<PackFormatInfo>("pack_format_for_version", { version });
}

/** Rust：生成资源包 zip（含写后校验） */
export function exportPack(options: ExportOptions): Promise<ExportResult> {
  return invoke<ExportResult>("export_pack", { options });
}

/** Rust：批量导出，每个字体生成一个独立资源包 zip */
export function exportMulti(options: ExportMultiOptions): Promise<ExportResult[]> {
  return invoke<ExportResult[]>("export_multi", { options });
}

/** Rust：资源管理器定位文件 */
export function openInExplorer(path: string): Promise<void> {
  return invoke<void>("open_in_explorer", { path });
}

/** 格式化文件大小 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** 生成本地唯一 id */
export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
