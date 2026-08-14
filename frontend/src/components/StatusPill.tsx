const TONE_BY_CATEGORY: Record<string, string> = {
  new: 'bg-slate-100 text-slate-600',
  indeterminate: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  done: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

export default function StatusPill({ status, category }: { status: string; category: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE_BY_CATEGORY[category] ?? TONE_BY_CATEGORY.new}`}
    >
      {status}
    </span>
  )
}
