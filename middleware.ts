import { type NextRequest } from "next/server";
import { logApiRequestMiddleware } from "@/lib/audit/middleware-log";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  if (request.nextUrl.pathname.startsWith("/api/")) {
    void logApiRequestMiddleware(request).catch(() => {});
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
