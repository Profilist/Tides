import React from 'react';
import { 
  Type, 
  Square,
  PenTool,
  Image as ImageIcon,
  LayoutTemplate,
  Code2,
  Layers
} from 'lucide-react';
import type { TLShape } from 'tldraw';

export const getShapeIcon = (type: string, size: number = 12) => {
  switch (type) {
    case 'text':
      return <Type size={size} />;
    case 'geo':
      return <Square size={size} />;
    case 'draw':
      return <PenTool size={size} />;
    case 'arrow':
      return <PenTool size={size} />;
    case 'image':
      return <ImageIcon size={size} />;
    case 'frame':
    case 'group':
      return <LayoutTemplate size={size} />;
    case 'html_preview':
      return <Code2 size={size} />;
    default:
      return <Layers size={size} />;
  }
};

export const getShapeName = (shape: TLShape): string => {
  if (shape.type === 'text' && (shape as any).props?.text) {
    const text = (shape as any).props.text;
    if (typeof text === 'string') {
      return text || 'Text';
    }
    if (text && typeof text === 'object') {
      const textContent = (text as any).toString?.() || 'Text';
      return textContent.substring(0, 30) || 'Text';
    }
    return 'Text';
  }
  if (shape.type === 'html_preview') {
    return 'HTML Preview';
  }
  return shape.type.charAt(0).toUpperCase() + shape.type.slice(1);
};
