import { redirect } from "next/navigation";

/** The module's own address opens its dashboard. */
export default function LabPage() {
  redirect("/lab/dashboard");
}
