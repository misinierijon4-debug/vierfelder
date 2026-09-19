type DiagrammTyp = 'saeulen' | 'balken'

type DiagrammSerie = {
  name: string
  farbe?: string
}

type DiagrammPunkt = {
  kategorie: string
  werte: number[]
}

export type EniDiagrammDaten = {
  typ: DiagrammTyp
  titel: string
  untertitel?: string
  einheit?: string
  serien: DiagrammSerie[]
  daten: DiagrammPunkt[]
  fussnote?: string
}

type Props = {
  /** rohes JSON aus einem ```diagramm-Block; darf waehrend des Streams unfertig sein */
  quelltext: string
}

const STANDARD_FARBEN = [
  'var(--koray)',
  '#2f80ed',
  'var(--erijon)',
  'var(--kreide-60)',
  '#b45ff0',
  '#2f7f96',
]

const BENANNTE_FARBEN: Record<string, string> = {
  gruen: '#22a447',
  blau: '#2f80ed',
  gold: 'var(--erijon)',
  petrol: 'var(--koray)',
  kreide: 'var(--kreide)',
}

const ERLAUBTE_VARIABLEN = new Set([
  '--erijon',
  '--koray',
  '--kreide',
  '--kreide-52',
  '--kreide-60',
])

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert)
}

function optionalerText(wert: unknown): string | undefined {
  if (typeof wert !== 'string') return undefined
  const text = wert.trim()
  return text || undefined
}

/**
 * Das Modell liefert Daten, keinen ausfuehrbaren Stil. Nur benannte Farben,
 * Hexwerte und die wenigen oeffentlichen Designvariablen duerfen ins SVG.
 */
function sichereFarbe(farbe: string | undefined, index: number): string {
  if (!farbe) return STANDARD_FARBEN[index % STANDARD_FARBEN.length]!
  const normalisiert = farbe.trim().toLowerCase()
  if (BENANNTE_FARBEN[normalisiert]) return BENANNTE_FARBEN[normalisiert]
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalisiert)) return normalisiert
  const variable = /^var\((--[a-z0-9-]+)\)$/i.exec(normalisiert)
  if (variable && ERLAUBTE_VARIABLEN.has(variable[1]!)) return normalisiert
  return STANDARD_FARBEN[index % STANDARD_FARBEN.length]!
}

/** ungueltiges oder noch unvollstaendiges Streaming-JSON bleibt unsichtbar */
export function liesEniDiagramm(quelltext: string): EniDiagrammDaten | null {
  let roh: unknown
  try {
    roh = JSON.parse(quelltext)
  } catch {
    return null
  }
  if (!istObjekt(roh) || (roh.typ !== 'saeulen' && roh.typ !== 'balken')) return null

  const titel = optionalerText(roh.titel)
  if (!titel || !Array.isArray(roh.serien) || !Array.isArray(roh.daten) || roh.serien.length === 0 || roh.daten.length === 0) {
    return null
  }

  const serien: DiagrammSerie[] = []
  for (const eintrag of roh.serien) {
    if (!istObjekt(eintrag)) return null
    const name = optionalerText(eintrag.name)
    if (!name) return null
    serien.push({ name, farbe: optionalerText(eintrag.farbe) })
  }

  const daten: DiagrammPunkt[] = []
  for (const eintrag of roh.daten) {
    if (!istObjekt(eintrag)) return null
    const kategorie = optionalerText(eintrag.kategorie)
    if (!kategorie || !Array.isArray(eintrag.werte) || eintrag.werte.length !== serien.length) return null
    if (!eintrag.werte.every((wert) => typeof wert === 'number' && Number.isFinite(wert))) return null
    daten.push({ kategorie, werte: eintrag.werte as number[] })
  }

  return {
    typ: roh.typ,
    titel,
    untertitel: optionalerText(roh.untertitel),
    einheit: optionalerText(roh.einheit),
    serien,
    daten,
    fussnote: optionalerText(roh.fussnote),
  }
}

const ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

function formatiereWert(wert: number, einheit?: string): string {
  const zahl = ZAHL.format(wert)
  if (!einheit) return zahl
  return /^[%°x×]$/.test(einheit) ? `${zahl}${einheit}` : `${zahl} ${einheit}`
}

function kurz(text: string, laenge: number): string {
  return text.length <= laenge ? text : `${text.slice(0, Math.max(laenge - 1, 1)).trimEnd()}…`
}

