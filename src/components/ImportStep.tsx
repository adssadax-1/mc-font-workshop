import { useCallback, useEffect, useRef, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Space,
  Tag,
  Tooltip,
} from "antd";
import {
  InboxOutlined,
  FileAddOutlined,
  DeleteOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  formatBytes,
  pickFontFiles,
  uid,
  validateFont,
  convertFont,
} from "../commands";
import type { FontFormat, FontItem } from "../types";

/** 各格式在 Minecraft 中的加载兼容性提示（无提示返回 null） */
function formatWarning(format: FontFormat): string | null {
  switch (format) {
    case "otf":
      return "OTF 为 CFF/PostScript 轮廓，Minecraft 无法渲染其字形，建议先转成 TTF 再使用";
    case "woff":
      return "WOFF 需要 Minecraft 1.19.4+ 才能加载";
    case "woff2":
      return "WOFF2 需要 Minecraft 1.21.3+ 才能加载";
    default:
      return null;
  }
}

/** 用 FontFace + Canvas 渲染字形预览（宽度随文字自适应） */
function FontPreview({ font, text }: { font: FontItem; text: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(convertFileSrc(font.path));
        const buf = await resp.arrayBuffer();
        const face = new FontFace(`preview-${font.id}`, buf);
        await face.load();
        document.fonts.add(face);
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d")!;
        const sample = text.trim() || "ABC 中文测试 123";
        const fontSpec = `18px "preview-${font.id}"`;
        // 先按目标字号量宽，动态调整画布宽度（60 ~ 380）
        ctx.font = fontSpec;
        const w = ctx.measureText(sample).width;
        canvas.width = Math.min(Math.max(Math.ceil(w) + 24, 60), 380);
        // 重设宽度会清空并重置 context 状态，需重新设置
        ctx.font = fontSpec;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#333333";
        ctx.textBaseline = "middle";
        ctx.fillText(sample, 12, canvas.height / 2 + 1);
      } catch {
        /* 预览失败则留空画布 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [font.path, font.id, text]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={40}
      className="preview-canvas"
    />
  );
}

interface Props {
  fonts: FontItem[];
  setFonts: React.Dispatch<React.SetStateAction<FontItem[]>>;
  onNext: () => void;
  /** 新字体加入时初始化其独立配置（packName 默认=字体名，description 默认=字体原本名称） */
  onFontCreated: (id: string, packName: string, defaultDescZh?: string) => void;
  /** 字体删除时清理其配置 */
  onFontRemoved: (id: string) => void;
}

export default function ImportStep({ fonts, setFonts, onNext, onFontCreated, onFontRemoved }: Props) {
  const { message, modal } = AntApp.useApp();
  const [dragging, setDragging] = useState(false);
  const [previewText, setPreviewText] = useState("ABC 中文测试 123");
  // 最新 fonts 引用：addPaths 里做「同源文件只处理一次」检查（避免重复转换大文件）
  const fontsRef = useRef(fonts);
  useEffect(() => {
    fontsRef.current = fonts;
  }, [fonts]);

  const addPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      const newItems: FontItem[] = [];
      for (const path of paths) {
        if (fontsRef.current.some((f) => f.sourcePath === path)) continue;
        try {
          const info = await validateFont(path);
          if (info.format !== "ttf") {
            // OTF：先弹风险确认（转换不保证 100% 兼容 + 字体许可问题）
            if (info.format === "otf") {
              const ok = await new Promise<boolean>((resolve) => {
                modal.confirm({
                  title: "OTF 字体风险提示",
                  content:
                    "OTF（CFF 轮廓）Minecraft 无法直接渲染其字形，将自动转换为 TTF 后导入。转换不保证 100% 兼容（变体、复杂字形可能显示异常）；且请确认该字体许可允许修改。是否继续？",
                  okText: "继续转换",
                  cancelText: "跳过",
                  onOk: () => resolve(true),
                  onCancel: () => resolve(false),
                });
              });
              if (!ok) continue;
            } else {
              message.warning(
                `${info.name}.${info.format}: ${formatWarning(
                  info.format
                )}，将自动转换为 TTF`
              );
            }
            const key = `convert-${path}`;
            message.loading({
              content: `正在转换 ${info.name} → TTF（大字体可能需十几秒）…`,
              key,
              duration: 0,
            });
            try {
              const res = await convertFont(path);
              const id = uid();
              // description 默认 = 资源包名称（字体文件名）
              onFontCreated(id, info.name, info.name);
              newItems.push({
                id,
                path: res.path,
                sourcePath: path,
                fileName: info.name + ".ttf",
                format: "ttf",
                sizeBytes: res.size_bytes || info.size_bytes,
                enabled: true,
                converted: true,
              });
              message.success({ content: `${info.name} 已转换为 TTF`, key });
            } catch (e) {
              message.error({ content: `${info.name} 转换失败: ${String(e)}`, key });
            }
          } else {
            const id = uid();
            // description 默认 = 资源包名称（字体文件名）
            onFontCreated(id, info.name, info.name);
            newItems.push({
              id,
              path,
              sourcePath: path,
              fileName: info.name + "." + info.format,
              format: info.format,
              sizeBytes: info.size_bytes,
              enabled: true,
            });
          }
        } catch (e) {
          message.error(String(e));
        }
      }
      if (newItems.length === 0) return;
      // 函数式更新：以最新 state 去重（同一路径只保留一条），并发添加也安全
      setFonts((prev) => {
        const existing = new Set(prev.map((f) => f.path));
        const merged = [...prev];
        for (const item of newItems) {
          if (!existing.has(item.path)) {
            existing.add(item.path);
            merged.push(item);
          }
        }
        return merged;
      });
    },
    [message, modal, setFonts]
  );

  // Tauri 拖拽事件（拖入字体文件得到路径）
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setDragging(true);
        } else if (event.payload.type === "leave") {
          setDragging(false);
        } else if (event.payload.type === "drop") {
          setDragging(false);
          addPaths(event.payload.paths);
        }
      })
      .then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlisten = fn;
        }
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [addPaths]);

  const removeFont = (id: string) => {
    setFonts((prev) => prev.filter((f) => f.id !== id));
    onFontRemoved(id);
  };

  const toggleEnabled = (id: string, enabled: boolean) =>
    setFonts((prev) => prev.map((f) => (f.id === id ? { ...f, enabled } : f)));

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        title="① 导入字体"
        extra={<Button onClick={() => void pickFontFiles().then(addPaths)} icon={<FileAddOutlined />}>选择字体文件</Button>}
      >
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onClick={() => void pickFontFiles().then(addPaths)}
        >
          <div className="dz-icon">
            <InboxOutlined style={{ color: "#4A90D9" }} />
          </div>
          <div className="dz-title">点击选择或拖入字体文件</div>
          <div className="dz-hint">支持 .ttf / .otf / .woff / .woff2，可多选（自动校验文件头）</div>
        </div>
      </Card>

      <Card
        title={`字体列表（${fonts.length}）`}
        extra={
          <Space>
            <span style={{ color: "#999", fontSize: 12 }}>预览文字</span>
            <Input
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder="输入文字预览字形效果"
              style={{ width: 240 }}
              allowClear
            />
          </Space>
        }
      >
        {fonts.length === 0 ? (
          <Empty description="尚未导入字体" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {fonts.map((f) => (
              <Card
                key={f.id}
                size="small"
                styles={{ body: { padding: "12px 16px 8px" } }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <Checkbox
                    checked={f.enabled}
                    onChange={(e) => toggleEnabled(f.id, e.target.checked)}
                  />
                  <div style={{ width: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Tooltip title={f.path}>
                      <b>{f.fileName}</b>
                    </Tooltip>
                  </div>
                  <Tag color="blue">{f.format.toUpperCase()}</Tag>
                  {f.converted && (
                    <Tag color="green" style={{ marginInlineEnd: 0 }}>
                      已转换 TTF
                    </Tag>
                  )}
                  {formatWarning(f.format) && (
                    <Tooltip title={formatWarning(f.format)}>
                      <WarningOutlined style={{ color: "#faad14" }} />
                    </Tooltip>
                  )}
                  <span style={{ color: "#999", fontSize: 12, width: 70 }}>
                    {formatBytes(f.sizeBytes)}
                  </span>
                  <FontPreview font={f} text={previewText} />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeFont(f.id)}
                    style={{ marginLeft: "auto" }}
                  />
                </div>
                <div style={{ color: "#999", fontSize: 12, marginTop: 6 }}>
                  该字体的资源包配置请在「② 配置」步骤中设置（每个字体独立）
                </div>
              </Card>
            ))}
          </Space>
        )}
      </Card>

      <div style={{ textAlign: "right" }}>
        <Button
          type="primary"
          size="large"
          disabled={fonts.length === 0}
          onClick={onNext}
        >
          下一步：配置
        </Button>
      </div>
    </Space>
  );
}
