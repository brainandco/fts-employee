import { redirect } from "next/navigation";

export default function LegacyPmEhsAssignRedirect() {
  redirect("/dashboard/assets/assign?tab=ehs");
}
