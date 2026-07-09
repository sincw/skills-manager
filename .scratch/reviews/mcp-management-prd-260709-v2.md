# Cross-Review v2: MCP Server Library Management PRD

**Date**: 2026-07-09
**Reviewers**: Kimi K2.7 + GLM-5.2
**Artifact**: `.scratch/260709_mcp-management/PRD.md` (post round-1 fixes)

---

## 评分

**Kimi K2.7: 5/10 · GLM-5.2: 6/10 → 最终 min 5/10**
🚫 **BLOCKER — 不可发布**（双方各报独立 blocker，共 5 个）

---

## R1 修复验证

上一轮 5 个 blocker 的修复情况：

| R1 Blocker | 状态 |
|---|---|
| B1: sanitization ≠ --profile | ✅ 已修复，使用 exact preset name + profile_arg 字段 |
| B2: Web edit 无路由 | ✅ 新增 mcp edit + PUT /api/mcp/:name |
| B3: sync 对所有 tool 写 | ✅ supports_mcp_profile 过滤 |
| B4: deactivate replacement 冲突 | ✅ fallback 链 + 仅无 active 时才清空 |
| B5: 空文件兼容性 | ✅ 改为 empty [mcp_servers] section |

结论：R1 修复完整，但修复本身引入了新的 ADR drift 问题（仅改 PRD 未回写 ADR）。

---

## R2 Blocker 清单

### B1. Web install 表单收集 server name，但后端从 content 解析 (Kimi)
**Location**: US20 / Web Client McpPage

Web 安装表单要求用户输入 server name + TOML content，但 CLI 明确规定 name 只能从 `[mcp_servers.<name>]` 解析，没有 --name 参数。UI 传 name 而后端忽略会造成混淆。

**Fix**: 二选一：(a) Web 表单去掉 name 字段，仅输入完整 TOML；(b) 后端强制校验 name == content 中解析的 name，不一致 400。

### B2. PresetBar "统一 API" 无路由支撑 (Kimi)
**Location**: US27-28 / Web Client PresetBar / Web server routes

PresetBar 改为内部统一调用，但 Web server routes 列表没有统一的 `POST /api/presets/:ref/apply` 或 `POST /api/presets/deactivate` endpoint。只有独立的 MCP sync 和 preset CRUD。

**Fix**: 新增 `POST /api/presets/:ref/apply`（skills+MCP 串行 sync）+ `POST /api/presets/deactivate`（清理两者），走 WriteJobQueue。

### B3. JSON format 对 codex 兼容性未验证 (Kimi)
**Location**: ToolAdapter / mcp_output_format

mcp_output_format 支持 JSON，settings UI 对 codex 也暴露 JSON 选项。但 codex 是当前唯一 target，若 codex 不吃 `.config.json`，用户设 JSON 后产物无法加载。

**Fix**: codex 强制仅 toml，或 ToolAdapter 增加 `supported_mcp_formats`，sync 对不支持的格式跳过并报告。

### B4. ADR-0003 与 mcp edit 直接互斥 (GLM)
**Location**: ADR-0003 consequences vs PRD mcp edit

ADR-0003 后果节明确写："不支持在未删除旧文件的情况下原地更新 server"。PRD 引入 `mcp edit` 取代 workaround，但未声明 supersede ADR-0003。两份长期文档直接打架。

**Fix**: PRD 显式声明 supersede + 同步更新 ADR-0003 后果节（或新增 ADR-0006）。

### B5. US22 "remove+reinstall" 措辞未同步 (GLM，Kimi 也发现)
**Location**: US22

US22 仍写 "via remove+reinstall under the same name"，与 implementation "in-place edit" 冲突。上一轮引入 edit 就是为了取代这个 workaround。

**Fix**: 改为 "edit content in-place via mcp edit (PUT /api/mcp/:name)"。

---

## 共识 Warning

| # | 问题 | 建议 |
|---|---|---|
| C2 | edit 路径缺少 64KB 上限：Security 仅对 install 声明 | edit 逻辑与 PUT 路由同样施加 64KB 限制 |
| C3 | 工具配置路由 `/api/config/tools` 与既有 `/api/tools` 不一致 | 复用 `/api/tools` 命名，改为 `PUT /api/tools/:key/mcp` |

---

## Kimi 独到 Warning

| # | 问题 | 建议 |
|---|---|---|
| W1 | `mcp install <path> [--content]` 签名暧昧，path 与 --content 应互斥 | 改为二选一语法 |
| W2 | "clear all MCP profile files" 未限定 scope（当前 active 还是全部 preset） | 明确为 "for the previously active preset" |
| W3 | 无 active preset 时 `mcp sync` 行为未定义 | 返回 `no_active_preset` 错误 |
| W4 | TOML install 遇额外 top-level section 拒绝/忽略未定义 | 拒绝，视为格式错误 |
| W5 | override_mcp_output_dir 放 ToolAdapter 混淆运行时/持久化模型 | CustomToolDef 保留，ToolAdapter 只保留 resolved |
| W6 | PUT /api/tools/:key/mcp 未说明 format 枚举校验 | 仅允许 toml/json，非法 400 |
| W7 | audit_log 扩展标注 future migration 与 Security 要求矛盾 | 明确本轮 v7 是否包含 |

---

## GLM 独到 Warning

| # | 问题 | 建议 |
|---|---|---|
| W8 | ADR-0005 取消激活 "0 字节" 与 PRD "空 [mcp_servers]" 未同步 | 更新 ADR-0005 |
| W9 | ADR-0005 PresetBar optional prop 与 PRD 内部统一冲突 | 更新 ADR-0005 后果节 |
| W10 | Apply A→B 需捕获旧 active id 才能清 A 的具名 profile | 明确 apply 先读 current active id |
| W11 | Deactivate 非活动 preset 分支的 MCP 清理缺失 | 非活动 deactivate 同样清空 MCP profile |
| W12 | add-mcp/remove-mcp 命中活动 preset 时是否自动 sync | 活动 preset 自动重 sync |
| W13 | JSON serverName 含 TOML 非法字符（`.`、`]`）→ 语法错误 TOML | installer 增加字符集校验 |
| W14 | git_backup 扩展可能把 plaintext secret 推到远端 | Security 评估 git_backup 风险 |

---

## 最终评估

第二轮修复解决了第一轮全部 5 个 blocker，方向正确。但暴露出两个新层面的问题：

1. **ADR drift**（GLM 核心发现）：PRD 引用 ADR 作为权威来源，但 ADR-0003/0005 多处条款与 PRD 新版矛盾。这是过程性问题——"修 PRD 不改 ADR"会在每次审查中重复触发。
2. **Web 层契约缺口**（Kimi 核心发现）：安装表单 name 字段、PresetBar 统一 API 路由、JSON format 校验，三处 Web-CLI 契约未闭合。

**修复优先级**：B4（ADR 同步）→ B2（路由补全）→ B1（表单 name）→ B3（JSON 校验）→ W8/W9（ADR-0005）→ W10/W11（deactivate 边界）→ 其余。
