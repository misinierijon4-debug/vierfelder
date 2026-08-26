import { useCallback, useEffect, useRef, useState } from 'react'
import type { Backend } from './backend'
import { tickKey, wertKey } from './types'
import type { AreaId, Ereignis, Ticks, UserId, Werte, Zustand } from './types'

let ereignisId = 0

type Ladezustand = 'laden' | 'bereit' | 'fehler'

/**
 * hält den zustand, schreibt optimistisch und nimmt bei fehlern zurück.
 * refs statt state als schreibgrundlage: zwei taps im selben tick würden sich
 * sonst gegenseitig überschreiben, weil react erst danach neu rendert.
 */
export function useTracker(backend: Backend) {
  const [me, setMe] = useState<UserId>('erijon')
  const [ticks, setTicks] = useState<Ticks>({})
  const [werte, setWerte] = useState<Werte>({})
  const [ladezustand, setLadezustand] = useState<Ladezustand>('laden')
  const [fehler, setFehler] = useState<string | null>(null)
  const [ereignis, setEreignis] = useState<Ereignis | null>(null)

  const ticksRef = useRef<Ticks>({})
  const werteRef = useRef<Werte>({})
  const meRef = useRef<UserId>('erijon')

  const uebernimm = useCallback((next: Ticks) => {
    ticksRef.current = next
    setTicks(next)
  }, [])

  useEffect(() => {
    let aktiv = true
    setLadezustand('laden')

    backend
      .laden()
      .then((anfang) => {
        if (!aktiv) return
        meRef.current = anfang.me
        ticksRef.current = anfang.ticks
        werteRef.current = anfang.werte
        setMe(anfang.me)
        setTicks(anfang.ticks)
        setWerte(anfang.werte)
        setLadezustand('bereit')
        setFehler(null)
      })
      .catch((e: unknown) => {
        if (!aktiv) return
        setLadezustand('fehler')
        setFehler(
          e instanceof Error && e.message.startsWith('kein profil')
            ? e.message
            : 'daten konnten nicht geladen werden. prüfe die verbindung und lade neu.'
        )
      })

    const abmelden = backend.abonniere((e) => {
      const key = tickKey(e.user, e.area, e.tag)
      const next = { ...ticksRef.current }
      if (e.gesetzt) next[key] = true
      else delete next[key]
      uebernimm(next)

      // nur live eintreffende ereignisse werden animiert
      if (document.visibilityState === 'visible') {
        setEreignis({
          id: ++ereignisId,
          user: e.user,
          area: e.area,
          tag: e.tag,
          gesetzt: e.gesetzt,
          quelle: e.user === meRef.current ? 'selbst' : 'fremd',
        })
      }
    })

    return () => {
      aktiv = false
      abmelden()
    }
  }, [backend, uebernimm])

  const toggle = useCallback(
    (area: AreaId, tag: string) => {
      const u = meRef.current
      const vorher = ticksRef.current
      const key = tickKey(u, area, tag)
      const gesetzt = vorher[key] !== true

      const next = { ...vorher }
      if (gesetzt) next[key] = true
      else delete next[key]

      uebernimm(next)
      setEreignis({ id: ++ereignisId, user: u, area, tag, gesetzt, quelle: 'selbst' })
      setFehler(null)

      backend.schreibeTick(area, tag, gesetzt).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, uebernimm]
  )

  const setWert = useCallback(
    (area: AreaId, tag: string, v: number) => {
      const vorher = werteRef.current
      const sauber = Math.max(0, Math.round(v))
      const next: Werte = { ...vorher }
      const key = wertKey(area, tag)
      if (sauber === 0) delete next[key]
      else next[key] = sauber

      werteRef.current = next
      setWerte(next)

      backend.schreibeWert(area, tag, sauber).catch(() => {
        werteRef.current = vorher
        setWerte(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend]
  )

  const zustand: Zustand = { ticks, werte }

  return { me, zustand, ladezustand, fehler, ereignis, toggle, setWert }
}
