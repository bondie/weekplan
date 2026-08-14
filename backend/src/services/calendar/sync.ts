import crypto from 'node:crypto'
import type { CalendarSource, Prisma } from '@prisma/client'
import { env } from '../../env'
import { addDaysToKey, keyToDbDate, localDateKey, todayKey } from '../../lib/dates'
import { prisma } from '../../lib/prisma'
import { expandIcs, type Occurrence } from './ics'

const WINDOW_BACK_DAYS = 21
const WINDOW_FORWARD_DAYS = 90
const MAX_FEED_BYTES = 10 * 1024 * 1024

function syncWindow() {
  const today = todayKey()
  return {
    start: new Date(`${addDaysToKey(today, -WINDOW_BACK_DAYS)}T00:00:00`),
    end: new Date(`${addDaysToKey(today, WINDOW_FORWARD_DAYS)}T23:59:59`),
  }
}

function countsToCapacity(occurrence: Occurrence, source: CalendarSource): boolean {
  if (occurrence.cancelled) return false
  if (occurrence.busyStatus === 'FREE') return false
  if (occurrence.busyStatus === 'TENTATIVE' && !source.countTentative) return false

  if (occurrence.allDay) {
    if (source.allDayPolicy === 'IGNORE') return false
    if (source.allDayPolicy === 'FULL_DAY') return true
    return occurrence.busyStatus === 'BUSY' || occurrence.busyStatus === 'OOF'
  }

  return true
}

export interface SourceSyncResult {
  sourceId: string
  name: string
  ok: boolean
  events?: number
  unchanged?: boolean
  error?: string
}

export async function syncCalendarSource(source: CalendarSource): Promise<SourceSyncResult> {
  const base = { sourceId: source.id, name: source.name }
  if (!source.url) return { ...base, ok: true, events: 0 }

  try {
    const headers: Record<string, string> = {}
    if (source.etag) headers['If-None-Match'] = source.etag
    if (source.lastModified) headers['If-Modified-Since'] = source.lastModified

    const res = await fetch(source.url, { headers, signal: AbortSignal.timeout(60_000) })

    if (res.status === 304) {
      await prisma.calendarSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveFailures: 0 },
      })
      return { ...base, ok: true, unchanged: true }
    }

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

    const text = await res.text()
    if (text.length > MAX_FEED_BYTES) throw new Error(`feed larger than ${MAX_FEED_BYTES} bytes`)
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('response is not an iCalendar feed')

    const hash = crypto.createHash('sha256').update(text).digest('hex')
    // Outlook often ignores conditional headers, so the body hash is the real change detector.
    if (hash === source.contentHash) {
      await prisma.calendarSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveFailures: 0 },
      })
      return { ...base, ok: true, unchanged: true }
    }

    const window = syncWindow()
    const occurrences = expandIcs(text, window.start, window.end)
    const seen = new Set<string>()

    for (const occurrence of occurrences) {
      const key = `${occurrence.uid}|${occurrence.recurrenceId}`
      if (seen.has(key)) continue
      seen.add(key)

      const data = {
        userId: source.userId,
        sourceId: source.id,
        uid: occurrence.uid,
        recurrenceId: occurrence.recurrenceId,
        title: occurrence.title,
        location: occurrence.location,
        startsAt: occurrence.startsAt,
        endsAt: occurrence.endsAt,
        localDate: keyToDbDate(localDateKey(occurrence.startsAt)),
        allDay: occurrence.allDay,
        busyStatus: occurrence.busyStatus,
        cancelled: occurrence.cancelled,
        countsToCapacity: countsToCapacity(occurrence, source),
        syncedAt: new Date(),
      }

      await prisma.calendarEvent.upsert({
        where: {
          sourceId_uid_recurrenceId: {
            sourceId: source.id,
            uid: occurrence.uid,
            recurrenceId: occurrence.recurrenceId,
          },
        },
        create: data,
        update: data,
      })
    }

    const stale = await prisma.calendarEvent.findMany({
      where: { sourceId: source.id, startsAt: { gte: window.start, lte: window.end } },
      select: { id: true, uid: true, recurrenceId: true },
    })
    const removed = stale.filter((event) => !seen.has(`${event.uid}|${event.recurrenceId}`)).map((event) => event.id)
    if (removed.length > 0) await prisma.calendarEvent.deleteMany({ where: { id: { in: removed } } })

    await prisma.calendarSource.update({
      where: { id: source.id },
      data: {
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        contentHash: hash,
        lastFetchedAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
        eventCount: seen.size,
      },
    })

    return { ...base, ok: true, events: seen.size }
  } catch (err) {
    const message = (err as Error).message
    await prisma.calendarSource.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date(), lastError: message, consecutiveFailures: { increment: 1 } },
    })
    return { ...base, ok: false, error: message }
  }
}

export interface CalendarSyncResult {
  ok: boolean
  at: string
  sources: SourceSyncResult[]
}

export async function runCalendarSync(): Promise<CalendarSyncResult> {
  const sources = await prisma.calendarSource.findMany({ where: { enabled: true, kind: 'ICS_URL' } })
  const results: SourceSyncResult[] = []

  for (const source of sources) {
    results.push(await syncCalendarSource(source))
  }

  const result: CalendarSyncResult = {
    ok: results.every((r) => r.ok),
    at: new Date().toISOString(),
    sources: results,
  }

  await prisma.syncState.upsert({
    where: { key: 'calendar' },
    create: { key: 'calendar', value: result as unknown as Prisma.InputJsonValue },
    update: { value: result as unknown as Prisma.InputJsonValue },
  })

  return result
}

/** ICS_URL is only a bootstrap convenience; the UI owns sources afterwards. */
export async function ensureEnvIcsSource(userId: string): Promise<void> {
  if (!env.ICS_URL) return

  const existing = await prisma.calendarSource.findFirst({ where: { userId, url: env.ICS_URL } })
  if (existing) return

  await prisma.calendarSource.create({
    data: { userId, kind: 'ICS_URL', name: 'Outlook / Teams', url: env.ICS_URL },
  })
}
