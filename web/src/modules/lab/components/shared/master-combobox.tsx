"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@base-ui/react/combobox";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { cn } from "@/core/lib/utils";
import { createMasterOption } from "@/modules/lab/hooks/use-master-options";
import type { MasterKind, MasterOptionDTO } from "@/modules/lab/types";
import { IoAdd, IoCheckmark, IoChevronDown, IoCreateOutline, IoReloadOutline, IoSearchOutline } from "react-icons/io5";

/** The two entries offered under the matches, Odoo style. */
const CREATE = "__create__";
const CREATE_EDIT = "__create_edit__";

/** The same rule the server holds a code to: see validation/master.ts. */
const CODE_PATTERN = /^[A-Za-z0-9-]{1,16}$/;

/**
 * A master-data picker that can be searched, and -- for whoever may add codes
 * -- grows the list from where the code is needed: type a code that is not
 * there and pick "Create", or "Create and edit…" to give it a label first.
 * The new code goes into the master data and is picked straight away.
 *
 * Looks and behaves like the Select it replaces, so a form keeps its rhythm:
 * the trigger is the field, and the search sits at the top of the list.
 */
export function MasterCombobox({
  id,
  kind,
  value,
  items,
  options,
  onValueChange,
  canCreate = false,
  className,
}: {
  id?: string;
  kind: MasterKind;
  value: string;
  /** What each choice reads as, empty and mixed included, in order. */
  items: Record<string, string>;
  /** Every option, to know which codes already exist. */
  options: readonly MasterOptionDTO[];
  onValueChange: (value: string) => void;
  canCreate?: boolean;
  className?: string;
}) {
  const t = useTranslations("masterCombobox");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The code "Create and edit…" opened its dialog on, or null. */
  const [editing, setEditing] = useState<string | null>(null);

  const typed = query.trim().toUpperCase();
  const exists = useMemo(
    () => options.some((option) => option.kind === kind && option.code === typed),
    [options, kind, typed],
  );
  const valid = CODE_PATTERN.test(typed);
  const offerCreate = canCreate && typed !== "" && !exists;

  const values = useMemo(() => {
    const keys = Object.keys(items);
    return offerCreate && valid ? [...keys, CREATE, CREATE_EDIT] : keys;
  }, [items, offerCreate, valid]);

  async function create(code: string, label?: string) {
    setBusy(true);
    setError(null);
    const result = await createMasterOption(kind, code, label);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || t("createFailed"));
      return false;
    }
    onValueChange(result.option.id);
    return true;
  }

  function pick(next: string | null) {
    if (next === CREATE) {
      void create(typed);
    } else if (next === CREATE_EDIT) {
      setError(null);
      setEditing(typed);
    } else if (typeof next === "string") {
      setError(null);
      onValueChange(next);
    }
  }

  return (
    <>
      {/* Not modal: the dialog around it already is, and a modal picker locks
          the page scroll, which reflows the whole table behind on every open. */}
      <Combobox.Root<string>
        modal={false}
        items={values}
        value={value}
        onValueChange={pick}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setQuery("");
        }}
        inputValue={query}
        onInputValueChange={setQuery}
        itemToStringLabel={(item) => items[item] ?? ""}
        filter={(item, search) =>
          item === CREATE ||
          item === CREATE_EDIT ||
          (items[item] ?? "").toLowerCase().includes(search.trim().toLowerCase())
        }
        autoHighlight
      >
        <Combobox.Trigger
          id={id}
          disabled={busy}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-1.5 rounded-xl border border-transparent bg-field py-2 pr-2.5 pl-3 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className="line-clamp-1 flex-1 text-left">{items[value] ?? ""}</span>
          {busy ? (
            <IoReloadOutline aria-hidden className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <IoChevronDown aria-hidden className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
          )}
        </Combobox.Trigger>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="isolate z-50">
            <Combobox.Popup className="relative isolate z-50 flex max-h-[min(var(--available-height),22rem)] w-(--anchor-width) min-w-48 origin-(--transform-origin) flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-raised duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <div className="flex items-center gap-2 border-b px-3">
                <IoSearchOutline aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <Combobox.Input
                  aria-label={t("search")}
                  placeholder={t("search")}
                  className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <Combobox.Empty className="px-3 py-2 text-sm text-muted-foreground empty:hidden">
                {t("noResults")}
              </Combobox.Empty>
              <Combobox.List className="min-h-0 flex-1 overflow-y-auto p-1 empty:hidden">
                {(item: string) =>
                  item === CREATE || item === CREATE_EDIT ? (
                    <Combobox.Item
                      key={item}
                      value={item}
                      className="flex min-h-9 w-full cursor-default items-center gap-2 rounded-lg py-1.5 pr-2.5 pl-2.5 text-sm font-medium text-primary outline-hidden select-none data-highlighted:bg-accent"
                    >
                      {item === CREATE ? (
                        <>
                          <IoAdd aria-hidden className="size-4 shrink-0" />
                          {t("create", { code: typed })}
                        </>
                      ) : (
                        <>
                          <IoCreateOutline aria-hidden className="size-4 shrink-0" />
                          {t("createAndEdit")}
                        </>
                      )}
                    </Combobox.Item>
                  ) : (
                    <Combobox.Item
                      key={item}
                      value={item}
                      className="relative flex min-h-9 w-full cursor-default items-center rounded-lg py-1.5 pr-8 pl-2.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <span className="flex-1 whitespace-nowrap">{items[item]}</span>
                      <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                        <IoCheckmark />
                      </Combobox.ItemIndicator>
                    </Combobox.Item>
                  )
                }
              </Combobox.List>
              {offerCreate && !valid ? (
                <p className="border-t px-3 py-2 text-xs text-muted-foreground">{t("codeInvalid")}</p>
              ) : null}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {error && !editing ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {editing !== null ? (
        <CreateOptionDialog
          kind={kind}
          initialCode={editing}
          busy={busy}
          error={error}
          onCancel={() => setEditing(null)}
          onSubmit={async (code, label) => {
            if (await create(code, label)) setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

/** "Create and edit…": the code as typed, and a label to go with it. */
function CreateOptionDialog({
  kind,
  initialCode,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  kind: MasterKind;
  initialCode: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (code: string, label: string) => Promise<void>;
}) {
  const t = useTranslations("masterCombobox");
  const tMaster = useTranslations("masterData");
  const uid = useId();
  const [code, setCode] = useState(initialCode);
  const [label, setLabel] = useState("");
  const valid = CODE_PATTERN.test(code.trim());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) void onSubmit(code.trim(), label);
  }

  return (
    <Dialog open onOpenChange={(next) => (!next && !busy ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle", { kind: tMaster(`kind.${kind}`) })}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>
        <form id={`master-create-${uid}`} onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`master-create-code-${uid}`}>{t("code")}</Label>
            <Input
              id={`master-create-code-${uid}`}
              value={code}
              maxLength={16}
              aria-invalid={!valid}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`master-create-label-${uid}`}>{t("label")}</Label>
            <Input
              id={`master-create-label-${uid}`}
              value={label}
              maxLength={191}
              autoFocus
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button type="submit" form={`master-create-${uid}`} className="gap-2" disabled={busy || !valid}>
            {busy ? <IoReloadOutline className="size-4 animate-spin" /> : <IoAdd className="size-4" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