function wertebereich(daten: EniDiagrammDaten): { minimum: number; maximum: number; spanne: number } {
  const werte = daten.daten.flatMap((punkt) => punkt.werte)
  let minimum = Math.min(0, ...werte)
  let maximum = Math.max(0, ...werte)
  if (minimum === maximum) maximum = minimum + 1
  const zugabe = (maximum - minimum) * 0.12
  if (maximum > 0) maximum += zugabe
  if (minimum < 0) minimum -= zugabe
  return { minimum, maximum, spanne: maximum - minimum }
}

function Saeulen({ diagramm, farben }: { diagramm: EniDiagrammDaten; farben: string[] }) {
  const breite = Math.max(320, diagramm.daten.length * Math.max(92, diagramm.serien.length * 34))
  const hoehe = 252
  const oben = 24
  const unten = 54
  const links = 14
  const rechts = 14
  const plotBreite = breite - links - rechts
  const plotHoehe = hoehe - oben - unten
  const { minimum, maximum, spanne } = wertebereich(diagramm)
  const y = (wert: number) => oben + ((maximum - wert) / spanne) * plotHoehe
  const nullLinie = y(0)
  const gruppenBreite = plotBreite / diagramm.daten.length
  const innenBreite = gruppenBreite * 0.76
  const luecke = 4
  const saeulenBreite = Math.max(3, (innenBreite - luecke * (diagramm.serien.length - 1)) / diagramm.serien.length)

  return (
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <svg
        viewBox={`0 0 ${breite} ${hoehe}`}
        className="block h-auto w-full overflow-visible"
        style={{ minWidth: breite > 360 ? `${breite}px` : undefined }}
        aria-hidden="true"
        data-ausrichtung="saeulen"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((anteil) => {
          const linieY = oben + plotHoehe * anteil
          return <line key={anteil} x1={links} x2={breite - rechts} y1={linieY} y2={linieY} stroke="var(--linie)" strokeWidth="1" />
        })}
        {minimum < 0 && maximum > 0 && (
          <line x1={links} x2={breite - rechts} y1={nullLinie} y2={nullLinie} stroke="var(--linie-hell)" strokeWidth="1.25" />
        )}

        {diagramm.daten.flatMap((punkt, punktIndex) => {
          const gruppenStart = links + punktIndex * gruppenBreite + (gruppenBreite - innenBreite) / 2
          return punkt.werte.map((wert, serienIndex) => {
            const wertY = y(wert)
            const rectY = Math.min(wertY, nullLinie)
            const rectHoehe = Math.max(Math.abs(nullLinie - wertY), 1.5)
            const x = gruppenStart + serienIndex * (saeulenBreite + luecke)
            const labelY = wert >= 0 ? Math.max(rectY - 6, 11) : Math.min(rectY + rectHoehe + 13, hoehe - unten + 14)
            return (
              <g key={`${punktIndex}-${serienIndex}`}>
                <rect
                  x={x}
                  y={rectY}
                  width={saeulenBreite}
                  height={rectHoehe}
                  rx={Math.min(6, saeulenBreite / 2)}
                  fill={farben[serienIndex]}
                  data-kategorie={punkt.kategorie}
                  data-serie={diagramm.serien[serienIndex]!.name}
                />
                <text
                  x={x + saeulenBreite / 2}
                  y={labelY}
                  textAnchor="middle"
                  fill="var(--kreide)"
                  fontSize="11"
                  fontWeight="700"
                  className="tnum"
                >
                  {formatiereWert(wert, diagramm.einheit)}
                </text>
              </g>
            )
          })
        })}

        {diagramm.daten.map((punkt, index) => (
          <text
            key={`${punkt.kategorie}-${index}`}
            x={links + index * gruppenBreite + gruppenBreite / 2}
            y={hoehe - 22}
            textAnchor="middle"
            fill="var(--kreide-52)"
            fontSize="11"
          >
            <title>{punkt.kategorie}</title>
            {kurz(punkt.kategorie, 18)}
          </text>
        ))}
      </svg>
    </div>
  )
}

