// MC 版本下拉选项（pack_format 由 Rust 侧对照表匹配）
export interface McVersionOption {
  label: string;
  value: string;
}

export const MC_VERSIONS: McVersionOption[] = [
  { label: "1.8.9（pack_format 1）", value: "1.8.9" },
  { label: "1.12.2（pack_format 3）", value: "1.12.2" },
  { label: "1.14.4（pack_format 4）", value: "1.14.4" },
  { label: "1.16.5（pack_format 6）", value: "1.16.5" },
  { label: "1.17.1（pack_format 7）", value: "1.17.1" },
  { label: "1.18.2（pack_format 8）", value: "1.18.2" },
  { label: "1.19.2（pack_format 9）", value: "1.19.2" },
  { label: "1.19.3（pack_format 12）", value: "1.19.3" },
  { label: "1.19.4（pack_format 13）", value: "1.19.4" },
  { label: "1.20.1（pack_format 15）", value: "1.20.1" },
  { label: "1.20.2（pack_format 18）", value: "1.20.2" },
  { label: "1.20.4（pack_format 22）", value: "1.20.4" },
  { label: "1.20.6（pack_format 32）", value: "1.20.6" },
  { label: "1.21.1（pack_format 34）", value: "1.21.1" },
  { label: "1.21.3（pack_format 42）", value: "1.21.3" },
  { label: "1.21.4（pack_format 46）", value: "1.21.4" },
  { label: "1.21.5（pack_format 55）", value: "1.21.5" },
  { label: "1.21.7（pack_format 63）", value: "1.21.7" },
  { label: "1.21.8（pack_format 64）", value: "1.21.8" },
  { label: "1.21.9（min_format 68）", value: "1.21.9" },
  { label: "1.21.10（min_format 69）", value: "1.21.10" },
  { label: "1.21.11+（min_format 75）", value: "1.21.11" },
  { label: "26.1.x 快照（min_format 84）", value: "26.1" },
  { label: "26.2+ 快照（min_format 88）", value: "26.2" },
];
