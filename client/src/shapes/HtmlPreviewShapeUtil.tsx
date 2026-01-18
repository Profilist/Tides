import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type TLBaseShape,
} from 'tldraw';

export const HTML_PREVIEW_TYPE = 'html_preview' as const;

export type HtmlPreviewShape = TLBaseShape<
  typeof HTML_PREVIEW_TYPE,
  {
    w: number;
    h: number;
    html: string;
    title?: string;
    sourceShapeId?: string;
  }
>;

export class HtmlPreviewShapeUtil extends BaseBoxShapeUtil<HtmlPreviewShape> {
  static override type = HTML_PREVIEW_TYPE;

  static override props = {
    w: T.number,
    h: T.number,
    html: T.string,
    title: T.optional(T.string),
    sourceShapeId: T.optional(T.string),
  };

  override getDefaultProps(): HtmlPreviewShape['props'] {
    return {
      w: 1440,
      h: 760,
      html: '<!DOCTYPE html><html><body></body></html>',
      title: 'HTML Preview',
    };
  }

  override component(shape: HtmlPreviewShape) {
    return (
      <HTMLContainer id={shape.id} style={{ width: shape.props.w, height: shape.props.h }}>
        <div
          contentEditable={false}
          style={{
            width: '100%',
            height: '100%',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
            pointerEvents: 'all',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: 28,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              fontSize: 11,
              fontWeight: 600,
              color: '#475569',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              cursor: 'move',
              userSelect: 'none',
            }}
          >
            <span style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Preview</span>
            <span style={{ fontWeight: 500, color: '#94a3b8' }}>
              {shape.props.title ?? 'HTML'}
            </span>
          </div>
          <iframe
            title={shape.props.title ?? 'HTML Preview'}
            srcDoc={shape.props.html}
            sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
            scrolling="yes"
            style={{
              width: '100%',
              flex: 1,
              border: 'none',
              background: '#ffffff',
              overflow: 'auto',
              pointerEvents: 'all',
            }}
          />
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: HtmlPreviewShape) {
    return <rect width={shape.props.w} height={shape.props.h} />;
  }
}
