"use client";

import { useState } from "react";
import { ChangePasswordDialog } from "@/core/components/layout/change-password-dialog";
import { QuickRowBody, quickRowClass } from "@/core/components/launcher/quick-row";
import { IoKeyOutline } from "react-icons/io5";

/** "Change password" on the launcher: the same dialog the account menu opens. */
export function ChangePasswordAction({ title, hint }: { title: string; hint: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={quickRowClass} onClick={() => setOpen(true)}>
        <QuickRowBody icon={IoKeyOutline} title={title} hint={hint} />
      </button>
      <ChangePasswordDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
