import React from 'react';
import { ChevronRight } from 'lucide-react';

interface ActionSuggestionProps {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function ActionSuggestion({ label, icon, onClick, disabled }: ActionSuggestionProps) {
  return (
    <button
      className={`
        flex items-center gap-2 w-full p-2 rounded border border-slate-200 bg-white
        transition-all text-left group shadow-sm
        ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-[#1e61f0] hover:bg-slate-50'}
      `}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="text-slate-400 group-hover:text-[#1e61f0] transition-colors">{icon}</span>
      <span className="text-xs font-medium text-slate-600 group-hover:text-slate-900">{label}</span>
      <ChevronRight size={12} className="ml-auto text-slate-300 group-hover:text-[#1e61f0]" />
    </button>
  );
}
