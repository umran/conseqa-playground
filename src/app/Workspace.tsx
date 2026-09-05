import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Sidebar } from "@cloudflare/kumo/components/sidebar";
import { Switch } from "@cloudflare/kumo/components/switch";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { Tooltip, TooltipProvider } from "@cloudflare/kumo/components/tooltip";
import { Banner } from "@cloudflare/kumo/components/banner";
import {
  ArrowCounterClockwiseIcon,
  BookOpenTextIcon,
  BooksIcon,
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  GithubLogoIcon,
  MoonIcon,
  SidebarSimpleIcon,
  SunIcon,
  TextAlignLeftIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { analysisClient } from "../analysis/client";
import { useAnalysis } from "../analysis/useAnalysis";
import { YamlEditor, type YamlEditorHandle } from "../editor/YamlEditor";
import { lintDiagnostics } from "../editor/lint";
import { offsetOf } from "../editor/locate";
import { VizPane } from "../viz/VizPane";
import { syncDocsAssistant } from "./assistant";
import { CatalogDialog } from "./CatalogDialog";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { PipelineStatus } from "./PipelineStatus";
import { SplitPane } from "./SplitPane";
import { readStoredBoolean, readStoredNumber, writeStored } from "./persist";
import { useDraft } from "./useDraft";
import { useMediaQuery } from "./useMediaQuery";
import { useTheme } from "./theme";

const REPO = "https://github.com/umran/conseqa";
// The semantics live on their own site now; the playground only points
// at them.
const DOCS = "https://docs.conseqa.umran.ca";

// The definition panel: wide enough for YAML at a readable size, never
// so wide that the visualization becomes a sliver.
const PANEL_MIN_WIDTH = 340;
const PANEL_MAX_WIDTH = 900;
const PANEL_DEFAULT_WIDTH = 560;
const PANEL_WIDTH_KEY = "conseqa-playground-panel-width";
const PANEL_OPEN_KEY = "conseqa-playground-panel-open";
// Shown until it is dismissed or the document is opened: the semantics
// are the thing a first-time reader most needs and would least expect to
// need, since the editor looks self-explanatory and the verdicts do not.
const DOCS_PROMPT_KEY = "conseqa-playground-docs-prompt-seen";

export function Workspace() {
  const draft = useDraft();
  const [verify, setVerify] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pane, setPane] = useState<"editor" | "viz">("editor");
  const [panelOpen, setPanelOpen] = useState(() => readStoredBoolean(PANEL_OPEN_KEY, true));
  const [docsPrompt, setDocsPrompt] = useState(() => !readStoredBoolean(DOCS_PROMPT_KEY, false));
  const [theme, setTheme] = useTheme();
  const editor = useRef<YamlEditorHandle>(null);

  const wide = useMediaQuery("(min-width: 900px)");
  const state = useAnalysis(draft.source, draft.entry.title, verify, { resetKey: draft.entry.id });
  const diagnostics = useMemo(() => lintDiagnostics(draft.source, state.analysis), [draft.source, state.analysis]);

  const locateId = useCallback((id: string) => editor.current?.revealId(id) ?? false, []);
  const locateLine = useCallback(
    (line: number, column: number) => {
      const offset = offsetOf(draft.source, line, column);
      editor.current?.reveal(offset, offset);
    },
    [draft.source],
  );

  useEffect(() => {
    writeStored(PANEL_OPEN_KEY, String(panelOpen));
  }, [panelOpen]);

  // The docs assistant floats over the workspace and follows the page's
  // colour mode; booted from an effect so it never gates first paint.
  useEffect(() => {
    syncDocsAssistant(theme);
  }, [theme]);

  const dismissDocsPrompt = useCallback(() => {
    setDocsPrompt(false);
    writeStored(DOCS_PROMPT_KEY, "true");
  }, []);

  const openDocs = useCallback(() => {
    dismissDocsPrompt();
    window.open(DOCS, "_blank", "noopener,noreferrer");
  }, [dismissDocsPrompt]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft.source);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the download stays available.
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([draft.source], { type: "text/yaml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draft.entry.id}.yaml`;
    document.body.append(link);
    link.click();
    // Firefox and Safari read the blob after the click returns; revoking
    // synchronously can cancel the download or write an empty file.
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 0);
  };

  const format = async () => {
    const canonical = await analysisClient().canonicalize(draft.source);
    if (canonical) draft.setSource(canonical);
  };

  const parses = state.analysis?.parse_error === null;

  const editorPane = (
    <SplitPane
      initial={0.66}
      min={0.25}
      max={0.9}
      storageKey="conseqa-playground-editor-split"
      label="Resize the diagnostics panel"
      top={
        <div className="flex h-full min-h-0 flex-col bg-kumo-base">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-kumo-hairline px-3 py-1.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-xs text-kumo-subtle">{draft.entry.path}</span>
              {draft.dirty && <Badge variant="beta">edited</Badge>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip
                content="Expand the shorthand: rewrite as conseqa serializes the model"
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="square"
                    icon={TextAlignLeftIcon}
                    aria-label="Format the model"
                    disabled={!parses}
                    onClick={format}
                  />
                }
              />
              <Tooltip
                content={copied ? "Copied" : "Copy the YAML"}
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="square"
                    icon={copied ? CheckIcon : CopyIcon}
                    aria-label="Copy the YAML"
                    onClick={copy}
                  />
                }
              />
              <Tooltip
                content="Download the YAML"
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="square"
                    icon={DownloadSimpleIcon}
                    aria-label="Download the YAML"
                    onClick={download}
                  />
                }
              />
              <Tooltip
                content="Restore the example as it ships"
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="square"
                    icon={ArrowCounterClockwiseIcon}
                    aria-label="Reset the model"
                    disabled={!draft.dirty}
                    onClick={draft.reset}
                  />
                }
              />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <YamlEditor ref={editor} value={draft.source} onChange={draft.setSource} diagnostics={diagnostics} />
          </div>
        </div>
      }
      bottom={
        <DiagnosticsPanel
          analysis={state.analysis}
          entry={draft.entry}
          onLocateId={locateId}
          onLocateLine={locateLine}
        />
      }
    />
  );

  const vizPane = (
    <VizPane
      page={state.page}
      booting={state.booting}
      working={state.working}
      bootError={state.bootError}
      theme={theme}
    />
  );

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 flex-col bg-kumo-canvas text-kumo-default">
        {/* One row at every width. The catalog button carries the open
            model's name and is the only element that shrinks, so the
            controls never wrap onto a second line. */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-kumo-hairline bg-kumo-base px-3 sm:gap-3 sm:px-4">
          {/* Over the panel it acts on, at the same edge of the window —
              a control for the left pane belongs on the left. Only where
              there are two panes side by side: the narrow layout
              switches between them with its own tabs. */}
          {wide && (
            <Tooltip
              content={panelOpen ? "Hide the definition" : "Show the definition"}
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  icon={SidebarSimpleIcon}
                  aria-label={panelOpen ? "Hide the definition" : "Show the definition"}
                  aria-expanded={panelOpen}
                  className={`-ml-1 shrink-0 ${panelOpen ? "" : "text-kumo-inactive"}`}
                  onClick={() => setPanelOpen((open) => !open)}
                />
              }
            />
          )}

          <div className="flex shrink-0 items-baseline gap-2">
            <span className="font-semibold tracking-tight text-kumo-strong">conseqa</span>
            <span className="hidden text-sm text-kumo-subtle sm:inline">playground</span>
          </div>

          <Tooltip
            content="Browse the model catalog"
            render={
              <Button
                variant="secondary"
                size="sm"
                icon={BooksIcon}
                className="min-w-0 shrink"
                onClick={() => setCatalogOpen(true)}
              >
                <span className="truncate">{draft.entry.title}</span>
              </Button>
            }
          />

          <Tooltip
            content="What every declaration means, and what the checker proves — the conseqa docs"
            render={
              <Button variant="ghost" size="sm" icon={BookOpenTextIcon} className="shrink-0" onClick={openDocs}>
                <span className="hidden md:inline">Docs</span>
              </Button>
            }
          />

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <Switch
              size="sm"
              label="Verify"
              labelTooltip="Run the model checker over the declared requirements and overlay its obligation report"
              checked={verify}
              onCheckedChange={setVerify}
            />
            {/* The only colour-mode control on the page: the embedded
                views take the mode as a prop and render none. */}
            <Tooltip
              content={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  shape="square"
                  icon={theme === "dark" ? SunIcon : MoonIcon}
                  aria-label="Toggle color mode"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                />
              }
            />
            <Tooltip
              content="conseqa on GitHub"
              render={
                <a
                  href={REPO}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label="conseqa on GitHub"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default"
                >
                  <GithubLogoIcon size={17} />
                </a>
              }
            />
          </div>
        </header>

        {docsPrompt && (
          <Banner
            size="sm"
            icon={<BookOpenTextIcon weight="fill" />}
            description="New to Conseqa? Read the docs."
            action={
              <>
                <Banner.Action onClick={openDocs}>Open</Banner.Action>
                <Banner.Action onClick={dismissDocsPrompt}>Dismiss</Banner.Action>
              </>
            }
            className="shrink-0 border-b border-kumo-hairline"
          />
        )}

        {wide ? (
          /* The definition is the panel you open to work on the model;
             the visualization is what the page is for. Kumo's Sidebar
             models exactly that: `contained` keeps it inside this
             bounded row, and `offcanvas` hides it outright when the
             header's toggle asks. */
          <Sidebar.Provider
            contained
            resizable
            side="left"
            collapsible="offcanvas"
            open={panelOpen}
            onOpenChange={setPanelOpen}
            defaultWidth={readStoredNumber(
              PANEL_WIDTH_KEY,
              PANEL_MIN_WIDTH,
              PANEL_MAX_WIDTH,
              PANEL_DEFAULT_WIDTH,
            )}
            minWidth={PANEL_MIN_WIDTH}
            maxWidth={PANEL_MAX_WIDTH}
            onWidthChange={(width) => writeStored(PANEL_WIDTH_KEY, String(width))}
            /* Never Kumo's mobile sidebar — a navigation sheet, which an
               editor is not. This layout is only mounted above `wide`,
               and below it the tabs take over; `1` makes that this
               app's decision rather than a coincidence of two
               breakpoints. */
            mobileBreakpoint={1}
            className="min-h-0 flex-1"
          >
            {/* The panel holds an editor, which lays out and scrolls
                itself, so its content goes straight in rather than
                through `Sidebar.Content`'s padded scroll area. The
                handle is ours: dragging sizes the panel and stops at its
                minimum, where Kumo's would collapse it. */}
            <Sidebar contentClassName="whitespace-normal">
              {editorPane}
              <PanelResizeHandle />
            </Sidebar>
            <main className="min-w-0 flex-1">{vizPane}</main>
          </Sidebar.Provider>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* A tab strip for the pane below it, sized to its labels
                rather than stretched across the window. */}
            <div className="flex shrink-0 border-b border-kumo-hairline bg-kumo-base px-3 py-1.5">
              <Tabs
                size="sm"
                className="w-fit"
                value={pane}
                onValueChange={(value) => setPane(value as "editor" | "viz")}
                tabs={[
                  { value: "editor", label: "Definition" },
                  { value: "viz", label: "Visualization" },
                ]}
              />
            </div>
            {/* The editor stays mounted behind the visualization so its
                undo history and scroll survive a look at the graph. The
                visualization is not: its canvas fits the scene once, on
                mount, and a hidden element has no measurable bounds. */}
            <div className="relative min-h-0 flex-1">
              <div className={pane === "editor" ? "h-full min-h-0" : "hidden"}>{editorPane}</div>
              {pane === "viz" && <div className="h-full min-h-0">{vizPane}</div>}
            </div>
          </div>
        )}

        <StatusBar state={state} verify={verify} />
      </div>

      <CatalogDialog
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        currentId={draft.entry.id}
        dirty={draft.dirty}
        onSelect={draft.open}
      />
    </TooltipProvider>
  );
}

