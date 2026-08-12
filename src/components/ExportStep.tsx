import { useState } from "react";
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Descriptions,
  List,
  Radio,
  Space,
  Statistic,
  Tooltip,
} from "antd";
import {
  DownloadOutlined,
  FolderOpenOutlined,
  CheckCircleFilled,
  FolderAddOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  exportMulti,
  exportPack,
  formatBytes,
  openInExplorer,
} from "../commands";
import { textToPngBase64 } from "../cover";
import type {
  ExportMultiOptions,
  ExportOptions,
  ExportResult,
  FontConfig,
  FontItem,
  GlobalConfig,
} from "../types";
import { DEFAULT_FONT_CONFIG, DEFAULT_GLOBAL_CONFIG } from "../types";

interface Props {
  fonts: FontItem[];
  fontConfigs: Record<string, FontConfig>;
  globalConfig: GlobalConfig;
  enabledCount: number;
}

/** 组装单个资源包的导出选项：每字体配置（包名/namespace/覆盖模式/描述/封面）+ 全局（版本/高级参数） */
function buildOptions(
  cfg: FontConfig,
  global: GlobalConfig,
  outputPath: string,
  fontList: { path: string; file_name: string; format: FontItem["format"] }[],
  coverB64: string | null
): ExportOptions {
  return {
    output_path: outputPath,
    pack_name: cfg.packName,
    namespace: cfg.namespace,
    font_json_name: cfg.fontJsonName,
    mode: cfg.mode,
    mc_version: global.mcVersion,
    pack_format_override: global.packFormatOverride,
    description_zh: cfg.descriptionZh,
    description_en: cfg.descriptionEn,
    cover_png: coverB64,
    fonts: fontList,
    size: global.size,
    shift_x: global.shiftX,
    shift_y: global.shiftY,
    oversample: global.oversample,
  };
}

/** 取封面：字体手动封面优先；否则按全局封面模式生成（auto=按字体名 / text=自定义文字 / image=共用图片 / none=无） */
async function resolveCover(
  font: FontItem,
  cfg: FontConfig,
  global?: GlobalConfig
): Promise<string | null> {
  if (cfg.cover.mode !== "none" && cfg.cover.pngBase64) {
    return cfg.cover.pngBase64;
  }
  const mode = global?.coverMode ?? "none";
  switch (mode) {
    case "image":
      return global?.coverImage ?? null;
    case "text":
      return textToPngBase64(font.path, font.id, global?.coverText || "字");
    case "auto":
      return textToPngBase64(
        font.path,
        font.id,
        font.fileName.replace(/\.[^.]+$/, "")
      );
    default:
      return null;
  }
}

