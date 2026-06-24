# Skills Manager

[English](./README.md)

Skills Manager 用来维护 AI 编码 Agent 的中央技能库，并把选中的 Skills 同步到 Agent 或工作区的 Skills 目录。当前仓库支持两个产品表面：

- `skills-manager-cli`：面向用户、脚本和 Agent 的稳定 CLI 合约。
- `web/`：基于本地浏览器的 Web Companion，通过 CLI JSON 接口读写数据。

项目术语见 [CONTEXT.md](./CONTEXT.md)。为什么仓库聚焦到 CLI + Web Companion，见 [docs/adr/0001-focus-on-cli-and-web-companion.md](./docs/adr/0001-focus-on-cli-and-web-companion.md)。

## CLI 合约

CLI 二进制名保持为 `skills-manager-cli`。

稳定命令分组：

- `repo`
- `tools`
- `skills`
- `presets`
- `git`

稳定全局参数：

- `--json`
- `--skills-root <path>`

默认数据位置：

- `~/.skills-manager`

根目录 npm 脚本只作为兼容包装器保留：

```bash
npm run cli -- --help
npm run cli -- --json repo status
npm run cli:build
npm run cli:install
```

等价 Cargo 命令：

```bash
cargo build --manifest-path cli/Cargo.toml --bin skills-manager-cli
cargo install --path cli --bin skills-manager-cli --locked --force
```

## 快速开始

前置依赖：

- Rust 工具链和 `cargo`。
- 如果要使用 npm 包装脚本，需要 Node.js。
- 如果要使用 Git 技能源、备份、pull、push 或 Git URL 安装，需要 Git。

常用命令：

```bash
# 查看仓库 / 技能库状态
npm run cli -- repo status
npm run cli -- skills list
npm run cli -- skills show <ref>

# 安装 Skills
npm run cli -- skills install ./my-skill --local
npm run cli -- skills install https://github.com/owner/repo.git --git
npm run cli -- skills install owner/repo@skill --skillssh
npm run cli -- skills install owner/repo@skill --sync

# 检查和更新
npm run cli -- skills check --all
npm run cli -- skills update --all

# Presets
npm run cli -- presets list
npm run cli -- presets create Default
npm run cli -- presets add-skill Default <skill-ref>
npm run cli -- presets apply Default
npm run cli -- skills sync --dry-run

# Git 管理的 skills 仓库
npm run cli -- git status
npm run cli -- git pull
npm run cli -- git commit -m "chore: update skills"
```

机器可读输出：

```bash
npm run -s cli -- --json skills list
```

直接操作外部 skills checkout，并避免把 manager 状态写进该 checkout：

```bash
npm run -s cli -- --skills-root /path/to/skills --json repo status
```

外部 root 对应的状态会放在 `~/.skills-manager/external/<name>-<hash>/`。

## Web Companion

Web Companion 位于 [web/](./web/README.zh-CN.md)。它包含本地 Fastify 服务和 React 前端。服务端执行 `skills-manager-cli --json`，浏览器不会直接执行 CLI。

安装并启动：

```bash
npm run cli:install
cd web
npm install
npm run dev
```

另开一个终端：

```bash
cd web
npm run dev:client
```

打开 `http://127.0.0.1:1420`。

## 开发

Rust 检查：

```bash
cargo build --manifest-path cli/Cargo.toml --bin skills-manager-cli
cargo test --manifest-path cli/Cargo.toml
```

Web 检查：

```bash
cd web
npm run build --workspace client
npm run build --workspace server
npm run test --workspace server
```

## 仓库结构

```text
cli/          Rust core library 和 skills-manager-cli 二进制
web/          Web Companion 服务端和前端
CONTEXT.md    项目术语表
docs/adr/     架构决策记录
scripts/      兼容包装脚本
```

## License

MIT