function StatusBar({
  state,
  verify,
}: {
  state: ReturnType<typeof useAnalysis>;
  verify: boolean;
}) {
  return (
    // The page's footer, not the panel's: it spans the window, so it
    // survives collapsing the definition and has the width to hold its
    // two halves apart. Where the answer came from on the left, what
    // the answer was on the right. Both groups wrap internally, so a
    // narrow window folds the line rather than splitting it into a
    // column.
    <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-kumo-hairline bg-kumo-base px-3 py-1.5 sm:px-4">
      {/* What the run found, where reading starts. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PipelineStatus state={state} verify={verify} />
        {state.failure && <span className="text-xs text-kumo-danger">{state.failure}</span>}
        {/* Which conseqa built the module: useful, and the first thing
            to drop when the line is tight. */}
        <Tooltip
          content="The conseqa commit this WebAssembly module was built from"
          render={
            <span className="hidden cursor-default font-mono text-xs text-kumo-inactive sm:inline">
              conseqa@{__CONSEQA_REV__}
            </span>
          }
        />
      </div>

      {/* How long it took, tucked to the far end: the one number that is
          about the run rather than about the model. */}
      <div className="flex items-center gap-2 text-xs text-kumo-inactive sm:ml-auto">
        {state.working || state.booting ? (
          <Loader size="sm" />
        ) : (
          state.timing && (
            <Tooltip
              content="Time inside the WebAssembly module: parse, validate, verify, and extract the graph"
              render={<span className="cursor-default font-mono">{state.timing.wasmMs.toFixed(1)} ms</span>}
            />
          )
        )}
      </div>
    </footer>
  );
}
