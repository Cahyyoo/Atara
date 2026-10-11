import { redirect } from "next/navigation";

/** Analytics was folded into the dashboard; keep old links and bookmarks working. */
export default function AnalyticsPage() {
  redirect("/lab/dashboard");
}
