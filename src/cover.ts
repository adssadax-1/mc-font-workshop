import { convertFileSrc } from "@tauri-apps/api/core";

// 按路径缓存已加载的 FontFace，避免重复网络请求
const fontCache = new Map<string, Promise<FontFace>>();

/** 加载本地字体为 FontFace（asset 协议读取），带缓存 */
export function loadFontForPreview(path: string, id: string): Promise<FontFace> {
  let p = fontCache.get(path);
  if (!p) {
    p = (async () => {
      const resp = await fetch(convertFileSrc(path));
      if (!resp.ok) throw new Error(`加载字体失败: HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      const face = new FontFace(`cover-${id}`, buf);
      await face.load();
      document.fonts.add(face);
      return face;
    })();
    fontCache.set(path, p);
  }
  return p;
}

/** 读取图片文件并输出为 128x128 的 PNG base64（不含 data: 前缀） */
export async function readImageAsPngBase64(
  path: string,
  size = 128
): Promise<string> {
  const resp = await fetch(convertFileSrc(path));
  if (!resp.ok) throw new Error(`读取图片失败: HTTP ${resp.status}`);
  const blob = await resp.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/png").split(",")[1];
}

/**
 * 用指定字体把文字渲染成 128x128 PNG base64（pack.png 标准尺寸）。
 * 白底 + 深灰字，字号自动适配（单字/短文本居中显示）。
 */
export async function textToPngBase64(
  fontPath: string,
  fontId: string,
  text: string
): Promise<string> {
  await loadFontForPreview(fontPath, fontId);
  const sample = text.trim() || "字";
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, 128, 128);
  // 字号自适应：从 110 递减直到文字宽度不超过画布（留 24px 边距）
  let size = 110;
  ctx.font = `${size}px "cover-${fontId}"`;
  while (size > 16 && ctx.measureText(sample).width > 104) {
    size -= 4;
    ctx.font = `${size}px "cover-${fontId}"`;
  }
  ctx.fillStyle = "#333333";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sample, 64, 67);
  return canvas.toDataURL("image/png").split(",")[1];
}
