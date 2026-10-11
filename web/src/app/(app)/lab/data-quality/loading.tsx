import { TablePageSkeleton } from "@/components/layout/page-skeleton";

/** Barcode, lab code, Sample ID, stage, age and the missing columns. */
export default function DataQualityLoading() {
  return <TablePageSkeleton columns={6} />;
}
