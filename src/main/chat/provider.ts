import { ClaudeProvider } from "../providers/claude.js";
import { MockProvider } from "../providers/mock.js";
import { strings as s } from "../../renderer/strings.js";
import type { ChatProvider } from "../providers/types.js";
export async function selectChatProvider(): Promise<{ provider: ChatProvider; model: string; label: string; warning?: string }> {
  const fallback = { provider: new MockProvider(), model: "mock", label: s.mock };
  if (process.env.J7_MOCK === "1") return fallback;
  const claude = new ClaudeProvider();
  try {
    if ((await claude.getStatus()).state === "ready") {
      const models = await claude.listModels();
      const model = models.find(m => /sonnet/i.test(m.id)) ?? models[0];
      if (model) return { provider: claude, model: model.id, label: s.claude };
    }
  } catch { /* Readiness failures use the explicit offline fallback. */ }
  await claude.dispose();
  return { ...fallback, warning: s.fallback };
}
