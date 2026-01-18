import { X, Sparkles } from 'lucide-react';
import { DetailsPanel } from './DetailsPanel';
import { ChatPanel } from './ChatPanel';
import type { SelectedShape, ChatContextShape, Issue, PersonaImpact } from '../../types/index';

type TabType = 'details' | 'chat';

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedIssue: Issue | null;
  issuesError: string | null;
  selectedShapes: SelectedShape[];
  chatContextShapes: ChatContextShape[];
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
  onClearSelection: () => void;
  onGenerateSuggestion: () => void;
  isGeneratingSuggestion: boolean;
  suggestionError: string | null;
  personaImpacts: PersonaImpact[];
  personaImpactStatus: 'idle' | 'pending' | 'running' | 'done' | 'error';
  personaImpactError: string | null;
}

export function RightSidebar({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  selectedIssue,
  issuesError,
  selectedShapes,
  chatContextShapes,
  isTyping,
  setIsTyping,
  onClearSelection,
  onGenerateSuggestion,
  isGeneratingSuggestion,
  suggestionError,
  personaImpacts,
  personaImpactStatus,
  personaImpactError,
}: RightSidebarProps) {
  return (
    <aside
      className={`
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        lg:translate-x-0
        fixed lg:static
        inset-y-0 right-0 z-30
        w-full sm:w-[320px] shrink-0
        border-l border-slate-200 bg-white
        flex flex-col
        transition-transform duration-200 ease-in-out
      `}
    >
      {/* Elegant Tab Navigation */}
      <div className="flex items-center justify-between gap-1 px-3 py-2.5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-1 flex-1">
          <button
            onClick={() => onTabChange('details')}
            className={`
              flex-1 relative px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200
              ${activeTab === 'details'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
              }
            `}
          >
            Details
          </button>
          <button
            onClick={() => onTabChange('chat')}
            className={`
              flex-1 relative px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-200 flex items-center justify-center gap-1
              ${activeTab === 'chat'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
              }
            `}
          >
            <Sparkles size={11} className={activeTab === 'chat' ? 'text-[#1e61f0]' : 'text-slate-400'} />
            <span>Ask AMP</span>
          </button>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative flex flex-col">
        {activeTab === 'details' && (
          <DetailsPanel issue={selectedIssue} issuesError={issuesError} />
        )}
        {activeTab === 'chat' && (
          <ChatPanel
            selectedShapes={selectedShapes}
            chatContextShapes={chatContextShapes}
            isTyping={isTyping}
            setIsTyping={setIsTyping}
            onClearSelection={onClearSelection}
            onGenerateSuggestion={onGenerateSuggestion}
            isGeneratingSuggestion={isGeneratingSuggestion}
            suggestionError={suggestionError}
            personaImpacts={personaImpacts}
            personaImpactStatus={personaImpactStatus}
            personaImpactError={personaImpactError}
          />
        )}
      </div>
    </aside>
  );
}
