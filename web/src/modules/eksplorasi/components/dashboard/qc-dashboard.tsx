"use client";

import type { QcBlank, QcControl, QcDuplicate } from "@/modules/eksplorasi/types";
import { ControlElementPicker, useControlElements } from "@/modules/eksplorasi/components/dashboard/control-element-picker";
import { QcControlSection } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { QcBlankSection } from "@/modules/eksplorasi/components/dashboard/qc-blank-section";
import { QcDuplicateSection } from "@/modules/eksplorasi/components/dashboard/qc-duplicate-section";

/**
 * The eksplorasi dashboard: the control charts of one OREAS standard, the
 * blanks against their limit, then the duplicates against their originals --
 * all for the elements ticked under Elements, which sits above them and is
 * remembered in this browser.
 */
export function QcDashboard({
  initialControl,
  initialBlank,
  duplicates,
}: {
  initialControl: QcControl;
  initialBlank: QcBlank;
  duplicates: QcDuplicate;
}) {
  const [elements, setElements] = useControlElements();
  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <ControlElementPicker shown={elements} onChange={setElements} />
      </div>
      <QcControlSection initial={initialControl} elements={elements} />
      <QcBlankSection initial={initialBlank} elements={elements} />
      <QcDuplicateSection initial={duplicates} elements={elements} />
    </div>
  );
}
