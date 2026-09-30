import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  alleRollen, EINSTELLUNGEN_GESPEICHERT, ladeEinstellungen, mitRolle, speichereEinstellungen,
} from '../../lib/eniEinstellungen'
import type { EniEinstellungen } from '../../lib/eniEinstellungen'
import { IconCaretDown, IconCheck } from './EniSymbole'
import { useMenueDaneben } from './useMenueDaneben'

const API = { laden: ladeEinstellungen, speichern: speichereEinstellungen }

type Props = {
  kontoId: string | null
  gesperrt?: boolean
  onSpeichert?: (speichert: boolean) => void
  api?: typeof API
}

/** dieselben rollen wie in „ENI anpassen“, direkt am chat erreichbar. */
export function EniRollenwahl({ kontoId, gesperrt = false, onSpeichert, api = API }: Props) {
  const [offen, setOffen] = useState(false)
  const [stand, setStand] = useState<EniEinstellungen | null>(null)
  const [laedt, setLaedt] = useState(false)
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [position, setPosition] = useState({ links: 0, hoehe: 352 })
  const huelle = useRef<HTMLDivElement>(null)
  const knopf = useRef<HTMLButtonElement>(null)
  const menue = useRef<HTMLDivElement>(null)
  const ladeNr = useRef(0)
  const schreibt = useRef(false)
  const lebt = useRef(true)
  const id = useId()
  const schliessen = useCallback(() => setOffen(false), [])
  useMenueDaneben(offen, huelle, schliessen)

  const laden = useCallback(async () => {
    const nr = ++ladeNr.current
    setLaedt(true)
    setFehler(null)
    try {
      const geladen = await api.laden()
      if (lebt.current && nr === ladeNr.current) setStand(geladen)
    } catch (ursache) {
      if (lebt.current && nr === ladeNr.current) setFehler((ursache as Error).message)
    } finally {
      if (lebt.current && nr === ladeNr.current) setLaedt(false)
    }
  }, [api])

  useEffect(() => {
    lebt.current = true
    void laden()
    const aktualisieren = () => { if (!schreibt.current) void laden() }
    window.addEventListener(EINSTELLUNGEN_GESPEICHERT, aktualisieren)
    return () => {
      lebt.current = false
      ladeNr.current++
      window.removeEventListener(EINSTELLUNGEN_GESPEICHERT, aktualisieren)
    }
  }, [laden])

  useEffect(() => { if (gesperrt) setOffen(false) }, [gesperrt])

  // auch mit tastatur und langen eigenen rollennamen bleibt das popup im bild.
  useLayoutEffect(() => {
    if (!offen) return
    const messen = () => {
      const rahmen = huelle.current?.getBoundingClientRect()
      if (!rahmen) return
      const breite = Math.min(290, window.innerWidth - 32)
      setPosition({
        links: Math.min(0, window.innerWidth - 16 - rahmen.left - breite),
        hoehe: Math.max(44, Math.min(352, rahmen.top - (window.visualViewport?.offsetTop ?? 0) - 16)),
      })
    }
    messen()
    const ereignisse: [EventTarget | undefined, string][] = [
      [window, 'resize'], [window.visualViewport ?? undefined, 'resize'], [window.visualViewport ?? undefined, 'scroll'],
    ]
    ereignisse.forEach(([ziel, art]) => ziel?.addEventListener(art, messen))
    return () => ereignisse.forEach(([ziel, art]) => ziel?.removeEventListener(art, messen))
  }, [offen])

  useLayoutEffect(() => {
    if (!offen || laedt) return
    const ziel = menue.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?? menue.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    ziel?.focus({ preventScroll: true })
  }, [offen, laedt])

  async function umschalten(id: string) {
    if (schreibt.current || gesperrt || laedt) return
    schreibt.current = true
    setSpeichert(true)
    setFehler(null)
    onSpeichert?.(true)
    try {
      // frisch lesen, damit ton, anweisungen und andere rollen erhalten bleiben.
      const aktuell = await api.laden()
      const rolle = alleRollen(aktuell).find((r) => r.id === id)
      if (!rolle) throw new Error('Rolle nicht mehr vorhanden.')
      const neu = mitRolle(aktuell, { ...rolle, aktiv: !rolle.aktiv })
      await api.speichern(kontoId, neu)
      if (lebt.current) setStand(neu)
    } catch (ursache) {
      if (lebt.current) setFehler((ursache as Error).message)
    } finally {
      schreibt.current = false
      if (lebt.current) { setSpeichert(false); onSpeichert?.(false) }
    }
  }

  const rollen = stand ? alleRollen(stand) : []
  const aktiv = rollen.filter((r) => r.aktiv)
  const titel = aktiv.length === 1 ? aktiv[0]!.name : aktiv.length ? `${aktiv.length} Rollen` : 'Rollen'

  return (
    <div ref={huelle} className="relative min-w-0 shrink"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) schliessen()
      }}
    >
      <button ref={knopf} type="button" disabled={gesperrt || speichert}
        aria-haspopup="menu" aria-expanded={offen} aria-controls={offen ? id : undefined}
        aria-label={`Rollen wählen${aktiv.length ? `, aktiv: ${aktiv.map((r) => r.name).join(', ')}` : ''}`}
        onClick={() => { if (!offen) void laden(); setOffen((war) => !war) }}
        className="flex min-h-11 min-w-11 max-w-[8rem] items-center gap-1 rounded-xl px-2 text-sm text-kreide-60 transition-colors hover:bg-linie hover:text-kreide disabled:opacity-40"
      >
        <span className="truncate" style={{ color: aktiv.length ? 'var(--kreide)' : undefined }}>{titel}</span>
        <IconCaretDown size={12} className="shrink-0" />
      </button>
        {offen && (
          <div ref={menue} id={id} role="menu" aria-label="ENI-Rollen" aria-busy={laedt || speichert}
            style={{ left: position.links, maxHeight: position.hoehe }}
            className="absolute bottom-full z-30 mb-2 w-[290px] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-linie-hell bg-flaeche p-1.5"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault(); schliessen(); knopf.current?.focus({ preventScroll: true })
              }
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              const zeilen = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
              if (!zeilen.length) return
              const jetzt = zeilen.indexOf(document.activeElement as HTMLButtonElement)
              const naechste = event.key === 'Home' ? 0 : event.key === 'End' ? zeilen.length - 1
                : (jetzt + (event.key === 'ArrowUp' ? -1 : 1) + zeilen.length) % zeilen.length
              zeilen[naechste]?.focus()
            }}
          >
            <p className="px-2.5 py-2 text-xs text-kreide-52">Aktiv bei passenden Themen</p>
            {laedt && !stand ? <p role="status" className="px-2.5 py-3 text-sm text-kreide-60">lädt …</p> : rollen.map((rolle) => (
              <button key={rolle.id} type="button" role="menuitemcheckbox" aria-checked={rolle.aktiv}
                disabled={laedt || speichert || gesperrt} onClick={() => void umschalten(rolle.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-grund disabled:opacity-50"
                style={{ color: rolle.aktiv ? 'var(--kreide)' : 'var(--kreide-60)' }}
              >
                <span className="min-w-0 flex-1 break-words">{rolle.name}</span>
                <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-md border border-linie-hell">
                  {rolle.aktiv && <IconCheck size={12} />}
                </span>
              </button>
            ))}
            {speichert && <p role="status" className="px-2.5 py-2 text-xs text-kreide-52">speichert …</p>}
            {fehler && <div role="alert" className="border-t border-linie px-2.5 py-2 text-sm text-kreide-60">
              <p>{fehler}</p>
              {!stand && <button type="button" role="menuitem" onClick={() => void laden()} className="min-h-11 font-semibold text-kreide">erneut laden</button>}
            </div>}
          </div>
        )}
    </div>
  )
}
