import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import BacklogPanel from './components/BacklogPanel'
import Header from './components/Header'
import SettingsDialog from './components/SettingsDialog'
import WeekGrid from './components/WeekGrid'
import { PlannerProvider, usePlanner } from './hooks/planner'
import type { Issue } from './api/types'

interface DragPayload {
  type: 'issue' | 'assignment' | 'day' | 'backlog'
  date?: string
  issue?: Issue
  label?: string
}

function Planner() {
  const planner = usePlanner()
  const [dragged, setDragged] = useState<DragPayload | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const sensors = useSensors(
    // Without a distance threshold a card could never be clicked, only dragged.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragStart = (event: DragStartEvent) => setDragged((event.active.data.current as DragPayload) ?? null)

  const onDragEnd = (event: DragEndEvent) => {
    setDragged(null)
    const { active, over } = event
    if (!over) return

    const source = active.data.current as DragPayload | undefined
    const target = over.data.current as DragPayload | undefined
    if (!source) return

    if (source.type === 'issue' && source.issue) {
      if (target?.type === 'day' || target?.type === 'assignment') {
        planner.plan(source.issue.key, target.date!)
      }
      return
    }

    if (source.type !== 'assignment') return

    if (target?.type === 'backlog') {
      planner.remove(String(active.id).replace('assignment:', ''))
      return
    }

    const targetDate = target?.date
    if (!targetDate) return

    if (targetDate !== source.date) {
      planner.move(String(active.id).replace('assignment:', ''), targetDate)
      return
    }

    const day = planner.week?.days.find((item) => item.date === targetDate)
    if (!day || active.id === over.id) return

    const ids = day.assignments.map((assignment) => `assignment:${assignment.id}`)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return

    planner.reorder(
      targetDate,
      arrayMove(ids, from, to).map((id) => id.replace('assignment:', '')),
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragged(null)}
    >
      <div className="flex h-screen flex-col bg-slate-100">
        <Header onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          <BacklogPanel />
          <WeekGrid />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged ? (
          <div className="w-72 rounded-lg border border-indigo-300 bg-white px-3 py-2 shadow-lg ring-2 ring-indigo-200">
            <div className="font-mono text-xs font-semibold text-indigo-600">{dragged.issue?.key ?? dragged.label}</div>
            <div className="clamp-2 text-sm text-slate-700">{dragged.issue?.summary ?? ''}</div>
          </div>
        ) : null}
      </DragOverlay>

      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </DndContext>
  )
}

export default function App() {
  return (
    <PlannerProvider>
      <Planner />
    </PlannerProvider>
  )
}
