import { TablePageSkeleton } from "@/core/components/layout/page-skeleton";

/** The widest table in the app; the skeleton shows the columns it opens with. */
export default function DatabaseLoading() {
  return <TablePageSkeleton columns={10} />;
}
