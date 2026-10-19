# Changelog

## 0.0.2 — 2026-10-19

### 修复

- `persona_save` 改为扁平参数，避免模型在嵌套 `persona` 对象中生成无效 JSON，修复 `tool input is invalid JSON` / `MALFORMED_RESPONSE`。
- 新增 `persona_note`，用于追加单条既定事实，减少因重写整张角色卡而产生的长 JSON。

### 调整

- 共创模式默认回复收紧为一次一个点、2–4 个短段、约 150–300 字。
- README 改为精简结构，补充指令表与许可说明。
- 新增 MIT License。
