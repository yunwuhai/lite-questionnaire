/**
 * Questionnaire 会话持久化
 *
 * 支持暂存/恢复问卷状态，跨 TUI 会话保持答案。
 * 通过 pi.appendEntry() 将状态写入会话文件。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Core, QuestionnaireSnapshot } from "./core";

/** 会话条目标记 */
const SNAPSHOT_CUSTOM_TYPE = "questionnaire_snapshot";

/**
 * 保存当前问卷状态到会话文件。
 */
export function saveSnapshot(pi: ExtensionAPI, core: Core, key?: string): void {
  const snapshot = { ...core.serialize(), key };
  pi.appendEntry(SNAPSHOT_CUSTOM_TYPE, snapshot);
}

/**
 * 从会话文件恢复问卷状态。
 * 返回恢复后的快照，如果没有保存的状态则返回 null。
 */
export function loadSnapshot(
  entries: Array<{ type: string; customType?: string; data?: unknown }>,
  key?: string,
): QuestionnaireSnapshot | null {
  // 从后往前查找最近的、属于当前问卷结构的快照
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "custom" || entry.customType !== SNAPSHOT_CUSTOM_TYPE || !entry.data) continue;
    const snapshot = entry.data as QuestionnaireSnapshot;
    if (key && snapshot.key !== key) continue;
    return snapshot;
  }
  return null;
}
