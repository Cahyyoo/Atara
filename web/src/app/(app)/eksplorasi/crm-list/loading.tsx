import { PageHeadingSkeleton, TableCardSkeleton } from "@/core/components/layout/page-skeleton";

/** The heading, then the three tables in the page's order: Standart, Blank, Duplicate. */
export default function CrmListLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeadingSkeleton />
      <TableCardSkeleton rows={6} columns={17} />
      <TableCardSkeleton rows={1} columns={6} />
      <TableCardSkeleton rows={1} columns={5} />
    </div>
  );
}
