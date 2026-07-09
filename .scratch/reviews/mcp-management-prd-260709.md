# Cross-Review: MCP Server Library Management PRD

**Date**: 2026-07-09
**Reviewers**: Kimi K2.7 + GLM-5.2
**Artifact**: `.scratch/260709_mcp-management/PRD.md`

---

## 评分

**Kimi K2.7: 5/10 · GLM-5.2: 5/10 → 最终 min 5/10**
🚫 **BLOCKER — 不可发布**（双方各自发现独立 blocker，共 5 个 blocker）

---

## Blocker 清单

### B1. Sanitized profile name ≠ codex `--profile` 参数 (GLM)
**Location**: Solution / MCP profile file naming; US 8/9; Further Notes

同步产物文件名被 sanitize：`"Web Dev" → web-dev.config.toml`，但 codex `--profile <name>` 按字面 name 找文件 —— `codex --profile "Web Dev"` 找的是 `Web Dev.config.toml`，而非 `web-dev.config.toml`。PRD 全程未说明用户应该传 sanitized name，核心闭环断裂。

**Fix**: 二选一：(a) 不做 sanitize 保留原名；(b) sync 结果显式返回 sanitized name 并引导用户 `--profile web-dev`。必须补 US：「sync 报告 exact --profile argument」。

### B2. Web edit (US20) 无路由/CLI 支撑 (GLM)
**Location**: Solution / Web client layer + Web server routes + US20

US20 要求 Web 编辑已安装 server 的 TOML，但 CLI 无 `mcp edit` 子命令，server routes 无 PUT/PATCH `/api/mcp/:name`，且 install 拒绝重名。三层均无支撑，US20 不可交付。

**Fix**: 新增 `mcp edit` CLI 子命令 + `PUT /api/mcp/:name` 路由。澄清「编辑改 name」的语义（禁止还是 rename）。

### B3. Sync 对所有 tool 写，但仅 codex 支持 `--profile` (GLM)
**Location**: Solution / Sync logic; Out of Scope

Sync 对每个 enabled tool 写 `{name}.config.toml`，但 Out of Scope 声明仅 codex 支持 `--profile`。为 cursor/claude 等工具写入的幽灵文件不会被加载，且可能与这些工具自有的 MCP 配置路径冲突。

**Fix**: ToolAdapter 增加 `supports_mcp_profile: bool`，仅 codex=true，其余跳过并在 skipped 列表标注原因 "tool does not support profile-based mcp"。

### B4. `presets deactivate` + replacement preset 逻辑冲突 (Kimi)
**Location**: Implementation Decisions / CLI layer / Preset apply/deactivate enhancement

现有 `run_presets` 的 `Deactivate` 在关闭 active preset 时会自动切换到 replacement preset（default 或下一个）并 apply。若直接清空 MCP profile，replacement preset 的 skills 已同步但 MCP 为空，行为不一致。

**Fix**: deactivate 切换时先走 apply（同步新 preset 的 skills+MCP），再仅对最终无 active 的情况清空。

### B5. Deactivate 空 TOML 文件对 codex 的兼容性未验证 (Kimi)
**Location**: Further Notes 第二段

PRD 声称「preset 取消激活时 MCP profile 文件置为 0 字节，codex 仍能解析 --profile 路径」。空文件不是合法 TOML，codex 解析阶段可能报错。

**Fix**: 验证 codex 对空 `.config.toml` 的实际行为；若不支持，改为写入 `# no mcp servers` 注释行或空 `[mcp_servers]` 表。

---

## 共识 Warning (both reviewers)

| # | 问题 | 建议 |
|---|---|---|
| W1 | `mcp install --name` 语义未定义：与文件内 server name 冲突时的行为不明确 | 建议移除 `--name`，name 永远取自文件内容 |
| W2 | Secret/env 处理零覆盖：全链路明文，未引用已有 `crypto.rs` | 新增「Secret handling」小节，即使不做加密也需显式记录风险 |
| W3 | JSON output 节标题自相矛盾（`JSON output format (for TOML format tools)`） | 改为 TOML 示例先行，JSON 移到 Future 小节 |
| W4 | Git 备份 + 审计日志未覆盖 MCP | 扩展 audit_log schema，git_backup 纳入 `mcp/` 目录 |
| W5 | US15 "remove" vs Further Notes "置空 0 字节" 措辞冲突 | 统一口径为「置空」 |

