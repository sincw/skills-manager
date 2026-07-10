# PRD 增量：全局工作区工具详情 — MCP Tab

Status: ready-for-agent

Parent: `.scratch/260709_mcp-management/PRD.md`（MCP 管理主 PRD；本文件是其后端/CLI 已落地后的 UI 增量）

## Problem Statement

MCP Server Library、preset 成员（技能库 / MCP库 tab）、以及 preset apply 时的 MCP profile sync 已在主 PRD 中实现。但用户在 **左侧导航 → 全局工作区 → 某工具（如 Codex）详情页** 时：

1. 页面只展示该工具全局 skills 目录里的 skill 列表；
2. 顶部有 PresetBar，apply 会同步 skills + MCP，但 **页面本身看不到 MCP 结果**；
3. 用户无法在当前上下文中确认「这个工具现在生效的是哪份 profile、里面有哪些 server、文件写在哪」；
4. 安装 / 调整 MCP 必须离开当前页，跳到侧栏「MCP库」或「我的技能」preset 详情，上下文断裂。

这与 `/my-skills`（preset 详情）已经提供的 **「技能库 / MCP库」双 tab** 体验不一致：同一套 preset 体系，在全局工作区却只露出 skill 半边。

## Solution

在 **全局工作区 · 工具详情页**（`WorkspaceView` 在选中某个 `currentTool` 时）增加与 `/my-skills` 同构的顶层 tab：

| Tab | 内容 |
|---|---|
| **技能库 {N}** | 现有全局 local skills 列表（搜索 / 标签 / 网格列表 / 添加 skill 等），行为不变 |
| **MCP库 {M}** | 新：面向「当前工具 + 当前 active preset」的 MCP 视图，可展示、安装、调整成员并看到 profile 落盘结果 |

视觉与交互对齐 `MySkills.tsx` 的 tab bar（`border-b` + active 下划线 + count），MCP 成员区优先复用 `PresetMcpTab`（或抽一层共享组件），避免第二套 membership UI。

### 信息架构（工具中心，而非再造一个 MCP 库）

全局工作区是 **per-tool** 视图；MCP profile 按设计写在 **工具全局配置目录**（例如 `~/.codex/{preset}.config.toml`），且本阶段只有 `supports_mcp_profile=true` 的工具（目前仅 codex）会真正写文件。

因此 MCP tab 的信息分层为：

```
[ 技能库 N ]  [ MCP库 M ]
─────────────────────────
① Profile 状态卡（仅 supports_mcp_profile 工具显示完整信息）
② 当前 active preset 的 MCP 成员列表（增删；无 active 时引导）
③ 安装入口（写入 MCP Library，可选加入 active preset）
```

侧栏「MCP库」页（全库 CRUD）保留；本 tab **不替代**全库页，而是在工作区上下文中提供「当前生效面 + 快捷安装/成员调整」。

## User Stories

1. As a web user on **全局工作区 → Codex 详情**，I want a **技能库 / MCP库** tab bar like `/my-skills`, so that I can switch between skills and MCP without leaving the tool page.
2. As a web user on the MCP tab, I want to see whether this tool supports MCP profile sync (`supports_mcp_profile`), so that I understand why pi/claude 等工具可能没有 profile 文件.
3. As a web user on a supporting tool (codex), I want a **Profile 状态卡** showing:
   - active preset name（若有）
   - 输出路径（如 `~/.codex/test3.config.toml`）
   - 是否已写入 / 是否为空节 `[mcp_servers]`
   - 建议启动参数（`codex --profile {preset_name}` / `profile_arg`）
   so that I no longer mistake `Default.config.toml` for the active preset file.
