"use client";

import { useState } from "react";
import type { PmEmployeeFilesFolder } from "@/components/pm-files/PmEmployeeFilesClient";
import { PmEmployeeFilesClient } from "@/components/pm-files/PmEmployeeFilesClient";
import { PmPpReportsBucketClient } from "@/components/pm-files/PmPpReportsBucketClient";

export function PmFilesWorkspaceClient({
  initialFolders,
  ppConfigured,
}: {
  initialFolders: PmEmployeeFilesFolder[];
  ppConfigured: boolean;
}) {
  const [tab, setTab] = useState<"employee" | "pp">("employee");

  return (
    <div className="space-y-5 pb-10">
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">PM files workspace</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Browse and manage employee files in your regions, and work with the shared PP final reports bucket — same
          capabilities as admin for these areas, scoped to your PM assignment.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("employee")}
          className={
            tab === "employee"
              ? "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
              : "rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          }
        >
          Employee files
        </button>
        <button
          type="button"
          onClick={() => setTab("pp")}
          className={
            tab === "pp"
              ? "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
              : "rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          }
        >
          PP final reports
        </button>
      </div>

      {tab === "employee" ? <PmEmployeeFilesClient initialFolders={initialFolders} /> : null}
      {tab === "pp" ? <PmPpReportsBucketClient configured={ppConfigured} /> : null}
    </div>
  );
}
