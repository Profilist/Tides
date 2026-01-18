import { CheckCircle2 } from 'lucide-react';

export function CopyButton() {
  return (
    <button className="text-[10px] text-slate-400 hover:text-[#1e61f0] font-medium flex items-center gap-1 transition-colors">
      <CheckCircle2 size={10} />
      Copy
    </button>
  );
}
