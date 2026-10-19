# Changelog

## 0.0.3 — 2026-10-19

### 修复

- 修复 `persona_save` 更新 `speechStyle` / `addressStyle` 时失败的问题。
- 根因是旧调用把 `name` 放在外层、字段放在 `persona` 内层，执行时只读取内层，导致找不到名称并整次失败。
- 扁平参数现在也兼容这种混合结构；仅按名称更新两个声音字段的路径已加回归测试。

## 0.0.2 — 2026-10-19

### 修复

- `persona_save` 改为扁平参数，避免模型在嵌套 `persona` 对象中生成无效 JSON，修复 `tool input is invalid JSON` / `MALFORMED_RESPONSE`。
- 新增 `persona_note`，用于追加单条既定事实，减少因重写整张角色卡而产生的长 JSON。

### 调整

- 共创模式默认回复收紧为一次一个点、2–4 个短段、约 150–300 字。
- README 改为精简结构，补充指令表与许可说明。
- 新增 MIT License。
