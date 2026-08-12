//! 资源包生成核心：pack.mcmeta / font json 生成、zip 打包、写后校验。

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::font_validate::FontFormat;
use crate::pack_format::{pack_format_for_version, PackFormatInfo};

/// 覆盖模式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OverwriteMode {
    /// 覆盖默认字体：写入 assets/minecraft/font/default.json
    Overwrite,
    /// 附加自定义字体：写入 assets/<ns>/font/<name>.json
    Custom,
}

/// 参与导出的单个字体。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FontInput {
    /// 源字体文件完整路径。
    pub path: String,
    /// 原始文件名（含扩展名），用于生成 zip 内名称。
    pub file_name: String,
    /// 魔数校验得到的格式。
    pub format: FontFormat,
}

/// 导出选项（由前端传入）。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GenerateOptions {
    /// 输出 zip 的完整路径（含 .zip）。
    pub output_path: String,
    pub pack_name: String,
    pub namespace: String,
    /// 自定义模式下 font json 的名称（不含 .json）。
    pub font_json_name: String,
    pub mode: OverwriteMode,
    pub mc_version: String,
    /// 手动指定 pack_format（优先级最高）。
    pub pack_format_override: Option<i32>,
    pub description_zh: String,
    pub description_en: String,
    /// 封面 pack.png 的 base64（不含 data: 前缀），None 则不生成封面。
    pub cover_png: Option<String>,
    pub fonts: Vec<FontInput>,
    // ttf provider 参数
    pub size: i32,
    pub shift_x: i32,
    pub shift_y: i32,
    pub oversample: i32,
}

/// 导出结果（返回给前端）。
#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub path: String,
    pub entries: Vec<String>,
    pub size_bytes: u64,
    pub pack_format: Option<i32>,
    pub min_format: Option<i32>,
    pub max_format: Option<i32>,
}

fn clean_char(c: char) -> char {
    if c.is_alphanumeric() || c == '_' || c == '-' || c == '.' {
        c
    } else {
        '_'
    }
}

/// ASCII 化 slug：转小写，只保留 [a-z0-9_-]（其余转下划线、连续合并），空则回退 "font"。
/// Minecraft 资源路径允许小写字母数字与 _-/.，中文字体名必须转成安全 ASCII 名。
fn ascii_slug(name: &str) -> String {
    let mut slug = String::new();
    let mut pending = false;
    for c in name.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            slug.push(c.to_ascii_lowercase());
            pending = false;
        } else if !slug.is_empty() && !pending {
            slug.push('_');
            pending = true;
        }
    }
    let slug = slug.trim_matches('_').to_string();
    if slug.is_empty() {
        "font".to_string()
    } else {
        slug
    }
}

/// 依据魔数推断的扩展名重组 zip 内文件名（如 a.otf 误命名为 .ttf 也能修正），
/// 文件名必须是 MC 资源路径合法的 ASCII 小写（中文字体名自动转为安全名）。
fn zip_file_name(f: &FontInput) -> String {
    let raw = f.file_name.replace(['/', '\\'], "_");
    let stem = raw.rsplit_once('.').map(|(s, _)| s).unwrap_or(&raw);
    format!("{}{}", ascii_slug(stem), f.format.ext())
}

/// 在 zip 内保证文件名唯一，冲突时在 stem 后追加 _2、_3…（保持扩展名在末尾）。
fn unique_name(base: &str, used: &mut HashSet<String>) -> String {
    if used.insert(base.to_string()) {
        return base.to_string();
    }
    let (stem, ext) = match base.rsplit_once('.') {
        Some((s, e)) => (s, e),
        None => (base, ""),
    };
    let mut i = 2;
    loop {
        let cand = if ext.is_empty() {
            format!("{stem}_{i}")
        } else {
            format!("{stem}_{i}.{ext}")
        };
        if used.insert(cand.clone()) {
            return cand;
        }
        i += 1;
    }
}

fn sanitize_namespace(ns: &str) -> Result<String, String> {
    let ns = ns.trim();
    if ns.is_empty() {
        return Err("namespace 不能为空".into());
    }
    if ns.chars().any(|c| c.is_ascii_uppercase()) {
        return Err("namespace 应使用小写字母（MC 命名空间规范）".into());
    }
    if !ns
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err("namespace 只允许小写字母、数字、_、-、.".into());
    }
    Ok(ns.to_string())
}

