import { NextResponse } from "next/server";
import { getDataClient } from "@/lib/supabase/server";
import { getRequestAuth } from "@/lib/supabase/request-auth";

/** POST — register Expo push token for the signed-in user (Bearer). */
export async function POST(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const expoPushToken = typeof body.expo_push_token === "string" ? body.expo_push_token.trim() : "";
  const platform = typeof body.platform === "string" ? body.platform.trim() : null;
  const appVariant =
    body.app_variant === "admin" ? "admin" : body.app_variant === "employee" ? "employee" : "employee";

  if (!expoPushToken.startsWith("ExponentPushToken") && !expoPushToken.startsWith("ExpoPushToken")) {
    return NextResponse.json({ message: "Invalid Expo push token" }, { status: 400 });
  }

  const supabase = await getDataClient();
  const { error } = await supabase.from("push_device_tokens").upsert(
    {
      user_id: auth.user.id,
      expo_push_token: expoPushToken,
      platform,
      app_variant: appVariant,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,expo_push_token" }
  );

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** DELETE — remove push token on sign-out (Bearer). */
export async function DELETE(req: Request) {
  const auth = await getRequestAuth(req);
  if (!auth) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const expoPushToken = typeof body.expo_push_token === "string" ? body.expo_push_token.trim() : "";

  const supabase = await getDataClient();
  if (expoPushToken) {
    await supabase
      .from("push_device_tokens")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("expo_push_token", expoPushToken);
  } else {
    await supabase.from("push_device_tokens").delete().eq("user_id", auth.user.id);
  }

  return NextResponse.json({ ok: true });
}
