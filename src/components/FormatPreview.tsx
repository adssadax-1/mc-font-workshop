import { parseMinecraftFormat, renderSegments } from "../minecraftFormat";

interface Props {
  text: string;
}

/** 模拟游戏内聊天栏效果的 description 实时预览（深色半透明底 + 描边文字） */
export default function FormatPreview({ text }: Props) {
  const hasContent = text.trim().length > 0;
  return (
    <div
      style={{
        background: "rgba(0,0,0,0.75)",
        borderRadius: 12,
        padding: "12px 16px",
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontSize: 15,
        lineHeight: 1.6,
      }}
    >
      {hasContent ? (
        renderSegments(parseMinecraftFormat(text))
      ) : (
        <span style={{ color: "#8a8a8a" }}>（description 为空，输入后此处实时预览 § 格式码效果）</span>
      )}
    </div>
  );
}
