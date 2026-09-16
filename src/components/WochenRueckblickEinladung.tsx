import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fromKey, weekDays } from '../lib/dates'
import { oeffneEniWoche } from '../lib/eniRoute'
import {
  ladeEniWochenEinladungen,
  schliesseEniWochenEinladung,
} from '../lib/wochenEinladung'
import type { WochenEinladung } from '../lib/wochenEinladung'
import { wochenZeitraum } from '../lib/kalender'
import { WOCHENBERICHT_VORLAGE } from '../../supabase/functions/_shared/eniVorlagen'

export type WochenRueckblickEinladungProps = {
  /** Die Einladung gehoert immer zum aktuell angemeldeten Auth-Konto. */
  kontoId: string | null
  /** Lokal gespeicherte Beispieldaten duerfen keine echte Einladung anzeigen. */
  art?: 'supabase' | 'lokal'
  /** Nur fuer deterministische Tests und fuer den Render-Moment relevant. */
  jetzt?: Date
  /** Wird beim Oeffnen auf den ENI-Wochenkontext gesetzt. */
  onWocheOeffnen?: (wochenbeginn: string) => void
  /** Alias fuer kleine Einbettungen mit bestehendem Callback-Namen. */
  onOeffnen?: (wochenbeginn: string) => void
}

function faellig(einladung: WochenEinladung, jetzt: number): boolean {
  const zeit = Date.parse(einladung.faellig_am)
  return Number.isFinite(zeit) && zeit <= jetzt
}

function bereich(woche: string): string {
  return wochenZeitraum(weekDays(fromKey(woche)))
}

function istSichtbarUndOnline(): boolean {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  return true
}

export function WochenRueckblickEinladung({
  kontoId,
  art = 'supabase',
  jetzt,
  onWocheOeffnen,
  onOeffnen,
}: WochenRueckblickEinladungProps) {
  const [einladungen, setEinladungen] = useState<WochenEinladung[]>([])
  const [beobachtetAm, setBeobachtetAm] = useState(() => jetzt?.getTime() ?? Date.now())
  const [fehler, setFehler] = useState<string | null>(null)
  const [schliessendeWoche, setSchliessendeWoche] = useState<string | null>(null)
  const generation = useRef(0)
  const jetztStempel = jetzt?.getTime()

  const lade = useCallback(async () => {
    if (art !== 'supabase' || !kontoId || !istSichtbarUndOnline()) return
    const meineGeneration = ++generation.current
    const renderZeit = jetztStempel ?? Date.now()
    setBeobachtetAm(renderZeit)
    try {
      const geladen = await ladeEniWochenEinladungen()
      if (meineGeneration !== generation.current) return
      setEinladungen(geladen)
      setFehler(null)
    } catch (ursache) {
      if (meineGeneration !== generation.current) return
      setFehler(ursache instanceof Error ? ursache.message : 'wochenrückblick konnte nicht geladen werden.')
    }
  }, [art, kontoId, jetztStempel])

  useEffect(() => {
    generation.current += 1
    setEinladungen([])
    setFehler(null)
    setSchliessendeWoche(null)
    if (art !== 'supabase' || !kontoId) return

    void lade()
    const timer = window.setInterval(() => {
      if (istSichtbarUndOnline()) void lade()
    }, 60_000)
    const beiFokus = () => {
      if (istSichtbarUndOnline()) void lade()
    }
    const beiSichtbarkeit = () => {
      if (istSichtbarUndOnline()) void lade()
    }
    const beiOnline = () => void lade()
    window.addEventListener('focus', beiFokus)
    document.addEventListener('visibilitychange', beiSichtbarkeit)
    window.addEventListener('online', beiOnline)
    return () => {
      generation.current += 1
      window.clearInterval(timer)
      window.removeEventListener('focus', beiFokus)
      document.removeEventListener('visibilitychange', beiSichtbarkeit)
      window.removeEventListener('online', beiOnline)
    }
  }, [art, kontoId, lade])

  const faellige = useMemo(
    () => einladungen.filter((einladung) => faellig(einladung, beobachtetAm)),
    [beobachtetAm, einladungen],
  )
  const naechste = faellige[0] ?? null

  const oeffnen = (woche: string) => {
    if (onWocheOeffnen) onWocheOeffnen(woche)
    else if (onOeffnen) onOeffnen(woche)
    else oeffneEniWoche(woche)
  }

  const schliessen = async (einladung: WochenEinladung) => {
    if (schliessendeWoche) return
    setSchliessendeWoche(einladung.wochenbeginn)
    setFehler(null)
    try {
      const bestaetigt = await schliesseEniWochenEinladung(einladung.wochenbeginn)
      if (
        !bestaetigt
        || bestaetigt.wochenbeginn !== einladung.wochenbeginn
        || bestaetigt.geschlossen_am === null
      ) {
        throw new Error('die woche konnte nicht bestätigt geschlossen werden. bitte versuche es erneut.')
      }
      setEinladungen((vorher) => vorher.filter((item) => item.wochenbeginn !== einladung.wochenbeginn))
    } catch (ursache) {
      setFehler(ursache instanceof Error ? ursache.message : 'woche konnte nicht geschlossen werden.')
    } finally {
      setSchliessendeWoche(null)
    }
  }

  if (art !== 'supabase' || !kontoId) return null
  if (!naechste) return fehler ? (
    <p role="status" className="mt-2 text-[11px] text-kreide-60">{fehler}</p>
  ) : null

  const anzahl = faellige.length
  return (
    <section
      aria-label="wochenrückblick einladung"
      className="mt-3 border-y border-linie bg-flaeche/45 px-3 py-3 text-kreide"
    >
      <p className="text-[13px] font-semibold leading-5 text-pretty">
        {WOCHENBERICHT_VORLAGE}
      </p>
      <p className="mt-1 text-[11px] text-kreide-60">
        {bereich(naechste.wochenbeginn)}
        {` · ${anzahl} ${anzahl === 1 ? 'offene Woche' : 'offene Wochen'}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <button
          type="button"
          className="min-h-11 px-0.5 text-[12px] font-semibold underline decoration-linie-hell underline-offset-4"
          onClick={() => oeffnen(naechste.wochenbeginn)}
        >
          Woche ansehen
        </button>
        <button
          type="button"
          className="min-h-11 px-0.5 text-[12px] text-kreide-60 underline decoration-linie-hell underline-offset-4 disabled:opacity-50"
          disabled={schliessendeWoche !== null}
          onClick={() => void schliessen(naechste)}
        >
          Schließen
        </button>
      </div>
      {fehler && (
        <p role="status" className="mt-2 text-[11px] text-kreide-60">{fehler}</p>
      )}
    </section>
  )
}
