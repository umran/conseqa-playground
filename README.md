# conseqa playground

A browser demonstration of [conseqa](https://github.com/umran/conseqa):
a catalog of worked example models, a live YAML editor, and the model
checker's verdicts overlaid on the interactive visualization — with no
server involved. Parsing, validation, verification, and the graph and
transaction-proof extraction all run in WebAssembly compiled from the
conseqa source; the build
output is a static directory that any file host can serve. The DSL's
semantics are documented at
[docs.conseqa.umran.ca](https://docs.conseqa.umran.ca), which the
playground links to rather than carrying a copy of its own.

```
npm install
npm run dev            # compiles the WebAssembly, then serves on :5173
npm run build          # optimized wasm + typecheck + static site → dist/
npm run test:wasm      # the WebAssembly crate's tests, run natively
```

`dev` rebuilds the WebAssembly first, so a change to `wasm/src/lib.rs`
takes effect on restart. `build` additionally runs `wasm-opt`, which
takes roughly twelve seconds and is the reason it is not in the dev
loop.

`vendor/conseqa` is a git submodule pinned to the commit the site is
built against, on conseqa's `master`. Clone with
`--recurse-submodules`, or run `git submodule update --init` in an
existing checkout; `git submodule update --remote` moves it forward.

## What it does

Every keystroke, debounced, runs the same pipeline the `conseqa` and
`conseqa-viz` CLIs run:

| pass | what it does | what the page shows |
| --- | --- | --- |
| parse | `conseqa::parser::yaml` deserializes the source | the error's line and column, marked in the editor |
| validate | `conseqa::analyzer::validate` checks ids and references | structural errors, each clickable to its declaration |
| verify | `conseqa::analyzer::verification` runs the model checker | the obligation report: proven, unknown, disproven |
| extract | `conseqa::viz` derives the graph and the transaction proofs | the system graph, the navigator's entity pages, the proof drawings |

Verification is attempted only over a valid model, exactly as the CLI
does — verdicts are meaningful only over a structurally coherent model.
Unknown is epistemic: the checker could not establish the property,
typically because a required fact is `unspecified` or no V1 verifier
attempts that family. It is never evidence of a violation.

The parser takes the DSL's shorthand as readily as its canonical form —
`order_id: uuid` for a field, `customer.id` for a path,
`input:input.create_order.request` for a value source, a bare schema id
for an error class's contract — which is how the catalogue's models are
written.
Shorthand exists on input only: serialization emits the canonical form,
so the editor's format button expands it. Which declarations may be
compressed, and why the rest may not, is the semantics document's
*Canonical form and shorthand* section.

The visualization is not a reimplementation. It is the conseqa-viz
React application, imported from `vendor/conseqa/viz/src` and handed
the page data the WebAssembly build produces, in place of the
`window.CONSEQA` blob the CLI injects into the HTML it writes. It is
mounted once and fed new data as the model changes, so the open route,
the selection, and the canvas's pan and zoom survive every keystroke.

The colour mode is this application's to own: the header holds the only
control for it, and the views take the mode as a prop and render none.
The views also size their own top bar by container queries, so it fits
the pane the split gives it rather than the window it cannot see.

Side by side, the definition is Kumo's `Sidebar` and the visualization
is the `<main>` beside it — the panel you open to work on the model
against the thing the page is for. Its resize handle sizes the panel by
drag, collapses it when dragged past the minimum and restores it on the
way back, and the header's toggle hides it outright; the width and the
open state are both remembered. Below 900px the two become tabs
instead, and the editor stays mounted behind the visualization either
way, so its undo history and scroll position survive both.

## Layout

```
wasm/                  Rust: one `analyze` entry point over the conseqa crate
  src/lib.rs           parse → validate → verify → report → graph, as JSON
src/analysis/          the worker hosting the module, and the client driving it
src/editor/            CodeMirror 6: YAML, Kumo-token theme, analyzer diagnostics
src/catalog/           the demo models, imported from the vendored fixtures
src/viz/               mounts the vendored conseqa-viz front end
src/app/               the shell: header, panes, diagnostics, catalog
vendor/conseqa/        submodule: the conseqa source
```

The WebAssembly module exposes two functions. `analyze(source, title,
verify)` returns the page data plus the diagnostics the CLIs print to
stderr; `canonicalize(source)` returns the model as conseqa serializes
it — canonical throughout, so shorthand comes back expanded — behind
the editor's format button. The graph and transaction-proof extractors
come from `conseqa::viz`, the same library module the CLI renders
with, so what the browser draws is what the CLI draws. The crate is
built with conseqa's default `confluence` feature off: that feature is
the agent-workspace server stack, which neither compiles to wasm32 nor
belongs in a browser, and the lean build is exactly the parser,
analyzer, spec, and viz modules.

Analysis runs in a Web Worker. Requests are latest-wins: a burst of
keystrokes costs at most one extra run, and a worker lost to a panic is
replaced transparently.

## Publishing

`npm run build` writes a self-contained `dist/`. The site is served from
the root of its own domain, so no base path is needed:

```
npm run build
npx wrangler pages deploy dist --project-name=conseqa-playground
```

`.github/workflows/deploy.yml` does that on every push: it builds with
the Rust and Node toolchains, runs the WebAssembly crate's tests, and
uploads `dist/` to Cloudflare Pages. Pushes to `main` publish; every
other branch and pull request gets its own preview URL.

The build runs in Actions rather than in Cloudflare's build image, so
the toolchain this project needs — Rust, the `wasm32` target,
`wasm-pack` — is one this repository controls. Cloudflare only receives
the finished directory.

### One-time setup

1. Create the project, once, from a machine with `wrangler login` done:

   ```
   npx wrangler pages project create conseqa-playground --production-branch=main
   ```

2. Add two repository secrets, from **Settings → Secrets and variables →
   Actions**: `CLOUDFLARE_API_TOKEN` (an API token with the *Cloudflare
   Pages: Edit* permission) and `CLOUDFLARE_ACCOUNT_ID`.

3. In the Pages project, under **Custom domains**, add
   `conseqa.umran.ca`. `umran.ca` is already on Cloudflare
   nameservers, so the `CNAME` record and the certificate are created
   for you.

`public/_headers` pins the content-hashed assets to a year-long
immutable cache and holds `index.html` to revalidation — a build
changes the asset names, which is what lets a deploy take effect
despite the lifetime.

### What the host has to do

Very little, which is why this is free to run. Serve files, with
`application/wasm` on the `.wasm` asset — every static host in common
use already does. Nothing here uses WebAssembly threads, so no
`Cross-Origin-Opener-Policy` or `Cross-Origin-Embedder-Policy` headers
are needed. There are no server-side routes to rewrite either: the app
lives at `/`, and both the open model and the visualization's route are
carried in the query string and the fragment.

Unlike the single file `conseqa-viz` writes, this site does need to be
*served*: a Web Worker and a streamed WebAssembly module cannot load
from a `file://` URL. `npm run preview` serves the built `dist/`
locally.

## Tests

`npm run test:wasm` runs the WebAssembly crate's tests natively:
end-to-end analysis of the worked examples, parse-error locations, the
DSL-version refusal, and the refusal to verify an invalid model.
