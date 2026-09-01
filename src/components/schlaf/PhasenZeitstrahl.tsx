import { useId, useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { NachtPhasenAnalyse } from '../../lib/schlafPhasen'
import {
  formatDauer,
  nachtUhrzeit,
  position,
  stundenmarken,
  verlauf,
  PHASEN_SCHWELLE,
} from '../../lib/schlafPhasen'
import { EBENE, nachtkurve } from '../../lib/nachtkurve'
import { DIAGRAMM, EASE } from '../../lib/motion'
import type { PhasenArt } from '../../lib/types'

type Props = {
  analyse: NachtPhasenAnalyse
}

/**
 * Die vier Phasenfarben gehoeren keiner Person, sie sind eine Legende: wach
 * ist die helle Linie oben, der Traum leuchtet, und je tiefer der Schlaf,
 * desto dunkler das Petrol. Die Farbe wiederholt die Hoehe, statt ihr zu
 * widersprechen. Sie stehen nur hier im Nachtdetail; das Wochenraster bleibt
 * zweifarbig.
 */
const FARBE: Record<PhasenArt, string> = {
  tief: 'var(--phase-tief)',
  rem: 'var(--phase-rem)',
  kern: 'var(--phase-kern)',
  unspez: 'var(--phase-kern)',
  wach: 'var(--phase-wach)',
}

/**
 * Der Verlauf ist eine Kurve, kein Balken — und ein einziger Pfad, keine Folge
 * von Teilstuecken.
 *
 * Ein Balken kann nur Farbe nebeneinander legen; die Nacht hat aber eine
 * Richtung — nach unten in den Tiefschlaf und wieder herauf. Die Kurve zeigt
 * genau das: die Breite bleibt die Uhr, die Hoehe ist die Schlaftiefe.
 *
 * Dass es ein einziger Pfad ist, ist keine Kosmetik. Vorher bekam jede Phase
 * ihren eigenen Pfad, und ob zwei davon aneinander stiessen, entschied ein
 * Vergleich zweier Pixelwerte. Health setzt seine Grenzen sekundengenau: eine
 * Sekunde Naht ist knapp breiter als die Toleranz war, und ab der ersten
 * solchen Naht zerfiel die Kurve in waagerechte Striche. Ein Pfad mit einem
 * einzigen `M` kann das nicht.
 */
const BREITE = 320
/** hoehe des kurvenfeldes; die vier ebenen liegen als anteil davon darin */
const KURVE_HOEHE = 104
const HOEHE = 132
/** grundlinie der uhrzeiten */
const ACHSE_Y = 126
/**
 * Strichstaerke der Kurve.
 *
 * Sie ist die Grenze der Aufloesung: was schmaler ist als der Strich, kann
 * keine Form mehr bilden, sondern nur noch eine Doppellinie — und die sieht
 * aus wie ein Fehler, nicht wie eine kurze Phase.
 */
const STRICH = 1.5
/** so nah an den rand darf keine stundenmarke, sonst stoesst sie an die eckzeit */
const RANDSCHUTZ = 42
/** groesse der uhrzeiten. die eckzeit ist fuenf zeichen breit, daher der randschutz */
const ACHSE_SCHRIFT = 10

export function PhasenZeitstrahl({ analyse }: Props) {
  const reduced = useReducedMotion()
  // useId liefert zeichen, die in einer url-referenz nichts zu suchen haben
  const roheId = useId()
  const id = roheId.replace(/[^a-zA-Z0-9]/g, '')
  const glanz = `glow-${id}`
  const verlaufId = `sleep-gradient-${id}`
  const traumId = `rem-gradient-${id}`

  const { kurve, unruhen, von, bis, marken } = useMemo(() => {
    const { linie, unruhen } = verlauf(analyse)
    // die achse gehoert dieser einen nacht: sie beginnt und endet an den
    // gemessenen zeiten, damit die aufloesung so fein wie moeglich bleibt
    const alle = [...linie, ...unruhen]
    const von = Math.min(analyse.einschlafMinute, ...alle.map((s) => s.von))
    const bis = Math.max(analyse.aufwachMinute, ...alle.map((s) => s.bis))
    // hoechstens sechs beschriftungen: die zwei eckzeiten und dazwischen volle
    // stunden. stuendlich sind das bei acht stunden neun zahlen unter einer
    // kurve, die von acht stunden erzaehlt — sie ueberlappen nicht, aber sie
    // sind rauschen. ab sechs stunden geht es deshalb in zwei-, ab zwoelf in
    // drei-stunden-schritten.
    const dauer = bis - von
    const schritt = dauer > 12 * 60 ? 180 : dauer > 6 * 60 ? 120 : 60
    return {
      kurve: nachtkurve(linie, von, bis, { breite: BREITE, hoehe: KURVE_HOEHE }),
      unruhen: unruhen.map((u) => ({
        schluessel: u.von,
        x: position((u.von + u.bis) / 2, von, bis) * BREITE,
      })),
      von,
      bis,
      marken: stundenmarken(von, bis, schritt).filter((m) => {
        const x = position(m, von, bis) * BREITE
        return x > RANDSCHUTZ && x < BREITE - RANDSCHUTZ
      }),
    }
  }, [analyse])

  if (!analyse.hatPhasenDaten || kurve.d === '') {
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
  const wachHoehe = EBENE.wach * KURVE_HOEHE
  /** die vier ebenen als hilfslinien, in derselben hoehe, die auch die kurve benutzt */
  const ebenen = [EBENE.wach, EBENE.rem, EBENE.kern, EBENE.tief]

  // reihenfolge wie in der kurve: von der wach-linie oben bis zum tiefschlaf
  const kacheln = [
    { key: 'wach' as const, label: 'wach', minuten: analyse.wachMinuten, prozent: analyse.wachProzent },
    { key: 'rem' as const, label: 'rem', minuten: analyse.remMinuten, prozent: analyse.remProzent },
    { key: 'kern' as const, label: 'kernschlaf', minuten: analyse.coreMinuten, prozent: analyse.coreProzent },
    { key: 'tief' as const, label: 'tiefschlaf', minuten: analyse.tiefMinuten, prozent: analyse.tiefProzent },
  ]

  /** dieselbe geometrie, nur in anderer staerke und farbe — nie ein zweiter pfad */
  const linie = (stroke: string, breite: number, deckkraft: number, filter?: string) => (
    <path
      d={kurve.d}
      fill="none"
      stroke={stroke}
      strokeWidth={breite}
      strokeOpacity={deckkraft}
      strokeLinecap="round"
      strokeLinejoin="round"
      filter={filter}
    />
  )

  // Eine Nacht ausserhalb des geladenen Fensters hat ihre Kennzahlen, aber
  // ihren Verlauf noch nicht. Ein durchgehender Block waere hier keine
  // Wartemeldung, sondern eine Behauptung ueber die Nacht — also steht hier,
  // was wirklich der Fall ist, in derselben Karte und ohne Sprung im Layout.
  if (!analyse.verlaufGeladen) {
    return (
      <div className="mt-4 overflow-hidden rounded-[2px] border border-linie bg-flaeche">
        <div className="px-3.5 pt-3">
          <span className="text-[11px] font-medium text-kreide">verlauf der nacht</span>
        </div>
        <div
          className="flex items-center justify-center px-3.5"
          style={{ height: `${KURVE_HOEHE}px` }}
          role="status"
        >
          <span className="text-[11px] text-kreide-52">verlauf wird geladen …</span>
        </div>
      </div>
    )
  }

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
            {/*
              Der Farbverlauf laeuft ueber die Uhr, nicht ueber die Hoehe: jede
              Marke sitzt an dem Anteil der Nacht, an dem ihre Phase beginnt.
              `userSpaceOnUse` statt der Voreinstellung, damit die Anteile sich
              auf die Zeitachse beziehen und nicht auf die zufaellige
              Bounding-Box des Pfades.
            */}
            <linearGradient
              id={verlaufId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={BREITE}
              y2="0"
            >
              {kurve.marken.map((marke, i) => (
                <stop
                  key={`${i}-${marke.offset}`}
                  offset={`${marke.offset * 100}%`}
                  style={{ stopColor: FARBE[marke.art] }}
                />
              ))}
            </linearGradient>

            {/*
              Derselbe Verlauf, aber nur dort sichtbar, wo getraeumt wurde. So
              bekommt REM sein staerkeres Leuchten, ohne dass die Kurve dafuer
              in Stuecke zerlegt werden muesste.
            */}
            <linearGradient
              id={traumId}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={BREITE}
              y2="0"
            >
              {kurve.marken.map((marke, i) => (
                <stop
                  key={`${i}-${marke.offset}`}
                  offset={`${marke.offset * 100}%`}
                  style={{ stopColor: FARBE.rem, stopOpacity: marke.art === 'rem' ? 1 : 0 }}
                />
              ))}
            </linearGradient>

            {/* das leuchten ist die einzige stelle mit weicher kante in der app —
                ohne es wirkt die kurve wie ein technischer plot, nicht wie eine nacht */}
            <filter
              id={glanz}
              filterUnits="userSpaceOnUse"
              x={-16}
              y={-16}
              width={BREITE + 32}
              height={KURVE_HOEHE + 32}
            >
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="coloredBlur" />
              </feMerge>
            </filter>
          </defs>

          {/*
            Vier Haarlinien auf den Hoehen der vier Ebenen. Ohne sie ist die
            Hoehe der Kurve nur relativ zu sich selbst lesbar: man sieht, dass
            es tiefer wird, aber nicht, dass es vier Stufen sind. Sie liegen in
            `--linie` wie jede andere Haarlinie der App — eine eigene, blassere
            Stufe waere auf dem Telefon nicht mehr da. Beschriftet sind sie
            nicht: die Legende darunter steht in derselben Reihenfolge.
          */}
          {ebenen.map((ebene) => (
            <line
              key={ebene}
              x1="0"
              x2={BREITE}
              y1={ebene * KURVE_HOEHE}
              y2={ebene * KURVE_HOEHE}
              stroke="var(--linie)"
              strokeWidth="1"
              shapeRendering="crispEdges"
            />
          ))}

          {/* dreimal derselbe pfad: schein, traumschein, linie */}
          {linie(`url(#${verlaufId})`, STRICH + 2.5, 0.28, `url(#${glanz})`)}
          {linie(`url(#${traumId})`, STRICH + 3.5, 0.5, `url(#${glanz})`)}
          {linie(`url(#${verlaufId})`, STRICH, 1)}

          {/* kurzes wachwerden: ein punkt auf der wachhoehe, kein ausschlag —
              als voller ausschlag waere eine minute umdrehen im bild genauso
              laut wie eine halbe stunde wachliegen */}
          {unruhen.map((u) => (
            <circle
              key={u.schluessel}
              cx={u.x}
              cy={wachHoehe}
              r={STRICH}
              fill={FARBE.wach}
              fillOpacity="0.45"
            />
          ))}

          <text
            x="0"
            y={ACHSE_Y}
            textAnchor="start"
            fill="var(--kreide)"
            fontSize={ACHSE_SCHRIFT}
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
              fontSize={ACHSE_SCHRIFT}
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
            fontSize={ACHSE_SCHRIFT}
            className="tnum"
          >
            {bisUhr}
          </text>
        </svg>
      </motion.div>

      {unruhen.length > 0 && (
        <p className="mx-3.5 mt-1 text-pretty text-[10px] text-kreide-52">
          punkte oben: {unruhen.length}× kurz wach, unter {PHASEN_SCHWELLE} minuten
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
