import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Plus,
  CheckCircle2,
  Circle,
  Layout
} from 'lucide-react';
import type { Editor, TLShapeId } from 'tldraw';
import { PagesListWithDragDrop } from './PagesListWithDragDrop';
import '../page-panel.css';

interface LeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  editor: Editor | null;
}

// Mock Task Data
interface Task {
  id: string;
  name: string;
  isCompleted: boolean;
}

export function LeftSidebar({
  isOpen,
  onClose,
  editor,
}: LeftSidebarProps) {
  // --- State ---
  // Default to null (All Pages) or a specific ID
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isTasksCollapsed, setIsTasksCollapsed] = useState(false);
  const [allShapeIds, setAllShapeIds] = useState<TLShapeId[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; shapeIds: TLShapeId[] } | null>(null);

  const rafRef = useRef<number | null>(null);
  const pendingUpdateRef = useRef(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Mock Tasks - In a real app, these would come from your backend/store
  const tasks: Task[] = useMemo(() => [
    { id: 't1', name: 'Design System', isCompleted: false },
    { id: 't2', name: 'Auth Flow', isCompleted: true },
    { id: 't3', name: 'Dashboard', isCompleted: false },
  ], []);

  // --- Tldraw Data Sync ---
  const updateShapeIds = useCallback(() => {
    if (!editor || pendingUpdateRef.current) return;
    pendingUpdateRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    
    rafRef.current = requestAnimationFrame(() => {
      try {
        const ids = editor.getSortedChildIdsForParent(editor.getCurrentPageId());
        setAllShapeIds((prev) => {
          if (prev.length !== ids.length || prev.some((id, i) => id !== ids[i])) return ids;
          return prev;
        });
      } catch (error) {
        console.error('Error getting shape IDs:', error);
      } finally {
        pendingUpdateRef.current = false;
      }
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      setAllShapeIds([]);
      return;
    }
    updateShapeIds();

    let lastUpdate = 0;
    const throttleMs = 100;
    
    const unsubscribe = editor.store.listen(() => {
      const now = Date.now();
      if (now - lastUpdate >= throttleMs) {
        lastUpdate = now;
        updateShapeIds();
      }
    }, { source: 'user', scope: 'document' });

    const handleEvent = (event: { type: string }) => {
      const shapeEvents = ['create-shapes', 'delete-shapes', 'reparent-shapes'];
      if (shapeEvents.includes(event.type)) updateShapeIds();
    };

    editor.on('event', handleEvent);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      unsubscribe();
      editor.off('event', handleEvent);
    };
  }, [editor, updateShapeIds]);

  // --- Filtering Logic (Simulated) ---
  const displayedShapeIds = useMemo(() => {
    if (!activeTaskId || !editor) return allShapeIds;

    // SIMULATED FILTER: 
    // Example: 't1' shows first 3 layers, 't2' shows next 3, etc.
    // Replace with real logic: allShapeIds.filter(id => editor.getShape(id).meta.taskId === activeTaskId)
    return allShapeIds.filter((_, index) => {
      if (activeTaskId === 't1') return index < 3;
      if (activeTaskId === 't2') return index >= 3 && index < 6;
      if (activeTaskId === 't3') return index >= 6;
      return true;
    });
  }, [allShapeIds, activeTaskId, editor]);

  // --- Context Menu (Grouping) ---
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, selectedShapeIds: TLShapeId[]) => {
    if (!editor) return;
    const currentSelection = editor.getSelectedShapeIds();
    const shapeIdsToUse = selectedShapeIds.length >= 2 ? selectedShapeIds : currentSelection;
    if (shapeIdsToUse.length >= 2) {
      setContextMenu({ x: e.clientX, y: e.clientY, shapeIds: shapeIdsToUse });
    }
  };

  const handleGroup = () => {
    if (!editor || !contextMenu) return;
    const shapes = contextMenu.shapeIds.map(id => editor.getShape(id)).filter(Boolean);
    if (shapes.length >= 2) editor.groupShapes(shapes);
    setContextMenu(null);
  };

  const handleUngroup = () => {
    if (!editor || !contextMenu) return;
    const shapes = contextMenu.shapeIds.map(id => editor.getShape(id)).filter(Boolean);
    const groups = shapes.filter(s => s.type === 'group');
    if (groups.length > 0) editor.ungroupShapes(groups);
    setContextMenu(null);
  };

  // --- Helper for Task Count ---
  const getTaskLayerCount = (tid: string | null) => {
     if (!tid) return allShapeIds.length;
     // Mimic the filter logic above for counts
     if (tid === 't1') return Math.min(allShapeIds.length, 3);
     if (tid === 't2') return Math.max(0, Math.min(allShapeIds.length, 6) - 3);
     if (tid === 't3') return Math.max(0, allShapeIds.length - 6);
     return 0;
  }

  // --- Render ---

  return (
    <aside
      className={`
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0
        fixed lg:static 
        inset-y-0 left-0 z-30 
        w-60 shrink-0 
        bg-[#F9FAFB] /* Light gray background like Figma sidebar */
        border-r border-slate-200 
        flex flex-col 
        transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
      `}
    >
      {/* --- TOP SECTION: TASKS (Replacing Pages) --- */}
      <div className="flex flex-col pt-2 pb-1 shrink-0 select-none">
        
        {/* Header Row */}
        <div className="flex items-center justify-between px-4 py-2 group">
          <div className="flex items-center gap-1 cursor-pointer" onClick={() => setIsTasksCollapsed(!isTasksCollapsed)}>
            <span className="text-[11px] font-bold text-slate-900">Tasks</span>
          </div>
          <button className="text-slate-500 hover:text-slate-900 transition-colors">
             <Plus size={14} />
          </button>
        </div>

        {/* Task List */}
        <div className={`px-2 flex flex-col gap-0.5 transition-all duration-300 ${isTasksCollapsed ? 'hidden' : 'block'}`}>
          {/* "View All" - Acting as the Default View */}
          <div
            onClick={() => setActiveTaskId(null)}
            className={`
              flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer text-[12px] font-medium
              ${activeTaskId === null
                ? 'bg-[#1e61f0] text-white' // Selected: task being worked on
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }
            `}
          >
             <span className="truncate">View All</span>
             <span className="text-[10px] opacity-60 font-semibold">{allShapeIds.length}</span>
          </div>

          {/* Individual Tasks */}
          {tasks.map(task => {
            const isActive = activeTaskId === task.id;
            const count = getTaskLayerCount(task.id);
            return (
              <div 
                key={task.id}
                onClick={() => setActiveTaskId(task.id)}
                className={`
                  group flex items-center justify-between px-3 py-1.5 rounded-md cursor-pointer text-[12px] font-medium transition-colors
                  ${isActive 
                    ? 'bg-[#1e61f0] text-white' 
                    : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                  }
                `}
              >
                <div className="flex items-center gap-2 truncate">
                  {/* Status Indicator */}
                  {task.isCompleted ? (
                    <CheckCircle2 size={12} className="text-slate-400" />
                  ) : (
                    <Circle size={12} className="text-slate-300" />
                  )}
                  <span className="truncate">{task.name}</span>
                </div>
                
                {/* Count Pill */}
                <span className={`text-[10px] opacity-60 font-semibold`}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- DIVIDER --- */}
      <div className="h-[1px] bg-slate-200 my-1 mx-0 w-full" />

      {/* --- BOTTOM SECTION: PAGES --- */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Header */}
        <div className="px-4 py-3 shrink-0 select-none">
          <span className="text-[11px] font-bold text-slate-900">Pages</span>
        </div>

        {/* Tree Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-2">
          {!editor ? (
            <div className="p-4 text-center">
               <span className="text-[11px] text-slate-400">Loading canvas...</span>
            </div>
          ) : displayedShapeIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center pt-10 text-center opacity-60">
              <Layout size={24} className="text-slate-300 mb-2" strokeWidth={1.5} />
              <p className="text-[11px] font-medium text-slate-500">Empty</p>
            </div>
          ) : (
            <PagesListWithDragDrop
              shapeIds={displayedShapeIds}
              depth={0}
              editor={editor}
              parentId={editor.getCurrentPageId()}
              onContextMenu={handleContextMenu}
            />
          )}
        </div>
      </div>

      {/* Mobile Close Button (Floating) */}
      <button
        onClick={onClose}
        className="lg:hidden absolute top-2 right-2 p-1 bg-white border border-slate-200 rounded-md shadow-sm z-50 text-slate-500"
      >
        <X size={16} />
      </button>

      {/* --- CONTEXT MENU --- */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white border border-slate-200 rounded shadow-lg z-50 py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handleGroup}
            className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-100"
          >
            Group Selection
          </button>
          <button
            onClick={handleUngroup}
            className="w-full text-left px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-100"
          >
            Ungroup
          </button>
        </div>
      )}
    </aside>
  );
}