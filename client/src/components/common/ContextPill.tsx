import React from 'react';
import { X } from 'lucide-react';

interface ContextPillProps {
  shape: { id: string; name: string; type: string };
  icon: React.ReactNode;
  onRemove: () => void;
}

export function ContextPill({ shape, icon, onRemove }: ContextPillProps) {
  return (
    <span className="inline-flex items-center gap-1 group rounded-full pl-1 pr-1.5 py-0.5 text-[11px] font-normal bg-slate-100/60 text-slate-600 hover:bg-slate-200/60 transition-colors cursor-default">
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemove();
        }}
        className="relative flex items-center justify-center w-3.5 h-3.5 transition-all text-slate-500 group-hover:text-slate-600 flex-shrink-0"
        title="Remove"
        type="button"
      >
        <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 opacity-100 group-hover:opacity-0">
          {icon}
        </span>
        <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 opacity-0 group-hover:opacity-100">
          <X size={11} strokeWidth={2.5} />
        </span>
      </button>
      <span className="text-slate-600 whitespace-nowrap">{shape.name}</span>
    </span>
  );
}
