import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Code2,
  Maximize2,
  ArrowUp,
  Video,
  Gauge,
  User,
  Loader2,
  Check,
} from 'lucide-react';
import type {
  SelectedShape,
  ChatContextShape,
  PersonaImpact,
  Issue,
  ChatMessage,
  ChatEvidenceItem,
  ChatRequest,
  ChatResponse,
} from '../../types';
import { getShapeIcon } from '../../utils/shapeUtils';
import { ContextPill } from '../../../src/components/common/ContextPill';
import { IconButton } from '../../../src/components/common/IconButton';

type ContextMode = 'presentation' | 'performance' | 'team' | null;

interface ChatPanelProps {
  selectedShapes: SelectedShape[];
  chatContextShapes: ChatContextShape[];
  selectedIssue: Issue | null;
  suggestionContext: {
    html?: string;
    summary?: string | null;
  } | null;
  suggestionMessage: ChatMessage | null;
  onSuggestionUpdate: (html: string, changeSummary?: string[]) => void;
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

export function ChatPanel({
  selectedShapes,
  chatContextShapes,
  selectedIssue,
  suggestionContext,
  suggestionMessage,
  onSuggestionUpdate,
  isTyping,
  setIsTyping,
  onClearSelection,
  onGenerateSuggestion,
  isGeneratingSuggestion,
  suggestionError,
  personaImpacts,
  personaImpactStatus,
  personaImpactError,
}: ChatPanelProps) {
  const [contextMode, setContextMode] = useState<ContextMode>(null);
  const [progress, setProgress] = useState<number[]>([0, 0, 0, 0]);
  const [activePersonaIndex, setActivePersonaIndex] = useState<number | null>(null);
  const [animationActive, setAnimationActive] = useState(false);
  const prevGeneratingRef = useRef(isGeneratingSuggestion);
  const [phraseIndices, setPhraseIndices] = useState<number[]>([0, 0, 0, 0]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const lastIssueIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastSuggestionMessageIdRef = useRef<string | null>(null);

  const personaAgents = useMemo(() => Array.from({ length: 4 }, (_, index) => index), []);
  const phrases = useMemo(
    () => [
      'Shopping for sneakers...',
      'Comparing cart totals...',
      'Browsing new arrivals...',
      'Checking size availability...',
      'Reviewing return policy...',
      'Applying a promo code...',
      'Switching to mobile view...',
      'Saving items for later...',
      'Scanning product details...',
      'Exploring color options...',
      'Looking for free shipping...',
      'Finishing checkout flow...',
      'Looking for gift ideas...',
      'Sorting by best sellers...',
      'Filtering by price range...',
      'Rechecking product reviews...',
      'Comparing material details...',
      'Picking a favorite colorway...',
      'Checking stock in store...',
      'Skimming delivery timelines...',
      'Reviewing payment options...',
      'Editing the shopping bag...',
      'Verifying size guide...',
      'Hunting for limited drops...',
      'Confirming order total...',
      'Scanning for bundle deals...',
      'Comparing fit notes...',
      'Saving for a future sale...',
      'Testing a wishlist flow...',
      'Browsing editorial picks...',
      'Searching for seasonal items...',
      'Reviewing shipping address...',
      'Confirming tax estimate...',
      'Checking loyalty points...',
      'Exploring recommended items...',
      'Reviewing product images...',
      'Zooming into details...',
      'Comparing similar styles...',
      'Checking availability by size...',
      'Reviewing care instructions...',
      'Completing account sign-up...',
      'Comparing shipping speeds...',
      'Validating discount eligibility...',
      'Inspecting cart line items...',
      'Evaluating fit for occasion...',
      'Testing add-to-cart flow...',
      'Reviewing exchange policy...',
      'Scanning for cross-sells...',
      'Comparing color swatches...',
      'Revisiting saved items...',
      'Reviewing order summary...',
      'Finalizing payment method...',
    ],
    [],
  );

  const createMessageId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  useEffect(() => {
    const nextIssueId = selectedIssue?.id ?? null;
    if (lastIssueIdRef.current !== nextIssueId) {
      setMessages([]);
      setChatError(null);
      lastIssueIdRef.current = nextIssueId;
      lastSuggestionMessageIdRef.current = null;
    }
  }, [selectedIssue?.id]);

  useEffect(() => {
    if (!suggestionMessage?.id || suggestionMessage.id === lastSuggestionMessageIdRef.current) {
      return;
    }
    setMessages((prev) => [...prev, suggestionMessage]);
    lastSuggestionMessageIdRef.current = suggestionMessage.id;
  }, [suggestionMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current;
    if (!wasGenerating && isGeneratingSuggestion) {
      setProgress([0, 0, 0, 0]);
      setPhraseIndices([0, 0, 0, 0]);
      setAnimationActive(true);
    }
    prevGeneratingRef.current = isGeneratingSuggestion;
  }, [isGeneratingSuggestion]);

  useEffect(() => {
    if (!animationActive) {
      return;
    }
    const startTime = Date.now();
    const durations = [5000, 5600, 6200, 6800];
    const offsets = [0, 600, 1200, 1800];
    let timer: number | null = window.setInterval(() => {
      const now = Date.now();
      setProgress((prev) => {
        const next = prev.map((value, index) => {
          const elapsed = now - startTime - offsets[index];
          if (elapsed <= 0) {
            return value;
          }
          const ratio = Math.min(1, elapsed / durations[index]);
          return Math.max(value, Math.round(ratio * 100));
        });
        const allDone = next.every((value) => value >= 100);
        if (allDone && timer) {
          window.clearInterval(timer);
          timer = null;
          setAnimationActive(false);
        }
        return next;
      });
    }, 200);
    let phraseTimer: number | null = window.setInterval(() => {
      setPhraseIndices((prev) =>
        prev.map((value, index) => (value + 1 + index) % phrases.length),
      );
    }, 1200);
    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
      if (phraseTimer) {
        window.clearInterval(phraseTimer);
      }
    };
  }, [animationActive, phrases.length]);

  const canSend = Boolean(inputValue.trim()) && !isSending && Boolean(selectedIssue);

  const handleSend = async () => {
    if (!selectedIssue || !inputValue.trim() || isSending) {
      return;
    }
    const content = inputValue.trim();
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsSending(true);
    setChatError(null);

    try {
      const payload: ChatRequest = {
        message: content,
        context: {
          suggestionHtml: suggestionContext?.html,
          suggestionSummary: suggestionContext?.summary ?? null,
        },
      };
      const response = await fetch(`/api/issues/${selectedIssue.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Request failed (${response.status}): ${details.slice(0, 200)}`);
      }
      const data = (await response.json()) as ChatResponse;
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: data.reply?.content ?? 'Thanks for the question. Let me dig into that.',
        timestamp: new Date().toISOString(),
        evidence: data.reply?.evidence ?? [],
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (typeof data.updatedHtml === 'string' && data.updatedHtml.trim()) {
        onSuggestionUpdate(data.updatedHtml, data.changeSummary);
      }
    } catch (error) {
      console.error('Failed to send chat message', error);
      setChatError(
        error instanceof Error ? error.message : 'Failed to send message. Try again.',
      );
    } finally {
      setIsSending(false);
    }
  };

