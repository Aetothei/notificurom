import React, { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '@/db/schema';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';

interface KanbanBoardProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  searchFilter: string;
  sourceFilter: string;
  onSearchChange?: (value: string) => void;
  onClearFilters?: () => void;
}

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: 'inbox', title: 'Inbox' },
  { id: 'next', title: 'Next Actions' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'waiting', title: 'Waiting On' },
  { id: 'done', title: 'Done' },
];

export function KanbanBoard({
  tasks,
  setTasks,
  searchFilter,
  sourceFilter,
  onSearchChange,
  onClearFilters,
}: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const updateServerTask = useCallback(
    async (taskId: string, status?: TaskStatus, sortOrder?: number) => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, sortOrder }),
        });
        if (!res.ok) {
          console.error('Failed to update task on server, status code:', res.status);
        }
      } catch (err) {
        console.error('Failed to sync task status with server', err);
      }
    },
    []
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag starts so clicks on links/buttons work naturally
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleMoveColumn = useCallback(
    async (taskId: string, targetStatus: TaskStatus) => {
      const now = new Date().toISOString();
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: targetStatus, statusUpdatedAt: now } : t
        )
      );
      await updateServerTask(taskId, targetStatus);
    },
    [setTasks, updateServerTask]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      try {
        await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete task', err);
      }
    },
    [setTasks]
  );

  const handleFilterRepo = useCallback(
    (repo: string) => {
      if (!onSearchChange) return;
      if (searchFilter.trim().toLowerCase() === repo.toLowerCase()) {
        onSearchChange('');
      } else {
        onSearchChange(repo);
      }
    },
    [searchFilter, onSearchChange]
  );

  const onDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    setTasks((prev) => {
      const activeIdx = prev.findIndex((t) => t.id === activeId);
      if (activeIdx === -1) return prev;

      const activeItem = prev[activeIdx];
      const isOverColumn = COLUMNS.some((col) => col.id === overId);

      if (isOverColumn) {
        const targetColumn = overId as TaskStatus;
        if (activeItem.status !== targetColumn) {
          const updated = [...prev];
          updated[activeIdx] = {
            ...activeItem,
            status: targetColumn,
            statusUpdatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return prev;
      }

      const overIdx = prev.findIndex((t) => t.id === overId);
      if (overIdx === -1) return prev;

      const overItem = prev[overIdx];
      if (activeItem.status !== overItem.status) {
        const updated = [...prev];
        updated[activeIdx] = {
          ...activeItem,
          status: overItem.status,
          statusUpdatedAt: new Date().toISOString(),
        };
        return arrayMove(updated, activeIdx, overIdx);
      } else if (activeIdx !== overIdx) {
        return arrayMove(prev, activeIdx, overIdx);
      }

      return prev;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    setTasks((prev) => {
      const activeIdx = prev.findIndex((t) => t.id === activeId);
      if (activeIdx === -1) return prev;

      let nextTasks = [...prev];
      let finalStatus = nextTasks[activeIdx].status;

      const isOverColumn = COLUMNS.some((col) => col.id === overId);
      if (isOverColumn) {
        finalStatus = overId as TaskStatus;
        if (nextTasks[activeIdx].status !== finalStatus) {
          nextTasks[activeIdx] = {
            ...nextTasks[activeIdx],
            status: finalStatus,
            statusUpdatedAt: new Date().toISOString(),
          };
        }
      } else {
        const overIdx = prev.findIndex((t) => t.id === overId);
        if (overIdx !== -1) {
          const overItem = prev[overIdx];
          finalStatus = overItem.status;
          if (nextTasks[activeIdx].status !== overItem.status) {
            nextTasks[activeIdx] = {
              ...nextTasks[activeIdx],
              status: finalStatus,
              statusUpdatedAt: new Date().toISOString(),
            };
          }
          if (activeIdx !== overIdx) {
            nextTasks = arrayMove(nextTasks, activeIdx, overIdx);
          }
        }
      }

      const columnTasks = nextTasks.filter((t) => t.status === finalStatus);
      const colIndex = columnTasks.findIndex((t) => t.id === activeId);
      const newSortOrder = colIndex >= 0 ? colIndex : 0;

      nextTasks = nextTasks.map((t) =>
        t.id === activeId ? { ...t, sortOrder: newSortOrder } : t
      );

      updateServerTask(activeId, finalStatus, newSortOrder);

      return nextTasks;
    });
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (sourceFilter !== 'all') {
        if (sourceFilter === 'github_pr' && task.sourceType !== 'pr') return false;
        if (sourceFilter === 'github_issue' && task.sourceType !== 'issue') return false;
        if (sourceFilter === 'review_request' && task.sourceType !== 'review_request') return false;
      }

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(q);
        const matchRepo = (task.repository || '').toLowerCase().includes(q);
        const matchAuthor = (task.author || '').toLowerCase().includes(q);
        return matchTitle || matchRepo || matchAuthor;
      }

      return true;
    });
  }, [tasks, searchFilter, sourceFilter]);

  return (
    <DndContext
      id="notificurom-dnd-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 pb-4 items-start">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);
          return (
            <KanbanColumn
              key={col.id}
              id={col.id}
              title={col.title}
              tasks={colTasks}
              hasActiveFilters={Boolean(searchFilter.trim()) || sourceFilter !== 'all'}
              onClearFilters={onClearFilters}
              onMoveColumn={handleMoveColumn}
              onDeleteTask={handleDeleteTask}
              onFilterRepo={handleFilterRepo}
            />
          );
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-[340px]">
            <TaskCard task={activeTask} isOverlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