fn sanitize_json_name(name: &str) -> Result<String, String> {
    let name = name.trim().to_ascii_lowercase();
    if name.is_empty() {
        return Err("字体 JSON 名称不能为空".into());
    }
    if !name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err("字体 JSON 名称只允许小写字母、数字、_、-、.".into());
    }
    Ok(name)
}

/// 解码前端传来的封面 PNG base64 数据。
fn decode_cover_png(b64: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let b64 = b64.trim();
    if b64.is_empty() {
        return Err("封面数据为空".into());
    }
    base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("封面 base64 解码失败: {e}"))
}

/// 构建 pack.mcmeta 内容。
///
/// - 1.20.5+（pack_format >= 32）：description 支持多语言对象，pack.name 支持显示名；
/// - 1.21.9+：使用 min_format / max_format。
fn build_mcmeta(opts: &GenerateOptions, pf: &PackFormatInfo) -> Result<Vec<u8>, String> {
    let mut pack = serde_json::Map::new();
    if let Some(n) = pf.single {
        pack.insert("pack_format".into(), serde_json::json!(n));
    } else {
        pack.insert(
            "min_format".into(),
            serde_json::json!(pf.min_format.unwrap_or(0)),
        );
        pack.insert(
            "max_format".into(),
            serde_json::json!(pf.max_format.unwrap_or(9999)),
        );
    }

    let zh = opts.description_zh.trim();
    let en = opts.description_en.trim();
    let modern = pf.single.map_or(true, |n| n >= 32);
    let desc = if modern && !en.is_empty() {
        let mut map = serde_json::Map::new();
        map.insert("en_us".into(), serde_json::json!(en));
        if !zh.is_empty() {
            map.insert("zh_cn".into(), serde_json::json!(zh));
        }
        serde_json::Value::Object(map)
    } else {
        serde_json::json!(if zh.is_empty() { en } else { zh })
    };
    pack.insert("description".into(), desc);

    if modern {
        pack.insert("name".into(), serde_json::json!(opts.pack_name));
    }

    let root = serde_json::json!({ "pack": pack });
    serde_json::to_vec_pretty(&root).map_err(|e| e.to_string())
}

/// 构建 font/*.json 内容（providers 数组，一个 ttf provider 对应一个字体）。
///
/// 注意：游戏对 ttf provider 的 `file` 会自动加 `font/` 目录前缀
/// （minecraft:xxx.ttf → assets/minecraft/font/xxx.ttf），
/// 因此 file 字段只写文件名，不能带 font/ 路径段。
fn build_font_json(opts: &GenerateOptions) -> Result<Vec<u8>, String> {
    let mut providers = Vec::with_capacity(opts.fonts.len());
    for f in &opts.fonts {
        providers.push(serde_json::json!({
            "type": "ttf",
            "file": format!("{}:{}", opts.namespace, zip_file_name(f)),
            "shift": [opts.shift_x, opts.shift_y],
            "size": opts.size,
            "oversample": opts.oversample,
            "skip": "",
        }));
    }
    let root = serde_json::json!({ "providers": providers });
    serde_json::to_vec_pretty(&root).map_err(|e| e.to_string())
}

/// 重新打开 zip，校验所有期望条目存在且非空。
fn verify_zip(path: &Path, expected: &[String]) -> Result<(), String> {
    let file = File::open(path).map_err(|e| format!("导出后无法打开 zip 进行校验: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("zip 读取失败: {e}"))?;
    for name in expected {
        let entry = archive
            .by_name(name)
            .map_err(|e| format!("zip 校验失败，缺少条目 {name}: {e}"))?;
        if entry.size() == 0 {
            return Err(format!("zip 校验失败，条目 {name} 为空"));
        }
    }
    Ok(())
}

/// 单个字体的独立资源包配置（批量导出时使用）。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PerFontItem {
    pub font: FontInput,
    /// 该字体的资源包名称（zip 文件名）。
    pub pack_name: String,
    /// 独立描述（中文，留空则用全局配置）。
    pub description_zh: String,
    /// 独立描述（英文，留空则用全局配置）。
    pub description_en: String,
}

/// 批量导出选项（每个字体一个资源包）。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ExportMultiOptions {
    /// 输出目录（所有 zip 都放这里）。
    pub output_dir: String,
    /// 全局配置（namespace/覆盖模式/json 名/版本/封面/高级参数，作为默认值）。
    pub base: GenerateOptions,
    /// 每个要导出的字体及其独立配置。
    pub items: Vec<PerFontItem>,
}

