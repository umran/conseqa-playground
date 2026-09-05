/** Short hash of the vendored conseqa commit, injected by vite.config.ts. */
declare const __CONSEQA_REV__: string;

/**
 * The Mintlify assistant's browser API, installed by its embed script.
 * Only the surface src/app/assistant.ts uses is declared here.
 */
interface MintlifyAssistant {
  init(config: { id: string; appearance?: { theme?: "light" | "dark" | "system" } }): Promise<void>;
  update(config: { appearance?: { theme?: "light" | "dark" | "system" } }): Promise<void>;
}

interface Window {
  MintlifyAssistant?: MintlifyAssistant;
}
