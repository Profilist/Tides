import React from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';
import { HtmlPreviewShapeUtil } from '../../shapes/HtmlPreviewShapeUtil';

interface CanvasProps {
  onMount: (editor: Editor) => void;
}

export function Canvas({ onMount }: CanvasProps) {
  return (
    <main className="relative flex-1 bg-[#F3F4F6] overflow-hidden min-w-0">
      <div className="absolute inset-0">
        <Tldraw onMount={onMount} shapeUtils={[HtmlPreviewShapeUtil]} />
      </div>
    </main>
  );
}