/// zip 文件名清洗：保留字母数字（含中文）与 _-.，去掉路径分隔符与首尾点。
fn zip_basename(name: &str) -> String {
    let cleaned: String = name.trim().chars().map(clean_char).collect();
    let cleaned = cleaned.trim_matches('.').to_string();
    if cleaned.is_empty() {
        "font-pack".to_string()
    } else {
        cleaned
    }
}

/// 批量导出：为每个字体生成一个独立资源包 zip。
pub fn export_multi(opts: &ExportMultiOptions) -> Result<Vec<ExportResult>, String> {
    if opts.items.is_empty() {
        return Err("没有可导出的字体".into());
    }
    let dir = PathBuf::from(&opts.output_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("无法创建输出目录 {}: {e}", dir.display()))?;

    let mut results = Vec::with_capacity(opts.items.len());
    for item in &opts.items {
        let pack_name = item.pack_name.trim();
        if pack_name.is_empty() {
            return Err(format!("字体 {} 的资源包名称不能为空", item.font.file_name));
        }
        let mut gen = opts.base.clone();
        gen.output_path = dir
            .join(format!("{}.zip", zip_basename(pack_name)))
            .to_string_lossy()
            .into_owned();
        gen.pack_name = pack_name.to_string();
        gen.description_zh = if item.description_zh.trim().is_empty() {
            opts.base.description_zh.clone()
        } else {
            item.description_zh.clone()
        };
        gen.description_en = if item.description_en.trim().is_empty() {
            opts.base.description_en.clone()
        } else {
            item.description_en.clone()
        };
        gen.fonts = vec![item.font.clone()];
        results.push(generate_pack(&gen)?);
    }
    Ok(results)
}

