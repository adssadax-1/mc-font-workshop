import { useMemo, useState } from "react";
import { App as AntApp, Badge, Button, Tag } from "antd";
import { GithubOutlined } from "@ant-design/icons";
import ImportStep from "./components/ImportStep";
import ConfigStep from "./components/ConfigStep";
import ExportStep from "./components/ExportStep";
import { openUrl } from "./commands";
import { DEFAULT_FONT_CONFIG, DEFAULT_GLOBAL_CONFIG } from "./types";
import type { FontConfig, GlobalConfig, FontItem } from "./types";

const STEPS = ["导入字体", "配置", "导出"];

const GITHUB_URL = "https://github.com/adssadax-1/mc-font-workshop";

export default function App() {
  const [step, setStep] = useState(0);
  const [fonts, setFonts] = useState<FontItem[]>([]);
  // 每个字体一份独立配置（fontId → FontConfig）
  const [fontConfigs, setFontConfigs] = useState<Record<string, FontConfig>>({});
  // 全局配置（高级参数 / 游戏版本 / 自动封面）
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(
    DEFAULT_GLOBAL_CONFIG
  );

  const enabledCount = useMemo(
    () => fonts.filter((f) => f.enabled && !f.invalid).length,
    [fonts]
  );

  /** 新字体加入时初始化其配置（packName 默认=字体名，description 默认=字体原本名称） */
  const initFontConfig = (id: string, packName: string, defaultDescZh?: string) =>
    setFontConfigs((prev) =>
      prev[id]
        ? prev
        : {
            ...prev,
            [id]: {
              ...DEFAULT_FONT_CONFIG,
              packName,
              descriptionZh:
                defaultDescZh ?? DEFAULT_FONT_CONFIG.descriptionZh,
            },
          }
    );

  /** 字体删除时清理其配置 */
  const removeFontConfig = (id: string) =>
    setFontConfigs(({ [id]: _removed, ...rest }) => rest);

  const patchFontConfig = (id: string, patch: Partial<FontConfig>) =>
    setFontConfigs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_FONT_CONFIG), ...patch },
    }));

  const patchGlobalConfig = (patch: Partial<GlobalConfig>) =>
    setGlobalConfig((prev) => ({ ...prev, ...patch }));

  // 渲染时与默认值合并：热更新残留的旧 state（缺少 coverMode 等新字段）也能安全使用
  const effectiveGlobal = useMemo(
    () => ({ ...DEFAULT_GLOBAL_CONFIG, ...globalConfig }),
    [globalConfig]
  );

  return (
    <AntApp>
      <div className="app-header">
        <div className="brand">
          <img className="logo" src="/src/assets/icon.svg" alt="logo" />
          ⛏ MC 字体包工坊
        </div>
        <div className="actions">
          <Tag color="green" style={{ marginRight: 4 }}>
            开源
          </Tag>
          <Button
            type="primary"
            size="small"
            ghost
            icon={<GithubOutlined />}
            onClick={() => void openUrl(GITHUB_URL)}
          >
            GitHub 项目
          </Button>
          <Badge
            count={fonts.length}
            showZero
            color="#4A90D9"
            offset={[-4, 2]}
          >
            <span style={{ paddingRight: 10 }}>字体</span>
          </Badge>
          <Button type="link" size="small" href="https://github.com/adssadax-1/mc-content-localizer" target="_blank">
            参考: MC 汉化工坊
          </Button>
        </div>
      </div>

      <div className="app-body">
        <div className="app-sider">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`step-item ${i === step ? "active" : ""}`}
              onClick={() => setStep(i)}
            >
              <span className="step-num">{i + 1}</span>
              {label}
            </div>
          ))}
        </div>

        <div className="app-content">
          {step === 0 && (
            <ImportStep
              fonts={fonts}
              setFonts={setFonts}
              onNext={() => setStep(1)}
              onFontCreated={initFontConfig}
              onFontRemoved={removeFontConfig}
            />
          )}
          {step === 1 && (
            <ConfigStep
              fonts={fonts}
              fontConfigs={fontConfigs}
              patchFontConfig={patchFontConfig}
              globalConfig={effectiveGlobal}
              patchGlobalConfig={patchGlobalConfig}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <ExportStep
              fonts={fonts}
              fontConfigs={fontConfigs}
              globalConfig={effectiveGlobal}
              enabledCount={enabledCount}
            />
          )}
        </div>
      </div>
    </AntApp>
  );
}
