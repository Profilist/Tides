import React, { useEffect, useState } from 'react';
import type { Editor, TLShapeId } from 'tldraw';
import { PanelLeft, PanelRight } from 'lucide-react';
import { Header } from './components/Header/Header';
import { LeftSidebar } from './components/LeftSidebar/LeftSidebar';
import { RightSidebar } from './components/RightSidebar/RightSidebar';
import { Canvas } from './components/Canvas/Canvas';
import { useEditor } from './hooks/useEditor';
import { useResponsiveSidebars } from './hooks/useResponsiveSidebars';
import type { LayerNode, SelectedShape, ChatContextShape, PersonaImpact } from './types';
import { HTML_PREVIEW_TYPE } from './shapes/HtmlPreviewShapeUtil';

const USE_LOCAL_SUGGESTION = true;

export default function DesignPlatformUI() {
  const [activeTab, setActiveTab] = useState<'inspect' | 'chat'>('chat');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedShapes, setSelectedShapes] = useState<SelectedShape[]>([]);
  const [chatContextShapes, setChatContextShapes] = useState<ChatContextShape[]>([]);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [personaImpactJobId, setPersonaImpactJobId] = useState<string | null>(null);
  const [personaImpacts, setPersonaImpacts] = useState<PersonaImpact[]>([]);
  const [personaImpactStatus, setPersonaImpactStatus] = useState<
    'idle' | 'pending' | 'running' | 'done' | 'error'
  >('idle');
  const [personaImpactError, setPersonaImpactError] = useState<string | null>(null);

  const {
    leftSidebarOpen,
    setLeftSidebarOpen,
    rightSidebarOpen,
    setRightSidebarOpen,
  } = useResponsiveSidebars();

  const { editorRef, editor, handleEditorMount } = useEditor(
    setSelectedShapes,
    setChatContextShapes
  );

  const handleLayerClick = (shapeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editorRef.current) return;

    try {
      editorRef.current.setSelectedShapes([shapeId as TLShapeId]);
      setTimeout(() => {
        editorRef.current?.zoomToSelection({ animation: { duration: 200 } });
      }, 50);
    } catch (error) {
      console.error('Error selecting shape:', error);
    }
  };

  const toggleLayerExpansion = (shapeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedLayers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(shapeId)) {
        newSet.delete(shapeId);
      } else {
        newSet.add(shapeId);
      }
      return newSet;
    });
  };

  const handleClearSelection = () => {
    editorRef.current?.setSelectedShapes([]);
  };

  const insertHtmlPreview = (editor: Editor, html: string) => {
    const existingPreviews = editor
      .getCurrentPageShapes()
      .filter((shape) => shape.type === HTML_PREVIEW_TYPE);
    const offset = existingPreviews.length * 40;
    const x = 120 + offset;
    const y = 120 + offset;

    editor.createShape({
      type: HTML_PREVIEW_TYPE,
      x,
      y,
      props: {
        w: 1440,
        h: 760,
        html,
        title: 'AI Suggested UI',
      },
    });
  };

  const handleGenerateSuggestion = async () => {
    if (!editorRef.current || isGeneratingSuggestion) return;
    setIsGeneratingSuggestion(true);
    setSuggestionError(null);
    setPersonaImpacts([]);
    setPersonaImpactError(null);
    setPersonaImpactStatus('idle');
    setPersonaImpactJobId(null);

    try {
      if (USE_LOCAL_SUGGESTION) {
        const response = await fetch('/api/test/suggestion-output');
        if (!response.ok) {
          const details = await response.text();
          throw new Error(`Request failed (${response.status}): ${details.slice(0, 200)}`);
        }
        const data = await response.json();
        const html = data?.html;
        if (typeof html === 'string' && html.trim()) {
          insertHtmlPreview(editorRef.current, html);
          const jobResponse = await fetch('/api/test/persona-impact-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: 'demo',
              project: { id: 'demo', name: 'Demo UI Suggestion' },
            }),
          });
          if (jobResponse.ok) {
            const jobData = await jobResponse.json();
            const jobId =
              typeof jobData?.personaImpactJobId === 'string'
                ? jobData.personaImpactJobId
                : null;
            if (jobId) {
              setPersonaImpactJobId(jobId);
              setPersonaImpactStatus('pending');
            }
          }
          return;
        }
        setSuggestionError('No HTML returned from /api/test/suggestion-output.');
        return;
      }

      const response = await fetch('/api/suggest-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue: {
            id: 'iss_scroll_depth_low',
            metric: 'event_rate',
            eventType: 'scroll_depth_25',
            segment: { country: 'Thailand' },
            windowA: { start: '2026-01-10T20:50:45.695Z', end: '2026-01-17T20:50:45.695Z' },
            windowB: { start: '2026-01-03T20:50:45.695Z', end: '2026-01-10T20:50:45.695Z' },
            valueA: 0.35,
            valueB: 0.58,
            deltaPct: -39.7,
            direction: 'decrease',
            severity: 'high',
            sampleA: { eventCount: 420, uniqueUsers: 1200 },
            sampleB: { eventCount: 680, uniqueUsers: 1180 },
          },
          project: { id: 'demo', name: 'Demo UI Suggestion' },
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Request failed (${response.status}): ${details.slice(0, 200)}`);
      }

      const data = await response.json();
      const html = data?.suggestion?.updatedHtml;
      const jobId = typeof data?.personaImpactJobId === 'string' ? data.personaImpactJobId : null;
      if (typeof html === 'string' && html.trim()) {
        insertHtmlPreview(editorRef.current, html);
        if (jobId) {
          setPersonaImpactJobId(jobId);
          setPersonaImpactStatus('pending');
        }
      } else {
        setSuggestionError('No HTML returned from /api/suggest-ui.');
      }
    } catch (error) {
      console.error('Failed to generate suggestion', error);
      setSuggestionError('Failed to generate UI preview. Ensure the API server is running.');
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  useEffect(() => {
    if (!personaImpactJobId) return;
    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/persona-impact-jobs/${personaImpactJobId}`);
        if (!response.ok) {
          const details = await response.text();
          throw new Error(`Request failed (${response.status}): ${details.slice(0, 200)}`);
        }
        const data = await response.json();
        if (cancelled) return;

        const status = data?.status as
          | 'pending'
          | 'running'
          | 'done'
          | 'error'
          | undefined;
        const impacts = Array.isArray(data?.personaImpacts) ? data.personaImpacts : [];
        const error = typeof data?.error === 'string' ? data.error : null;

        if (status) {
          setPersonaImpactStatus(status);
        }
        if (status === 'done') {
          setPersonaImpacts(impacts);
          return;
        }
        if (status === 'error') {
          setPersonaImpactError(error ?? 'Persona impact job failed.');
          return;
        }

        timeoutId = window.setTimeout(poll, 2000);
      } catch (err) {
        if (cancelled) return;
        setPersonaImpactStatus('error');
        setPersonaImpactError(err instanceof Error ? err.message : 'Failed to fetch impacts.');
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [personaImpactJobId]);

  return (
    <div className="flex h-screen w-full flex-col bg-white text-slate-900 font-sans antialiased selection:bg-[#1e61f0] selection:text-white overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden relative">
        <LeftSidebar
          isOpen={leftSidebarOpen}
          onClose={() => setLeftSidebarOpen(false)}
          editor={editor}
        />

        {leftSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/20 z-20"
            onClick={() => setLeftSidebarOpen(false)}
          />
        )}
        {rightSidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/20 z-20"
            onClick={() => setRightSidebarOpen(false)}
          />
        )}

        <button
          onClick={() => setLeftSidebarOpen(true)}
          className={`
            ${leftSidebarOpen ? 'hidden' : 'flex'}
            lg:hidden
            fixed left-2 top-14 z-20
            p-2 bg-white border border-slate-200 rounded shadow-sm
            text-slate-600 hover:text-slate-900 hover:bg-slate-50
            transition-colors
          `}
        >
          <PanelLeft size={16} />
        </button>

        <button
          onClick={() => setRightSidebarOpen(true)}
          className={`
            ${rightSidebarOpen ? 'hidden' : 'flex'}
            lg:hidden
            fixed right-2 top-14 z-20
            p-2 bg-white border border-slate-200 rounded shadow-sm
            text-slate-600 hover:text-slate-900 hover:bg-slate-50
            transition-colors
          `}
        >
          <PanelRight size={16} />
        </button>

        <Canvas onMount={handleEditorMount} />

        <RightSidebar
          isOpen={rightSidebarOpen}
          onClose={() => setRightSidebarOpen(false)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedShapes={selectedShapes}
          chatContextShapes={chatContextShapes}
          isTyping={isTyping}
          setIsTyping={setIsTyping}
          onClearSelection={handleClearSelection}
          onGenerateSuggestion={handleGenerateSuggestion}
          isGeneratingSuggestion={isGeneratingSuggestion}
          suggestionError={suggestionError}
          personaImpacts={personaImpacts}
          personaImpactStatus={personaImpactStatus}
          personaImpactError={personaImpactError}
        />
      </div>
    </div>
  );
}
