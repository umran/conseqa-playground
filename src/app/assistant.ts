// The Mintlify assistant: the "ask the docs" widget wired to the
// semantics site, floated over the workspace so a question about the
// DSL can be asked without leaving the model.
//
// The embed script is fetched lazily, from an effect — never as a
// render-blocking tag — so the playground's boot does not wait on the
// widget CDN, and a load that never finishes (an ad blocker, an
// offline session) leaves the page exactly as it was. The script
// installs `window.MintlifyAssistant` as a call-buffering stub before
// its runtime arrives, which is what makes init-then-update safe to
// issue from the very first render.

import type { Theme } from "./theme";

const WIDGET_ID = "mint_widget_fce49cdf-4362-4287-a8b3-c6aba914d704";
const EMBED_URL = "https://widget.mintlify.com/v1/embed.js";

let booted = false;

/**
 * Boots the widget on the first call and follows the colour mode on
 * every one after, so the assistant always matches the page around it
 * rather than guessing from the system preference.
 */
export function syncDocsAssistant(theme: Theme): void {
  if (!booted) {
    booted = true;
    import(/* @vite-ignore */ EMBED_URL)
      .then(() => window.MintlifyAssistant?.init({ id: WIDGET_ID, appearance: { theme } }))
      .catch(() => {
        // The assistant is a convenience; its absence is not the page's
        // problem, and nothing here should surface as a failure.
      });
    return;
  }
  window.MintlifyAssistant?.update({ appearance: { theme } }).catch(() => {});
}
