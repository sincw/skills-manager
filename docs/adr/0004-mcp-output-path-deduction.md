# MCP 输出路径推导规则

每个 Tool 的 MCP 输出目录默认从该工具已有的 `relative_skills_dir` 推导：取其父目录作为 MCP 输出根目录。

例如 `.codex/skills` → `.codex/` → 解析为 `~/.codex/`。这一位置恰好匹配 codex 的 `--profile` 加载路径：`$CODEX_HOME/<name>.config.toml`（即 `~/.codex/<name>.config.toml`）。

## 考虑过的选项

- **独立的配置键**：每个工具需要额外配置一个 `mcp_output_dir` 字段。缺点是新工具适配时必须同步配置两个路径，且 90% 的情况下值就是 skills_dir 的父目录，增加了冗余。
- **全局默认路径**：一个全局的 MCP 输出基目录，所有工具共享。缺点是不同的工具可能有不同的 MCP 配置文件规范（codex 用 `.config.toml`，未来 cursor 可能用 `.json`），不适合统一。

## 后果

- 适配新工具时 MCP 输出路径自动就位，无需额外配置
- 用户仍可在设置页覆盖（`override_mcp_output_dir`），与 `override_skills_dir` 模式一致
- 约定：当 `relative_skills_dir` 的父目录不明确时（例如 `~/.agents/skills`），推导结果为 `~/.agents/`