/// 生成资源包 zip 并做写后校验。
pub fn generate_pack(opts: &GenerateOptions) -> Result<ExportResult, String> {
    if opts.pack_name.trim().is_empty() {
        return Err("资源包名称不能为空".into());
    }
    if opts.fonts.is_empty() {
        return Err("没有可导出的字体，请先勾选至少一个字体".into());
    }
    let ns = sanitize_namespace(&opts.namespace)?;
    let pf = match opts.pack_format_override {
        Some(n) => PackFormatInfo::single(n),
        None => pack_format_for_version(&opts.mc_version)?,
    };

    let json_name = match opts.mode {
        OverwriteMode::Overwrite => "default".to_string(),
        OverwriteMode::Custom => sanitize_json_name(&opts.font_json_name)?,
    };

    let out = PathBuf::from(&opts.output_path);
    if let Some(dir) = out.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("无法创建输出目录 {}: {e}", dir.display()))?;
    }

    let mut zip = ZipWriter::new(
        File::create(&out).map_err(|e| format!("无法创建 zip 文件 {}: {e}", out.display()))?,
    );
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let mut entries: Vec<String> = Vec::new();

    // 1. pack.mcmeta
    zip.start_file("pack.mcmeta", options)
        .map_err(|e| format!("写入 pack.mcmeta 失败: {e}"))?;
    zip.write_all(&build_mcmeta(opts, &pf)?)
        .map_err(|e| format!("写入 pack.mcmeta 失败: {e}"))?;
    entries.push("pack.mcmeta".into());

    // 2. font/*.json
    let font_json_entry = format!("assets/{ns}/font/{json_name}.json");
    zip.start_file(&font_json_entry, options)
        .map_err(|e| format!("写入 {font_json_entry} 失败: {e}"))?;
    zip.write_all(&build_font_json(opts)?)
        .map_err(|e| format!("写入 {font_json_entry} 失败: {e}"))?;
    entries.push(font_json_entry);

    // 3. 封面 pack.png（可选）
    if let Some(b64) = &opts.cover_png {
        let cover_bytes = decode_cover_png(b64)?;
        if cover_bytes.is_empty() {
            return Err("封面数据为空".into());
        }
        zip.start_file("pack.png", options)
            .map_err(|e| format!("写入 pack.png 失败: {e}"))?;
        zip.write_all(&cover_bytes)
            .map_err(|e| format!("写入 pack.png 失败: {e}"))?;
        entries.push("pack.png".into());
    }

    // 4. 字体文件本体
    let mut used: HashSet<String> = HashSet::new();
    for f in &opts.fonts {
        let target = unique_name(&zip_file_name(f), &mut used);
        let entry = format!("assets/{ns}/font/{target}");
        let bytes = std::fs::read(&f.path)
            .map_err(|e| format!("读取字体文件 {} 失败: {e}", f.path))?;
        zip.start_file(&entry, options)
            .map_err(|e| format!("写入 {entry} 失败: {e}"))?;
        zip.write_all(&bytes)
            .map_err(|e| format!("写入 {entry} 失败: {e}"))?;
        entries.push(entry);
    }

    zip.finish().map_err(|e| format!("zip 写入失败: {e}"))?;

    verify_zip(&out, &entries)?;

    let size_bytes = std::fs::metadata(&out)
        .map_err(|e| format!("读取输出文件信息失败: {e}"))?
        .len();

    Ok(ExportResult {
        path: out.to_string_lossy().into_owned(),
        entries,
        size_bytes,
        pack_format: pf.single,
        min_format: pf.min_format,
        max_format: pf.max_format,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::font_validate::FontFormat;
    use serde_json::Value;

    fn sample_options() -> GenerateOptions {
        GenerateOptions {
            output_path: String::new(),
            pack_name: "我的字体包".into(),
            namespace: "minecraft".into(),
            font_json_name: "custom".into(),
            mode: OverwriteMode::Overwrite,
            mc_version: "1.20.1".into(),
            pack_format_override: None,
            description_zh: "中文 字体包".into(),
            description_en: String::new(),
            cover_png: None,
            fonts: vec![FontInput {
                path: "C:/fake/font.ttf".into(),
                file_name: "font.ttf".into(),
                format: FontFormat::Ttf,
            }],
            size: 11,
            shift_x: 0,
            shift_y: 0,
            oversample: 8,
        }
    }

    #[test]
    fn mcmeta_legacy_single_and_string_description() {
        let mut opts = sample_options();
        opts.mc_version = "1.20.1".into();
        let pf = pack_format_for_version("1.20.1").unwrap();
        let bytes = build_mcmeta(&opts, &pf).unwrap();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["pack"]["pack_format"], 15);
        assert_eq!(v["pack"]["description"], "中文 字体包");
        // 1.20.1 不支持 pack.name
        assert!(v["pack"].get("name").is_none());
    }

    #[test]
    fn mcmeta_modern_multilang_and_name() {
        let mut opts = sample_options();
        opts.mc_version = "1.21.9".into();
        opts.description_en = "Chinese Font Pack".into();
        let pf = pack_format_for_version("1.21.9").unwrap();
        let bytes = build_mcmeta(&opts, &pf).unwrap();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        assert!(v["pack"].get("pack_format").is_none());
        assert_eq!(v["pack"]["min_format"], 68);
        assert_eq!(v["pack"]["max_format"], 9999);
        assert_eq!(v["pack"]["description"]["en_us"], "Chinese Font Pack");
        assert_eq!(v["pack"]["description"]["zh_cn"], "中文 字体包");
        assert_eq!(v["pack"]["name"], "我的字体包");
    }

    #[test]
    fn mcmeta_modern_without_en_falls_back_to_string() {
        let mut opts = sample_options();
        opts.mc_version = "1.21.5".into();
        let pf = pack_format_for_version("1.21.5").unwrap();
        let bytes = build_mcmeta(&opts, &pf).unwrap();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["pack"]["pack_format"], 55);
        assert_eq!(v["pack"]["description"], "中文 字体包");
        assert_eq!(v["pack"]["name"], "我的字体包");
    }

    #[test]
    fn font_json_providers_structure() {
        let opts = sample_options();
        let bytes = build_font_json(&opts).unwrap();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        let p = &v["providers"][0];
        assert_eq!(p["type"], "ttf");
        // file 不带 font/ 前缀（游戏自动加 font/ 目录前缀）
        assert_eq!(p["file"], "minecraft:font.ttf");
        assert_eq!(p["shift"], serde_json::json!([0, 0]));
        assert_eq!(p["size"], 11);
        assert_eq!(p["oversample"], 8);
        assert_eq!(p["skip"], "");
    }

    fn fake_font(name: &str, format: FontFormat) -> FontInput {
        // 按进程隔离临时目录，避免并行测试互相覆盖文件
        let dir = std::env::temp_dir().join(format!(
            "mc-font-workshop-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        let magic: &[u8] = match format {
            FontFormat::Ttf => &[0x00, 0x01, 0x00, 0x00],
            FontFormat::Otf => b"OTTO",
            FontFormat::Woff => b"wOFF",
            FontFormat::Woff2 => b"wOF2",
        };
        let mut bytes = magic.to_vec();
        bytes.extend_from_slice(b"fake-font-data-12345");
        std::fs::write(&p, &bytes).unwrap();
        FontInput {
            path: p.to_string_lossy().into_owned(),
            file_name: p.file_name().unwrap().to_string_lossy().into_owned(),
            format,
        }
    }

    #[test]
    fn full_export_overwrite_mode() {
        let dir = std::env::temp_dir().join("mc-font-workshop-test/out");
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("overwrite.zip");
        let mut opts = sample_options();
        opts.output_path = out.to_string_lossy().into_owned();
        opts.fonts = vec![fake_font("a.ttf", FontFormat::Ttf)];

        let result = generate_pack(&opts).unwrap();
        assert!(out.exists());
        assert!(result.size_bytes > 0);
        assert!(result.entries.contains(&"pack.mcmeta".to_string()));
        assert!(result.entries.contains(&"assets/minecraft/font/default.json".to_string()));
        assert!(result.entries.contains(&"assets/minecraft/font/a.ttf".to_string()));

        // 重新打开检查内容
        use std::io::Read;
        let f = File::open(&out).unwrap();
        let mut arc = zip::ZipArchive::new(f).unwrap();
        let mut buf = Vec::new();
        arc.by_name("pack.mcmeta").unwrap().read_to_end(&mut buf).unwrap();
        let mcmeta: Value = serde_json::from_slice(&buf).unwrap();
        assert_eq!(mcmeta["pack"]["pack_format"], 15);
    }

    #[test]
    fn full_export_custom_mode_and_dedup() {
        let dir = std::env::temp_dir().join("mc-font-workshop-test/out");
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("custom.zip");
        let mut opts = sample_options();
        opts.output_path = out.to_string_lossy().into_owned();
        opts.mode = OverwriteMode::Custom;
        opts.namespace = "myfonts".into();
        opts.font_json_name = "custom-font".into();
        // 两个同名同格式的字体 → zip 内去重为 font.ttf / font_2.ttf
        let f1 = fake_font("font.ttf", FontFormat::Ttf);
        let f2 = fake_font("font.ttf", FontFormat::Ttf);
        opts.fonts = vec![f1, f2];

        let result = generate_pack(&opts).unwrap();
        assert!(result
            .entries
            .contains(&"assets/myfonts/font/custom-font.json".to_string()));
        assert!(result
            .entries
            .contains(&"assets/myfonts/font/font.ttf".to_string()));
        assert!(
            result
                .entries
                .contains(&"assets/myfonts/font/font_2.ttf".to_string()),
            "entries 实际内容: {:?}",
            result.entries
        );
    }

    #[test]
    fn export_with_cover_png() {
        use base64::Engine;
        use std::io::Read;
        let dir = std::env::temp_dir().join(format!(
            "mc-font-workshop-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("cover.zip");
        let mut opts = sample_options();
        opts.output_path = out.to_string_lossy().into_owned();
        opts.fonts = vec![fake_font("cover-a.ttf", FontFormat::Ttf)];
        let png: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01, 0x02, 0x03];
        opts.cover_png = Some(base64::engine::general_purpose::STANDARD.encode(&png));

        let result = generate_pack(&opts).unwrap();
        assert!(result.entries.contains(&"pack.png".to_string()));

        let f = File::open(&out).unwrap();
        let mut arc = zip::ZipArchive::new(f).unwrap();
        let mut buf = Vec::new();
        arc.by_name("pack.png")
            .unwrap()
            .read_to_end(&mut buf)
            .unwrap();
        assert_eq!(buf, png);
    }

    #[test]
    fn export_multi_per_font_packs() {
        use std::io::Read;
        let dir = std::env::temp_dir().join(format!(
            "mc-font-workshop-test-{}/out-multi",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let mut base = sample_options();
        base.output_path = String::new(); // 会被 export_multi 覆盖
        base.mc_version = "1.21.5".into();
        base.description_zh = "全局描述".into();
        let items = vec![
            PerFontItem {
                font: fake_font("font-a.ttf", FontFormat::Ttf),
                pack_name: "字体包A".into(),
                description_zh: String::new(), // 用全局
                description_en: String::new(),
            },
            PerFontItem {
                font: fake_font("font-b.ttf", FontFormat::Otf),
                pack_name: "font-b".into(),
                description_zh: "独立描述B".into(),
                description_en: String::new(),
            },
        ];
        let results = export_multi(&ExportMultiOptions {
            output_dir: dir.to_string_lossy().into_owned(),
            base,
            items,
        })
        .unwrap();
        assert_eq!(results.len(), 2);

        // A 包：中文 zip 名，只含 font-a，描述用全局
        let a_zip = dir.join("字体包A.zip");
        assert!(a_zip.exists());
        let mut arc = zip::ZipArchive::new(File::open(&a_zip).unwrap()).unwrap();
        let mut buf = Vec::new();
        arc.by_name("assets/minecraft/font/default.json")
            .unwrap()
            .read_to_end(&mut buf)
            .unwrap();
        let v: Value = serde_json::from_slice(&buf).unwrap();
        assert_eq!(v["providers"].as_array().unwrap().len(), 1);
        assert_eq!(v["providers"][0]["file"], "minecraft:font-a.ttf");
        let mut mc = Vec::new();
        arc.by_name("pack.mcmeta")
            .unwrap()
            .read_to_end(&mut mc)
            .unwrap();
        let mv: Value = serde_json::from_slice(&mc).unwrap();
        assert_eq!(mv["pack"]["description"], "全局描述");

        // B 包：独立描述生效
        let b_zip = dir.join("font-b.zip");
        assert!(b_zip.exists());
        let mut arc2 = zip::ZipArchive::new(File::open(&b_zip).unwrap()).unwrap();
        let mut mc2 = Vec::new();
        arc2.by_name("pack.mcmeta")
            .unwrap()
            .read_to_end(&mut mc2)
            .unwrap();
        let mv2: Value = serde_json::from_slice(&mc2).unwrap();
        assert_eq!(mv2["pack"]["description"], "独立描述B");
        assert_eq!(mv2["pack"]["name"], "font-b");
    }

    #[test]
    fn chinese_and_uppercase_names_become_ascii() {
        // 中文文件名 → MC 非法路径，必须转成安全 ASCII（回退 font）
        let f = FontInput {
            path: "C:/x/汉仪力量字体.ttf".into(),
            file_name: "汉仪力量字体.ttf".into(),
            format: FontFormat::Ttf,
        };
        assert_eq!(zip_file_name(&f), "font.ttf");
        let bytes = build_font_json(&GenerateOptions {
            fonts: vec![f],
            ..sample_options()
        })
        .unwrap();
        let v: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["providers"][0]["file"], "minecraft:font.ttf");

        // 混合大小写/空格 → 小写 slug
        let f2 = FontInput {
            path: "C:/x/My Font 2.ttf".into(),
            file_name: "My Font 2.ttf".into(),
            format: FontFormat::Ttf,
        };
        assert_eq!(zip_file_name(&f2), "my_font_2.ttf");

        // custom 模式 json 名大写 → 转小写
        let mut opts = sample_options();
        opts.font_json_name = "MyFont".into();
        opts.fonts = vec![fake_font("case-font.ttf", FontFormat::Ttf)];
        let out = generate_pack(&GenerateOptions {
            mode: OverwriteMode::Custom,
            output_path: format!(
                "{}/mc-font-workshop-test-{}/out/case.zip",
                std::env::temp_dir().display(),
                std::process::id()
            ),
            ..opts.clone()
        })
        .unwrap();
        assert!(out
            .entries
            .contains(&"assets/minecraft/font/myfont.json".to_string()));
    }

    #[test]
    fn rejects_bad_namespace_and_empty_fonts() {
        let mut opts = sample_options();
        opts.namespace = "My-Ns".into();
        assert!(generate_pack(&opts).is_err());
        opts.namespace = "ok_ns".into();
        opts.fonts.clear();
        assert!(generate_pack(&opts).is_err());
    }
}
