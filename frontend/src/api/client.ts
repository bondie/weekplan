import type { CalendarSource, IssueList, Me, Scope, SyncStatus, Week } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Požadavek selhal (${res.status})`)
  }

  return res.json() as Promise<T>
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  me: () => request<Me>('/me'),
  updateMe: (body: Partial<Pick<Me, 'dailyCapacityMinutes' | 'workingDays' | 'showWeekend' | 'jql'>>) =>
    request<Me>('/me', { method: 'PATCH', body: json(body) }),

  week: (from: string) => request<Week>(`/week?from=${from}`),

  issues: (scope: Scope, q: string, project: string) => {
    const params = new URLSearchParams({ scope })
    if (q) params.set('q', q)
    if (project) params.set('project', project)
    return request<IssueList>(`/issues?${params}`)
  },

  createAssignment: (body: { issueKey: string; date: string; plannedMinutes?: number }, week: string) =>
    request<{ week: Week }>(`/assignments?week=${week}`, { method: 'POST', body: json(body) }),

  updateAssignment: (
    id: string,
    body: { date?: string; plannedMinutes?: number; note?: string | null; done?: boolean },
    week: string,
  ) => request<{ week: Week }>(`/assignments/${id}?week=${week}`, { method: 'PATCH', body: json(body) }),

  splitAssignment: (id: string, body: { date: string; minutes: number }, week: string) =>
    request<{ week: Week }>(`/assignments/${id}/split?week=${week}`, { method: 'POST', body: json(body) }),

  reorderAssignments: (body: { date: string; ids: string[] }, week: string) =>
    request<{ week: Week }>(`/assignments/reorder?week=${week}`, { method: 'POST', body: json(body) }),

  deleteAssignment: (id: string, week: string) =>
    request<{ week: Week }>(`/assignments/${id}?week=${week}`, { method: 'DELETE' }),

  sources: () => request<CalendarSource[]>('/calendar/sources'),
  createSource: (body: { name: string; url: string }) =>
    request<{ source: CalendarSource }>('/calendar/sources', { method: 'POST', body: json(body) }),
  updateSource: (
    id: string,
    body: Partial<Pick<CalendarSource, 'name' | 'url' | 'enabled' | 'allDayPolicy' | 'countTentative'>>,
  ) => request<CalendarSource>(`/calendar/sources/${id}`, { method: 'PATCH', body: json(body) }),
  deleteSource: (id: string) => request<{ ok: boolean }>(`/calendar/sources/${id}`, { method: 'DELETE' }),

  createManualEvent: (body: { date: string; title: string; startTime?: string; minutes: number }, week: string) =>
    request<{ week: Week }>(`/calendar/events?week=${week}`, { method: 'POST', body: json(body) }),
  updateEvent: (id: string, body: { countsToCapacity?: boolean; minutes?: number; title?: string }) =>
    request<{ week: Week }>(`/calendar/events/${id}`, { method: 'PATCH', body: json(body) }),
  deleteEvent: (id: string) => request<{ week: Week }>(`/calendar/events/${id}`, { method: 'DELETE' }),

  setDayCapacity: (date: string, body: { capacityMinutes: number; note?: string | null }) =>
    request<{ week: Week }>(`/days/${date}/capacity`, { method: 'PUT', body: json(body) }),
  clearDayCapacity: (date: string) => request<{ week: Week }>(`/days/${date}/capacity`, { method: 'DELETE' }),

  syncStatus: () => request<SyncStatus>('/sync/status'),
  syncJira: (full = false) => request<unknown>(`/sync/jira${full ? '?full=1' : ''}`, { method: 'POST' }),
  syncCalendar: () => request<unknown>('/sync/calendar', { method: 'POST' }),
}
