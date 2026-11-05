// Claude's "default" catalog entry is an alias that is hidden from the selector; old chats and settings resolve it to Opus.
export const canonicalModelKey = (key: string) => key === "claude:default" ? "claude:opus" : key;
