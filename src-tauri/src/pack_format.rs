//! Minecraft 资源包格式（pack_format）版本对照表。
//!
//! 1.21.9 及以后，资源包改用 `min_format` / `max_format` 替代单一 `pack_format`。

use serde::{Deserialize, Serialize};

/// 某个 MC 版本对应的资源包格式信息。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PackFormatInfo {
    /// 单一 pack_format（1.21.8 及以下，或手动指定时使用）。
    pub single: Option<i32>,
    /// 1.21.9+ 的最低可加载格式。
    pub min_format: Option<i32>,
    /// 1.21.9+ 的最高可加载格式（开放给未来版本）。
    pub max_format: Option<i32>,
}

impl PackFormatInfo {
    pub const fn single(n: i32) -> Self {
        Self {
            single: Some(n),
            min_format: None,
            max_format: None,
        }
    }

    pub const fn range(min: i32) -> Self {
        Self {
            single: None,
            min_format: Some(min),
            max_format: Some(9999),
        }
    }
}

type Ver = (u32, u32, u32);

struct VersionEntry {
    min: Ver,
    max: Ver,
    pf: PackFormatInfo,
}

const fn v(major: u32, minor: u32, patch: u32) -> Ver {
    (major, minor, patch)
}

/// pack_format 全版本对照表（按 MC 版本从低到高排列）。
/// 来源：Minecraft Wiki - Pack format，与规划文档一致。
const TABLE: &[VersionEntry] = &[
    VersionEntry { min: v(1, 6, 1), max: v(1, 8, 9), pf: PackFormatInfo::single(1) },
    VersionEntry { min: v(1, 9, 0), max: v(1, 10, 2), pf: PackFormatInfo::single(2) },
    VersionEntry { min: v(1, 11, 0), max: v(1, 12, 2), pf: PackFormatInfo::single(3) },
    VersionEntry { min: v(1, 13, 0), max: v(1, 14, 4), pf: PackFormatInfo::single(4) },
    VersionEntry { min: v(1, 15, 0), max: v(1, 16, 1), pf: PackFormatInfo::single(5) },
    VersionEntry { min: v(1, 16, 2), max: v(1, 16, 5), pf: PackFormatInfo::single(6) },
    VersionEntry { min: v(1, 17, 0), max: v(1, 17, 1), pf: PackFormatInfo::single(7) },
    VersionEntry { min: v(1, 18, 0), max: v(1, 18, 2), pf: PackFormatInfo::single(8) },
    VersionEntry { min: v(1, 19, 0), max: v(1, 19, 2), pf: PackFormatInfo::single(9) },
    VersionEntry { min: v(1, 19, 3), max: v(1, 19, 3), pf: PackFormatInfo::single(12) },
    VersionEntry { min: v(1, 19, 4), max: v(1, 19, 4), pf: PackFormatInfo::single(13) },
    VersionEntry { min: v(1, 20, 0), max: v(1, 20, 1), pf: PackFormatInfo::single(15) },
    VersionEntry { min: v(1, 20, 2), max: v(1, 20, 2), pf: PackFormatInfo::single(18) },
    VersionEntry { min: v(1, 20, 3), max: v(1, 20, 4), pf: PackFormatInfo::single(22) },
    VersionEntry { min: v(1, 20, 5), max: v(1, 20, 6), pf: PackFormatInfo::single(32) },
    VersionEntry { min: v(1, 21, 0), max: v(1, 21, 1), pf: PackFormatInfo::single(34) },
    VersionEntry { min: v(1, 21, 2), max: v(1, 21, 3), pf: PackFormatInfo::single(42) },
    VersionEntry { min: v(1, 21, 4), max: v(1, 21, 4), pf: PackFormatInfo::single(46) },
    VersionEntry { min: v(1, 21, 5), max: v(1, 21, 5), pf: PackFormatInfo::single(55) },
    VersionEntry { min: v(1, 21, 6), max: v(1, 21, 7), pf: PackFormatInfo::single(63) },
    VersionEntry { min: v(1, 21, 8), max: v(1, 21, 8), pf: PackFormatInfo::single(64) },
    VersionEntry { min: v(1, 21, 9), max: v(1, 21, 9), pf: PackFormatInfo::range(68) },
    VersionEntry { min: v(1, 21, 10), max: v(1, 21, 10), pf: PackFormatInfo::range(69) },
    VersionEntry { min: v(1, 21, 11), max: v(1, 21, 999), pf: PackFormatInfo::range(75) },
    // 26.1.x（1.21.9 快照系）/ 26.2+ 以 min_format 标记
    VersionEntry { min: v(26, 1, 0), max: v(26, 1, 999), pf: PackFormatInfo::range(84) },
    VersionEntry { min: v(26, 2, 0), max: v(26, 2, 999), pf: PackFormatInfo::range(88) },
];

