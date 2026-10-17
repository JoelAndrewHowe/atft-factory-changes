import { useEffect, useRef, useState } from 'react'
import type { TraceDefinition } from './traces'

interface TracePanelProps {
  trace: TraceDefinition
  onClose: () => void
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
        <span className="visually-hidden">Start highlighted text: </span>
        {highlight}
        <span className="visually-hidden"> End highlighted text</span>
      </mark>
      {content.slice(index + highlight.length)}
    </code>
  )
}

export function TracePanel({ trace, onClose }: TracePanelProps) {
  const [index, setIndex] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const connectionRef = useRef<HTMLDivElement>(null)
  const prevIndexRef = useRef(0)
  const [announcement, setAnnouncement] = useState('')

  const total = trace.connections.length
  const connection = trace.connections[index]

  // The panel is keyed by entry in the lesson, so every opening starts at 1.
  useEffect(() => {
    headingRef.current?.focus()
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  // Keep the new connection visible after navigation without taking keyboard focus
  // away from the navigation controls (or the heading when a control disables).
  useEffect(() => {
    if (prevIndexRef.current !== index) {
      connectionRef.current?.scrollIntoView({ block: 'start' })
      prevIndexRef.current = index
    }
  }, [index])

  // Handle Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const panel = panelRef.current
    if (!panel) return
    panel.addEventListener('keydown', handleKeyDown)
    return () => panel.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleBack = () => {
    if (index > 0) {
      const newIndex = index - 1
      setIndex(newIndex)
      setAnnouncement(`Connection ${newIndex + 1} of ${total}: ${trace.connections[newIndex].title}`)
      if (newIndex === 0) {
        // Back button will become disabled, move focus to heading
        setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 0)
      } else {
        setTimeout(() => backButtonRef.current?.focus({ preventScroll: true }), 0)
      }
    }
  }

  const handleNext = () => {
    if (index < total - 1) {
      const newIndex = index + 1
      setIndex(newIndex)
      setAnnouncement(`Connection ${newIndex + 1} of ${total}: ${trace.connections[newIndex].title}`)
      if (newIndex === total - 1) {
        // Next button will become disabled, move focus to heading
        setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 0)
      } else {
        setTimeout(() => nextButtonRef.current?.focus({ preventScroll: true }), 0)
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
          {trace.panelTitle} — Connection {index + 1} of {total}: {connection.title}
        </h4>
        <span className="trace-label">Correct example — your answers are unchanged</span>
      </div>
      <div className="trace-connection" ref={connectionRef}>
        <div className="trace-counter" aria-hidden="true">
          Connection {index + 1} of {total}: {connection.title}
        </div>
        <div className="visually-hidden" aria-live="polite" aria-atomic="true">{announcement}</div>
        {connection.excerpts.map((excerpt, i) => (
          <div key={i} className="trace-excerpt">
            <div className="trace-excerpt-label">{excerpt.label}</div>
            <pre className="trace-pre">
              <HighlightedCode content={excerpt.content} highlight={excerpt.highlight} />
            </pre>
            <div className="trace-highlight-cue">Highlighted: <code>{excerpt.highlight}</code></div>
          </div>
        ))}
        <p className="trace-explanation">{connection.explanation}</p>
      </div>
      <div className="trace-controls">
        <button
          ref={backButtonRef}
          className="action-button action-button-secondary"
          onClick={handleBack}
          disabled={index === 0}
        >
          Back
        </button>
        <button
          ref={nextButtonRef}
          className="action-button"
          onClick={handleNext}
          disabled={index === total - 1}
        >
          Next
        </button>
        <button
          className="action-button action-button-secondary"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
