import type { ReceiptConfirmationDisplay } from "@/lib/receipt-confirmations/load-receipt-confirmations";

export function ReceiptConfirmationsTable({ rows }: { rows: ReceiptConfirmationDisplay[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-700">
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Resource</th>
            <th className="px-4 py-3 font-medium">Receipt photos</th>
            <th className="px-4 py-3 font-medium">Employee</th>
            <th className="px-4 py-3 font-medium">Assigned</th>
            <th className="px-4 py-3 font-medium">Confirmed</th>
            <th className="px-4 py-3 font-medium">Note</th>
            <th className="px-4 py-3 font-medium">Assigned by</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-zinc-500">
                No receipt records yet. Assignments will appear here after employees confirm (or while still pending).
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-3">
                  <span
                    className={
                      r.status === "confirmed"
                        ? "rounded bg-emerald-100 px-2 py-0.5 text-emerald-900"
                        : "rounded bg-amber-100 px-2 py-0.5 text-amber-900"
                    }
                  >
                    {r.status === "confirmed" ? "Confirmed" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-700">{r.typeLabel}</td>
                <td className="px-4 py-3 font-medium text-zinc-900">{r.resourceLabel}</td>
                <td className="px-4 py-3 align-top">
                  {r.resourceType === "asset" ? (
                    r.receiptPhotoUrls.length === 0 ? (
                      <span className="text-zinc-400">{r.status === "confirmed" ? "—" : "After confirm"}</span>
                    ) : (
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {r.receiptPhotoUrls.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block h-14 w-14 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-50 hover:opacity-90"
                            title="Open full size"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-800">{r.employeeName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                  {r.assignedAt ? new Date(r.assignedAt).toLocaleString() : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                  {r.confirmedAt ? new Date(r.confirmedAt).toLocaleString() : "—"}
                </td>
                <td className="max-w-[200px] truncate px-4 py-3 text-zinc-600" title={r.confirmationMessage ?? ""}>
                  {r.confirmationMessage ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-600">{r.assignerName}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
