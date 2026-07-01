---
name: read-across
description: Multi-model cross-review — spawn two reviewer sub-agents (Kimi K2.7 + GLM-5.2) in parallel, collect structured JSON findings, then the parent agent arbitrates. Use when the user wants 交叉审核, cross-review, multi-model review, 多模型审查, second opinion, or adversarial review of any artifact (PRD, code, architecture, config, document).
---

# Read-Across — 双模型交叉审核

## Reviewer Panel

| Reviewer | Agent Type | Model |
|---|---|---|
| Kimi | `across` | `CloseAI/kimi-k2.7-code` |
| GLM | `across` | `CloseAI/glm-5.2` |

Both use the global `across` custom agent (`~/.pi/agent/agents/across.md`) — adversarial, structured JSON output.

## Review Focus (按 artifact 类型)

先按类型选审查轴，再注入 prompt：

- **PRD / 方案**: 一致性、完整性、可行性、风险、干系人覆盖
- **代码**: bug、安全、性能、可读性、边界情况、测试覆盖
- **架构**: 耦合度、可扩展性、数据流、失败模式、迁移路径
- **事实核查**: 幻觉、来源准确性、逻辑一致性、缺失上下文

## Workflow

### 0. 准备 artifact

- **代码**: 附文件路径 + 行号区间（如 `src/auth.ts:120-180`），让 reviewer 能 `read` 实际文件、看调用方。不要只贴死代码块。
- **大 artifact**（>800 行或 >30KB）: 摘要 + 关键章节，或分章节并发审查再合并。避免 context 截断降质。
- **纯文档/PRD**: 整份 inline 可接受。

### 1. Spawn both reviewers in parallel

用统一 prompt 模板，注入：审查轴、语言（中文）、评分锚定、对抗指令。

```
Axis = 按 artifact 类型选上面的 Review Focus

prompt = f"""审查以下 artifact，输出中文，严格按 JSON schema。

## 审查轴
{Axis}

## 评分锚定
1-3: 有 blocker，不可发布
4-6: 多处 warning，需修订
7-8: 少量 warning/nit，基本可用
9-10: 仅 nit 或无问题

## 对抗提示
另一独立 reviewer 也在审同一 artifact。请主动寻找对方可能遗漏的角度，尤其边界情况与隐性假设。

## Artifact
[artifact 或路径+行号区间]
"""
```

Spawn：

```
Agent({
  subagent_type: "across",
  description: "Cross-review — Kimi",
  prompt: prompt,
  model: "CloseAI/kimi-k2.7-code",
  run_in_background: true,
})

Agent({
  subagent_type: "across",
  description: "Cross-review — GLM",
  prompt: prompt,
  model: "CloseAI/glm-5.2",
  run_in_background: true,
})
```

### 2. Collect results

逐个 `wait: true` 拉取，避免读到未完成结果：

```
get_subagent_result("<kimi-agent-id>", wait: true)
get_subagent_result("<glm-agent-id>", wait: true)
```

**模型不可用 fallback**: 连接失败/超时 → 标注单模型结果，最终评分用该单模型分，不强行平均，不伪造缺失方。输出注明 `⚠️ 仅单模型（Kimi/GLM）完成`。

每个 reviewer 返回结构化 JSON：

```json
{
  "summary": "一句话总体评估",
  "score": 1-10,
  "strengths": ["point 1", "point 2"],
  "issues": [
    {
      "severity": "blocker|warning|nit",
      "location": "section/line reference",
      "finding": "what is wrong",
      "rationale": "why it matters",
      "suggestion": "concrete fix"
    }
  ],
  "missing_perspectives": ["angle not covered"],
  "model_perspective": "what this model uniquely caught"
}
```

**JSON 解析失败兜底**:
1. 从 markdown ```json code block 提取
2. 仍失败 → 让该 reviewer 重试 1 次（"请只输出合法 JSON，无多余文本"）
3. 再失败 → 降级为 markdown 自由输出，parent 手动解析，结果标 `parse_failed`，该模型评分不计入最终分

### 3. Parent agent arbitrates

Synthesize both reviews:

1. **Consensus** (both agree) → merged finding, highest priority
2. **Kimi-only** → flag with attribution, assess independently
3. **GLM-only** → flag with attribution, assess independently
4. **Conflicts** → call out, give your own verdict
5. **Final score** → 见下方评分规则，**不取算术平均**

### 评分规则（关键）

- **blocker 一票否决**: 任一 reviewer 报 blocker → 最终分不超过该模型分，且在输出顶部强制 escalate（`🚫 BLOCKER — 不可发布`）
- **无 blocker**: 最终分 = `min(Kimi, GLM)`，取保守值，不让高分稀释低分发现的问题
- **单模型完成**: 用该模型分，标注 `仅单模型`

### 4. 持久化与后续动作

- 仲裁结果落盘: `.scratch/reviews/<artifact>-<date>.md`（与 issue-tracker 工作流对齐）
- blocker/warning findings → 可批量生成 `.scratch/` issue 或打 triage label，审完即结案 = 流失

## Output 模板

```
## Cross-Review: [artifact name]

**Kimi K2.7: 8.5/10 · GLM-5.2: 6.0/10 → 最终 min 6.0/10**
[若 blocker: 🚫 BLOCKER — 不可发布]
[若单模型: ⚠️ 仅单模型（Kimi）完成]

### 🔴 共识问题 (both reviewers)
- [finding] → Fix: [merged suggestion]

### 🟡 Kimi 独到发现
- [finding] → Assessment: [your verdict]

### 🟢 GLM 独到发现
- [finding] → Assessment: [your verdict]

### ⚡ 分歧
- Kimi says X, GLM says Y → Arbiter: [your call]

### 📊 最终评估
[One-paragraph synthesis incorporating both reviews]

### ➡️ 后续动作
- [blocker/warning → .scratch issue 或 triage label]
- [落盘路径: .scratch/reviews/...]
```

## Pitfalls

- **算术平均掩盖 blocker** → 用 min + blocker 一票否决，不取 avg
- **空 prompt 各凭感觉打分** → 模板化注入轴/语言/rubric/对抗指令
- **两模型完全一致** → 可疑。对抗指令已前置（spawn 时注入）。事后仍一致则手动追问"请找对方遗漏点"
- **大 artifact 截断** → 分块或摘要
- **代码只贴死块** → 附路径+行号，reviewer 能 read 实际文件
- **审完即丢** → 落盘 + findings 转 issue
- **成本** → 两模型各跑一次，典型成本 < 单次调用的 2.5x
