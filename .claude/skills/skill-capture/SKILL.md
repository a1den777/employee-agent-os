---
name: skill-capture
description: 将员工确认过的纠错沉淀为共享 Vault 中可复用、可审核的 Skill。
---

# Skill 沉淀

只有在员工确认某个纠正方法可以复用后，才能使用本 Skill。

## 操作步骤

1. 记录任务、原错误方法、确认后的修正方法和依据。
2. 创建 `vault/skills/<小写短名称>/SKILL.md`。
3. 在 frontmatter 中填写 `name`、`status: draft`、`owner` 和 `source_task`。
4. 写明触发条件、执行步骤、约束、失败情况和验收标准。
5. 告知员工：该 Skill 目前是草稿，需要人工审核。

## 禁止事项

- 不要自动把 Skill 升级为 `active`。
- 不要保存密钥、个人凭证或未经处理的敏感对话。
- 不要把一次性的个人偏好写成组织级规则。