function Balken({ diagramm, farben }: { diagramm: EniDiagrammDaten; farben: string[] }) {
  const breite = 360
  const links = 108
  const rechts = 52
  const oben = 12
  const gruppenHoehe = Math.max(54, diagramm.serien.length * 23 + 22)
  const hoehe = oben + diagramm.daten.length * gruppenHoehe + 12
  const plotBreite = breite - links - rechts
  const { minimum, maximum, spanne } = wertebereich(diagramm)
  const x = (wert: number) => links + ((wert - minimum) / spanne) * plotBreite
  const nullLinie = x(0)

  return (
    <svg
      viewBox={`0 0 ${breite} ${hoehe}`}
      className="block h-auto w-full overflow-visible"
      aria-hidden="true"
      data-ausrichtung="balken"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((anteil) => {
        const linieX = links + plotBreite * anteil
        return <line key={anteil} x1={linieX} x2={linieX} y1={oben} y2={hoehe - 8} stroke="var(--linie)" strokeWidth="1" />
      })}
      {minimum < 0 && maximum > 0 && (
        <line x1={nullLinie} x2={nullLinie} y1={oben} y2={hoehe - 8} stroke="var(--linie-hell)" strokeWidth="1.25" />
      )}

      {diagramm.daten.map((punkt, punktIndex) => {
        const startY = oben + punktIndex * gruppenHoehe
        return (
          <g key={`${punkt.kategorie}-${punktIndex}`}>
            <text x={links - 9} y={startY + 12} textAnchor="end" fill="var(--kreide-52)" fontSize="11">
              <title>{punkt.kategorie}</title>
              {kurz(punkt.kategorie, 17)}
            </text>
            {punkt.werte.map((wert, serienIndex) => {
              const wertX = x(wert)
              const rectX = Math.min(wertX, nullLinie)
              const rectBreite = Math.max(Math.abs(nullLinie - wertX), 1.5)
              const y = startY + 21 + serienIndex * 23
              return (
                <g key={serienIndex}>
                  <rect
                    x={rectX}
                    y={y}
                    width={rectBreite}
                    height="16"
                    rx="5"
                    fill={farben[serienIndex]}
                    data-kategorie={punkt.kategorie}
                    data-serie={diagramm.serien[serienIndex]!.name}
                  />
                  <text
                    x={wert >= 0 ? rectX + rectBreite + 5 : rectX - 5}
                    y={y + 12}
                    textAnchor={wert >= 0 ? 'start' : 'end'}
                    fill="var(--kreide)"
                    fontSize="10.5"
                    fontWeight="700"
                    className="tnum"
                  >
                    {formatiereWert(wert, diagramm.einheit)}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </svg>
  )
}

export function EniDiagramm({ quelltext }: Props) {
  const diagramm = liesEniDiagramm(quelltext)
  if (!diagramm) return null

  const farben = diagramm.serien.map((serie, index) => sichereFarbe(serie.farbe, index))
  const zugangstext = [
    `Diagramm: ${diagramm.titel}.`,
    diagramm.untertitel,
    ...diagramm.daten.map((punkt) =>
      `${punkt.kategorie}: ${punkt.werte.map((wert, index) => `${diagramm.serien[index]!.name} ${formatiereWert(wert, diagramm.einheit)}`).join(', ')}`
    ),
    diagramm.fussnote,
  ].filter(Boolean).join(' ')

  return (
    <figure role="figure" aria-label={zugangstext} className="my-5 min-w-0 border-y border-linie py-4">
      <figcaption>
        <h3 className="display text-[16px] font-bold leading-tight text-kreide sm:text-[17px]">
          {diagramm.titel}
        </h3>
        {diagramm.untertitel && (
          <p className="mt-1 text-[13px] leading-snug text-kreide-52 sm:text-[14px]">
            {diagramm.untertitel}
          </p>
        )}
      </figcaption>

      <ul aria-label="Legende" className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {diagramm.serien.map((serie, index) => (
          <li key={`${serie.name}-${index}`} className="flex items-center gap-2 text-[12px] text-kreide sm:text-[13px]">
            <span aria-hidden="true" className="h-5 w-1 rounded-full" style={{ background: farben[index] }} />
            {serie.name}
          </li>
        ))}
      </ul>

      <div className="mt-3">
        {diagramm.typ === 'saeulen'
          ? <Saeulen diagramm={diagramm} farben={farben} />
          : <Balken diagramm={diagramm} farben={farben} />}
      </div>

      {diagramm.fussnote && (
        <p className="mt-3 text-[11px] leading-relaxed text-kreide-52">{diagramm.fussnote}</p>
      )}
    </figure>
  )
}
