# Skills Manager Web Companion

[English](./README.md)

Web Companion 是 Skills Manager 的本地浏览器界面。它包含 Fastify API 服务和 React 前端。服务端通过 `skills-manager-cli --json` 读写数据，浏览器不会直接执行 CLI。

`web/client` 是当前保留的 React UI 源头，不再从根目录桌面 UI 同步。部分文件仍保留兼容命名，例如 `lib/tauri.ts`，因为共享页面会 import 这个模块形状；实际实现是 Web HTTP adapter，并通过 browser shims 适配浏览器环境。

## 使用要求

- Linux。
- Node.js 20+。
- 如果要从源码构建或安装 `skills-manager-cli`，需要 Rust 工具链和 `cargo`。
- 可用的 `skills-manager-cli` 二进制。
- Git，可选；Git 技能源、Git Backup、pull、push 和 Git URL 安装需要它。

## 安装顺序

先在仓库根目录安装 CLI：

```bash
cd /path/to/skills-manager
npm run cli:install
```

检查是否可用：

```bash
~/.cargo/bin/skills-manager-cli --help
```

安装 Web 依赖：

```bash
cd /path/to/skills-manager/web
npm install
```

如果 CLI 不在 `PATH` 里，设置路径：

```bash
export SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli"
```

也可以复制 `.env.example`，再通过 shell 或 service manager 加载。

## 开发模式

启动 API 服务：

```bash
cd /path/to/skills-manager/web
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run dev
```

另开一个终端启动 Vite 前端：

```bash
cd /path/to/skills-manager/web
npm run dev:client
```

打开 `http://127.0.0.1:1420`。

Vite 会把 `/api` 代理到 `http://127.0.0.1:17321`。

## 生产构建

构建两个 workspace：

```bash
cd /path/to/skills-manager/web
npm run build
```

启动构建后的服务端：

```bash
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run start --workspace server
```

打开 `http://127.0.0.1:17321`。

## 环境变量

| 变量 | 是否必须 | 说明 |
| --- | --- | --- |
| `SKILLS_MANAGER_CLI` | 推荐 | CLI 可执行文件路径。默认使用 `PATH` 里的 `skills-manager-cli`。 |
| `SKILLS_MANAGER_WEB_HOST` | 否 | 服务监听地址，默认 `127.0.0.1`。 |
| `SKILLS_MANAGER_WEB_PORT` | 否 | 服务端口，默认 `17321`。 |
| `SKILLS_MANAGER_WEB_TOKEN` | 条件必须 | 当 `SKILLS_MANAGER_WEB_HOST=0.0.0.0` 时必须设置。 |
| `SKILLS_MANAGER_SKILLS_ROOT` | 否 | 可选，会传给 CLI：`--skills-root <path>`。 |
| `SKILLS_MANAGER_WEB_DATA_DIR` | 否 | 保存 `audit.jsonl` 和 `commands.jsonl`，默认 `~/.local/share/skills-manager-web`。 |

普通本机浏览器使用时建议保持监听 `127.0.0.1`。如果监听 `0.0.0.0`，后端会要求 `SKILLS_MANAGER_WEB_TOKEN`；远程暴露时请通过带认证的反向代理或其他层给 `/api` 请求加上 `Authorization: Bearer <token>`。

## 路由

核心 Skills Manager 路由：

- `/` - dashboard。
- `/install` - 市场和技能安装。
- `/my-skills` - 已安装 Skills。
- `/global-workspace` - 全局工作区总览。
- `/global-workspace/:agentKey` - 单个工具工作区。
- `/project/:id` - 项目工作区详情。
- `/settings` - 设置。

Web 控制台路由：

- `/web` - 仓库路径、数量、当前 preset、最近任务。
- `/web/skills` - 技能列表、搜索、安装、更新、检查、导出、标签、adopt 和删除。
- `/web/presets` - preset 列表、预览、应用、停用、添加/移除技能和同步。
- `/web/tools` - 只读工具状态。
- `/web/git` - status、init、clone、remote、pull、push、commit、versions 和 restore。
- `/web/operations` - 任务队列、命令参数、stdout/stderr、错误和耗时。
- `/web/settings` - 主题、语言和中央仓库路径控制。

高风险写操作需要前端确认，并且后端请求必须带 `confirm: true`。删除技能前必须先执行 `remove-dry-run`，否则删除接口不会接受。

## 测试

```bash
npm run lint
npm run test
```

`npm run test` 会运行服务端测试并构建前端生产包。

## systemd 用户服务

示例 unit：`docs/systemd-user.service`。

```bash
mkdir -p ~/.config/skills-manager-web
cp .env.example ~/.config/skills-manager-web/env
cp docs/systemd-user.service ~/.config/systemd/user/skills-manager-web.service
systemctl --user daemon-reload
systemctl --user enable --now skills-manager-web
```

如果你的代码目录不是 `~/src/skills-manager/web`，需要修改 unit 里的 `WorkingDirectory`。
