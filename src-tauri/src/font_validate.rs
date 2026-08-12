//! 字体文件头魔数校验：防止非字体文件混入资源包。

use serde::{Deserialize, Serialize};
use std::path::Path;

/// 识别出的字体格式。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FontFormat {
    Ttf,
    Otf,
    Woff,
    Woff2,
}

impl FontFormat {
    /// zip 内使用的扩展名（游戏按扩展名决定加载方式）。
    pub fn ext(self) -> &'static str {
        match self {
            FontFormat::Ttf => ".ttf",
            FontFormat::Otf => ".otf",
            FontFormat::Woff => ".woff",
            FontFormat::Woff2 => ".woff2",
        }
    }
}

/// 校验结果。
#[derive(Debug, Serialize)]
pub struct FontInfo {
    pub name: String,
    pub format: FontFormat,
    pub size_bytes: u64,
}

const TTF_MAGIC: [u8; 4] = [0x00, 0x01, 0x00, 0x00];
const TRUE_MAGIC: [u8; 4] = *b"true";
const TYP1_MAGIC: [u8; 4] = *b"typ1";
const OTF_MAGIC: [u8; 4] = *b"OTTO";
const WOFF_MAGIC: [u8; 4] = *b"wOFF";
const WOFF2_MAGIC: [u8; 4] = *b"wOF2";

/// 读取文件头并识别字体格式；非字体文件返回错误。
pub fn validate_font_file(path: &Path) -> Result<FontInfo, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("无法读取文件 {}: {e}", path.display()))?;
    if bytes.len() < 4 {
        return Err(format!("{}: 文件过小，不是有效的字体文件", path.display()));
    }
    let magic: [u8; 4] = [bytes[0], bytes[1], bytes[2], bytes[3]];
    let format = match magic {
        TTF_MAGIC | TRUE_MAGIC | TYP1_MAGIC => FontFormat::Ttf,
        OTF_MAGIC => FontFormat::Otf,
        WOFF_MAGIC => FontFormat::Woff,
        WOFF2_MAGIC => FontFormat::Woff2,
        _ => {
            return Err(format!(
                "{}: 文件头不是已知字体格式（TTF/OTF/WOFF/WOFF2），已拒绝",
                path.display()
            ))
        }
    };
    let name = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "font".into());
    Ok(FontInfo {
        name,
        format,
        size_bytes: bytes.len() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_temp(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "mc-font-workshop-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join(name);
        std::fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn detects_all_formats() {
        assert_eq!(
            validate_font_file(&write_temp("a.ttf", &TTF_MAGIC)).unwrap().format,
            FontFormat::Ttf
        );
        assert_eq!(
            validate_font_file(&write_temp("b.otf", b"OTTOxxxx")).unwrap().format,
            FontFormat::Otf
        );
        assert_eq!(
            validate_font_file(&write_temp("c.woff", b"wOFFxxxx")).unwrap().format,
            FontFormat::Woff
        );
        assert_eq!(
            validate_font_file(&write_temp("d.woff2", b"wOF2xxxx")).unwrap().format,
            FontFormat::Woff2
        );
        assert_eq!(FontFormat::Woff2.ext(), ".woff2");
    }

    #[test]
    fn rejects_non_fonts() {
        assert!(validate_font_file(&write_temp("e.txt", b"PK\x03\x04xxxx")).is_err());
        assert!(validate_font_file(&write_temp("f.bin", &[0u8; 3])).is_err());
    }
}