4. As a web user, when there is an **active preset**, I want the MCP tab to list that preset’s MCP servers (name + command excerpt, no env), with add/remove controls identical in spirit to `/my-skills` MCP tab, so that membership changes here re-sync the profile immediately when the preset is active.
5. As a web user, when there is **no active preset**, I want a clear empty state (“先应用一个 Preset”) and still be able to open/install into the MCP Library, so that I am not blocked from managing the library.
6. As a web user, I want an **安装 MCP** entry on this tab (raw TOML editor, same contract as MCP Library install: parse `[mcp_servers.<name>]`), with an option “同时加入当前 active preset”（default on when active preset exists), so that install → membership → profile write can happen in one place.
7. As a web user on a tool with `supports_mcp_profile=false`, I want the MCP tab to show an explanatory empty/unsupported panel (本工具暂不支持 profile 型 MCP；管理请到 MCP库；apply 时会被 skip), and still allow browsing/installing into the central MCP Library, so that the tab is never a dead end.
8. As a web user, after PresetBar apply/deactivate or MCP membership/install on this tab, I want the Profile 状态卡 and MCP count to refresh, so that the UI matches disk state.
9. As a web user, I want the page header badge / tab counts to mean:
   - 技能库 count = 当前工具全局 skills 列表数量（现有 `localSkills.length`）
   - MCP库 count = 当前 active preset 的 MCP 成员数（无 active 时为 0 或显示 “—” 并在 tab 内解释）
   so that counts match `/my-skills` semantics (preset-scoped MCP count), not “disk 上有多少个 \*.config.toml”.

## Implementation Decisions

### Surface

- **Primary file**: `web/client/src/views/WorkspaceView.tsx`（`currentTool` 已选中的详情分支）
- **Reuse**:
  - Tab bar 样式对齐 `MySkills.tsx`（`detailTab: "skills" | "mcp"`）
  - 成员列表/增删复用 `web/client/src/components/PresetMcpTab.tsx`（入参 `presetId` = CLI active preset id；若组件强依赖 “viewed preset from MySkills”，则抽 `PresetMcpMembership` 共享，MySkills / WorkspaceView 共用）
  - 安装表单可抽小组件，或轻量内嵌与 `McpLibrary.tsx` / `McpPage.tsx` 相同的 `--content` install 调用（`api.installMcp`）
- **API**（已有，原则上 **不新增** CLI/服务端能力）:
  - `GET /api/presets/current` → active preset
  - `GET /api/presets/:ref/mcp` → 成员
  - `POST|DELETE /api/presets/:ref/mcp` → 增删成员（active 时 CLI 已 auto re-sync）
  - `POST /api/mcp/install` → 安装
  - `GET /api/mcp` / `GET /api/mcp/:name` → 列表与全文
  - `POST /api/mcp/sync` 或依赖 apply/成员变更后的 auto-sync；状态卡可用 `mcp sync --preset` 的 JSON（若需强制刷新）或客户端在 apply 返回的 `mcp.tools[toolKey]` 上缓存
  - `GET /api/tools` → `supports_mcp_profile` / `mcp_output_dir` / `mcp_output_format`

### Profile 状态卡数据

优先用已有 apply/sync JSON 契约，避免新 API：

```json
{
  "preset": "test3",
  "profile_arg": "test3",
  "tools": {
    "codex": { "status": "written", "path": "/home/sinc/.codex/test3.config.toml" }
  }
}
```

客户端在以下时机刷新状态卡：

1. 进入 MCP tab / 切换 tool
2. PresetBar `onComplete`
3. MCP 安装成功且勾选加入 active preset
4. `PresetMcpTab` membership change 回调

若当前无 active preset：状态卡显示 “无 active preset，未生成/未绑定 profile”。

若 tool 不支持：状态卡显示 skip reason 文案 `tool_does_not_support_profile_mcp` 的用户可读版。

**不要**在状态卡默认展示 env 明文；成员列表 excerpt 仅 name + command（与主 PRD / MySkills 一致）。完整 TOML 可通过 “查看” 链到 MCP库详情或本 tab 内只读展开（env 本阶段仍明文，与主 PRD 一致）。

### 文件命名与用户教育（写进 UI 文案）