/// 解析形如 "1.21.9" / "26.2" / "1.21" 的版本号。
fn parse_version(s: &str) -> Option<Ver> {
    let parts: Vec<&str> = s.trim().split('.').collect();
    if parts.is_empty() || parts.len() > 3 {
        return None;
    }
    let mut out = [0u32; 3];
    for (i, p) in parts.iter().enumerate() {
        let n: u32 = p.trim().parse().ok()?;
        if n >= 1000 {
            return None;
        }
        out[i] = n;
    }
    Some((out[0], out[1], out[2]))
}

/// 根据 MC 版本号匹配资源包格式。
///
/// - 纯数字输入视为手动指定 pack_format；
/// - 1.21.9+ 返回 `min_format`/`max_format`；
/// - 超出对照表的未来版本返回兜底格式。
pub fn pack_format_for_version(version: &str) -> Result<PackFormatInfo, String> {
    let vs = version.trim();
    if vs.is_empty() {
        return Err("版本号不能为空".into());
    }
    // 纯数字 → 手动 pack_format
    if vs.chars().all(|c| c.is_ascii_digit()) {
        let n: i32 = vs
            .parse()
            .map_err(|_| format!("pack_format 数字无效: {vs}"))?;
        if !(1..=1000).contains(&n) {
            return Err(format!("pack_format 应在 1~1000 之间: {vs}"));
        }
        return Ok(PackFormatInfo::single(n));
    }
    let ver = parse_version(vs).ok_or_else(|| format!("无法解析版本号: {vs}"))?;
    for e in TABLE {
        if ver >= e.min && ver <= e.max {
            return Ok(e.pf);
        }
    }
    // 未来版本兜底
    if ver >= v(26, 2, 0) {
        return Ok(PackFormatInfo::range(88));
    }
    if ver >= v(26, 1, 0) {
        return Ok(PackFormatInfo::range(84));
    }
    if ver >= v(1, 21, 9) {
        return Ok(PackFormatInfo::range(75));
    }
    Err(format!("未找到版本 {vs} 对应的 pack_format"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_versions_use_single() {
        assert_eq!(pack_format_for_version("1.8.9").unwrap().single, Some(1));
        assert_eq!(pack_format_for_version("1.12.2").unwrap().single, Some(3));
        assert_eq!(pack_format_for_version("1.16.5").unwrap().single, Some(6));
        assert_eq!(pack_format_for_version("1.19.4").unwrap().single, Some(13));
        assert_eq!(pack_format_for_version("1.20.1").unwrap().single, Some(15));
        assert_eq!(pack_format_for_version("1.20.4").unwrap().single, Some(22));
        assert_eq!(pack_format_for_version("1.20.6").unwrap().single, Some(32));
        assert_eq!(pack_format_for_version("1.21.1").unwrap().single, Some(34));
        assert_eq!(pack_format_for_version("1.21.3").unwrap().single, Some(42));
        assert_eq!(pack_format_for_version("1.21.4").unwrap().single, Some(46));
        assert_eq!(pack_format_for_version("1.21.5").unwrap().single, Some(55));
        assert_eq!(pack_format_for_version("1.21.7").unwrap().single, Some(63));
        assert_eq!(pack_format_for_version("1.21.8").unwrap().single, Some(64));
    }

    #[test]
    fn new_versions_use_min_format() {
        let r = pack_format_for_version("1.21.9").unwrap();
        assert_eq!(r.single, None);
        assert_eq!(r.min_format, Some(68));
        assert_eq!(pack_format_for_version("1.21.10").unwrap().min_format, Some(69));
        assert_eq!(pack_format_for_version("1.21.11").unwrap().min_format, Some(75));
        assert_eq!(pack_format_for_version("26.1").unwrap().min_format, Some(84));
        assert_eq!(pack_format_for_version("26.2").unwrap().min_format, Some(88));
    }

    #[test]
    fn manual_number_is_pack_format() {
        assert_eq!(pack_format_for_version("42").unwrap().single, Some(42));
        assert!(pack_format_for_version("0").is_err());
        assert!(pack_format_for_version("abc").is_err());
    }

    #[test]
    fn future_versions_fallback() {
        assert_eq!(pack_format_for_version("1.25").unwrap().min_format, Some(75));
        assert_eq!(pack_format_for_version("27.0").unwrap().min_format, Some(88));
    }
}