  const renderEvidence = (item: ChatEvidenceItem) => {
    switch (item.type) {
      case 'metric':
        return (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{item.title}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-slate-900">{item.value}</span>
              {item.delta && (
                <span className="text-[10px] text-slate-500 font-medium">{item.delta}</span>
              )}
            </div>
            {item.caption && <div className="mt-1 text-[10px] text-slate-400">{item.caption}</div>}
          </div>
        );
      case 'event_sample':
        return (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{item.title}</div>
            <ul className="mt-1 space-y-1">
              {item.events.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-slate-500">{event.id}</span>
                  <span className="text-[10px] text-slate-400">{event.label ?? event.timestamp}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      case 'note':
        return (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{item.title}</div>
            <div className="mt-1 text-[11px] text-slate-600">{item.body}</div>
          </div>
        );
      default:
        return null;
    }
  };

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

        {suggestionError && (
          <div className="text-xs text-red-500">{suggestionError}</div>
        )}

        <div className="flex flex-col items-end gap-2">
          <div className="bg-slate-100 text-slate-800 text-sm px-3 py-2 rounded-2xl rounded-tr-sm max-w-[90%]">
            Would you like to see suggested changes?
          </div>
          <button
            type="button"
            onClick={onGenerateSuggestion}
            disabled={isGeneratingSuggestion}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isGeneratingSuggestion
                ? 'border-slate-200 text-slate-400 bg-slate-100 cursor-not-allowed'
                : 'border-[#1e61f0]/30 text-[#1e61f0] bg-[#1e61f0]/5 hover:bg-[#1e61f0]/10'
            }`}
          >
            <Sparkles size={12} />
            {isGeneratingSuggestion ? 'Generating UI preview...' : 'Generate UI Preview'}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {selectedIssue ? (
            <>
              {messages.length === 0 && (
                <div>
                  {/* Ask about the selected issue or the UI changes. */}
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className="space-y-2 max-w-[90%]">
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm ${
                        message.role === 'user'
                          ? 'bg-slate-900 text-white rounded-tr-sm'
                          : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                      }`}
                    >
                      {message.content}
                    </div>
                    {message.role === 'assistant' && message.evidence && message.evidence.length > 0 && (
                      <div className="grid gap-2">
                        {message.evidence.map((item, index) => (
                          <div key={`${message.id}-${index}`}>{renderEvidence(item)}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 size={12} className="animate-spin" />
                  AMP is drafting a response...
                </div>
              )}
              {chatError && <div className="text-xs text-rose-500">{chatError}</div>}
              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="text-xs text-slate-400">Select an issue to start chatting.</div>
          )}
        </div>

        <div className="space-y-2">
          <div className="w-full max-w-[280px] rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
            {personaAgents.map((index) => {
              const percent = progress[index] ?? 0;
              const isDone = percent >= 100;
              const isRunning = animationActive && !isDone;
              const phrase = phrases[phraseIndices[index] ?? 0] ?? phrases[0];
              const rowClasses = isRunning
                ? 'relative bg-[#C1E0FE]/10 px-3 py-2.5'
                : 'px-3 py-2.5 border-b border-slate-50';

              return (
                <button
                  key={`persona-agent-${index + 1}`}
                  type="button"
                  onClick={() => setActivePersonaIndex(index)}
                  className={`w-full text-left ${rowClasses}`}
                >
                  {isRunning ? (
                    <>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2.5">
                          <div className="text-[#1E61F0]">
                            <User size={14} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-[#0D1F91]">
                              Persona Agent {index + 1}
                            </span>
                          </div>
                        </div>
                        <Loader2 size={12} className="text-[#1E61F0] animate-spin" />
                      </div>
                      <div className="flex justify-between items-center pl-[26px]">
                        <span className="text-[10px] text-slate-500 font-medium truncate max-w-[140px]">
                          {phrase}
                        </span>
                        <span className="text-[10px] font-mono text-[#1E61F0] opacity-80">
                          {percent}%
                        </span>
                      </div>
                      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#C1E0FE]/50">
                        <div
                          className="h-full bg-[#1E61F0] transition-all duration-700 ease-out"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center text-[#0F4F73]">
                          <User size={14} className="opacity-80" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-600">
                            Persona Agent {index + 1}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400">
                          {isDone ? 'Done' : ''}
                        </span>
                        {isDone ? (
                          <Check size={12} className="text-[#0F4F73]" strokeWidth={2.5} />
                        ) : (
                          <span className="text-[10px] font-mono text-[#1E61F0] opacity-80">
                            {percent}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {personaImpactStatus === 'idle' && (
            <div className="text-xs text-slate-400">Run a suggestion to see persona impacts.</div>
          )}
          {(personaImpactStatus === 'pending' || personaImpactStatus === 'running') && (
            <div className="text-xs text-slate-400">Loading persona impacts...</div>
          )}
          {personaImpactStatus === 'error' && (
            <div className="text-xs text-rose-500">
              Failed to load persona impacts{personaImpactError ? `: ${personaImpactError}` : '.'}
            </div>
          )}
          {personaImpactStatus === 'done' && personaImpacts.length === 0 && (
            <div className="text-xs text-slate-400">No persona impacts returned.</div>
          )}
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
              placeholder={
                selectedIssue
                  ? 'Ask about the issue or UI changes...'
                  : 'Select an issue to start chatting...'
              }
              value={inputValue}
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
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
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
                className={`p-1.5 rounded transition-colors ${
                  canSend
                    ? 'bg-slate-900 text-white hover:bg-slate-700'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
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
      {activePersonaIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          {(() => {
            const persona = personaImpacts[activePersonaIndex] ?? null;
            return (
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {persona?.personaName ?? `Persona Agent ${activePersonaIndex + 1}`}
                </div>
                <div className="text-xs text-slate-500">
                  {persona ? 'Persona details' : 'Persona details not available yet'}
                </div>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => setActivePersonaIndex(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="px-4 py-4 space-y-4 text-sm text-slate-600">
              {persona ? (
                <>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Summary</div>
                    <div className="mt-1">{persona.summary}</div>
                  </div>
                  {persona.signals.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Signals</div>
                      <ul className="mt-1 list-disc list-inside text-slate-500 space-y-1">
                        {persona.signals.map((signal) => (
                          <li key={signal}>{signal}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-slate-500">
                  Run “Generate UI Preview” to populate persona insights.
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 text-right">
              <button
                type="button"
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
                onClick={() => setActivePersonaIndex(null)}
              >
                Close
              </button>
            </div>
          </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
