export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_date: string | null;
  created_at: string;
  closed_at: string | null;
};

export function isOpenTaskStatus(status: string): boolean {
  return status !== "Completed" && status !== "Closed";
}

export function mapTaskRow(row: TaskRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    isOpen: isOpenTaskStatus(row.status),
  };
}