---

## Kimi 独到 Warning

| # | 问题 | 建议 |
|---|---|---|
| W6 | `ToolAdapter.relative_mcp_output_dir` 定义但计算链未使用 | 统一计算链：override → relative → parent_of(skills_dir) |
| W7 | `PresetBar.onActivateMCP` 为 optional prop，静默遗漏风险 | 内聚到 PresetBar 内部统一调用 |
| W8 | MCP profile 文件名 sanitize 规则欠定义（特殊字符范围、连续连字符等） | 给出明确正则 `[^a-z0-9]+`→`-` |
| W9 | 错误路径测试覆盖不足（语法错误、特殊字符、磁盘无权限） | 各核心操作补充异常输入 golden file |
| W10 | JSON 多 server 拒绝时错误信息格式未结构化 | 定义 `--json` 结构化错误 schema |

---

## GLM 独到 Warning

| # | 问题 | 建议 |
|---|---|---|
| W11 | US28 vs Out of Scope 项目工作区矛盾 | 统一：项目工作区激活=复用全局 MCP sync，改 US28 措辞 |
| W12 | `mcp_servers.enabled` 字段无消费方（无 enable/disable US） | 删除该字段，禁用语义通过「从 preset 移除」表达 |
| W13 | Apply 切换 preset 后旧 MCP profile 文件残留（skills 侧有清理，MCP 侧无） | apply 增强：对旧 preset 执行等价的 deactivate 清理 |
| W14 | Web 展示 MCP 内容泄露 secrets（US19/22/23 明文显示） | US：env 默认掩码 + reveal toggle |
| W15 | Web install "from content" 缺少 CLI 契约（CLI 只接受 `<path>`） | CLI install 增加 `--content` 或 stdin 入口 |
| W16 | MCP install 无安全检查（不校验 command、无大小上限） | 新增 Security 小节声明风险接受 |
| W17 | ToolAdapter 新字段未考虑 CustomToolDef Deserialize 侧（旧 settings 缺字段解析失败） | CustomToolDef 同步加字段 + `#[serde(default)]` |
| W18 | Deactivate 仅遍历当前 enabled tools，跨工具集变更后陈旧文件残留 | 新增 `mcp_sync_metadata` 表，按历史清理 |
| W19 | CLI `--name` flag 与 installer logic「parse from content」矛盾 | 明确优先级或移除 --name |
| W20 | JSON→TOML 转换键名归一化规则缺位 | 补规则：`"mcpServers"` 顶层键→`[mcp_servers.<name>]`，其余键原样保留 |
| W21 | mcp_output_format=JSON 时 deactivate 置 0 字节是非法 JSON | 按格式区分：toml→0字节，json→`{}` |
| W22 | preset 名 sanitize 后可能冲突（`"Web Dev"` 与 `"web-dev"` 产出同名文件） | sanitize 后做唯一性校验，冲突时报错或加后缀 |
| W23 | Missing test: JSON→TOML 语义保真度、preset add-mcp→sync 端到端、sanitize 冲突 | 在 test seam 补充 |

---

## 最终评估

这份 PRD 在整体架构方向上正确——严格镜像现有 skills 管理（库/preset/sync），三段式 vertical slice 清晰，ADR 引用充分。但存在 **5 个 blocker**，其中最关键的是**核心闭环断裂**：sanitize 后的文件名与 codex `--profile` 的字面名不对应（B1），导致 sync 产物无法被 codex 加载。此外，Web edit (US20) 在整个 CLI + Server + Client 三层均无支撑路由（B2），sync 对所有 tool 盲目写文件与 Out of Scope「仅 codex」形成文档内自相矛盾（B3）。

建议修订优先级：
1. **Blocker 优先级**: B1（核心闭环）> B2（US20 不可交付）> B3（可行性矛盾）> B4（代码兼容）> B5（外部验证）
2. **Warning 优先级**: W14（Web secrets 泄露）> W2（secret 策略声明）> W11（项目工作区语义）> W6（死字段）> W13（旧文件残留）> 其余
