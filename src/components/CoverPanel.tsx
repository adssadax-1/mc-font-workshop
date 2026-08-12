import { useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Image,
  Input,
  Radio,
  Space,
} from "antd";
import { PictureOutlined, FontSizeOutlined } from "@ant-design/icons";
import { open } from "@tauri-apps/plugin-dialog";
import { readImageAsPngBase64, textToPngBase64 } from "../cover";
import type { CoverConfig, FontItem } from "../types";

interface Props {
  cover: CoverConfig;
  patchCover: (patch: Partial<CoverConfig>) => void;
  /** 该字体（文字封面用此字体渲染） */
  font: FontItem;
}

/** 该字体的资源包封面（pack.png，128x128）：无 / 自定义图片 / 用字体渲染文字 */
export default function CoverPanel({ cover, patchCover, font }: Props) {
  const { message } = AntApp.useApp();
  const [coverText, setCoverText] = useState("字");

  const pickImage = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"] },
      ],
    });
    if (!selected || typeof selected !== "string") return;
    try {
      const b64 = await readImageAsPngBase64(selected);
      patchCover({ mode: "image", pngBase64: b64 });
      message.success("封面图片已导入（已缩放为 128x128）");
    } catch (e) {
      message.error(String(e));
    }
  };

  const generateByText = async () => {
    try {
      const b64 = await textToPngBase64(font.path, font.id, coverText);
      patchCover({ mode: "text", pngBase64: b64 });
      message.success("封面已用该字体生成");
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <Card title="该字体的封面（pack.png，标准 128x128）" size="small">
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Radio.Group
          value={cover.mode}
          onChange={(e) =>
            patchCover({
              mode: e.target.value,
              pngBase64:
                e.target.value === "none" ? undefined : cover.pngBase64,
            })
          }
        >
          <Radio value="none">无封面</Radio>
          <Radio value="image">自定义图片</Radio>
          <Radio value="text">用该字体生成（单字/文字效果）</Radio>
        </Radio.Group>

        {cover.mode === "image" && (
          <Button icon={<PictureOutlined />} onClick={() => void pickImage()}>
            选择封面图片（自动缩放为 128x128）
          </Button>
        )}

        {cover.mode === "text" && (
          <Space wrap>
            <Input
              value={coverText}
              onChange={(e) => setCoverText(e.target.value)}
              placeholder="封面文字（如：字）"
              style={{ width: 160 }}
              maxLength={8}
              onPressEnter={() => void generateByText()}
            />
            <Button
              type="primary"
              icon={<FontSizeOutlined />}
              onClick={() => void generateByText()}
            >
              生成封面
            </Button>
          </Space>
        )}

        {cover.pngBase64 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Image
              src={`data:image/png;base64,${cover.pngBase64}`}
              width={128}
              height={128}
              alt="封面预览"
              style={{ border: "1px solid #E6E8EB", borderRadius: 8 }}
            />
            <span style={{ color: "#999", fontSize: 12 }}>
              128x128 PNG，将写入该资源包根目录 pack.png
            </span>
          </div>
        ) : (
          cover.mode !== "none" && (
            <span style={{ color: "#bbb", fontSize: 12 }}>
              （尚未生成封面，预览将显示空白）
            </span>
          )
        )}
      </Space>
    </Card>
  );
}
