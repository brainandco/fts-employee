"use client";

import Image from "next/image";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

function IconBriefcase() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function IconDevice() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = (fd.get("email") as string)?.trim();
    const password = fd.get("password") as string;
    if (!email || !password) {
      setSubmitError("Email and password required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        body: fd,
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.href = "/api/auth/callback?next=" + encodeURIComponent("/dashboard");
        return;
      }
      setSubmitError(data?.error || (res.ok ? "Something went wrong" : `Login failed (${res.status})`));
      setLoading(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white lg:flex-row">
      <aside className="relative order-2 flex min-h-[260px] flex-1 flex-col justify-center overflow-hidden border-t border-indigo-100 bg-indigo-50 px-8 py-10 sm:min-h-[300px] lg:order-1 lg:min-h-screen lg:w-[48%] lg:max-w-none lg:border-r lg:border-t-0 lg:px-12 xl:px-16">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="fts-login-blob absolute -right-10 top-6 h-52 w-52 rounded-full bg-indigo-200/80" />
          <div className="fts-login-blob fts-login-blob--2 absolute bottom-12 -left-8 h-44 w-44 rounded-full bg-violet-200/70" />
          <div className="fts-login-blob fts-login-blob--3 absolute left-[35%] top-[38%] h-28 w-28 rounded-full bg-sky-200/60" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-md space-y-6 fts-login-stagger lg:max-w-lg">
          <div className="relative h-12 w-44 sm:h-14 sm:w-52">
            <Image
              src="/images/black.png"
              alt="Fast Technology Solutions"
              fill
              className="object-contain object-left"
              priority
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">Field teams</p>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 xl:text-4xl">Your work hub</h2>
          <p className="text-base leading-relaxed text-slate-600">
            Access dashboards, assets, tasks, and leave in one place—aligned with how your PM and QC roles collaborate.
          </p>
          <ul className="space-y-4 pt-2">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-200/90 text-indigo-900 shadow-sm">
                <IconBriefcase />
              </span>
              <span className="text-sm leading-snug text-slate-700">
                <span className="font-semibold text-slate-800">Role-aware workspace</span>
                <span className="mt-0.5 block text-slate-600">PM and QC flows tailored to what you need today.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-200/90 text-indigo-900 shadow-sm">
                <IconDevice />
              </span>
              <span className="text-sm leading-snug text-slate-700">
                <span className="font-semibold text-slate-800">Assets & assignments</span>
                <span className="mt-0.5 block text-slate-600">Track gear and requests without leaving the portal.</span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-200/90 text-indigo-900 shadow-sm">
                <IconSpark />
              </span>
              <span className="text-sm leading-snug text-slate-700">
                <span className="font-semibold text-slate-800">Stay in sync</span>
                <span className="mt-0.5 block text-slate-600">Tasks and leave requests keep everyone on the same page.</span>
              </span>
            </li>
          </ul>
        </div>
      </aside>

      <div className="order-1 flex flex-1 flex-col justify-center bg-slate-50 px-4 py-10 sm:px-8 lg:order-2 lg:min-h-screen lg:flex-[1.05] lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-md fts-auth-card">
          <div className="fts-auth-panel border-slate-200/90 px-8 py-9 shadow-lg shadow-slate-200/50">
            <div className="mb-6 text-center lg:text-left">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Fast Technology Solutions</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Employee Portal</h1>
              <p className="mt-2 text-sm text-slate-600">Use the email and password from your administrator.</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="fts-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="fts-input w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                />
              </div>
              {(error || submitError) && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
                  {submitError ?? (error ? decodeURIComponent(error) : "")}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="fts-btn-primary w-full rounded-xl py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
