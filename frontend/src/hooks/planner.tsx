import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import type { Week } from '../api/types'
import { addDays, startOfWeek, todayKey } from '../lib/format'

interface PlannerValue {
  weekStart: string
  week: Week | undefined
  isLoading: boolean
  error: string | null
  goToWeek: (date: string) => void
  shiftWeek: (weeks: number) => void
  plan: (issueKey: string, date: string) => void
  move: (id: string, date: string) => void
  setMinutes: (id: string, minutes: number) => void
  toggleDone: (id: string, done: boolean) => void
  remove: (id: string) => void
  split: (id: string, date: string, minutes: number) => void
  reorder: (date: string, ids: string[]) => void
  setDayCapacity: (date: string, minutes: number | null) => void
  addManualEvent: (input: { date: string; title: string; startTime: string; minutes: number }) => void
  setEventCounts: (id: string, countsToCapacity: boolean) => void
  deleteEvent: (id: string) => void
  isMutating: boolean
}

const PlannerContext = createContext<PlannerValue | null>(null)

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayKey()))
  const queryClient = useQueryClient()

  const weekQuery = useQuery({ queryKey: ['week', weekStart], queryFn: () => api.week(weekStart) })

  // The server recomputes capacity on every mutation, so its week payload always wins.
  const onSuccess = useCallback(
    (result: { week: Week }) => {
      queryClient.setQueryData(['week', result.week.weekStart], result.week)
      void queryClient.invalidateQueries({ queryKey: ['issues'] })
    },
    [queryClient],
  )

  // Shared scope serializes rapid drags instead of racing them against each other.
  const scope = { id: 'week' }

  const planMutation = useMutation({
    mutationFn: (input: { issueKey: string; date: string }) => api.createAssignment(input, weekStart),
    onSuccess,
    scope,
  })

  const patchMutation = useMutation({
    mutationFn: (input: {
      id: string
      body: { date?: string; plannedMinutes?: number; done?: boolean; note?: string | null }
    }) => api.updateAssignment(input.id, input.body, weekStart),
    onSuccess,
    scope,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAssignment(id, weekStart),
    onSuccess,
    scope,
  })

  const splitMutation = useMutation({
    mutationFn: (input: { id: string; date: string; minutes: number }) =>
      api.splitAssignment(input.id, { date: input.date, minutes: input.minutes }, weekStart),
    onSuccess,
    scope,
  })

  const reorderMutation = useMutation({
    mutationFn: (input: { date: string; ids: string[] }) => api.reorderAssignments(input, weekStart),
    onSuccess,
    scope,
  })

  const capacityMutation = useMutation({
    mutationFn: (input: { date: string; minutes: number | null }) =>
      input.minutes === null
        ? api.clearDayCapacity(input.date)
        : api.setDayCapacity(input.date, { capacityMinutes: input.minutes }),
    onSuccess,
    scope,
  })

  const manualEventMutation = useMutation({
    mutationFn: (input: { date: string; title: string; startTime: string; minutes: number }) =>
      api.createManualEvent(input, weekStart),
    onSuccess,
    scope,
  })

  const eventPatchMutation = useMutation({
    mutationFn: (input: { id: string; countsToCapacity: boolean }) =>
      api.updateEvent(input.id, { countsToCapacity: input.countsToCapacity }),
    onSuccess,
    scope,
  })

  const eventDeleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess,
    scope,
  })

  const value = useMemo<PlannerValue>(
    () => ({
      weekStart,
      week: weekQuery.data,
      isLoading: weekQuery.isLoading,
      error: weekQuery.error ? (weekQuery.error as Error).message : null,
      goToWeek: (date) => setWeekStart(startOfWeek(date)),
      shiftWeek: (weeks) => setWeekStart((current) => startOfWeek(addDays(current, weeks * 7))),
      plan: (issueKey, date) => planMutation.mutate({ issueKey, date }),
      move: (id, date) => patchMutation.mutate({ id, body: { date } }),
      setMinutes: (id, plannedMinutes) => patchMutation.mutate({ id, body: { plannedMinutes } }),
      toggleDone: (id, done) => patchMutation.mutate({ id, body: { done } }),
      remove: (id) => deleteMutation.mutate(id),
      split: (id, date, minutes) => splitMutation.mutate({ id, date, minutes }),
      reorder: (date, ids) => reorderMutation.mutate({ date, ids }),
      setDayCapacity: (date, minutes) => capacityMutation.mutate({ date, minutes }),
      addManualEvent: (input) => manualEventMutation.mutate(input),
      setEventCounts: (id, countsToCapacity) => eventPatchMutation.mutate({ id, countsToCapacity }),
      deleteEvent: (id) => eventDeleteMutation.mutate(id),
      isMutating:
        planMutation.isPending ||
        patchMutation.isPending ||
        deleteMutation.isPending ||
        splitMutation.isPending ||
        reorderMutation.isPending ||
        capacityMutation.isPending ||
        manualEventMutation.isPending ||
        eventPatchMutation.isPending ||
        eventDeleteMutation.isPending,
    }),
    [
      weekStart,
      weekQuery.data,
      weekQuery.isLoading,
      weekQuery.error,
      planMutation,
      patchMutation,
      deleteMutation,
      splitMutation,
      reorderMutation,
      capacityMutation,
      manualEventMutation,
      eventPatchMutation,
      eventDeleteMutation,
    ],
  )

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
}

export function usePlanner(): PlannerValue {
  const value = useContext(PlannerContext)
  if (!value) throw new Error('usePlanner must be used inside PlannerProvider')
  return value
}
