import { useEffect, useState } from 'react'
import {
  AKTIVITAETS_ERINNERUNGEN,
  ladeAktivitaetsErinnerungen,
  setzeAktivitaetsErinnerung,
} from '../lib/aktivitaetsErinnerung'
import type { AktivitaetsArt, AktivitaetsEinstellungen } from '../lib/aktivitaetsErinnerung'
import { blockiereNeustart } from '../lib/pwaBlocker'

export function AktivitaetsErinnerungen() {
  const [werte, setWerte] = useState<AktivitaetsEinstellungen | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    ladeAktivitaetsErinnerungen()
      .then((w) => {
        if (aktiv) setWerte(w)
      })
      .catch(() => {
        if (aktiv) setFehler('erinnerungen konnten nicht geladen werden.')
      })
    return () => {
      aktiv = false
    }
  }, [])

  async function aendern(art: AktivitaetsArt, aktiv: boolean) {
    const freigeben = blockiereNeustart()
    setLaeuft(true)
    setFehler(null)
    try {
      await setzeAktivitaetsErinnerung(art, aktiv)
      setWerte((w) => w && { ...w, [`${art}_aktiv`]: aktiv })
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'speichern fehlgeschlagen.')
    } finally {
      setLaeuft(false)
      freigeben()
    }
  }

  if (!werte) {
    return fehler ? <p role="status" className="mt-2 text-kreide-60">{fehler}</p> : null
  }

  return (
    <>
      {AKTIVITAETS_ERINNERUNGEN.map((e) => (
        <label key={e.art} className="flex min-h-11 items-center gap-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={werte[`${e.art}_aktiv`]}
            disabled={laeuft}
            onChange={(event) => void aendern(e.art, event.target.checked)}
            aria-label={`${e.label} erinnern`}
            className="h-4 w-4 accent-current"
          />
          <span>
            <span className="block text-[12px] font-semibold text-kreide">{e.label}</span>
            <span className="block text-[11px] text-kreide-52">{e.beschreibung}</span>
          </span>
        </label>
      ))}
      {fehler && <p role="status" className="mt-2 text-kreide-60">{fehler}</p>}
    </>
  )
}