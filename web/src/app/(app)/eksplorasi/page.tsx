import { redirect } from "next/navigation";

/** The module's own address opens its dashboard. */
export default function EksplorasiPage() {
  redirect("/eksplorasi/dashboard");
}
