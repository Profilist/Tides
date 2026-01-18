import { useRef, useCallback, useEffect, useState } from 'react';
import type { Editor } from 'tldraw';
import type { SelectedShape, ChatContextShape } from '../types';
import { getShapeName } from '../utils/shapeUtils';

export const useEditor = (
  setSelectedShapes: (shapes: SelectedShape[]) => void,
  setChatContextShapes: (shapes: ChatContextShape[]) => void
) => {
  const editorRef = useRef<Editor | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const updateLayersAndSelection = useCallback((editor: Editor) => {

    const selectedShapeIds = editor.getSelectedShapeIds();
    
    if (selectedShapeIds.length > 0) {
      const shapes = selectedShapeIds.map(id => {
        try {
          const shape = editor.getShape(id);
          if (!shape) return null;

          return {
            id: shape.id,
            type: shape.type,
            name: getShapeName(shape)
          };
        } catch {
          return null;
        }
      }).filter(Boolean) as SelectedShape[];
      
      setSelectedShapes(shapes);
      
      let contextShape = shapes[0];
      const groupOrFrame = shapes.find(s => s.type === 'group' || s.type === 'frame');
      if (groupOrFrame) {
        contextShape = groupOrFrame;
      }
      
      if (contextShape?.name) {
        setChatContextShapes([{
          id: contextShape.id,
          type: contextShape.type,
          name: contextShape.name
        }]);
      } else {
        setChatContextShapes([]);
      }
    } else {
      setSelectedShapes([]);
      setChatContextShapes([]);
    }
  }, [setSelectedShapes, setChatContextShapes]);

  const handleEditorMount = useCallback((editorInstance: Editor) => {
    editorRef.current = editorInstance;
    setEditor(editorInstance);

    if (cleanupRef.current) {
      cleanupRef.current();
    }

    const storeCleanup = editorInstance.store.listen(() => {
      updateLayersAndSelection(editorInstance);
    });

    cleanupRef.current = () => {
      storeCleanup();
    };

    updateLayersAndSelection(editorInstance);
  }, [updateLayersAndSelection]);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return { editorRef, editor, handleEditorMount };
};
