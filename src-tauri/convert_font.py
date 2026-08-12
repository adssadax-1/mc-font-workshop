#!/usr/bin/env python3
"""字体转 TTF 转换器（供 Rust 端调用）。

- WOFF / WOFF2：解包容器 → TTF
- OTF（CFF/PostScript 轮廓）：转换为 TrueType（glyf）轮廓
- 可变字体（variable font）：实例化到默认实例
- 移除 Minecraft 用不到的布局表（GSUB/GPOS 等）

用法: python convert_font.py <输入字体路径> <输出目录>
成功输出 JSON: {"ok": true, "path": "...ttf", "size_bytes": N}
失败输出 JSON: {"error": "..."}
"""
import json
import os
import sys


def safe_name(name: str) -> str:
    cleaned = "".join(c if (c.isalnum() or c in "_-.") else "_" for c in name)
    return cleaned or "font"


def cff_to_ttf(font):
    """把 CFF 表（三次贝塞尔）转换为 glyf 表（二次贝塞尔），供 stb_truetype 渲染。"""
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib.tables._g_l_y_f import table__g_l_y_f
    from fontTools.ttLib.tables._l_o_c_a import table__l_o_c_a

    cff = font["CFF "].cff
    char_strings = cff.topDictIndex[0].CharStrings
    glyph_order = font.getGlyphOrder()
    glyphs = {}
    for name in glyph_order:
        tt_pen = TTGlyphPen(glyphs)
        cu2qu_pen = Cu2QuPen(tt_pen, max_err=1.0, reverse_direction=True)
        char_strings[name].draw(cu2qu_pen)
        glyphs[name] = tt_pen.glyph()
    glyf = table__g_l_y_f("glyf")
    glyf.glyphOrder = glyph_order
    glyf.glyphs = glyphs
    font["glyf"] = glyf
    # glyf 表依赖 loca 表定位字形（DirectWrite 等渲染器必需），CFF 源没有 loca 需补建
    if "loca" not in font:
        font["loca"] = table__l_o_c_a("loca")
    del font["CFF "]
    if "VORG" in font:
        del font["VORG"]
    # post 3.0：不保存字形名（Minecraft/stb_truetype 不依赖 post 名字）
    font["post"].formatType = 3.0
    font.sfntVersion = "\x00\x01\x00\x00"
    return font


def convert(src: str, out_dir: str) -> str:
    from fontTools.ttLib import TTFont

    font = TTFont(src)

    # 可变字体：实例化到默认实例（Minecraft 不支持 gvar 变体）
    if "fvar" in font:
        from fontTools.varLib.instancer import instantiateVariableFont

        axes = {a.axisTag: a.defaultValue for a in font["fvar"].axes}
        font = instantiateVariableFont(font, axes)

    # OTF（CFF 轮廓）→ TrueType（glyf 轮廓）
    if "CFF " in font:
        font = cff_to_ttf(font)

    # 移除 Minecraft 用不到的布局/其他表，避免转换后残留引用问题
    for tag in (
        "GSUB", "GPOS", "GDEF", "BASE", "JSTF",
        "morx", "mort", "kerx", "kern", "Feat", "opbd",
        "DSIG",
    ):
        if tag in font:
            del font[tag]

    os.makedirs(out_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(src))[0]
    out_path = os.path.join(out_dir, safe_name(stem) + ".ttf")
    font.save(out_path)
    return out_path


def main() -> int:
    if len(sys.argv) < 3:
        print(json.dumps({"error": "参数不足：需要 <输入字体> <输出目录>"}))
        return 1
    src, out_dir = sys.argv[1], sys.argv[2]
    try:
        out_path = convert(src, out_dir)
        print(json.dumps({
            "ok": True,
            "path": out_path,
            "size_bytes": os.path.getsize(out_path),
        }))
        return 0
    except Exception as exc:  # noqa: BLE001 - 脚本面向外部调用，任何失败都要回传
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
