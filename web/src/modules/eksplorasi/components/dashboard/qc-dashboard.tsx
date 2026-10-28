"use client";

import type { QcControl, QcDuplicate } from "@/modules/eksplorasi/types";
import { ControlElementPicker, useControlElements } from "@/modules/eksplorasi/components/dashboard/control-element-picker";
import { QcControlSection } from "@/modules/eksplorasi/components/dashboard/qc-control-section";
import { QcDuplicateSection } from "@/modules/eksplorasi/components/dashboard/qc-duplicate-section";

/**
 * The eksplorasi dashboard: the control charts of one OREAS standard, then
 * the duplicates against their originals -- both for the elements ticked
 * under Elements, which sits above them and is remembered in this browser.
 */
export function QcDashboard({ initialControl, duplicates }: { initialControl: QcControl; duplicates: QcDuplicate }) {
  const [elements, setElements] = useControlElements();
  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end">
        <ControlElementPicker shown={elements} onChange={setElements} />
      </div>
      <QcControlSection initial={initialControl} elements={elements} />
      <QcDuplicateSection data={duplicates} elements={elements} />
    </div>
  );
}
