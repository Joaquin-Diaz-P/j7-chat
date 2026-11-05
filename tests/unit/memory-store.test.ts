import { MemoryChatStore } from "../../src/main/chat/memory-store.js";
import { chatStoreContract } from "./chat-store.contract.js";
chatStoreContract("memory", () => new MemoryChatStore());
