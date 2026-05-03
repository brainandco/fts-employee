"use client";

import { useState } from "react";
import { PpFieldFilesClient } from "@/components/pp/PpFieldFilesClient";
import { PpReportsClient } from "@/components/pp/PpReportsClient";

type Region = { id: string; name: string; code: string | null };
type Folder = {
  id: string;
  regionId: string;
  pathSegment: string;
  createdAt: string;
  regionName: string;
  regionCode: string | null;
};

export function PpWorkspaceClient({
  regions,
  initialFolders,
  ppReportsConfigured,
  reporterFullName,
}: {
  regions: Region[];
  initialFolders: Folder[];
  ppReportsConfigured: boolean;
  reporterFullName?: string | null;
}) {
  const [tab, setTab] = useState<"field" | "reports">("field");

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Files workspace</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Browse and manage field uploads in any region, then publish final reports to the configured reporting bucket.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("field")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === "field" ? "bg-indigo-700 text-white" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
          }`}
        >
          Field uploads (employees)
        </button>
        <button
          type="button"
          onClick={() => setTab("reports")}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            tab === "reports" ? "bg-indigo-700 text-white" : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
          }`}
        >
          Final reports (PP bucket)
        </button>
      </div>

      {tab === "field" ? (
        <PpFieldFilesClient regions={regions} initialFolders={initialFolders} />
      ) : (
        <PpReportsClient configured={ppReportsConfigured} reporterFullName={reporterFullName} />
      )}
    </div>
  );
}
