"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import type { ApiResult } from "@/core/types";
import type { SampleListItemDTO } from "@/modules/lab/types";
import { IoAddCircleOutline, IoInformationCircleOutline, IoReloadOutline } from "react-icons/io5";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { withBasePath } from "@/core/lib/http/base-path";

interface GenerateFormProps {
  onGenerated: (samples: SampleListItemDTO[]) => void;
}

/** The same ceiling the request schema enforces, so the form never offers more. */
export const MAX_BARCODES = 500;

/** The quantity typed, as a whole number in range; null while it is not one. */
export function parseQuantity(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const quantity = Number(value);
  return quantity >= 1 && quantity <= MAX_BARCODES ? quantity : null;
}

/**
 * Barcodes first, identity later.
 *
 * The bags are labelled as they arrive, before anybody knows where each one
 * came from in detail; the Database role fills in the identity -- and with it
 * the Sample ID -- afterwards in the Sample Database, one record or many at a
 * time. So this asks for nothing but how many. The server already accepts an
 * empty identity and creates the barcode unidentified.
 */
export function GenerateForm({ onGenerated }: GenerateFormProps) {
  const t = useTranslations("samples.generate");
  const tCommon = useTranslations("common");
  const [quantityInput, setQuantityInput] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantity = parseQuantity(quantityInput);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (quantity === null) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(withBasePath("/api/samples/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // One empty identity per barcode: each is created without a Sample ID.
        body: JSON.stringify({ identities: Array.from({ length: quantity }, () => ({})) }),
      });
      const result: ApiResult<SampleListItemDTO[]> = await response.json();

      if (!result.success) {
        setError(result.error);
        return;
      }

      onGenerated(result.data);
      setQuantityInput("1");
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("formTitle")}</CardTitle>
        <CardDescription>{t("formDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div data-tour="generate-quantity" className="flex w-40 flex-col gap-1.5">
              <Label htmlFor="barcode-quantity">{t("quantity")}</Label>
              <Input
                id="barcode-quantity"
                inputMode="numeric"
                autoComplete="off"
                value={quantityInput}
                aria-invalid={quantity === null}
                aria-describedby="barcode-quantity-hint"
                onChange={(event) => setQuantityInput(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              data-tour="generate-submit"
              disabled={isSubmitting || quantity === null}
              className="gap-2 sm:w-56"
            >
              {isSubmitting ? (
                <IoReloadOutline className="size-4 animate-spin" />
              ) : (
                <IoAddCircleOutline className="size-4" />
              )}
              {t("submit", { count: quantity ?? 0 })}
            </Button>
          </div>
          <p
            id="barcode-quantity-hint"
            className={quantity === null ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
          >
            {t("quantityHint", { max: MAX_BARCODES })}
          </p>

          <div
            data-tour="generate-next"
            className="flex items-start gap-2.5 rounded-xl bg-muted/60 px-3.5 py-2.5 text-sm"
          >
            <IoInformationCircleOutline aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              {t("identityLater")}{" "}
              <Link href="/lab/database?ident=missing" className="font-medium text-primary hover:underline">
                {t("openDatabase")}
              </Link>
            </p>
          </div>

          <InlineNotice tone="error">{error}</InlineNotice>
        </form>
      </CardContent>
    </Card>
  );
}
