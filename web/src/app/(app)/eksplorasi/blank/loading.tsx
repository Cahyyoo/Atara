import { TablePageSkeleton } from "@/core/components/layout/page-skeleton";

/** The list's heading, then its table: its columns, the elements and the buttons. */
export default function BlankLoading() {
  return <TablePageSkeleton columns={25} />;
}
