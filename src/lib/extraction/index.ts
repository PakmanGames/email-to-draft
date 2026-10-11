// Extraction (technical design 6): email text in, checked line items out.
export { extractLines, type ExtractLinesResult } from "./extract";
export { FAULT_MODES, FakeLlmClient, fakeReply, type FakeReply, type FaultMode } from "./fake";
export { GroqLlmClient } from "./groq";
export type { LlmClient, LlmResponse } from "./llm";
export { PROMPT_VERSION } from "./prompt";
