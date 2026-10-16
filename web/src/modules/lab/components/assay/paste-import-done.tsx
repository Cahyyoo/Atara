"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/core/components/ui/button";
import { IoCheckmarkCircle, IoDocumentAttachOutline } from "react-icons/io5";

/** What the import screen shows once a sheet has been saved. */
export function PasteImportDone({ count, onImportAnother }: { count: number; onImportAnother: () => void }) {
  const t = useTranslations("assay.paste");

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-background px-6 py-10 text-center">
      <IoCheckmarkCircle aria-hidden className="size-10 text-emerald-600" />
      <p className="text-lg font-medium">{t("doneTitle", { count })}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t("doneBody")}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button className="gap-2" onClick={onImportAnother}>
          <IoDocumentAttachOutline className="size-4" />
          {t("importAnother")}
        </Button>
        <Link href="/lab/database" className={buttonVariants({ variant: "outline" })}>
          {t("openDatabase")}
        </Link>
      </div>
    </div>
  );
}
