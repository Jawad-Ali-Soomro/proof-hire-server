export type MilestoneProgressItem = {
  index: number;
  title: string;
  description?: string;
  amount?: number;
  dueDate?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
};

export function parseJobMilestones(raw: unknown): Array<{
  title?: string;
  description?: string;
  amount?: number;
  dueDate?: string;
}> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m) => m && typeof m === 'object');
}

export function buildMilestoneProgress(
  jobMilestones: unknown,
  bidAmount: number,
): MilestoneProgressItem[] {
  const parsed = parseJobMilestones(jobMilestones);
  if (parsed.length) {
    return parsed.map((m, i) => ({
      index: i,
      title: String(m.title || '').trim() || `Milestone ${i + 1}`,
      description: String(m.description || '').trim() || undefined,
      amount:
        m.amount != null && Number.isFinite(Number(m.amount))
          ? Number(m.amount)
          : undefined,
      dueDate: String(m.dueDate || '').trim() || undefined,
      status: 'PENDING' as const,
    }));
  }
  return [
    {
      index: 0,
      title: 'Project delivery',
      description: undefined,
      amount: bidAmount,
      dueDate: undefined,
      status: 'PENDING',
    },
  ];
}

export function normalizeMilestoneProgress(raw: unknown): MilestoneProgressItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m, i) => {
      if (!m || typeof m !== 'object') return null;
      const row = m as Record<string, unknown>;
      const status = String(row.status || 'PENDING').toUpperCase();
      const normalizedStatus =
        status === 'COMPLETED'
          ? 'COMPLETED'
          : status === 'IN_PROGRESS'
            ? 'IN_PROGRESS'
            : 'PENDING';
      return {
        index: typeof row.index === 'number' ? row.index : i,
        title: String(row.title || `Milestone ${i + 1}`),
        description: row.description ? String(row.description) : undefined,
        amount:
          row.amount != null && Number.isFinite(Number(row.amount))
            ? Number(row.amount)
            : undefined,
        dueDate: row.dueDate ? String(row.dueDate) : undefined,
        status: normalizedStatus as MilestoneProgressItem['status'],
      };
    })
    .filter(Boolean) as MilestoneProgressItem[];
}

export function contractProgressFromMilestones(
  milestones: MilestoneProgressItem[],
): { completed: number; total: number; allDone: boolean } {
  const total = milestones.length;
  const completed = milestones.filter((m) => m.status === 'COMPLETED').length;
  return { completed, total, allDone: total > 0 && completed === total };
}
