import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import { formatRelative, todayKey } from '../lib/format'

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources })
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.issues(todayKey(), [], '', '')).projects,
  })

  const [newSource, setNewSource] = useState({ name: 'Outlook / Teams', url: '' })
  const [jqlDraft, setJqlDraft] = useState<string | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries()
  }

  const updateMe = useMutation({ mutationFn: api.updateMe, onSuccess: refresh })
  const addSource = useMutation({
    mutationFn: () => api.createSource(newSource),
    onSuccess: () => {
      setNewSource({ name: 'Outlook / Teams', url: '' })
      refresh()
    },
  })
  const removeSource = useMutation({ mutationFn: api.deleteSource, onSuccess: refresh })
  const syncCalendar = useMutation({ mutationFn: api.syncCalendar, onSuccess: refresh })
  const fullSync = useMutation({ mutationFn: () => api.syncJira(true), onSuccess: refresh })

  const user = me.data
  const capacityHours = user ? user.dailyCapacityMinutes / 60 : 8

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-8" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold">Nastavení</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Kapacita</h3>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-600">Hodin denně</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                defaultValue={capacityHours}
                onBlur={(event) =>
                  updateMe.mutate({ dailyCapacityMinutes: Math.round(Number(event.target.value) * 60) })
                }
                className="w-20 rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-indigo-400"
              />
              <label className="ml-4 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={user?.showWeekend ?? false}
                  onChange={(event) => updateMe.mutate({ showWeekend: event.target.checked })}
                />
                Zobrazovat víkend
              </label>
            </div>

            <div className="mt-3 flex gap-1">
              {WEEKDAYS.map((label, index) => {
                const day = index + 1
                const active = user?.workingDays.includes(day) ?? false
                return (
                  <button
                    key={label}
                    onClick={() => {
                      if (!user) return
                      const next = active
                        ? user.workingDays.filter((d) => d !== day)
                        : [...user.workingDays, day].sort()
                      updateMe.mutate({ workingDays: next })
                    }}
                    className={`w-10 rounded-md py-1 text-xs font-medium transition ${
                      active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Projekty</h3>
            <p className="mb-2 text-xs text-slate-500">
              Ignorované projekty se v plánování vůbec nezobrazují. Projekt s režií se nepočítá do zbývající práce a
              jeho výkazy jsou ve dnech odlišené — měsíční režijní task se tak přepíná sám.
            </p>

            <div className="space-y-1">
              {projects.data?.map((item) => {
                const ignored = user?.ignoredProjects.includes(item.key) ?? false
                const isOverhead = user?.overheadProject === item.key
                return (
                  <div key={item.key} className="flex items-center gap-3 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                    <span className="font-mono text-xs text-slate-600">{item.key}</span>
                    <span className="text-xs text-slate-400">{item.count}</span>

                    <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={ignored}
                        onChange={() => {
                          if (!user) return
                          updateMe.mutate({
                            ignoredProjects: ignored
                              ? user.ignoredProjects.filter((key) => key !== item.key)
                              : [...user.ignoredProjects, item.key],
                          })
                        }}
                      />
                      ignorovat
                    </label>

                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="radio"
                        name="overheadProject"
                        checked={isOverhead}
                        onChange={() => updateMe.mutate({ overheadProject: item.key })}
                      />
                      režie
                    </label>
                  </div>
                )
              })}
            </div>

            {user?.overheadProject ? (
              <button
                onClick={() => updateMe.mutate({ overheadProject: null })}
                className="mt-2 text-xs text-slate-500 hover:text-indigo-600"
              >
                Zrušit projekt s režií ({user.overheadProject})
              </button>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Kalendáře s režií</h3>
            <p className="mb-3 text-xs text-slate-500">
              V Outlook Web: Nastavení → Kalendář → Sdílené kalendáře → Publikovat → zkopíruj ICS odkaz. Outlook
              publikovaný feed aktualizuje se zpožděním (klidně i hodiny) — co v něm ještě není, přidej ručně jako blok
              režie přímo ve dni.
            </p>

            <div className="space-y-2">
              {sources.data?.map((source) => (
                <div key={source.id} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-700">{source.name}</div>
                    <div className="truncate text-[11px] text-slate-400">{source.url}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {source.eventCount} událostí · staženo {formatRelative(source.lastSuccessAt)}
                      {source.lastError ? (
                        <span className="ml-1 inline-flex items-center gap-1 text-rose-600">
                          <AlertTriangle className="size-3" />
                          {source.lastError}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={() => removeSource.mutate(source.id)}
                    className="rounded p-1 text-slate-300 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}

              {sources.data?.length === 0 ? <p className="text-xs text-slate-400">Zatím žádný kalendář.</p> : null}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={newSource.name}
                onChange={(event) => setNewSource({ ...newSource, name: event.target.value })}
                placeholder="Název"
                className="w-40 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              <input
                value={newSource.url}
                onChange={(event) => setNewSource({ ...newSource, url: event.target.value })}
                placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
                className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
              <button
                onClick={() => addSource.mutate()}
                disabled={!newSource.url || addSource.isPending}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Přidat
              </button>
            </div>

            <button
              onClick={() => syncCalendar.mutate()}
              className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600"
            >
              <RefreshCw className={`size-3.5 ${syncCalendar.isPending ? 'animate-spin' : ''}`} />
              Stáhnout kalendáře teď
            </button>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">JIRA dotaz</h3>
            <p className="mb-2 text-xs text-slate-500">
              Určuje, které tasky se stahují. <code className="rounded bg-slate-100 px-1">{'{user}'}</code> se nahradí
              tvým JIRA uživatelem. Prázdné = výchozí dotaz.
            </p>
            <textarea
              value={jqlDraft ?? user?.jql ?? ''}
              onChange={(event) => setJqlDraft(event.target.value)}
              placeholder={user?.defaultJql}
              rows={2}
              className="w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-xs outline-none focus:border-indigo-400"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => {
                  updateMe.mutate({ jql: jqlDraft?.trim() ? jqlDraft.trim() : null })
                  setJqlDraft(null)
                }}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >
                Uložit dotaz
              </button>
              <button
                onClick={() => fullSync.mutate()}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600"
              >
                <RefreshCw className={`size-3.5 ${fullSync.isPending ? 'animate-spin' : ''}`} />
                Plná synchronizace JIRA
              </button>
            </div>
            <p className="mt-2 font-mono text-[11px] text-slate-400">{user?.effectiveJql}</p>
          </section>
        </div>
      </div>
    </div>
  )
}
