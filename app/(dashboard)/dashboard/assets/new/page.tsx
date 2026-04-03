import { redirect } from "next/navigation";

export default async function PmNewAssetPage() {
  redirect("/dashboard/assets/request");
}
