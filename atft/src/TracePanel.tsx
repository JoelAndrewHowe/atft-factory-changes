import { useEffect, useRef, useState } from 'react'
import type { TraceDefinition } from './traces'

interface TracePanelProps {
  trace: TraceDefinition
  onClose: () => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

function HighlightedCode({
  content,
  highlight,
}: {
  content: string
  highlight?: string
}) {
  if (!highlight) {
    return <code>{content}</code>
  }
  const index = content.indexOf(highlight)
  if (index === -1) {
    return <code>{content}</code>
  }
  return (
    <code>
      {content.slice(0, index)}
      <mark className="trace-highlight">
        <span className="trace-highlight-glyph" aria-hidden="true">▸ </span>
        <span className="visually-hidden">Highlighted: </span>
        {highlight}
        <span className="visually-hidden"> End highlight</span>
      </mark>
      {content.slice(index + highlight.length)}
    </code>
  )
}

export function TracePanel({ trace, onClose, triggerRef }: TracePanelProps) {
  const [index, setIndex] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const prevTraceIdRef = useRef(trace.id)

  const total = trace.connections.length
  // A different trace can render before the reset effect runs. Never index the
  // new (possibly shorter) connection list with the previous trace's position.
  const displayedIndex = prevTraceIdRef.current === trace.id ? Math.min(index, total - 1) : 0
  const connection = trace.connections[displayedIndex]

  // Reset index when trace changes or re-opens
  useEffect(() => {
    if (prevTraceIdRef.current !== trace.id) {
      setIndex(0)
      prevTraceIdRef.current = trace.id
    }
    headingRef.current?.focus()
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [trace.id])

  // Handle Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        requestAnimationFrame(() => {
          triggerRef?.current?.focus()
        })
      }
    }
    const panel = panelRef.current
    if (!panel) return
    panel.addEventListener('keydown', handleKeyDown)
    return () => panel.removeEventListener('keydown', handleKeyDown)
  }, [onClose, triggerRef])

  const handleClose = () => {
    onClose()
    requestAnimationFrame(() => {
      triggerRef?.current?.focus()
    })
  }

  const handleBack = () => {
    if (displayedIndex > 0) {
      const newIndex = displayedIndex - 1
      setIndex(newIndex)
      if (newIndex === 0) {
        // Back button will become disabled, move focus to heading
        setTimeout(() => headingRef.current?.focus(), 0)
      } else {
        setTimeout(() => backButtonRef.current?.focus(), 0)
      }
    }
  }

  const handleNext = () => {
    if (displayedIndex < total - 1) {
      const newIndex = displayedIndex + 1
      setIndex(newIndex)
      if (newIndex === total - 1) {
        // Next button will become disabled, move focus to heading
        setTimeout(() => headingRef.current?.focus(), 0)
      } else {
        setTimeout(() => nextButtonRef.current?.focus(), 0)
      }
    }
  }

  return (
    <div
      ref={panelRef}
      id={`trace-panel-${trace.id}`}
      className="trace-panel"
      role="region"
      aria-label={`${trace.panelTitle} trace`}
      tabIndex={-1}
    >
      <div className="trace-header">
        <h4 tabIndex={-1} ref={headingRef} id={`trace-heading-${trace.id}`}>
          {trace.panelTitle}
        </h4>
        <span className="trace-label">Correct example — your answers are unchanged</span>
      </div>
      <div className="trace-connection">
        <div className="trace-counter" aria-live="polite" aria-atomic="true">
          Connection {displayedIndex + 1} of {total}: {connection.title}
        </div>
        {connection.excerpts.map((excerpt, i) => (
          <div key={i} className="trace-excerpt">
            <div className="trace-excerpt-label">{excerpt.label}</div>
            <pre className="trace-pre">
              <HighlightedCode content={excerpt.content} highlight={excerpt.highlight} />
            </pre>
          </div>
        ))}
        <p className="trace-explanation">{connection.explanation}</p>
      </div>
      <div className="trace-controls">
        <button
          ref={backButtonRef}
          className="action-button action-button-secondary"
          onClick={handleBack}
          disabled={displayedIndex === 0}
        >
          Back
        </button>
        <button
          ref={nextButtonRef}
          className="action-button"
          onClick={handleNext}
          disabled={displayedIndex === total - 1}
        >
          Next
        </button>
        <button
          className="action-button action-button-secondary"
          onClick={handleClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
