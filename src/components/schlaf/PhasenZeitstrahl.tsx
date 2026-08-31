import { useId, useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { NachtPhasenAnalyse } from '../../lib/schlafPhasen'
import {
  formatDauer,
  hypnogramm,
  nachtUhrzeit,
  position,
  stundenmarken,
  verlauf,
  PHASEN_SCHWELLE,
} from '../../lib/schlafPhasen'
import { DIAGRAMM, EASE } from '../../lib/motion'
import type { PhasenArt } from '../../lib/types'

type Props = {
  analyse: NachtPhasenAnalyse
}

/**
 * Die vier Phasenfarben gehoeren keiner Person, sie sind eine Legende. Sie
 * stehen nur hier im Nachtdetail; das Wochenraster bleibt zweifarbig.
 */
const FARBE: Record<PhasenArt, string> = {
  tief: 'var(--phase-tief)',
  rem: 'var(--phase-rem)',
  kern: 'var(--phase-kern)',
  unspez: 'var(--phase-kern)',
  wach: 'var(--phase-wach)',
}

/**
 * Der Verlauf ist eine Kurve, kein Balken.
 *
 * Ein Balken kann nur Farbe nebeneinander legen; die Nacht hat aber eine
 * Richtung — nach unten in den Tiefschlaf und wieder herauf. Die Kurve zeigt
 * genau das: die Breite bleibt die Uhr, die Hoehe ist die Schlaftiefe. Die
 * Zahlen darunter sind dieselben wie vorher, nur die Reihenfolge folgt jetzt
 * der Hoehe der Linien.
 */
const BREITE = 320
const HOEHE = 124
/** y der wach-linie und y der tiefschlaf-linie */
const OBEN = 16
const UNTEN = 92
/** grundlinie der uhrzeiten */
const ACHSE_Y = 117
/** waagerechte laenge eines phasenuebergangs */
const UEBERGANG = 7.5
/**
 * Strichstaerke der Kurve.
 *
 * Sie ist die Grenze der Aufloesung: was schmaler ist als der Strich, kann
 * keine Form mehr bilden, sondern nur noch eine Doppellinie — und die sieht
 * aus wie ein Fehler, nicht wie eine kurze Phase. Bei 320 Einheiten fuer eine
 * Nacht ist eine Minute rund 0,6 Einheiten breit; mit 1,5 traegt der Strich
 * also alles ab etwa zweieinhalb Minuten.
 */
const STRICH = 1.5
/** so nah an den rand darf keine stundenmarke, sonst stoesst sie an die eckzeit */
const RANDSCHUTZ = 34

export function PhasenZeitstrahl({ analyse }: Props) {
  const reduced = useReducedMotion()
  const glanz = useId()

  const { kurve, unruhen, von, bis, marken } = useMemo(() => {
    const { linie, unruhen } = verlauf(analyse)
    // die achse gehoert dieser einen nacht: sie beginnt und endet an den
    // gemessenen zeiten, damit die auflösung so fein wie moeglich bleibt
    const alle = [...linie, ...unruhen]
    const von = Math.min(analyse.einschlafMinute, ...alle.map((s) => s.von))
    const bis = Math.max(analyse.aufwachMinute, ...alle.map((s) => s.bis))
    // ueber zwoelf stunden wuerden stuendliche marken aneinanderkleben
    const schritt = bis - von > 12 * 60 ? 120 : 60
    return {
      kurve: hypnogramm(linie, von, bis, {
        breite: BREITE,
        oben: OBEN,
        unten: UNTEN,
        radius: UEBERGANG,
      }),
      unruhen: unruhen.map((u) => ({
        von: position(u.von, von, bis) * BREITE,
        // eine minute waere sonst unsichtbar: der strich hat eine mindestlaenge
        bis: Math.max(position(u.bis, von, bis) * BREITE, position(u.von, von, bis) * BREITE + 1.6),
      })),
      von,
      bis,
      marken: stundenmarken(von, bis, schritt).filter((m) => {
        const x = position(m, von, bis) * BREITE
        return x > RANDSCHUTZ && x < BREITE - RANDSCHUTZ
      }),
    }
  }, [analyse])

  if (!analyse.hatPhasenDaten) {
    return (
      <div className="mt-4 border-y border-linie py-4">
        <p className="text-[11px] font-medium text-kreide">keine schlafphasen erfasst</p>
        <p className="mt-1 text-pretty text-[10px] text-kreide-52">
          health hat für diese nacht nur die schlafdauer geliefert.
        </p>
      </div>
    )
  }

  const vonUhr = nachtUhrzeit(von)
  const bisUhr = nachtUhrzeit(bis)

  // reihenfolge wie in der kurve: von der wach-linie oben bis zum tiefschlaf
  const kacheln = [
    { key: 'wach' as const, label: 'wach', minuten: analyse.wachMinuten, prozent: analyse.wachProzent },
    { key: 'rem' as const, label: 'rem', minuten: analyse.remMinuten, prozent: analyse.remProzent },
    { key: 'kern' as const, label: 'kernschlaf', minuten: analyse.coreMinuten, prozent: analyse.coreProzent },
    { key: 'tief' as const, label: 'tiefschlaf', minuten: analyse.tiefMinuten, prozent: analyse.tiefProzent },
  ]

  const linien = (breite: number, deckkraft: number, nurRem: boolean) =>
    kurve
      .filter((stueck) => !nurRem || stueck.art === 'rem')
      .map((stueck, i) => (
        <path
          key={`${nurRem ? 'rem' : 'alle'}-${i}`}
          d={stueck.d}
          fill="none"
          stroke={FARBE[stueck.art]}
          strokeWidth={breite}
          strokeOpacity={deckkraft}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))

  return (
    <div className="mt-4 overflow-hidden rounded-[2px] border border-linie bg-flaeche">
      <div className="px-3.5 pt-3">
        <span className="text-[11px] font-medium text-kreide">verlauf der nacht</span>
      </div>

      <motion.div
        className="px-3.5 pt-1"
        initial={reduced ? false : { clipPath: 'inset(-24px 100% -24px 0px)' }}
        animate={{ clipPath: 'inset(-24px 0% -24px 0px)' }}
        transition={{ duration: reduced ? 0 : DIAGRAMM.linienDauer, ease: EASE }}
      >
        <svg
          viewBox={`0 0 ${BREITE} ${HOEHE}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={`schlafphasen von ${vonUhr} bis ${bisUhr}: ${kacheln
            .map((k) => `${k.label} ${formatDauer(k.minuten)}`)
            .join(', ')}`}
        >
          <defs>
            {/* das leuchten ist die einzige stelle mit weicher kante in der app —
                ohne es wirkt die kurve wie ein technischer plot, nicht wie eine nacht */}
            <filter id={glanz} x="-5%" y="-40%" width="110%" height="180%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          <g filter={`url(#${glanz})`}>
            {linien(STRICH + 1, 0.16, false)}
            {/* der traum leuchtet staerker, so wie er die nacht auch praegt */}
            {linien(STRICH + 2, 0.5, true)}
          </g>

          {linien(STRICH, 1, false)}

          {/* kurzes wachwerden: ein strich auf der wachhoehe, kein ausschlag */}
          {unruhen.map((u) => (
            <line
              key={u.von}
              x1={u.von}
              x2={u.bis}
              y1={OBEN}
              y2={OBEN}
              stroke={FARBE.wach}
              strokeWidth={STRICH + 0.4}
              strokeOpacity="0.5"
              strokeLinecap="round"
            />
          ))}

          <text
            x="0"
            y={ACHSE_Y}
            textAnchor="start"
            fill="var(--kreide)"
            fontSize="9"
            className="tnum"
          >
            {vonUhr}
          </text>
          {marken.map((m) => (
            <text
              key={m}
              x={position(m, von, bis) * BREITE}
              y={ACHSE_Y}
              textAnchor="middle"
              fill="var(--kreide-52)"
              fontSize="9"
              className="tnum"
            >
              {nachtUhrzeit(m).slice(0, 2)}
            </text>
          ))}
          <text
            x={BREITE}
            y={ACHSE_Y}
            textAnchor="end"
            fill="var(--kreide)"
            fontSize="9"
            className="tnum"
          >
            {bisUhr}
          </text>
        </svg>
      </motion.div>

      {unruhen.length > 0 && (
        <p className="mx-3.5 mt-1 text-pretty text-[10px] text-kreide-52">
          striche oben: {unruhen.length}× kurz wach, unter {PHASEN_SCHWELLE} minuten
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 border-t border-linie">
        {kacheln.map((kachel, index) => (
          <div
            key={kachel.key}
            className={`min-w-0 px-3 py-2.5 ${index % 2 === 1 ? 'border-l border-linie' : ''} ${
              index >= 2 ? 'border-t border-linie' : ''
            }`}
          >
            <dt className="flex items-center gap-1.5 text-[10px] text-kreide-52">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: FARBE[kachel.key] }}
              />
              <span className="truncate">{kachel.label}</span>
            </dt>
            <dd className="mt-1 flex items-baseline justify-between gap-2">
              <span className="tnum truncate text-[14px] font-semibold text-kreide">
                {formatDauer(kachel.minuten)}
              </span>
              <span className="tnum shrink-0 text-[10px] text-kreide-52">
                {kachel.key === 'wach' && analyse.wachphasenAnzahl > 0
                  ? `${analyse.wachphasenAnzahl}×`
                  : `${kachel.prozent}%`}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
