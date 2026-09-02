import { useMemo } from 'react'
import { USERS } from '../../lib/types'
import type { Schlafnacht, UserId } from '../../lib/types'
import type { NachtPhasenAnalyse } from '../../lib/schlafPhasen'
import {
  abendDatum,
  achse,
  analysiereSchlafnacht,
  formatDauer,
  position,
  stundenmarken,
  verlauf,
} from '../../lib/schlafPhasen'
import { nachtkurve } from '../../lib/nachtkurve'

type Props = {
  naechte: Schlafnacht[]
  gewaehlterTag: string
}

/** die kurve hat dieselben masse wie im nachtdetail, nur zweifarbig uebereinander */
const BREITE = 320
const KURVE_HOEHE = 96
const HOEHE = 140
/** grundlinie der stundenmarken */
const ACHSE_Y = 132
/** so nah an den rand darf keine stundenmarke, sonst stoesst sie an die eckzeiten */
const RANDSCHUTZ = 42

type Zeile = {
  id: string
  label: string
  wert: (a: NachtPhasenAnalyse) => number | null
  text: (a: NachtPhasenAnalyse) => string
  /**
   * 'hoch' heisst: mehr gewinnt, 'tief': weniger. null heisst: die zeile hat
   * keine wertende richtung — wer frueher aufwacht, hat nicht besser geschlafen
   */
  richtung: 'hoch' | 'tief' | null
  /** ein kleiner unterschied ist kein sieg, wie im duell der woche */
  mindest: number
}

const ZEILEN: Zeile[] = [
  {
    id: 'schlafzeit',
    label: 'schlafzeit',
    wert: (a) => a.schlafMinuten,
    text: (a) => formatDauer(a.schlafMinuten),
    richtung: 'hoch',
    mindest: 5,
  },
  {
    id: 'eingeschlafen',
    label: 'eingeschlafen',
    wert: (a) => a.einschlafMinute,
    text: (a) => a.einschlafUhrzeit,
    richtung: 'tief',
    mindest: 5,
  },
  {
    id: 'aufgewacht',
    label: 'aufgewacht',
    wert: (a) => a.aufwachMinute,
    text: (a) => (a.hatZeitfensterDaten ? a.aufwachUhrzeit : '—'),
    richtung: null,
    mindest: 5,
  },
  {
    id: 'effizienz',
    label: 'effizienz',
    wert: (a) => a.effizienz,
    text: (a) => (a.effizienz === null ? '—' : `${a.effizienz}%`),
    richtung: 'hoch',
    mindest: 2,
  },
  {
    id: 'nachtwert',
    label: 'nachtwert',
    wert: (a) => a.qualitaet,
    text: (a) => String(a.qualitaet),
    richtung: 'hoch',
    mindest: 2,
  },
]

/**
 * Beide Naechte vom selben Abend, direkt gegeneinander gehalten: erst die
 * Kennzahlen in einer Tabelle, darunter die zwei Verlaufskurven auf einer
 * gemeinsamen Achse. Ohne beide naechte gibt es keinen vergleich — die
 * sektion bleibt dann ganz weg.
 */
