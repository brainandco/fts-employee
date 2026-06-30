import type { PmAssetBreakdownLine, PmAssignerSummary } from "@/lib/pm/pm-project-type-asset-stats";

export type PmBrandGroup = {
  brand: string;
  count: number;
  confirmedCount: number;
  pendingCount: number;
  byAssigner: PmAssignerSummary[];
  pendingAssignees: { employeeId: string; employeeName: string }[];
  categories: PmAssetBreakdownLine[];
};

function mergeAssignerLists(lists: PmAssignerSummary[][]): PmAssignerSummary[] {
  const map = new Map<string, PmAssignerSummary>();
  for (const list of lists) {
    for (const a of list) {
      const key = a.assignerUserId ?? a.assignerName;
      const row = map.get(key);
      if (!row) {
        map.set(key, { ...a });
      } else {
        row.count += a.count;
        row.confirmedCount += a.confirmedCount;
        row.pendingCount += a.pendingCount;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.assignerName.localeCompare(b.assignerName));
}

function mergePendingAssignees(
  lists: { employeeId: string; employeeName: string }[][]
): { employeeId: string; employeeName: string }[] {
  const map = new Map<string, string>();
  for (const list of lists) {
    for (const a of list) map.set(a.employeeId, a.employeeName);
  }
  return [...map.entries()]
    .map(([employeeId, employeeName]) => ({ employeeId, employeeName }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/** Group flat brand+category lines into brand cards with nested categories. */
export function groupLinesByBrand(lines: PmAssetBreakdownLine[]): PmBrandGroup[] {
  const map = new Map<string, PmBrandGroup>();

  for (const line of lines) {
    let group = map.get(line.brand);
    if (!group) {
      group = {
        brand: line.brand,
        count: 0,
        confirmedCount: 0,
        pendingCount: 0,
        byAssigner: [],
        pendingAssignees: [],
        categories: [],
      };
      map.set(line.brand, group);
    }
    group.count += line.count;
    group.confirmedCount += line.confirmedCount;
    group.pendingCount += line.pendingCount;
    group.categories.push(line);
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      categories: [...group.categories].sort(
        (a, b) => b.count - a.count || a.category.localeCompare(b.category)
      ),
      byAssigner: mergeAssignerLists(group.categories.map((c) => c.byAssigner)),
      pendingAssignees: mergePendingAssignees(group.categories.map((c) => c.pendingAssignees)),
    }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand));
}

export const BRAND_ACCENTS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  Samsung: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900", dot: "bg-sky-500" },
  Huawei: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-900", dot: "bg-rose-500" },
  Apple: { bg: "bg-zinc-100", border: "border-zinc-300", text: "text-zinc-900", dot: "bg-zinc-700" },
  iPhone: { bg: "bg-zinc-100", border: "border-zinc-300", text: "text-zinc-900", dot: "bg-zinc-700" },
  Sony: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-900", dot: "bg-indigo-500" },
  Lenovo: { bg: "bg-red-50", border: "border-red-200", text: "text-red-900", dot: "bg-red-500" },
  HP: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-900", dot: "bg-blue-600" },
  Dell: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-900", dot: "bg-slate-600" },
};

export function brandAccent(brand: string) {
  return (
    BRAND_ACCENTS[brand] ?? {
      bg: "bg-violet-50",
      border: "border-violet-200",
      text: "text-violet-900",
      dot: "bg-violet-500",
    }
  );
}

export function brandInitial(brand: string): string {
  return (brand.trim()[0] ?? "?").toUpperCase();
}