主 PRD 约定输出文件名为 **`{preset_name}.config.{ext}`**（精确 preset 名，无 sanitize）。状态卡必须展示 **完整路径 + profile 名**，并注明：

- 应用 `test3` → 写入 `~/.codex/test3.config.toml`，**不是** `Default.config.toml`
- 取消应用 → 文件保留，内容置为合法空节 `[mcp_servers]\n`（设计如此）
- 使用：`codex --profile test3`（`profile_arg`）

### 安装交互

- 主按钮：「安装 MCP」→ 展开/对话框，单文本域 raw TOML（与 MCP库相同）
- Checkbox：「加入当前 Preset（{name}）并同步 profile」— 仅当存在 active preset 且当前 tool 支持 profile 时默认勾选；无 active 时禁用并提示
- 成功后：刷新成员列表 + 状态卡；toast 带 path（若已 sync）

### PresetBar

- 保留在 header 区域（技能/MCP 两个 tab 共用），不藏进技能 tab
- apply/deactivate 后两个 tab 的 count 与 MCP 状态卡都要刷新

### i18n

- 新增 `globalWorkspace.tabs.skills` / `globalWorkspace.tabs.mcp`
- 状态卡、unsupported、空 active、安装、profile 提示等 key（zh / en / zh-TW）

### 项目工作区

- **本 PRD 默认不改** `ProjectDetail`：MCP 仍全局生效，项目页已有 PresetBar 全局提示
- 若实现时复用组件成本极低，可可选在项目详情加只读 MCP 状态卡；**非验收必须**

## Testing Decisions

### 验收重点（行为）

1. 全局工作区进入 codex 详情 → 可见「技能库 / MCP库」tab，默认「技能库」，技能列表与现网一致
2. 切到 MCP库 → 若 active=test3 且含 example2 → 列表显示 example2；状态卡 path 为 `…/test3.config.toml` 且非空
3. 在 MCP tab 移除 example2 → 成员更新；若 test3 仍为 active → profile 变为空节或不再含 example2
4. 再添加 example2 → profile 恢复含 server
5. 安装新 TOML 并勾选加入 active preset → 库中有记录、成员有记录、profile 含新 server
6. 切换到 pi（或不支持的工具）详情 MCP tab → unsupported 说明 + 仍可打开安装/链到 MCP库；不假装写了 profile
7. 无 active preset → 成员区 empty state；状态卡提示先 apply
8. PresetBar apply test3 → 状态卡路径/内容与 disk 一致；用户不会被导向 `Default.config.toml` 作为 test3 的文件

### 技术验证

- `cd web && npm run build --workspace client` + lint
- 不强制新 CLI 测试（无新 Rust 契约时）；若为实现状态卡新增只读 API，则补 server route 测试

## Out of Scope

- 多工具原生 MCP 写入（pi `mcp.json`、Claude/Cursor 等）— 仍受主 PRD `supports_mcp_profile` 限制
- 多 preset 同时 active / 合并多 profile
- 项目工作区完整 MCP tab（可选只读，非必须）
- env 脱敏、audit 扩展
- 修改 CLI sync 文件名规则或 deactivate 空节语义
- 在全局工作区实现完整 MCP 库替代侧栏 MCP库页（全库编辑/删除仍以侧栏为准；本 tab 以「当前 preset 成员 + 安装快捷入口 + profile 状态」为主）

## Further Notes

- 主 PRD US-30 已要求全局/项目 apply 时 sync MCP；本增量补的是 **可见性与就地管理**，不改变 sync 语义。
- 用户曾误读 `~/.codex/Default.config.toml`：状态卡与 toast 必须强调 **文件名 = preset 名**。
- `/my-skills` 的 tab 是 **preset 详情** 维度；本页 tab 是 **tool 详情** 维度。MCP 成员仍挂在 **active preset** 上（与 CLI 单 active 模型一致），不是 “按工具各维护一份 MCP 成员表”。
- 若后续做多工具 MCP，本 tab 的状态卡/unsupported 分支是自然扩展点，无需再拆 IA。
