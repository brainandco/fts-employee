"use client";

import type { ReactNode } from "react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/50 backdrop-blur-[1px]"
        aria-label="Dismiss"
        onClick={onCancel}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <h2 id="confirm-modal-title" className="text-lg font-semibold text-zinc-900">
          {title}
        </h2>
        <div className="mt-3 text-sm leading-relaxed text-zinc-600">{children}</div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-zinc-900 hover:bg-zinc-800"
            }`}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type NoticeModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
};

export function NoticeModal({ open, title, children, onClose, closeLabel = "OK" }: NoticeModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-zinc-900/50 backdrop-blur-[1px]" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-modal-title"
      >
        <h2 id="notice-modal-title" className="text-lg font-semibold text-zinc-900">
          {title}
        </h2>
        <div className="mt-3 max-h-[min(60vh,24rem)] overflow-y-auto text-sm leading-relaxed text-zinc-600">{children}</div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
