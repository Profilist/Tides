import { useEffect, useState } from 'react';
import type { Editor } from 'tldraw';
import { PanelLeft, PanelRight } from 'lucide-react';
import { Header } from './components/Header/Header';
import { LeftSidebar } from './components/LeftSidebar/LeftSidebar';
import { RightSidebar } from './components/RightSidebar/RightSidebar';
import { Canvas } from './components/Canvas/Canvas';
import { useEditor } from './hooks/useEditor';
import { useResponsiveSidebars } from './hooks/useResponsiveSidebars';
import type {
  SelectedShape,
  ChatContextShape,
  PersonaImpact,
  Issue,
  IssuePage,
  ChatMessage,
  SuggestionSummaryResponse,
} from './types';
import { HTML_PREVIEW_TYPE } from './shapes/HtmlPreviewShapeUtil';

const USE_LOCAL_SUGGESTION = true;
const ISSUE_PAGE_SOURCE_PREFIX = 'issue-pages:';
const DEFAULT_PREVIEW_WIDTH = 1200;
const DEFAULT_PREVIEW_HEIGHT = 800;
const PAGE_GAP = 80;
const SHOT_GAP = 40;

export default function DesignPlatformUI() {
  const [activeTab, setActiveTab] = useState<'details' | 'chat'>('chat');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedShapes, setSelectedShapes] = useState<SelectedShape[]>([]);
  const [chatContextShapes, setChatContextShapes] = useState<ChatContextShape[]>([]);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionContext, setSuggestionContext] = useState<{
    html?: string;
    summary?: string | null;
  } | null>(null);
  const [suggestionMessage, setSuggestionMessage] = useState<ChatMessage | null>(null);
  const [personaImpactJobId, setPersonaImpactJobId] = useState<string | null>(null);
  const [personaImpacts, setPersonaImpacts] = useState<PersonaImpact[]>([]);
  const [personaImpactStatus, setPersonaImpactStatus] = useState<
    'idle' | 'pending' | 'running' | 'done' | 'error'
  >('idle');
  const [personaImpactError, setPersonaImpactError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesError, setIssuesError] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  const clearIssuePagePreviews = (editor: Editor) => {
    const shapes = editor.getCurrentPageShapes();
    const toDelete = shapes.map((shape) => shape.id);
    if (toDelete.length > 0) {
      editor.deleteShapes(toDelete);
    }
  };

  const getPreviewSize = (screenshot: IssuePage['screenshots'][number]) => {
    const width = screenshot.width ?? DEFAULT_PREVIEW_WIDTH;
    const height = screenshot.height ?? DEFAULT_PREVIEW_HEIGHT;
    if (width <= DEFAULT_PREVIEW_WIDTH) {
      return { width, height };
    }
    const scale = DEFAULT_PREVIEW_WIDTH / width;
    return {
      width: DEFAULT_PREVIEW_WIDTH,
      height: Math.round(height * scale),
    };
  };

  const renderIssuePages = (editor: Editor, issueId: string, pages: IssuePage[]) => {
    clearIssuePagePreviews(editor);
    let x = 120;

    pages.forEach((page) => {
      let y = 120;
      let columnWidth = 0;

      page.screenshots.forEach((screenshot) => {
        const { width, height } = getPreviewSize(screenshot);
        const title = [page.title ?? page.name, screenshot.label]
          .filter(Boolean)
          .join(' · ');
        const html = `<!DOCTYPE html><html><body style="margin:0;background:#ffffff;">
          <img src="${screenshot.url}" style="width:100%;height:100%;object-fit:contain;" />
        </body></html>`;

        editor.createShape({
          type: HTML_PREVIEW_TYPE,
          x,
          y,
          props: {
            w: width,
            h: height,
            html,
            title: title || page.name,
            sourceShapeId: `${ISSUE_PAGE_SOURCE_PREFIX}${issueId}`,
          },
        });

        y += height + SHOT_GAP;
        columnWidth = Math.max(columnWidth, width);
      });

      x += columnWidth + PAGE_GAP;
    });
  };

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
    setSuggestionMessage(null);

    try {
      if (USE_LOCAL_SUGGESTION) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 8000);
        });
        const response = await fetch('/api/test/suggestion-output');
        if (!response.ok) {
          const details = await response.text();
          throw new Error(`Request failed (${response.status}): ${details.slice(0, 200)}`);
        }
        const data = await response.json();
        const html = data?.html;
        if (typeof html === 'string' && html.trim()) {
          insertHtmlPreview(editorRef.current, html);
          setSuggestionContext({ html });
          if (selectedIssueId) {
            const summaryPayload = {
              suggestionHtml: html,
            };
            console.log('suggestion-summary payload (local):', summaryPayload);
            const summaryResponse = await fetch(`/api/issues/${selectedIssueId}/suggestion-summary`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(summaryPayload),
            });
            if (summaryResponse.ok) {
              const summaryData = (await summaryResponse.json()) as SuggestionSummaryResponse;
              const content =
                typeof summaryData?.message?.content === 'string'
                  ? summaryData.message.content
                  : '';
              if (content) {
                setSuggestionMessage({
                  id: `suggestion-${Date.now()}`,
                  role: 'assistant',
                  content,
                  timestamp: new Date().toISOString(),
                  evidence: summaryData.message.evidence ?? [],
                });
                setSuggestionContext({ html, summary: content });
              }
            }
          }
          const jobResponse = await fetch('/api/test/persona-impact-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: 'default',
              project: { id: 'default', name: 'Demo UI Suggestion' },
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
      const updatedHtmlDiff = typeof data?.updatedHtmlDiff === 'string' ? data.updatedHtmlDiff : '';
      const jobId = typeof data?.personaImpactJobId === 'string' ? data.personaImpactJobId : null;
      if (typeof html === 'string' && html.trim()) {
        insertHtmlPreview(editorRef.current, html);
        const changeSummary = Array.isArray(data?.suggestion?.changeSummary)
          ? data.suggestion.changeSummary.join(' ')
          : null;
        setSuggestionContext({ html, summary: changeSummary });
        if (selectedIssueId) {
          const summaryPayload = {
            suggestionHtml: html,
            suggestionDiff: updatedHtmlDiff,
            changeSummary: Array.isArray(data?.suggestion?.changeSummary)
              ? data.suggestion.changeSummary
              : [],
          };
          console.log('suggestion-summary payload (api):', summaryPayload);
          const summaryResponse = await fetch(`/api/issues/${selectedIssueId}/suggestion-summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(summaryPayload),
          });
          if (summaryResponse.ok) {
            const summaryData = (await summaryResponse.json()) as SuggestionSummaryResponse;
            const content =
              typeof summaryData?.message?.content === 'string'
                ? summaryData.message.content
                : '';
            if (content) {
              setSuggestionMessage({
                id: `suggestion-${Date.now()}`,
                role: 'assistant',
                content,
                timestamp: new Date().toISOString(),
                evidence: summaryData.message.evidence ?? [],
              });
              setSuggestionContext({ html, summary: content });
            }
          }
        }
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

  const handleOpenSuggestion = () => {
    const html = suggestionContext?.html;
    if (!html) {
      return;
    }
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      return;
    }
    previewWindow.document.open();
    previewWindow.document.write(html);
    previewWindow.document.close();
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

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const loadIssues = async () => {
      try {
        const response = await fetch('/api/issues');
        if (!response.ok) {
          const details = await response.text();
          throw new Error(`Request failed (${response.status}): ${details.slice(0, 200)}`);
        }
        const data = await response.json();
        if (cancelled) return;
        const nextIssues = Array.isArray(data?.issues) ? data.issues : [];
        setIssues(nextIssues);
        setIssuesError(null);
      } catch (error) {
        if (cancelled) return;
        setIssuesError(error instanceof Error ? error.message : 'Failed to fetch issues.');
      }
    };

    loadIssues();
    intervalId = window.setInterval(loadIssues, 30000);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    if (issues.length === 0) {
      if (selectedIssueId) {
        setSelectedIssueId(null);
      }
      return;
    }
    const hasSelection = issues.some((issue) => issue.id === selectedIssueId);
    if (!hasSelection) {
      setSelectedIssueId(issues[0]?.id ?? null);
    }
  }, [issues, selectedIssueId]);

  useEffect(() => {
    setSuggestionContext(null);
    setSuggestionMessage(null);
  }, [selectedIssueId]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!selectedIssueId) {
      clearIssuePagePreviews(editor);
      return;
    }

    let cancelled = false;

    const loadIssuePages = async () => {
      try {
        const response = await fetch(`/api/issues/${selectedIssueId}/pages`);
        if (!response.ok) {
          const details = await response.text();
          throw new Error(`Request failed (${response.status}): ${details.slice(0, 200)}`);
        }
        const data = await response.json();
        if (cancelled) return;
        const pages = Array.isArray(data?.pages) ? data.pages : [];
        renderIssuePages(editor, selectedIssueId, pages);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load issue pages', error);
      }
    };

    loadIssuePages();

    return () => {
      cancelled = true;
    };
  }, [editor, selectedIssueId]);

  return (
    <div className="flex h-screen w-full flex-col bg-white text-slate-900 font-sans antialiased selection:bg-[#1e61f0] selection:text-white overflow-hidden">
      <Header
        hasSuggestion={Boolean(suggestionContext?.html)}
        onPlaySuggestion={handleOpenSuggestion}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <LeftSidebar
          isOpen={leftSidebarOpen}
          onClose={() => setLeftSidebarOpen(false)}
          editor={editor}
          issues={issues}
          selectedIssueId={selectedIssueId}
          onSelectIssue={setSelectedIssueId}
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
          selectedIssue={issues.find((issue) => issue.id === selectedIssueId) ?? null}
          suggestionContext={suggestionContext}
          suggestionMessage={suggestionMessage}
          issuesError={issuesError}
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
