import { useRef } from "react";
import { Button, Input, Space, Tooltip } from "antd";
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  ClearOutlined,
} from "@ant-design/icons";

const { TextArea } = Input;

/** §0-§f 颜色色板（§ 后跟字符 → Minecraft 颜色码） */
const COLORS: { code: string; color: string; title: string }[] = [
  { code: "§0", color: "#000000", title: "黑色" },
  { code: "§1", color: "#0000AA", title: "深蓝" },
  { code: "§2", color: "#00AA00", title: "深绿" },
  { code: "§3", color: "#00AAAA", title: "深青" },
  { code: "§4", color: "#AA0000", title: "深红" },
  { code: "§5", color: "#AA00AA", title: "深紫" },
  { code: "§6", color: "#FFAA00", title: "金色" },
  { code: "§7", color: "#AAAAAA", title: "灰色" },
  { code: "§8", color: "#555555", title: "深灰" },
  { code: "§9", color: "#5555FF", title: "蓝色" },
  { code: "§a", color: "#55FF55", title: "绿色" },
  { code: "§b", color: "#55FFFF", title: "青色" },
  { code: "§c", color: "#FF5555", title: "红色" },
  { code: "§d", color: "#FF55FF", title: "粉色" },
  { code: "§e", color: "#FFFF55", title: "黄色" },
  { code: "§f", color: "#FFFFFF", title: "白色" },
];

const STYLES: { code: string; icon: React.ReactNode; title: string }[] = [
  { code: "§l", icon: <BoldOutlined />, title: "粗体 §l" },
  { code: "§o", icon: <ItalicOutlined />, title: "斜体 §o" },
  { code: "§n", icon: <UnderlineOutlined />, title: "下划线 §n" },
  { code: "§m", icon: <StrikethroughOutlined />, title: "删除线 §m" },
  { code: "§r", icon: <ClearOutlined />, title: "重置样式 §r" },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

/** 支持 § 格式码的 description 编辑器：色板 + 样式按钮 + 光标处插入 */
export default function DescriptionEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<React.ComponentRef<typeof TextArea>>(null);

  const insert = (code: string) => {
    const textarea = ref.current?.resizableTextArea?.textArea;
    if (textarea) {
      const start = textarea.selectionStart ?? value.length;
      const end = textarea.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + code + value.slice(end));
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + code.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      onChange(value + code);
    }
  };

  return (
    <div>
      <Space wrap size={6} style={{ marginBottom: 8 }}>
        {COLORS.map((c) => (
          <Tooltip key={c.code} title={`${c.title} ${c.code}`}>
            <Button
              size="small"
              style={{
                width: 22,
                height: 22,
                padding: 0,
                background: c.color,
                border: "1px solid #d0d5db",
              }}
              onClick={() => insert(c.code)}
            />
          </Tooltip>
        ))}
        <span style={{ borderLeft: "1px solid #E6E8EB", height: 18, margin: "0 2px" }} />
        {STYLES.map((s) => (
          <Tooltip key={s.code} title={s.title}>
            <Button size="small" icon={s.icon} onClick={() => insert(s.code)} />
          </Tooltip>
        ))}
      </Space>
      <TextArea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "输入描述，支持 § 格式码（颜色/样式），可多行"}
        autoSize={{ minRows: 2, maxRows: 6 }}
      />
    </div>
  );
}
