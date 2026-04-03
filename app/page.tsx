import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const { data: employee } = await supabase
      .from("employees")
      .select("status")
      .eq("email", session.user.email ?? "")
      .maybeSingle();
    if (employee?.status === "ACTIVE") redirect("/dashboard");
  }
  redirect("/login");
}
