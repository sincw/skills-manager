# MCP Server 存储格式：一个文件一个 server，以 server name 为唯一键

每个 MCP Server 配置存储为中央库中的一个独立 `.toml` 文件，恰好包含一个 `[mcp_servers.<name>]` 节。Server name 是全局唯一标识符，而非文件名。

## 考虑过的选项

- **一个文件多个 server**：允许一个 `.toml` 包含多个 `[mcp_servers.xxx]` 节。但这使 Web UI 编辑复杂化（一个表单对应多个 server），且 preset 粒度模糊（添加/移除的是一个文件还是一个 server？），因此否决。
- **以文件名为唯一键**：允许不同的文件名包含相同的 server name。但 codex 以 `$CODEX_HOME/<name>.config.toml` 的 server name 区分 MCP，与文件系统文件名无关，因此否决。

## 后果

- 安装时需解析 TOML 提取 server name
- 文件名仅用作展示和磁盘存储，DO NOT 作为业务标识
- **Superseded by PRD MCP Server Library Management (2026-07)**: 原结论
