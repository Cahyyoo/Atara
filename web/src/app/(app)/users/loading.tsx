import { TablePageSkeleton } from "@/components/layout/page-skeleton";

/** User (name and email), role, status, verification, created, actions. */
export default function UsersLoading() {
  return <TablePageSkeleton columns={6} />;
}
