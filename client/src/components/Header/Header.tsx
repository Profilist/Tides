import { useState, useRef, useEffect } from 'react';
import { CheckCircle2, Share2, Play } from 'lucide-react';

interface HeaderProps {
  hasSuggestion: boolean;
  onPlaySuggestion: () => void;
}

export function Header({ hasSuggestion, onPlaySuggestion }: HeaderProps) {
  const [projectName, setProjectName] = useState('AmpliClo');
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEditing = () => {
    setEditingName(projectName);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editingName.trim()) {
      setProjectName(editingName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingName('');
  };

  return (
    <header className="flex items-center justify-between h-12 shrink-0 border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <img src="/logo.png" alt="Tides" className="h-7 w-7 rounded" />
          <span className="hover:text-slate-900 cursor-pointer transition-colors">Tides</span>
          <span className="text-slate-300">/</span>
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
              className="text-slate-900 bg-transparent border-b border-slate-300 focus:border-slate-900 outline-none px-1 py-0.5"
              style={{ width: `${Math.max(editingName.length, 8)}ch` }}
            />
          ) : (
            <span
              className="text-slate-900 cursor-text hover:text-slate-700 transition-colors"
              onDoubleClick={handleStartEditing}
              title="Double-click to rename"
            >
              {projectName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded-full border border-slate-100">
          <CheckCircle2 size={11} className="text-emerald-500" />
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Saved</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm">
          <Share2 size={13} />
          <span>Share</span>
        </button>
        <button
          type="button"
          onClick={onPlaySuggestion}
          disabled={!hasSuggestion}
          className={`flex items-center justify-center rounded-md border px-2 py-1.5 transition-colors ${
            hasSuggestion
              ? 'border-slate-200 text-slate-600 hover:bg-slate-50'
              : 'border-slate-100 text-slate-300 cursor-not-allowed'
          }`}
          title={hasSuggestion ? 'Open suggested UI in new tab' : 'No suggested UI yet'}
          aria-label="Open suggested UI in new tab"
        >
          <Play size={13} fill="currentColor" />
        </button>
      </div>
    </header>
  );
}
