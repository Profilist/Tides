import React from 'react';

interface IconButtonProps {
  icon: React.ReactNode;
}

export function IconButton({ icon }: IconButtonProps) {
  return (
    <button className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
      {icon}
    </button>
  );
}
