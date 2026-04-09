"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function LeavePerformaUpload({ approvalId, pdfUrl }: { approvalId: string; pdfUrl: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!message.trim()) {
      setFeedback({ type: "err", text: "Please add a short note (e.g. that the performa is filled and signed)." });
      return;
    }
    if (!file) {
      setFeedback({ type: "err", text: "Please choose your signed PDF file." });
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("message", message.trim());
      fd.set("file", file);
      const res = await fetch(`/api/leave/${approvalId}/submit-performa`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({ type: "err", text: data.message ?? "Upload failed" });
        return;
      }
      setFeedback({ type: "ok", text: "Signed performa submitted. Final approval will be done by a super user." });
      setMessage("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-4">
      <p className="text-sm font-medium text-zinc-900">Signed performa</p>
      <p className="mt-1 text-xs text-zinc-600">
        Download the PDF, print it, complete the home country section and signatures, then upload the signed PDF here.
      </p>
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 underline hover:text-violet-900"
      >
        Download filled performa (PDF)
      </a>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label htmlFor={`performa-msg-${approvalId}`} className="mb-1 block text-xs font-medium text-zinc-700">
            Message
          </label>
          <input
            id={`performa-msg-${approvalId}`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Signed performa attached"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/30"
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-700">Signed PDF</span>
          <input
            ref={fileInputRef}
            id={`performa-file-${approvalId}`}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-4 py-2.5 text-sm font-medium text-violet-900 shadow-sm transition hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            >
              <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Choose PDF file
            </button>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-600" title={file?.name}>
              {file ? file.name : "No file chosen"}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">PDF only, up to 15MB.</p>
        </div>
        {feedback ? (
          <p className={`text-sm ${feedback.type === "ok" ? "text-emerald-700" : "text-red-600"}`}>{feedback.text}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-800 disabled:opacity-50"
        >
          {loading ? "Uploading…" : "Submit signed performa"}
        </button>
      </form>
    </div>
  );
}
