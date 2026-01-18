import { useState, useRef, useEffect } from 'react';
import type { Editor, TLShapeId } from 'tldraw';
import { ChevronDown } from 'lucide-react';
import { getShapeIcon } from '../../utils/shapeUtils';

interface DragState {
  draggedShapeId: TLShapeId;
  draggedParentId: TLShapeId | null;
}

interface PagesListProps {
  shapeIds: TLShapeId[];
  depth: number;
  editor: Editor;
  parentId: TLShapeId | null;
  onContextMenu?: (e: React.MouseEvent, shapeIds: TLShapeId[]) => void;
}

export function PagesListWithDragDrop({ shapeIds, depth, editor, parentId, onContextMenu }: PagesListProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverId, setDragOverId] = useState<{ id: TLShapeId; position: 'before' | 'after' | 'inside' } | null>(null);

  const handleDragStart = (shapeId: TLShapeId, draggedParentId: TLShapeId | null) => {
    setDragState({ draggedShapeId: shapeId, draggedParentId });
  };

  const handleDragEnd = () => {
    setDragState(null);
    setDragOverId(null);
  };

  const handleDrop = (draggedId: TLShapeId, targetId: TLShapeId | null, dropPosition: 'before' | 'after' | 'inside') => {
    if (!dragState) return;

    const draggedShape = editor.getShape(draggedId);
    if (!draggedShape) return;

    // Don't allow dropping on itself
    if (targetId === draggedId && dropPosition === 'inside') return;

    // Prevent dropping into own descendants
    const isDescendant = (ancestorId: TLShapeId, potentialDescendantId: TLShapeId): boolean => {
      try {
        const children = editor.getSortedChildIdsForParent(ancestorId);
        if (children.includes(potentialDescendantId)) return true;
        for (const childId of children) {
          if (isDescendant(childId, potentialDescendantId)) return true;
        }
      } catch {
        // If we can't get children, assume not a descendant
      }
      return false;
    };

    if (targetId && dropPosition === 'inside' && isDescendant(draggedId, targetId)) {
      return; // Can't drop into own descendants
    }

    try {
      let newParentId: TLShapeId;
      let insertIndex: string;

      if (dropPosition === 'inside' && targetId) {
        // Dropping inside a group/frame
        const targetShape = editor.getShape(targetId);
        if (targetShape && (targetShape.type === 'group' || targetShape.type === 'frame')) {
          newParentId = targetId;
          // Append at the end
          const siblings = editor.getSortedChildIdsForParent(targetId);
          if (siblings.length === 0) {
            insertIndex = editor.getHighestIndexForParent(targetId);
          } else {
            const lastSibling = editor.getShape(siblings[siblings.length - 1]);
            if (lastSibling) {
              insertIndex = editor.getIndexAfter(lastSibling.id);
            } else {
              insertIndex = editor.getHighestIndexForParent(targetId);
            }
          }
        } else {
          return; // Can't drop inside a non-container
        }
      } else {
        // Dropping before/after (same parent level)
        // If dragging from a group to root level, use page as parent
        if (dropPosition === 'before' || dropPosition === 'after') {
          newParentId = parentId || editor.getCurrentPageId();
        } else {
          newParentId = parentId || editor.getCurrentPageId();
        }
        
        const siblings = editor.getSortedChildIdsForParent(newParentId);
        
        if (targetId && siblings.includes(targetId)) {
          const targetShape = editor.getShape(targetId);
          if (targetShape) {
            if (dropPosition === 'before') {
              // Insert before target
              insertIndex = editor.getIndexBefore(targetShape.id);
            } else {
              // Insert after target
              insertIndex = editor.getIndexAfter(targetShape.id);
            }
          } else {
            insertIndex = editor.getHighestIndexForParent(newParentId);
          }
        } else {
          // Append at the end
          insertIndex = editor.getHighestIndexForParent(newParentId);
        }
      }

      // Use reparentShapes to move the shape
      editor.reparentShapes([draggedId], newParentId, insertIndex);
    } catch (error) {
      console.error('Error reparenting shape:', error);
    }
  };

  return (
    <>
      {/* Root-level drop zone when dragging from a group - always show at root level */}
      {dragState && dragState.draggedParentId !== null && depth === 0 && (
        <div
          className={`page-panel-drop-zone ${dragOverId === null || (dragOverId.position === 'before' && dragOverId.id === (shapeIds[0] || editor.getCurrentPageId())) ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px`, minHeight: '4px' }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Set drag over state for root level drop
            const targetId = shapeIds[0] || editor.getCurrentPageId();
            if (!dragOverId || dragOverId.id !== targetId || dragOverId.position !== 'before') {
              setDragOverId({ id: targetId, position: 'before' });
            }
          }}
          onDragLeave={(e) => {
            // Only clear if we're leaving this specific drop zone
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY;
            if (y < rect.top || y > rect.bottom) {
              if (dragOverId?.position === 'before' && dragOverId.id === (shapeIds[0] || editor.getCurrentPageId())) {
                setDragOverId(null);
              }
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragState) {
              // Move to root level (current page)
              const pageId = editor.getCurrentPageId();
              const siblings = editor.getSortedChildIdsForParent(pageId);
              const insertIndex = siblings.length > 0 
                ? editor.getIndexAfter(siblings[siblings.length - 1])
                : editor.getHighestIndexForParent(pageId);
              editor.reparentShapes([dragState.draggedShapeId], pageId, insertIndex);
              handleDragEnd();
            }
          }}
        />
      )}
      {shapeIds.map((shapeId, index) => (
        <PageItemWithDragDrop
          key={shapeId}
          shapeId={shapeId}
          depth={depth}
          editor={editor}
          parentId={parentId}
          dragState={dragState}
          dragOverId={dragOverId}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={(id, position) => setDragOverId({ id, position })}
          onDragLeave={() => setDragOverId(null)}
          onDrop={handleDrop}
          onContextMenu={onContextMenu}
        />
      ))}
      {/* Drop zone at the end of the list */}
      {dragState && dragOverId === null && (
        <div
          className="page-panel-drop-zone"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onDragOver={(e) => {
            e.preventDefault();
            if (shapeIds.length > 0) {
              setDragOverId({ id: shapeIds[shapeIds.length - 1], position: 'after' });
            } else if (depth === 0 && dragState.draggedParentId !== null) {
              // Allow dropping at root level even when list is empty
              setDragOverId({ id: editor.getCurrentPageId(), position: 'after' });
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragState) {
              if (shapeIds.length > 0) {
                handleDrop(dragState.draggedShapeId, shapeIds[shapeIds.length - 1], 'after');
              } else if (depth === 0 && dragState.draggedParentId !== null) {
                // Drop at root level when list is empty
                const pageId = editor.getCurrentPageId();
                const insertIndex = editor.getHighestIndexForParent(pageId);
                editor.reparentShapes([dragState.draggedShapeId], pageId, insertIndex);
              }
              handleDragEnd();
            }
          }}
        />
      )}
    </>
  );
}

