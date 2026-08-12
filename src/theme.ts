import type { ThemeConfig } from "antd";

// 白亮 + 天空蓝主题（沿用 MC 汉化工坊视觉）
export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: "#4A90D9",
    colorInfo: "#4A90D9",
    colorBgLayout: "#F5F6F8",
    colorBgContainer: "#FFFFFF",
    colorBorder: "#E6E8EB",
    colorBorderSecondary: "#E6E8EB",
    borderRadius: 12,
    borderRadiusLG: 12,
    colorText: "#333333",
    colorTextSecondary: "#666666",
    fontSize: 14,
  },
  components: {
    Card: {
      headerBg: "#FFFFFF",
    },
    Button: {
      fontWeight: 500,
    },
  },
};
