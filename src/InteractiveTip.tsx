import './interactive-tip.css'

export default function InteractiveTip({ label, className = '' }: { label: string; className?: string }) {
  return <span className={`interactive-tip ${className}`} aria-hidden="true">
    <span>{label}</span>
    <svg viewBox="0 0 78 28" fill="none"><path d="M2 23 C19 27 28 28 48 25 C67 23 71 20 71 5 M64 11 L71 3 L77 11" /></svg>
  </span>
}
