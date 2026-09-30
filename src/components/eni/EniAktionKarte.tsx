import { useEffect, useMemo, useState } from 'react'
import { aktionsId, beschreibeAktion, knopfText, pruefeAktion } from '../../lib/eniAktion'
import type { EniAktion } from '../../lib/eniAktion'
import { IconCheck } from './EniSymbole'

/**
 * Nach so langer Zeit gilt ein Vorschlag nicht mehr. „heute“ in einer Antwort
 * von vorgestern hiesse sonst etwas anderes, als ENI gemeint hat, und ein
 * alter Knopf im Verlauf ist eine Einladung zum versehentlichen Tipp.
 */
const GUELTIG_MS = 36 * 60 * 60 * 1000

function liesErledigt(id: string): boolean {
  try {
    return localStorage.getItem(`eni-aktion:${id}`) === 'erledigt'
  } catch {
    return false
  }
}

function merkeErledigt(id: string) {
  try {
    localStorage.setItem(`eni-aktion:${id}`, 'erledigt')
  } catch {
    /* ohne speicher bleibt der knopf; ein zweiter tipp legt wegen der festen id nichts doppelt an */
  }
}

type Props = {
  /** der inhalt des ```aktion-blocks */
  quelle: string
  nachrichtId: string
  /** die stelle des blocks in der nachricht, fuer die feste id */
  nr: number
  /** wann ENI das geschrieben hat: daran haengen „heute“ und „gestern“ */
  erstellt: string
  ausfuehren: (aktion: EniAktion, id: string) => Promise<void>
}

/**
 * Ein Vorschlag von ENI als Karte: was geschrieben wuerde, und ein Knopf.
 * ENI selbst schreibt nie; erst dieser Tipp tut es, mit denselben Wegen und
 * Regeln wie der Tracker. Die id steht fest (`aktionsId`), ein zweiter Tipp
 * legt also nichts doppelt an.
 */
export function EniAktionKarte({ quelle, nachrichtId, nr, erstellt, ausfuehren }: Props) {
  const geschrieben = useMemo(() => new Date(erstellt), [erstellt])
  const urteil = useMemo(() => pruefeAktion(quelle, geschrieben), [quelle, geschrieben])
  const abgelaufen = Date.now() - geschrieben.getTime() > GUELTIG_MS
  const [id, setId] = useState<string | null>(null)
  const [stand, setStand] = useState<'bereit' | 'laeuft' | 'erledigt'>('bereit')
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let vorbei = false
    void aktionsId(nachrichtId, nr).then((neu) => {
      if (vorbei) return
      setId(neu)
      if (liesErledigt(neu)) setStand('erledigt')
    })
    return () => {
      vorbei = true
    }
  }, [nachrichtId, nr])

  if (!urteil.ok) {
    return <p className="text-[13px] leading-snug text-kreide-60">{urteil.grund}</p>
  }
  const aktion = urteil.aktion

  const tippe = async () => {
    if (!id || stand !== 'bereit') return
    setStand('laeuft')
    setFehler(null)
    try {
      await ausfuehren(aktion, id)
      merkeErledigt(id)
      setStand('erledigt')
    } catch (ursache) {
      setFehler(ursache instanceof Error ? ursache.message : 'hat nicht geklappt.')
      setStand('bereit')
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border border-linie bg-flaeche px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-kreide-52">vorschlag</p>
        <p className="mt-0.5 text-[15px] font-semibold leading-snug text-kreide">{beschreibeAktion(aktion, geschrieben)}</p>
        {fehler && (
          <p role="alert" className="mt-1 text-[12px] leading-snug text-kreide-60">
            {fehler}
          </p>
        )}
      </div>
      {stand === 'erledigt' ? (
        <p role="status" className="flex shrink-0 items-center gap-1.5 text-[13px] text-kreide-60">
          <IconCheck size={14} />
          {aktion.typ === 'ansage' ? 'angesagt' : 'eingetragen'}
        </p>
      ) : abgelaufen ? (
        <p className="shrink-0 text-[12px] text-kreide-52">nicht mehr aktuell</p>
      ) : (
        <button
          type="button"
          onClick={() => {
            void tippe()
          }}
          disabled={!id || stand === 'laeuft'}
          className="min-h-11 shrink-0 border border-kreide px-4 text-[14px] font-semibold text-kreide transition-opacity disabled:opacity-50"
        >
          {stand === 'laeuft' ? '…' : knopfText(aktion)}
        </button>
      )}
    </div>
  )
}
