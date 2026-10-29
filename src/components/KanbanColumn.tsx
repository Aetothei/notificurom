import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '@/db/schema';
import { TaskCard } from './TaskCard';
import { SectionHeader } from './SectionHeader';
import { ArrowUpDown } from 'lucide-react';

export type SortMode = 'default' | 'oldest' | 'newest' | 'stalled';

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  onDeleteTask: (taskId: string) => void;
}

const COLUMN_ICONS: Record<TaskStatus, string> = {
  inbox: 'mdi:inbox-arrow-down-outline',
  next: 'mdi:arrow-right-circle-outline',
  in_progress: 'mdi:play-circle-outline',
  waiting: 'mdi:clock-outline',
  done: 'mdi:check-circle-outline',
};

export function KanbanColumn({
  id,
  title,
  tasks,
  hasActiveFilters = false,
  onClearFilters,
  onDeleteTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: {
      type: 'Column',
      columnId: id,
    },
  });

  const [sortMode, setSortMode] = useState<SortMode>('default');

  const sortedTasks = [...tasks].sort((a, b) => {
    if (sortMode === 'oldest') {
      return new Date(a.sourceCreatedAt).getTime() - new Date(b.sourceCreatedAt).getTime();
    }
    if (sortMode === 'newest') {
      return new Date(b.sourceCreatedAt).getTime() - new Date(a.sourceCreatedAt).getTime();
    }
    if (sortMode === 'stalled') {
      return new Date(a.statusUpdatedAt).getTime() - new Date(b.statusUpdatedAt).getTime();
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return new Date(b.sourceCreatedAt).getTime() - new Date(a.sourceCreatedAt).getTime();
  });

  const sortButton = (
    <button
      type="button"
      onClick={() => {
        const modes: SortMode[] = ['default', 'oldest', 'newest', 'stalled'];
        const nextIdx = (modes.indexOf(sortMode) + 1) % modes.length;
        setSortMode(modes[nextIdx]);
      }}
      className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 transition-all cursor-pointer ${
        sortMode !== 'default'
          ? 'bg-amber-500/20 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
      }`}
      title={`Sorting: ${sortMode}. Click to cycle`}
    >
      <ArrowUpDown className="w-3 h-3" />
      {sortMode !== 'default' && (
        <span className="text-[10px] uppercase font-mono font-bold">{sortMode}</span>
      )}
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      data-column-id={id}
      data-testid={`column-${id}`}
      className={`flex flex-col w-full rounded-3xl bg-white/[0.025] backdrop-blur-xl p-3 transition-all ${
        isOver
          ? 'bg-amber-500/[0.06] shadow-[0_0_28px_rgba(245,158,11,0.14)]'
          : ''
      }`}
    >
      <SectionHeader
        title={title}
        icon={COLUMN_ICONS[id]}
        count={tasks.length}
        rightSlot={sortButton}
        className="mb-3 px-1"
      />

      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto max-h-[calc(100vh-160px)]">
        <SortableContext
          items={sortedTasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onDelete={onDeleteTask}
            />
          ))}
        </SortableContext>

        {sortedTasks.length === 0 && (
          <div className="py-10 flex flex-col items-center justify-center text-center text-zinc-600 text-xs gap-1.5">
            <span>
              {hasActiveFilters ? 'No matching items' : `No items in ${title.toLowerCase()}`}
            </span>
            {hasActiveFilters && onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="text-xs text-amber-400 hover:text-amber-300 underline font-medium transition-colors cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
