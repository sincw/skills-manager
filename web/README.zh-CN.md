# Skills Manager Web Companion

[English](./README.md)

这是 `xingkongliang/skills-manager` 的 Linux-only 浏览器界面。Web Companion 由本地 Fastify API 服务和 React 前端组成。服务端通过 `skills-manager-cli --json` 读写数据，浏览器不会直接执行 CLI。

当前项目位于主仓库的 `web/` 目录：

```text
skills-manager/
  web/
```

## 使用前必须安装什么

- Linux。
- Node.js 20+。
- Rust 工具链和 `cargo`，从源码构建或安装 `skills-manager-cli` 时需要。
- 可用的 `skills-manager-cli` 二进制文件，这是 Web 页面必须依赖的后端。
- Git，可选；如果你要使用 Git 技能源、Git Backup、pull、push，或者从 Git URL 安装技能，就需要安装。

使用 Web 页面前不需要先启动桌面版。Web 页面和桌面版都会通过 CLI 使用本机的 Skills Manager 数据。

## 是否必须先安装插件

不需要额外手动安装浏览器插件、Skills Manager 插件或 Tauri 插件。

前端复用了上游桌面版 React 页面，因此代码里会 import 一些 Tauri plugin API；但 Web 构建会把这些 import 映射到 `client/src/lib/browser-shims.ts` 里的浏览器兼容实现。开发依赖由 `npm install` 自动安装。

## 安装顺序

### 1. 先从父项目安装 CLI

在仓库根目录执行：

```bash
cd /path/to/skills-manager
npm install
npm run cli:install
```

默认会把二进制文件安装到：

```text
~/.cargo/bin/skills-manager-cli
```

检查是否可用：

```bash
~/.cargo/bin/skills-manager-cli --help
```

如果你的 `PATH` 里已经有可用的 `skills-manager-cli`，可以跳过重新安装。

### 2. 安装 Web 工程依赖

进入 Web 工程：

```bash
cd /path/to/skills-manager/web
npm install
```

如果你想按 lockfile 做一次干净安装，可以用 `npm ci` 替代 `npm install`。

### 3. 配置服务端环境变量

本机使用时，通常只需要指定 CLI 路径：

```bash
export SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli"
```

也可以复制模板并在当前 shell 中加载：

```bash
cd /path/to/skills-manager/web
cp .env.example .env
set -a
source .env
set +a
```

服务端读取的是进程环境变量。`.env` 文件只是模板，除非你通过 shell、systemd 或其他工具主动加载它。

## 开发模式启动 Web 页面

第一个终端启动 API 服务：

```bash
cd /path/to/skills-manager/web
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run dev
```

第二个终端启动 Vite 前端：

```bash
cd /path/to/skills-manager/web
npm run dev:client
```

打开：

```text
http://127.0.0.1:1420
```

Vite 会把 `/api` 代理到 `http://127.0.0.1:17321` 的 API 服务。开发时需要两个终端都保持运行；如果 API 服务停止，页面可以打开，但数据加载和写操作会失败。

## 构建后启动 Web 页面

构建服务端和前端：

```bash
cd /path/to/skills-manager/web
npm run build
```

启动构建后的服务端：

```bash
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run start --workspace server
```

打开：

```text
http://127.0.0.1:17321
```

前端构建完成后，服务端会直接托管 `client/dist`。

## 环境变量

| 变量 | 是否必须 | 说明 |
| --- | --- | --- |
| `SKILLS_MANAGER_CLI` | 推荐设置 | CLI 可执行文件路径。默认使用 `PATH` 里的 `skills-manager-cli`。 |
| `SKILLS_MANAGER_WEB_HOST` | 否 | 服务监听地址，默认 `127.0.0.1`。 |
| `SKILLS_MANAGER_WEB_PORT` | 否 | 服务端口，默认 `17321`。 |
| `SKILLS_MANAGER_WEB_TOKEN` | 条件必须 | 当 `SKILLS_MANAGER_WEB_HOST=0.0.0.0` 时必须设置。 |
| `SKILLS_MANAGER_SKILLS_ROOT` | 否 | 可选，会传给 CLI：`--skills-root <path>`。 |
| `SKILLS_MANAGER_WEB_DATA_DIR` | 否 | 保存 `audit.jsonl` 和 `commands.jsonl`，默认 `~/.local/share/skills-manager-web`。 |

普通本机浏览器使用时，建议保持监听 `127.0.0.1`。如果监听 `0.0.0.0`，后端会要求 `SKILLS_MANAGER_WEB_TOKEN`。当前浏览器前端还没有 token 输入界面，因此远程暴露时需要用带认证的反向代理，或者用其他方式给 `/api` 请求加上 `Authorization: Bearer <token>`。

## 页面和路由

核心 Skills Manager 页面：

- `/` - 桌面版风格的 Dashboard。
- `/install` - Marketplace 和技能安装。
- `/my-skills` - 已安装技能。
- `/global-workspace` - 全局 Agent Workspace 总览。
- `/global-workspace/:agentKey` - 单个 Agent Workspace。
- `/project/:id` - Project Workspace 详情。
- `/settings` - 桌面版风格设置页。

Web 控制台页面：

- `/web` - 仓库路径、数量、当前 preset、最近任务。
- `/web/skills` - 技能列表、搜索、安装、更新、检查、导出、标签、adopt 和删除。
- `/web/presets` - preset 列表、预览、应用、停用、添加/移除技能和同步。
- `/web/tools` - 只读工具状态。
- `/web/git` - status、init、clone、remote、pull、push、commit、versions 和 restore。
- `/web/operations` - 任务队列、命令参数、stdout/stderr、错误和耗时。
- `/web/settings` - 主题、语言和 central repository path 控制。

高风险写操作需要前端确认，并且后端请求必须带 `confirm: true`。删除技能前必须先执行 `remove-dry-run`，否则删除接口不会接受。

## 测试

```bash
npm run lint
npm run test
```

`npm run test` 会运行服务端单元/API 测试，并构建前端生产包。

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

## 同步上游 UI

复制过来的上游 React/Tailwind/i18n 资源位于 `client/src` 和 `client/public`。如果要从父级上游工程刷新：

```bash
scripts/sync-upstream-ui.sh ..
npm run build --workspace client
```

同步后仍然要保留 `client/src/lib/tauri.ts`、`client/src/lib/browser-shims.ts` 和 `client/src/web/` 作为 Web Companion 自己的代码。
