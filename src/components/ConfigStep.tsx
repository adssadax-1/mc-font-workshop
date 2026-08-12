import { useEffect, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Collapse,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Switch,
  Tabs,
  Tooltip,
} from "antd";
import { QuestionCircleOutlined, PictureOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { packFormatForVersion } from "../commands";
import { MC_VERSIONS } from "../versions";
import { readImageAsPngBase64 } from "../cover";
import type { PackFormatInfo } from "../types";
import { DEFAULT_FONT_CONFIG, DEFAULT_GLOBAL_CONFIG } from "../types";
import type { FontConfig, FontItem, GlobalConfig } from "../types";
import DescriptionEditor from "./DescriptionEditor";
import FormatPreview from "./FormatPreview";
import CoverPanel from "./CoverPanel";

interface Props {
  fonts: FontItem[];
  fontConfigs: Record<string, FontConfig>;
  patchFontConfig: (id: string, patch: Partial<FontConfig>) => void;
  globalConfig: GlobalConfig;
  patchGlobalConfig: (patch: Partial<GlobalConfig>) => void;
  onNext: () => void;
}

/** 单个字体的独立配置表单（包名/namespace/覆盖模式/描述/封面） */
function FontConfigForm({
  font,
  config,
  patch,
}: {
  font: FontItem;
  config: FontConfig;
  patch: (p: Partial<FontConfig>) => void;
}) {
  return (
    <Form layout="vertical" style={{ maxWidth: 760 }}>
      <Form.Item label="资源包名称（导出 zip 文件名 + pack.name）" required>
        <Input
          value={config.packName}
          onChange={(e) => patch({ packName: e.target.value })}
          placeholder="例如：我的字体包"
          maxLength={64}
        />
      </Form.Item>

      <Form.Item
        label={
          <Space size={4}>
            namespace
            <Tooltip title="字体文件与 JSON 存放的命名空间，需小写。覆盖默认字体时使用 minecraft">
              <QuestionCircleOutlined style={{ color: "#999" }} />
            </Tooltip>
          </Space>
        }
      >
        <Input
          value={config.namespace}
          onChange={(e) => patch({ namespace: e.target.value })}
          placeholder="minecraft（覆盖默认字体）或自定义，如 myfonts"
          style={{ width: 320 }}
        />
      </Form.Item>

      <Form.Item label="覆盖模式">
        <Radio.Group
          value={config.mode}
          onChange={(e) => patch({ mode: e.target.value })}
        >
          <Radio value="overwrite">覆盖默认字体（assets/minecraft/font/default.json）</Radio>
          <Radio value="custom">附加自定义字体（assets/&lt;ns&gt;/font/&lt;name&gt;.json）</Radio>
        </Radio.Group>
        {config.mode === "custom" && (
          <Input
            value={config.fontJsonName}
            onChange={(e) => patch({ fontJsonName: e.target.value })}
            placeholder="自定义字体 JSON 名称（如 myfont）"
            style={{ width: 320, marginTop: 8 }}
          />
        )}
      </Form.Item>

      <Form.Item
        label={
          <Space size={4}>
            description（中文 / zh_cn）
            <Tooltip title="1.20.5+ 且填写了 English 时，自动生成多语言 description 对象">
              <QuestionCircleOutlined style={{ color: "#999" }} />
            </Tooltip>
          </Space>
        }
      >
        <DescriptionEditor
          value={config.descriptionZh}
          onChange={(v) => patch({ descriptionZh: v })}
        />
        <div style={{ marginTop: 8 }}>
          <FormatPreview text={config.descriptionZh} />
        </div>
      </Form.Item>

      <Form.Item label="description English（en_us，可选）">
        <Input.TextArea
          value={config.descriptionEn}
          onChange={(e) => patch({ descriptionEn: e.target.value })}
          placeholder="例如：Chinese Font Pack（留空则 description 为纯文本）"
          autoSize={{ minRows: 1, maxRows: 3 }}
        />
      </Form.Item>

      <CoverPanel
        cover={config.cover}
        patchCover={(p) => patch({ cover: { ...config.cover, ...p } })}
        font={font}
      />
    </Form>
  );
}

/** 全局配置（版本 / 高级参数 / 自动封面），应用到所有字体 */
function GlobalConfigPanel({
  global = DEFAULT_GLOBAL_CONFIG,
  patch,
}: {
  global?: GlobalConfig;
  patch: (p: Partial<GlobalConfig>) => void;
}) {
  const { message } = AntApp.useApp();
  const [pfInfo, setPfInfo] = useState<PackFormatInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (global.packFormatOverride != null) {
      setPfInfo({
        single: global.packFormatOverride,
        min_format: null,
        max_format: null,
      });
      return;
    }
    packFormatForVersion(global.mcVersion)
      .then((info) => {
        if (!cancelled) setPfInfo(info);
      })
      .catch((e) => message.error(String(e)));
    return () => {
      cancelled = true;
    };
  }, [global.mcVersion, global.packFormatOverride, message]);

  const pfText = pfInfo
    ? pfInfo.single != null
      ? `pack_format ${pfInfo.single}`
      : `min_format ${pfInfo.min_format} / max_format ${pfInfo.max_format}`
    : "匹配中…";

  const pickGlobalImage = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "图片",
          extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"],
        },
      ],
    });
    if (!selected || typeof selected !== "string") return;
    try {
      const b64 = await readImageAsPngBase64(selected);
      patch({ coverImage: b64 });
      message.success("全局封面图片已导入（128x128）");
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <Card title="全局配置（应用到所有字体）" size="small">
      <Form layout="vertical">
        <Form.Item label="目标游戏版本（自动匹配 pack_format，应用到所有字体）">
          <Space wrap>
            <Select
              value={global.mcVersion}
              onChange={(v) => patch({ mcVersion: v })}
              options={MC_VERSIONS}
              style={{ width: 260 }}
              showSearch
            />
            <span style={{ color: "#4A90D9", fontWeight: 600 }}>{pfText}</span>
            <span style={{ color: "#999", fontSize: 12 }}>
              1.21.9+ 自动改用 min_format / max_format
            </span>
          </Space>
        </Form.Item>

        <Form.Item label="手动指定 pack_format">
          <Space>
            <Switch
              checked={global.packFormatOverride != null}
              onChange={(checked) =>
                patch({ packFormatOverride: checked ? 15 : null })
              }
            />
            {global.packFormatOverride != null && (
              <InputNumber
                value={global.packFormatOverride}
                min={1}
                max={1000}
                onChange={(v) => patch({ packFormatOverride: v ?? 15 })}
              />
            )}
          </Space>
        </Form.Item>

        <Collapse
          ghost
          items={[
            {
              key: "adv",
              label: "高级设置（文字大小 / 位置 / 清晰度）",
              children: (
                <Space size={16} wrap>
                  <Form.Item label="文字大小（默认 9 像素）" style={{ marginBottom: 0 }}>
                    <InputNumber
                      value={global.size}
                      min={1}
                      max={128}
                      onChange={(v) => patch({ size: v ?? 9 })}
                    />
                  </Form.Item>
                  <Form.Item label="水平偏移（像素）" style={{ marginBottom: 0 }}>
                    <InputNumber
                      value={global.shiftX}
                      min={-128}
                      max={128}
                      onChange={(v) => patch({ shiftX: v ?? 0 })}
                    />
                  </Form.Item>
                  <Form.Item label="垂直偏移（像素）" style={{ marginBottom: 0 }}>
                    <InputNumber
                      value={global.shiftY}
                      min={-128}
                      max={128}
                      onChange={(v) => patch({ shiftY: v ?? 0 })}
                    />
                  </Form.Item>
                  <Form.Item
                    label="渲染清晰度（默认 8，越大越清晰、越耗性能）"
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber
                      value={global.oversample}
                      min={1}
                      max={16}
                      onChange={(v) => patch({ oversample: v ?? 8 })}
                    />
                  </Form.Item>
                </Space>
              ),
            },
          ]}
        />

        <Form.Item
          label="封面生成（应用到未手动设置封面的字体）"
          extra="「按字体名称」与「自定义文字」都用该字体自身渲染；「自定义图片」为所有字体共用一张图"
        >
          <Space direction="vertical" style={{ width: "100%" }}>
            <Radio.Group
              value={global?.coverMode ?? "auto"}
              onChange={(e) => patch({ coverMode: e.target.value })}
            >
              <Radio value="auto">按字体名称生成（默认）</Radio>
              <Radio value="text">自定义文字</Radio>
              <Radio value="image">自定义图片</Radio>
              <Radio value="none">不生成</Radio>
            </Radio.Group>
            {global.coverMode === "text" && (
              <Input
                value={global.coverText}
                onChange={(e) => patch({ coverText: e.target.value })}
                placeholder="封面文字（如：字）"
                style={{ width: 220 }}
                maxLength={8}
              />
            )}
            {global.coverMode === "image" && (
              <Space>
                <Button
                  icon={<PictureOutlined />}
                  onClick={() => void pickGlobalImage()}
                >
                  选择封面图片（自动缩放 128x128）
                </Button>
                {global.coverImage && (
                  <img
                    src={`data:image/png;base64,${global.coverImage}`}
                    width={64}
                    height={64}
                    alt="全局封面预览"
                    style={{
                      border: "1px solid #E6E8EB",
                      borderRadius: 6,
                      verticalAlign: "middle",
                    }}
                  />
                )}
              </Space>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}

export default function ConfigStep({
  fonts,
  fontConfigs,
  patchFontConfig,
  globalConfig = DEFAULT_GLOBAL_CONFIG,
  patchGlobalConfig,
  onNext,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | undefined>(fonts[0]?.id);
  // 字体被删除后回退到第一个
  const activeId =
    fonts.some((f) => f.id === selectedId) ? selectedId : fonts[0]?.id;

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <GlobalConfigPanel global={globalConfig} patch={patchGlobalConfig} />

      {fonts.length === 0 ? (
        <Card title="② 每个字体的独立配置">
          <span style={{ color: "#999" }}>
            尚未导入字体，请先到「导入字体」步骤添加字体。
          </span>
        </Card>
      ) : (
        <Card title="② 每个字体的独立配置（点击左侧切换）">
          <Tabs
            tabPosition="left"
            activeKey={activeId}
            onChange={setSelectedId}
            items={fonts.map((f) => ({
              key: f.id,
              label: (
                <span
                  style={{
                    display: "inline-block",
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    verticalAlign: "middle",
                  }}
                >
                  {f.fileName}
                </span>
              ),
              children: (
                <FontConfigForm
                  key={f.id}
                  font={f}
                  config={fontConfigs[f.id] ?? DEFAULT_FONT_CONFIG}
                  patch={(p) => patchFontConfig(f.id, p)}
                />
              ),
            }))}
          />
        </Card>
      )}

      <div style={{ textAlign: "right" }}>
        <Button
          type="primary"
          size="large"
          disabled={fonts.length === 0}
          onClick={onNext}
        >
          下一步：导出
        </Button>
      </div>
    </Space>
  );
}
