import React, { useState } from 'react';
import { Sparkles, Terminal, CheckCircle2, Code2, Maximize2, ArrowUp, Video, Gauge, User } from 'lucide-react';
import type { SelectedShape, ChatContextShape } from '../../types';
import { getShapeIcon } from '../../utils/shapeUtils';
import { ContextPill } from '../../../src/components/common/ContextPill';
import { ActionSuggestion } from '../../../src/components/common/ActionSuggestion';
import { IconButton } from '../../../src/components/common/IconButton';
import { CopyButton } from '../../../src/components/common/CopyButton';

type ContextMode = 'presentation' | 'performance' | 'team' | null;

interface ChatPanelProps {
  selectedShapes: SelectedShape[];
  chatContextShapes: ChatContextShape[];
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
  onClearSelection: () => void;
  onGenerateSuggestion: () => void;
  isGeneratingSuggestion: boolean;
  suggestionError: string | null;
}

export function ChatPanel({
  selectedShapes,
  chatContextShapes,
  isTyping,
  setIsTyping,
  onClearSelection,
  onGenerateSuggestion,
  isGeneratingSuggestion,
  suggestionError,
}: ChatPanelProps) {
  const [contextMode, setContextMode] = useState<ContextMode>(null);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="mt-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-6 w-6 rounded flex items-center justify-center overflow-hidden">
              <img src="/Amp.jpeg" alt="AMP" className="h-full w-full object-cover" />
            </div>
            <span className="text-sm font-semibold text-slate-900">AMP</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {selectedShapes.length > 0 ? (
              <>
                I have context on{' '}
                {selectedShapes.map((shape, idx) => (
                  <React.Fragment key={shape.id}>
                    <span className="font-mono text-slate-700 bg-slate-100 px-1 rounded">
                      @{shape.name}
                    </span>
                    {idx < selectedShapes.length - 1 && ', '}
                  </React.Fragment>
                ))}
                . Ask me to generate React code, check accessibility, or suggest variants.
              </>
            ) : (
              <>
                Select a shape on the canvas to get context-aware assistance. Ask me to generate
                React code, check accessibility, or suggest variants.
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          <ActionSuggestion
            label={isGeneratingSuggestion ? 'Generating UI preview...' : 'Generate UI Preview'}
            icon={<Sparkles size={12} />}
            onClick={onGenerateSuggestion}
            disabled={isGeneratingSuggestion}
          />
          <ActionSuggestion label="Generate Tailwind Props" icon={<Terminal size={12} />} />
          <ActionSuggestion label="Audit Accessibility (A11y)" icon={<CheckCircle2 size={12} />} />
        </div>
        {suggestionError && (
          <div className="text-xs text-red-500">{suggestionError}</div>
        )}

        <div className="flex flex-col items-end gap-1">
          <div className="bg-slate-100 text-slate-800 text-sm px-3 py-2 rounded-2xl rounded-tr-sm max-w-[90%]">
            Make this button responsive and add a loading state.
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-[#1e61f0]" />
            <span className="text-xs font-medium text-slate-500">Generating suggestions...</span>
          </div>
          <div className="text-sm text-slate-800 leading-relaxed space-y-2">
            <p>
              I've updated the button with{' '}
              <span className="text-[#1e61f0] font-mono text-xs">w-full</span> for mobile and a
              standardized loading spinner.
            </p>

            <div className="rounded border border-slate-200 bg-slate-50 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-100">
                <span className="text-[10px] font-mono text-slate-500">Button.tsx</span>
                <CopyButton />
              </div>
              <div className="p-3 font-mono text-[10px] text-slate-600 overflow-x-auto">
                <span className="text-purple-600">const</span> Button = ({'{'} isLoading, ...props{'}'}) ={'>'} (
                <br />
                &nbsp;&nbsp;&lt;<span className="text-emerald-600">button</span> className="
                <span className="text-amber-600">w-full md:w-auto...</span>
                "&gt;
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;{'{'}isLoading ? &lt;Spinner /&gt; : children{'}'}
                <br />
                &nbsp;&nbsp;&lt;/<span className="text-emerald-600">button</span>&gt;
                <br />)
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-3 bg-white border-t border-slate-200 z-10">
        <div
          className={`
            relative flex flex-col rounded-lg border bg-white shadow-sm transition-all
            ${isTyping ? 'border-[#1e61f0] ring-1 ring-[#1e61f0]/20' : 'border-slate-300'}
          `}
        >
          {chatContextShapes.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 flex-wrap">
              {chatContextShapes.map((shape) => (
                <ContextPill
                  key={shape.id}
                  shape={shape}
                  icon={getShapeIcon(shape.type, 12)}
                  onRemove={onClearSelection}
                />
              ))}
            </div>
          )}

          <div className="relative">
            <textarea
              rows={1}
              className="w-full resize-none bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none min-h-[44px]"
              placeholder="Ask about styles, logic, or accessibility..."
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
            />
          </div>

          <div className="flex justify-between items-center px-2 pb-2 pt-1">
            <div className="flex gap-0.5">
              <IconButton icon={<Code2 size={14} />} />
              <IconButton icon={<Maximize2 size={14} />} />
            </div>

            <div className="flex gap-0.5 items-center">
              {/* Context Mode Icons - Cursor Style */}
              <button
                onClick={() => setContextMode(contextMode === 'presentation' ? null : 'presentation')}
                className={`
                  p-1.5 rounded transition-colors
                  ${contextMode === 'presentation'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }
                `}
                title="Presentation Mode"
              >
                <Video size={14} strokeWidth={2} />
              </button>
              <button
                onClick={() => setContextMode(contextMode === 'performance' ? null : 'performance')}
                className={`
                  p-1.5 rounded transition-colors
                  ${contextMode === 'performance'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }
                `}
                title="Performance"
              >
                <Gauge size={14} strokeWidth={2} />
              </button>
              <button
                onClick={() => setContextMode(contextMode === 'team' ? null : 'team')}
                className={`
                  p-1.5 rounded transition-colors
                  ${contextMode === 'team'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }
                `}
                title="Team"
              >
                <User size={14} strokeWidth={2} />
              </button>

              <div className="w-px h-5 bg-slate-200 mx-1" />

              {/* Prominent Send Button */}
              <button
                className="p-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                title="Send message"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
        <div className="text-[10px] text-center text-slate-400 mt-2">
          AI can make mistakes. Verify generated code.
        </div>
      </div>
    </>
  );
}
