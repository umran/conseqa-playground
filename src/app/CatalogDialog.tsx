import { Badge } from "@cloudflare/kumo/components/badge";
import { Button } from "@cloudflare/kumo/components/button";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { CheckIcon, XIcon } from "@phosphor-icons/react";

import { CATALOG, type CatalogEntry } from "../catalog";

const OUTCOME: Record<CatalogEntry["expect"], { label: string; variant: "success" | "warning" | "neutral" }> = {
  proven: { label: "every obligation proven", variant: "success" },
  unknown: { label: "some obligations unknown", variant: "warning" },
  blank: { label: "nothing declared yet", variant: "neutral" },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId: string;
  /** True when the loaded entry has unsaved edits. */
  dirty: boolean;
  onSelect: (entry: CatalogEntry) => void;
}

/** The demo catalog: conseqa's worked examples, with what each shows. */
export function CatalogDialog({ open, onOpenChange, currentId, dirty, onSelect }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="xl" className="max-h-[85vh] overflow-hidden p-0">
        <div className="flex items-start justify-between gap-4 border-b border-kumo-hairline px-6 py-4">
          <div>
            <Dialog.Title className="text-lg font-semibold text-kumo-strong">Model catalog</Dialog.Title>
            <Dialog.Description className="mt-0.5 text-sm text-kumo-subtle">
              Worked examples from the conseqa repository, and a blank model. Each one loads into the editor,
              where it can be changed freely.
            </Dialog.Description>
          </div>
          <Dialog.Close
            aria-label="Close"
            render={(props) => <Button {...props} variant="ghost" shape="square" icon={<XIcon />} aria-label="Close" />}
          />
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-4">
          <ul className="grid gap-3 sm:grid-cols-2">
            {CATALOG.map((entry) => {
              const current = entry.id === currentId;
              const outcome = OUTCOME[entry.expect];
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(entry);
                      onOpenChange(false);
                    }}
                    className={`flex h-full w-full cursor-pointer flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${
                      current
                        ? "border-kumo-brand bg-kumo-tint"
                        : "border-kumo-hairline bg-kumo-base hover:border-kumo-line hover:bg-kumo-tint"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-kumo-strong">{entry.title}</span>
                      {current && (
                        <Badge variant="primary" icon={<CheckIcon weight="bold" />}>
                          {dirty ? "open · edited" : "open"}
                        </Badge>
                      )}
                    </span>
                    <span className="text-sm text-kumo-subtle">{entry.blurb}</span>
                    <span className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      <Badge variant={outcome.variant}>{outcome.label}</Badge>
                      <span className="font-mono text-[11px] text-kumo-inactive">{entry.path}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {dirty && (
            <p className="mt-3 text-xs text-kumo-subtle">
              Your edits to the open model are kept in this browser and restored when you come back to it.
            </p>
          )}
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
