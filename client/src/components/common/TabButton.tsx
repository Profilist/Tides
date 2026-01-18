import React from 'react';

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}

export function TabButton({ label, active, onClick, icon }: TabButtonProps) {
  return (
    <button 
      onClick={onClick}
      className={`
        flex-1 flex items-center justify-center gap-1 sm:gap-1.5 pb-2 text-[10px] sm:text-xs font-semibold border-b-2 transition-colors px-1
        ${active 
          ? 'border-[#1e61f0] text-[#1e61f0]' 
          : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-t-sm'
        }
      `}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