export function SchlafNachtVergleich({ naechte, gewaehlterTag }: Props) {
  const nachtJeUser = useMemo(() => {
    const treffer: Partial<Record<UserId, Schlafnacht>> = {}
    for (const nacht of naechte) {
      if (nacht.schlafMinuten <= 0) continue
      if (abendDatum(nacht.einschlafzeit) !== gewaehlterTag) continue
      treffer[nacht.user] = nacht
    }
    return treffer
  }, [gewaehlterTag, naechte])

  const erijonNacht = nachtJeUser.erijon
  const korayNacht = nachtJeUser.koray
  if (!erijonNacht || !korayNacht) return null

  const bild = useMemo(() => {
    const analysen = [analysiereSchlafnacht(erijonNacht), analysiereSchlafnacht(korayNacht)]
    // eine kurve darf nicht behaupten, was noch nicht geladen ist — der flache
    // block waere keine wartemeldung, wie im nachtdetail
    const zeichenbar = analysen.every((a) => a.verlaufGeladen && a.hatPhasenDaten)
    if (!zeichenbar) {
      return { analysen, zeichenbar: false as const, von: 0, bis: 1, marken: [], pfade: ['', ''] }
    }

    const bereich = achse(analysen)
    const dauer = bereich.bis - bereich.von
    const schritt = dauer > 12 * 60 ? 180 : dauer > 6 * 60 ? 120 : 60
    const marken = stundenmarken(bereich.von, bereich.bis, schritt).filter((m) => {
      const x = position(m, bereich.von, bereich.bis) * BREITE
      return x > RANDSCHUTZ && x < BREITE - RANDSCHUTZ
    })
    const pfade = analysen.map((a) =>
      nachtkurve(verlauf(a).linie, bereich.von, bereich.bis, {
        breite: BREITE,
        hoehe: KURVE_HOEHE,
      }).d
    )
    return {
      analysen,
      zeichenbar: true as const,
      von: bereich.von,
      bis: bereich.bis,
      marken,
      pfade,
    }
  }, [erijonNacht, korayNacht])

  return (
    <section aria-labelledby="beide-naechte-titel" className="mt-5">
      <h2
        id="beide-naechte-titel"
        className="border-b border-linie pb-2 text-[12px] font-semibold text-kreide"
      >
        beide nächte
      </h2>

      <div className="mt-3 overflow-hidden rounded-[2px] border border-linie bg-flaeche">
        <div className="grid grid-cols-[1fr_72px_72px] items-baseline gap-x-2 border-b border-linie px-3 py-2.5">
          <span className="text-[10px] text-kreide-52">am selben abend</span>
          {USERS.map((user) => (
            <span key={user.id} className="text-right text-[11px] font-medium" style={{ color: user.farbe }}>
              {user.name}
            </span>
          ))}
        </div>

        <dl className="divide-y divide-linie">
          {ZEILEN.map((zeile) => {
            const [a, b] = bild.analysen
            const wa = zeile.wert(a)
            const wb = zeile.wert(b)
            let sieger: UserId | null = null
            if (
              zeile.richtung !== null &&
              wa !== null &&
              wb !== null &&
              Math.abs(wa - wb) >= zeile.mindest
            ) {
              sieger = (zeile.richtung === 'hoch' ? wa > wb : wa < wb) ? a!.user : b!.user
            }
            return (
              <div
                key={zeile.id}
                className="grid grid-cols-[1fr_72px_72px] items-baseline gap-x-2 px-3 py-2.5"
              >
                <dt className="truncate text-[11px] text-kreide-52">{zeile.label}</dt>
                {USERS.map((user, index) => (
                  <dd
                    key={user.id}
                    className="tnum text-right text-[13px] font-semibold transition-colors duration-200"
                    style={{ color: sieger === user.id ? user.farbe : 'var(--kreide-52)' }}
                  >
                    {zeile.text(bild.analysen[index]!)}
                  </dd>
                ))}
              </div>
            )
          })}
        </dl>

        {bild.zeichenbar ? (
          <div className="border-t border-linie px-3 py-2.5">
            <svg
              viewBox={`0 0 ${BREITE} ${HOEHE}`}
              className="block h-auto w-full overflow-visible"
              role="img"
              aria-label={`verlauf beider nächte: ${bild.analysen[0]!.user} ${bild.analysen[0]!.einschlafUhrzeit} bis ${bild.analysen[0]!.aufwachUhrzeit}, ${bild.analysen[1]!.user} ${bild.analysen[1]!.einschlafUhrzeit} bis ${bild.analysen[1]!.aufwachUhrzeit}`}
            >
              <path
                d={bild.pfade[0]}
                fill="none"
                stroke="var(--erijon)"
                strokeWidth="1.5"
                strokeOpacity="0.85"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={bild.pfade[1]}
                fill="none"
                stroke="var(--koray)"
                strokeWidth="1.5"
                strokeOpacity="0.85"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {bild.marken.map((m) => (
                <line
                  key={m}
                  x1={position(m, bild.von, bild.bis) * BREITE}
                  x2={position(m, bild.von, bild.bis) * BREITE}
                  y1={ACHSE_Y - 4}
                  y2={ACHSE_Y}
                  stroke="var(--linie)"
                  strokeWidth="1"
                  shapeRendering="crispEdges"
                />
              ))}

              <text x="0" y={ACHSE_Y - 18} textAnchor="start" fill="var(--erijon)" fontSize="10" className="tnum">
                {bild.analysen[0]!.einschlafUhrzeit}
              </text>
              <text x="0" y={ACHSE_Y - 6} textAnchor="start" fill="var(--koray)" fontSize="10" className="tnum">
                {bild.analysen[1]!.einschlafUhrzeit}
              </text>
              <text x={BREITE} y={ACHSE_Y - 18} textAnchor="end" fill="var(--erijon)" fontSize="10" className="tnum">
                {bild.analysen[0]!.hatZeitfensterDaten ? bild.analysen[0]!.aufwachUhrzeit : '--:--'}
              </text>
              <text x={BREITE} y={ACHSE_Y - 6} textAnchor="end" fill="var(--koray)" fontSize="10" className="tnum">
                {bild.analysen[1]!.hatZeitfensterDaten ? bild.analysen[1]!.aufwachUhrzeit : '--:--'}
              </text>
            </svg>
          </div>
        ) : (
          <p className="border-t border-linie px-3 py-2.5 text-pretty text-[10px] leading-snug text-kreide-52">
            die kurven erscheinen erst, wenn die schlafphasen beider nächte geladen sind
          </p>
        )}
      </div>
    </section>
  )
}
