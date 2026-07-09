# Preset 同步一体化：激活 preset 时 skills 和 MCP 同时同步

在全局工作区和项目工作区中，点击 preset 按钮（PresetBar）激活或取消激活时，同时处理 skills 和 MCP，而非分步操作。

- **激活**：遍历 preset 的 skills → 复制到各工具 skills 目录 + 调用 `mcp sync --preset <name>` → 合并 MCP servers 为一份输出文件写入各工具的 MCP 输出目录
- **取消激活**：删除各工具的 skills + 将各工具的 MCP 输出文件置空为合法空配置（TOML: `[mcp_servers]\n`，JSON: `{"mcpServers": {}}`），而非 0 字节。空节确保 codex `--profile` 仍可解析路径，不报错

## 考虑过的选项

- **分步操作**：skills 和 MCP 分两个独立的 UI 操作（比如技能栏按钮和 MCP 栏按钮各自独立）。缺点是多了一个步骤，用户容易漏掉其中一个，违背了"共用同一套 preset 管理"的设计意图。
- **PresetBar 完全不变，调用方去手动处理**：每个使用 PresetBar 的父组件在 onComplete 回调里自己调 mcp sync API。缺点是有多处调用方（WorkspaceView、ProjectDetail），容易遗忘或行为不一致。

## 后果

- PresetBar 内部统一调用 `POST /api/presets/:ref/apply`（skills + MCP 串行 sync），不再暴露 MCP 专用 optional prop。父组件无需传回调。
- `POST /api/presets/deactivate` 统一清理 skills + MCP。
- 如果某工具未配 MCP 输出目录或不支持 profile-based MCP（`supports_mcp_profile=false`），该工具在 MCP 同步阶段被跳过并在结果中报告，不阻塞整体流程。
