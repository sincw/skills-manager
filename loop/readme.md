# AFK Loop 使用说明

`loop/afk.sh` 用来批量执行已经拆好的本地 issue 队列。它适合在 `/to-prd` 和 `/to-issues` 之后使用，让 Codex 每轮选择一个明确、独立、适合无人值守的任务来实现并提交。

它不是需求澄清或任务拆分工具。需求还不清楚时，先走 `/grilling`、`/to-prd`、`/to-issues`。

## 前置条件

- 当前目录在 git 仓库内。
- 已安装 `codex` CLI，并且在 `PATH` 上可用。
- git 工作区必须是干净的。
- issue 文件放在 `.scratch/<feature>/issues/` 下。
- 可执行的 issue 状态为 `ready-for-agent`，或正文明确说明是 AFK 任务。
- 不要把 `needs-info`、`ready-for-human`、`wontfix`、`done`、HITL-only 或彼此强耦合的任务交给 loop。

## 基本用法

```bash
loop/afk.sh <iterations> <issues_path> [prompt_path]
```

示例：

```bash
loop/afk.sh 5 .scratch/task-manager/issues
```

使用自定义提示词：

```bash
loop/afk.sh 5 .scratch/task-manager/issues loop/prompt.md
```

参数说明：

- `<iterations>`：最多运行多少轮。
- `<issues_path>`：issue 目录，例如 `.scratch/<feature>/issues`。
- `[prompt_path]`：可选，默认是 `loop/prompt.md`。

## 每一轮会做什么

脚本每轮都会：

1. 检查 git 工作区是否干净。
2. 读取最近 5 个 commit，帮助 agent 避免重复工作。
3. 读取 issue 目录第一层的所有 `.md` 文件。
4. 将 issue、commit 历史和 prompt 一起传给 agent（`codex exec` 或 `pi -p`）。
5. 要求 agent 只选择并完成一个任务。
6. 期望本轮产生一个新的 git commit。

默认 prompt 会要求 agent：

- 只处理 AFK-ready issue。
- 不顺手完成相邻任务。
- 修改完成后运行相关测试、类型检查、lint 或 build。
- 完成任务后给 issue 添加完成记录，并移动到 `issues/done/`。
- 如果任务未完成，在原 issue 中追加说明。
- 每轮只创建一个 commit。

## 停止条件

loop 会在以下情况停止：

- 已达到 `<iterations>` 指定的最大轮数。
- agent 输出：

```xml
<promise>NO MORE TASKS</promise>
```

- 某一轮没有产生新的 commit。
- issue 目录或 prompt 文件不存在。
- 指定的 agent CLI 不可用。

## 推荐流程

```text
/grilling
→ /to-prd
→ /to-issues
→ 确认 issue 独立且标为 ready-for-agent
→ 确认 git 工作区干净
→ loop/afk.sh N .scratch/<feature>/issues
```

loop 适合执行已经准备好的队列，不适合替代前面的设计和拆分步骤。

## 运行前检查

```bash
git status --short
find .scratch/<feature>/issues -maxdepth 1 -type f -name '*.md' | sort
```

确认没有未提交修改，并且待执行 issue 都是明确、独立、可验证的。
