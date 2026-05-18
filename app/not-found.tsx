import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800">Employee Portal</p>
      <h1 className="mt-3 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-3 max-w-md text-sm text-slate-600">The page you requested does not exist (404).</p>
      <Link href="/dashboard" className="mt-8 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
        Back to dashboard
      </Link>
    </div>
  );
}
