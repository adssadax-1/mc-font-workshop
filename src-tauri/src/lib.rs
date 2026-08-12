mod font_validate;
mod generate;
mod pack_format;

use std::path::Path;

use font_validate::{validate_font_file, FontInfo};
use generate::{export_multi as run_export_multi, generate_pack, ExportMultiOptions, ExportResult, GenerateOptions};
use pack_format::PackFormatInfo;
use tauri::Manager;

/// 校验字体文件头魔数，返回格式与大小。
#[tauri::command]
fn validate_font(path: String) -> Result<FontInfo, String> {
    validate_font_file(Path::new(&path))
}

/// 根据 MC 版本号匹配 pack_format。
#[tauri::command]
fn pack_format_for_version(version: String) -> Result<PackFormatInfo, String> {
    pack_format::pack_format_for_version(&version)
}

/// 生成资源包 zip（mcmeta + font json + 字体文件），并做写后校验。
#[tauri::command]
fn export_pack(options: GenerateOptions) -> Result<ExportResult, String> {
    generate_pack(&options)
}

/// 批量导出：每个字体生成一个独立资源包 zip。
#[tauri::command]
async fn export_multi(options: ExportMultiOptions) -> Result<Vec<ExportResult>, String> {
    tauri::async_runtime::spawn_blocking(move || run_export_multi(&options))
        .await
        .map_err(|e| format!("导出任务异常: {e}"))?
}

/// 转换结果（由 convert_font.py 的 JSON 解析而来）。
#[derive(serde::Serialize)]
struct ConvertResult {
    path: String,
    size_bytes: u64,
}

/// 查找可用的 Python 解释器。
fn find_python() -> Result<String, String> {
    for name in ["python", "py"] {
        if std::process::Command::new(name)
            .arg("--version")
            .output()
            .is_ok()
        {
            return Ok(name.to_string());
        }
    }
    Err("未找到 Python 运行时：字体转换需要本机安装 Python 3 + fontTools（pip install fonttools brotli）".into())
}

/// 运行转换器（打包的 exe 或 python 脚本），返回转换结果 JSON。
fn run_converter(program: &str, args: &[&str]) -> Result<ConvertResult, String> {
    let output = std::process::Command::new(program)
        .args(args)
        .output()
        .map_err(|e| format!("无法启动转换器 {program}: {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() {
        // 优先从脚本的 JSON error 字段取错误信息
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&stdout) {
            if let Some(err) = v["error"].as_str() {
                return Err(format!("字体转换失败: {err}"));
            }
        }
        return Err(format!(
            "字体转换失败: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let v: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("解析转换结果失败: {e}"))?;
    Ok(ConvertResult {
        path: v["path"].as_str().unwrap_or_default().to_string(),
        size_bytes: v["size_bytes"].as_u64().unwrap_or(0),
    })
}

/// 调用转换器把非 TTF 字体转成 TTF（OTF→TTF 轮廓转换 / WOFF、WOFF2 解包）。
///
/// 优先使用打包的 font-converter.exe（bundle 资源目录或 src-tauri 目录）；
/// 开发环境无 exe 时回退到 python + convert_font.py。
#[tauri::command]
async fn convert_font(app: tauri::AppHandle, path: String) -> Result<ConvertResult, String> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let out_dir = std::env::temp_dir().join("mc-font-workshop-converted");
        // 1) bundle 资源目录中的转换器 exe
        if let Ok(res_dir) = app.path().resource_dir() {
            let exe = res_dir.join("font-converter.exe");
            if exe.exists() {
                return run_converter(
                    exe.to_str().unwrap_or_default(),
                    &[&path, out_dir.to_str().unwrap_or_default()],
                );
            }
        }
        // 2) 开发目录（src-tauri 下）的转换器 exe
        let dev_exe = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("font-converter.exe");
        if dev_exe.exists() {
            return run_converter(
                dev_exe.to_str().unwrap_or_default(),
                &[&path, out_dir.to_str().unwrap_or_default()],
            );
        }
        // 3) 回退：python + convert_font.py
        let script = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("convert_font.py");
        let python = find_python()?;
        run_converter(
            &python,
            &[
                script.to_str().unwrap_or_default(),
                &path,
                out_dir.to_str().unwrap_or_default(),
            ],
        )
    })
    .await
    .map_err(|e| format!("转换任务异常: {e}"))?
}

/// 在资源管理器中定位并选中文件（Windows）。
#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(format!("/select,\"{path}\""))
        .spawn()
        .map_err(|e| format!("无法打开资源管理器: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            validate_font,
            pack_format_for_version,
            convert_font,
            export_pack,
            export_multi,
            open_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
