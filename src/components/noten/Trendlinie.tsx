type Props = { werte: number[]; farbe?: string }

export function Trendlinie({ werte, farbe = 'var(--kreide-60)' }: Props) {
  if (werte.length === 0) return <span className="block h-6 w-16" aria-hidden="true" />
  const x = (i: number) => werte.length === 1 ? 32 : 3 + (i * 58) / (werte.length - 1)
  const y = (wert: number) => 21 - (Math.min(15, Math.max(0, wert)) / 15) * 18
  const pfad = werte.length === 1
    ? `M 28 ${y(werte[0]!)} L 36 ${y(werte[0]!)}`
    : werte.map((wert, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(wert)}`).join(' ')
  return (
    <svg viewBox="0 0 64 24" className="h-6 w-16" role="img" aria-label={`verlauf ${werte.join(', ')} punkte`}>
      <path d={pfad} fill="none" stroke={farbe} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
