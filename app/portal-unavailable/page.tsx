import Link from "next/link";

/** Shown when Supabase env or portal bootstrap fails — never redirect to Admin. */
export default function PortalUnavailablePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800">Fast Technology Solutions</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Employee Portal unavailable</h1>
      <p className="mt-3 max-w-md text-sm text-slate-600">
        We could not start the Employee Portal (configuration or server error). This is not the Admin Portal — please
        do not sign in here if you are a field employee.
      </p>
      <p className="mt-2 text-sm font-medium text-slate-800">HTTP 503 — Service Unavailable</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/login"
          className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Try sign-in again
        </Link>
      </div>
    </div>
  );
}