export default function ExportStep({
  fonts,
  fontConfigs,
  globalConfig = DEFAULT_GLOBAL_CONFIG,
  enabledCount,
}: Props) {
  const { message } = AntApp.useApp();
  const [mode, setMode] = useState<"each" | "merge">("each");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExportResult[] | null>(null);

  const enabledFonts = fonts.filter((f) => f.enabled && !f.invalid);

  /** 合并模式使用第一个启用字体的配置 */
  const mergeConfig: FontConfig | undefined = enabledFonts[0]
    ? (fontConfigs[enabledFonts[0].id] ?? DEFAULT_FONT_CONFIG)
    : undefined;

  /** 合并模式：导出一个 zip（所有字体，用第一个字体的配置 + 全局参数） */
  const doExportMerge = async () => {
    if (!mergeConfig || !enabledFonts[0]) return;
    const outPath = await save({
      defaultPath: `${mergeConfig.packName || "font-pack"}.zip`,
      filters: [{ name: "ZIP 资源包", extensions: ["zip"] }],
    });
    if (!outPath) return;
    setLoading(true);
    try {
      const finalPath = outPath.toLowerCase().endsWith(".zip")
        ? outPath
        : `${outPath}.zip`;
      const coverB64 = await resolveCover(
        enabledFonts[0],
        mergeConfig,
        globalConfig
      );
      const res = await exportPack(
        buildOptions(
          mergeConfig,
          globalConfig,
          finalPath,
          enabledFonts.map((f) => ({
            path: f.path,
            file_name: f.fileName,
            format: f.format,
          })),
          coverB64
        )
      );
      setResults([res]);
      message.success("资源包已生成并通过校验");
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  /** 每字体一包模式：选目录，批量生成独立 zip（各自配置 + 全局参数） */
  const doExportEach = async () => {
    const dir = await open({ directory: true });
    if (!dir || typeof dir !== "string") return;
    setLoading(true);
    try {
      const results: ExportResult[] = [];
      for (const f of enabledFonts) {
        const cfg = fontConfigs[f.id] ?? DEFAULT_FONT_CONFIG;
        const coverB64 = await resolveCover(f, cfg, globalConfig);
        const base = buildOptions(
          cfg,
          globalConfig,
          "",
          [{ path: f.path, file_name: f.fileName, format: f.format }],
          coverB64
        );
        const options: ExportMultiOptions = {
          output_dir: dir,
          base,
          items: [
            {
              font: { path: f.path, file_name: f.fileName, format: f.format },
              pack_name: cfg.packName || f.fileName.replace(/\.[^.]+$/, ""),
              description_zh: cfg.descriptionZh,
              description_en: cfg.descriptionEn,
            },
          ],
        };
        const res = await exportMulti(options);
        results.push(res[0]);
      }
      setResults(results);
      message.success(`已生成 ${results.length} 个独立资源包并通过校验`);
    } catch (e) {
      message.error(String(e));
    } finally {
      setLoading(false);
    }
  };

  const fmtInfo = (r: ExportResult) =>
    r.pack_format != null
      ? `pack_format ${r.pack_format}`
      : `min_format ${r.min_format} / max_format ${r.max_format}`;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="③ 导出">
        <Descriptions
          column={3}
          size="small"
          items={[
            { key: "ver", label: "游戏版本（全局）", children: globalConfig.mcVersion },
            { key: "cnt", label: "参与导出的字体", children: enabledCount },
            { key: "size", label: "字体总大小", children: formatBytes(enabledFonts.reduce((s, f) => s + f.sizeBytes, 0)) },
          ]}
        />
        {enabledCount === 0 && (
          <Alert
            type="warning"
            showIcon
            message="当前没有可导出的字体"
            description="请回到「导入字体」步骤添加并勾选字体。"
            style={{ marginTop: 12 }}
          />
        )}

        <div style={{ marginTop: 20 }}>
          <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
            <Radio value="each">
              每个字体一个资源包（推荐，各自独立配置）
            </Radio>
            <Radio value="merge">
              全部合并为一个资源包
              <Tooltip title="合并包使用第一个启用字体的配置（包名/描述/封面等），版本与高级参数用全局配置">
                <QuestionCircleOutlined style={{ marginLeft: 6, color: "#999" }} />
              </Tooltip>
            </Radio>
          </Radio.Group>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          {mode === "each" ? (
            <Button
              type="primary"
              size="large"
              icon={<FolderAddOutlined />}
              loading={loading}
              disabled={enabledCount === 0}
              onClick={() => void doExportEach()}
            >
              选择导出目录并批量导出
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              loading={loading}
              disabled={enabledCount === 0}
              onClick={() => void doExportMerge()}
            >
              导出资源包 zip
            </Button>
          )}
          {results && results.length > 0 && (
            <Button
              size="large"
              icon={<FolderOpenOutlined />}
              onClick={() => void openInExplorer(results[0].path)}
            >
              打开导出目录
            </Button>
          )}
        </div>
      </Card>

      {results && results.length > 0 && (
        <Card
          title={
            <Space>
              <CheckCircleFilled style={{ color: "#52c41a" }} />
              导出成功（{results.length} 个资源包，均已校验）
            </Space>
          }
        >
          {results.length === 1 ? (
            <Space size={32} wrap>
              <Statistic title="完整路径" value={results[0].path} valueStyle={{ fontSize: 14, fontWeight: 500 }} />
              <Statistic title="文件大小" value={formatBytes(results[0].size_bytes)} />
              <Statistic title="资源包格式" value={fmtInfo(results[0])} />
            </Space>
          ) : (
            <List
              size="small"
              dataSource={results}
              renderItem={(r) => (
                <List.Item
                  actions={[
                    <Button
                      key="open"
                      size="small"
                      icon={<FolderOpenOutlined />}
                      onClick={() => void openInExplorer(r.path)}
                    >
                      打开
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={r.path.split(/[\\/]/).pop()}
                    description={`${formatBytes(r.size_bytes)} · ${fmtInfo(r)}`}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      )}
    </Space>
  );
}
