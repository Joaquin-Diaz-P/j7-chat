import type { Message } from "../../shared/ipc.js";
import type { Attachment } from "../providers/types.js";
import { strings as s } from "../../renderer/strings.js";
export const RECAP_LIMIT = 100_000;
export function buildRecap(messages: readonly Message[], lastMessageId?: string, supportsImages = false): { text: string; attachments: Attachment[] } {
  const seen = lastMessageId ? messages.findIndex(m => m.id === lastMessageId) : -1;
  const unseen = messages.slice(seen + 1).filter(m => m.role !== "notice");
  if (!unseen.length) return { text: "", attachments: [] };
  const suffix = `\n${s.recapEnd}\n\n`;
  const prefix = `${s.recapStart}\n`;
  let remaining = RECAP_LIMIT - prefix.length - suffix.length;
  const rows: string[] = [];
  const attachments: Attachment[] = [];
  const recentIds = new Set(messages.filter(m => m.role !== "notice").slice(-4).map(m => m.id));
  for (const message of unseen) {
    let row = `${message.role === "user" ? s.recapUser : `${s.recapAssistant} (${message.modelLabel ?? message.model ?? s.assistant})`}: ${message.text}`;
    for (const file of message.attachments ?? []) {
      const label = `\n[${s.recapAttachment}: ${file.name}]`;
      row += label;
      if (file.kind === "image") {
        if (supportsImages && recentIds.has(message.id)) attachments.push(structuredClone(file));
      } else if (file.extractedText) row += `\n${file.extractedText}`;
    }
    rows.push(row);
  }
  // Drop extracted attachment text first, keeping names, roles and conversation intact.
  if (rows.join("\n").length > remaining) {
    rows.length = 0;
    for (const m of unseen) rows.push(`${m.role === "user" ? s.recapUser : `${s.recapAssistant} (${m.modelLabel ?? m.model ?? s.assistant})`}: ${m.text}${(m.attachments ?? []).map(a => `\n[${s.recapAttachment}: ${a.name}]`).join("")}`);
  }
  let body = rows.join("\n");
  if (body.length > remaining) {
    const marker = `${s.recapTruncated}\n`;
    remaining -= marker.length;
    body = marker + body.slice(-remaining);
  }
  return { text: prefix + body + suffix, attachments };
}