interface PageItemProps {
  shapeId: TLShapeId;
  depth: number;
  editor: Editor;
  parentId: TLShapeId | null;
  dragState: DragState | null;
  dragOverId: { id: TLShapeId; position: 'before' | 'after' | 'inside' } | null;
  onDragStart: (shapeId: TLShapeId, parentId: TLShapeId | null) => void;
  onDragEnd: () => void;
  onDragOver: (id: TLShapeId, position: 'before' | 'after' | 'inside') => void;
  onDragLeave: () => void;
  onDrop: (draggedId: TLShapeId, targetId: TLShapeId | null, dropPosition: 'before' | 'after' | 'inside') => void;
  onContextMenu?: (e: React.MouseEvent, shapeIds: TLShapeId[]) => void;
}

function PageItemWithDragDrop({
  shapeId,
  depth,
  editor,
  parentId,
  dragState,
  dragOverId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
}: PageItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [shape, setShape] = useState(() => editor.getShape(shapeId));
  const [childIds, setChildIds] = useState<TLShapeId[]>(() => {
    try {
      return editor.getSortedChildIdsForParent(shapeId);
    } catch {
      return [];
    }
  });
  const [isSelected, setIsSelected] = useState(() => editor.getSelectedShapeIds().includes(shapeId));
  const [isHidden, setIsHidden] = useState(() => {
    const meta = shape?.meta as any;
    return meta?.hidden === true;
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState('');

  const itemRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEditing = () => {
    const currentName = (shape?.meta as any)?.name || shape?.type || '';
    setEditingName(currentName);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!shape || !editingName.trim()) {
      setIsEditing(false);
      return;
    }

    editor.updateShape({
      id: shapeId,
      type: shape.type,
      meta: {
        ...shape.meta,
        name: editingName.trim(),
      },
    });

    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingName('');
  };

  useEffect(() => {
    const updateState = () => {
      const currentShape = editor.getShape(shapeId);
      if (!currentShape) {
        setShape(null);
        return;
      }

      setShape(currentShape);

      try {
        const newIds = editor.getSortedChildIdsForParent(shapeId);
        setChildIds((prev) => {
          if (prev.length === newIds.length && prev.every((id, i) => id === newIds[i])) {
            return prev;
          }
          return newIds;
        });
      } catch {
        // Parent might not exist
      }

      setIsSelected(editor.getSelectedShapeIds().includes(shapeId));

      const meta = currentShape.meta as any;
      setIsHidden(meta?.hidden === true);
    };

    updateState();

    const unsubscribe = editor.store.listen(updateState, {
      source: 'user',
      scope: 'document',
    });

    const handleEvent = (event: { type: string; shapes?: TLShapeId[]; shapeIds?: TLShapeId[] }) => {
      if (event.type === 'select' || event.type === 'update-shape') {
        const affectedIds = event.shapes || event.shapeIds || [];
        if (affectedIds.length === 0 || affectedIds.includes(shapeId)) {
          updateState();
        }
      }
    };

    editor.on('event', handleEvent);

    return () => {
      unsubscribe();
      editor.off('event', handleEvent);
    };
  }, [editor, shapeId]);

  if (!shape) return null;

  const hasChildren = childIds.length > 0;
  const isDragging = dragState?.draggedShapeId === shapeId;
  const isDragOverBefore = dragOverId?.id === shapeId && dragOverId.position === 'before';
  const isDragOverAfter = dragOverId?.id === shapeId && dragOverId.position === 'after';
  const isDragOverInside = dragOverId?.id === shapeId && dragOverId.position === 'inside';
  const canDropInside = hasChildren && (shape.type === 'group' || shape.type === 'frame');

  return (
    <>
      {/* Drop zone before this item */}
      {dragState && !isDragging && (
        <div
          className={`page-panel-drop-zone ${isDragOverBefore ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onDragOver={(e) => {
            e.preventDefault();
            onDragOver(shapeId, 'before');
          }}
          onDragLeave={onDragLeave}
          onDrop={(e) => {
            e.preventDefault();
            if (dragState) {
              // Will be handled by parent
            }
          }}
        />
      )}

      <div className={`page-panel-item ${isDragging ? 'dragging' : ''}`} ref={itemRef}>
        <div
          className={`page-panel-item-content ${isSelected ? 'selected' : ''} ${isHidden ? 'hidden' : ''} ${isExpanded && hasChildren ? 'expanded' : ''} ${isDragOverInside ? 'drag-over-inside' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          draggable={!isDragging && !isEditing}
          onDragStart={(e) => {
            if (isDragging || isEditing) return;
            e.dataTransfer.effectAllowed = 'move';
            onDragStart(shapeId, parentId);
          }}
          onDragEnd={() => {
            onDragEnd();
          }}
          onDragOver={(e) => {
            if (!dragState || isDragging) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const rect = itemRef.current?.getBoundingClientRect();
            if (!rect) return;

            const y = e.clientY - rect.top;
            const height = rect.height;
            const canDrop = canDropInside;

            if (canDrop && y < height * 0.3) {
              onDragOver(shapeId, 'before');
            } else if (canDrop && y > height * 0.7) {
              onDragOver(shapeId, 'after');
            } else if (canDrop) {
              onDragOver(shapeId, 'inside');
            } else if (y < height / 2) {
              onDragOver(shapeId, 'before');
            } else {
              onDragOver(shapeId, 'after');
            }
          }}
          onDragLeave={onDragLeave}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragState && !isDragging) {
              const rect = itemRef.current?.getBoundingClientRect();
              if (!rect) return;

              const y = e.clientY - rect.top;
              const height = rect.height;
              const canDrop = canDropInside;

              let position: 'before' | 'after' | 'inside';
              if (canDrop && y < height * 0.3) {
                position = 'before';
              } else if (canDrop && y > height * 0.7) {
                position = 'after';
              } else if (canDrop) {
                position = 'inside';
              } else if (y < height / 2) {
                position = 'before';
              } else {
                position = 'after';
              }

              onDrop(dragState.draggedShapeId, shapeId, position);
              onDragEnd();
            }
          }}
          onClick={(e) => {
            if (isEditing) return;

            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              const currentSelection = editor.getSelectedShapeIds();
              if (currentSelection.includes(shapeId)) {
                editor.setSelectedShapes(currentSelection.filter(id => id !== shapeId));
              } else {
                editor.setSelectedShapes([...currentSelection, shapeId]);
              }
            } else {
              if (hasChildren) {
                setIsExpanded(!isExpanded);
              }
              editor.setSelectedShapes([shapeId]);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onContextMenu) {
              const selectedIds = editor.getSelectedShapeIds();
              // If this shape is already selected, use current selection
              // Otherwise, select this shape first
              if (selectedIds.includes(shapeId)) {
                // Use current selection (might be 2+ items)
                onContextMenu(e, selectedIds);
              } else {
                // Select this shape and check if we now have 2+ selected
                const newSelection = [...selectedIds, shapeId];
                editor.setSelectedShapes(newSelection);
                onContextMenu(e, newSelection);
              }
            }
          }}
        >
          {hasChildren && (
            <span className="page-panel-item-expander">
              <ChevronDown
                size={12}
                strokeWidth={2}
                style={{
                  transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.15s ease',
                }}
              />
            </span>
          )}
          {!hasChildren && <span className="page-panel-item-spacer" />}
          <span className="page-panel-item-icon" style={{ display: 'flex', alignItems: 'center', color: '#6b7280' }}>
            {getShapeIcon(shape.type, 14)}
          </span>
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveEdit();
                } else if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="page-panel-item-input"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '11px',
                fontWeight: 500,
                color: '#1e293b',
                padding: '0 4px',
                margin: '0',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <span
              className="page-panel-item-label"
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleStartEditing();
              }}
            >
              {(shape.meta as any)?.name || shape.type}
            </span>
          )}
          <button
            className="page-panel-item-toggle"
            onClick={(e) => {
              e.stopPropagation();
              const currentShape = editor.getShape(shapeId);
              if (!currentShape) return;
              
              const newHiddenValue = !isHidden;
              
              editor.updateShape({
                id: shapeId,
                type: currentShape.type,
                meta: {
                  ...currentShape.meta,
                  hidden: newHiddenValue,
                },
              });
              
              setIsHidden(newHiddenValue);
            }}
            title={isHidden ? 'Show' : 'Hide'}
          >
            {isHidden ? '👁️' : '👁️‍🗨️'}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <PagesListWithDragDrop 
            shapeIds={childIds} 
            depth={depth + 1} 
            editor={editor} 
            parentId={shapeId}
            onContextMenu={onContextMenu}
          />
        )}
      </div>

      {/* Drop zone after this item */}
      {dragState && !isDragging && isDragOverAfter && (
        <div 
          className="page-panel-drop-zone active" 
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragState) {
              onDrop(dragState.draggedShapeId, shapeId, 'after');
              onDragEnd();
            }
          }}
        />
      )}

    </>
  );
}

