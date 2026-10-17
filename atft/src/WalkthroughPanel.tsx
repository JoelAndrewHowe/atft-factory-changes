import { useEffect, useRef, useState } from 'react'
import type { WalkthroughStage } from './walkthrough'

interface WalkthroughPanelProps {
  stages: WalkthroughStage[]
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

export function WalkthroughPanel({ stages, onClose, triggerRef }: WalkthroughPanelProps) {
  const [index, setIndex] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const stage = stages[index]
  const total = stages.length

  useEffect(() => {
    headingRef.current?.focus()
    panelRef.current?.scrollIntoView({ block: 'nearest' })
  }, [])

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
    if (index > 0) {
      const newIndex = index - 1
      setIndex(newIndex)
      if (newIndex === 0) {
        setTimeout(() => headingRef.current?.focus(), 0)
      } else {
        setTimeout(() => backButtonRef.current?.focus(), 0)
      }
    }
  }

  const handleNext = () => {
    if (index < total - 1) {
      const newIndex = index + 1
      setIndex(newIndex)
      if (newIndex === total - 1) {
        setTimeout(() => headingRef.current?.focus(), 0)
      } else {
        setTimeout(() => nextButtonRef.current?.focus(), 0)
      }
    }
  }

  return (
    <div
      ref={panelRef}
      className="trace-panel"
      role="region"
      aria-label="Your completed test — simulated walkthrough"
      tabIndex={-1}
    >
      <div className="trace-header">
        <h4 tabIndex={-1} ref={headingRef} id="walkthrough-heading">
          Your completed test — simulated walkthrough
        </h4>
      </div>
      <div className="trace-connection">
        <div className="trace-counter" aria-live="polite" aria-atomic="true">
          Stage {index + 1} of {total}: {stage.title}
        </div>
        {stage.excerpts.map((excerpt, i) => (
          <div key={i} className="trace-excerpt">
            <div className="trace-excerpt-label">{excerpt.label}</div>
            <pre className="trace-pre">
              <HighlightedCode content={excerpt.content} highlight={excerpt.highlight} />
            </pre>
          </div>
        ))}
        <p className="trace-explanation">{stage.explanation}</p>
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
          onClick={handleClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
