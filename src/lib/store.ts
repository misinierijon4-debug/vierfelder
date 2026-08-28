import { useCallback, useEffect, useRef, useState } from 'react'
import type { Backend } from './backend'
import { gewichtKey, tickKey, wertKey } from './types'
import type {
  AreaId,
  Aufenthalt,
  Ereignis,
  Gewichte,
  Schlafnacht,
  Ticks,
  UserId,
  Werte,
  Zustand,
} from './types'

let ereignisId = 0

function istProfilfehler(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith('kein profil')
}

function fehlertext(e: unknown): string {
  if (istProfilfehler(e)) return (e as Error).message
  const code = (e as { code?: string } | null)?.code
  if (code === 'PGRST301' || code === '401') {
    return 'anmeldung abgelaufen. lade die seite neu.'
  }
  return 'daten konnten nicht geladen werden. prüfe die verbindung und lade neu.'
}

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
  const [gewichte, setGewichte] = useState<Gewichte>({})
  const [schlaf, setSchlaf] = useState<Schlafnacht[]>([])
  // messungen schreibt nur die datenbank, deshalb gibt es hier kein ref und
  // keine optimistische rücknahme: der zustand ändert sich nur beim laden.
  const [aufenthalte, setAufenthalte] = useState<Aufenthalt[]>([])
  const [ladezustand, setLadezustand] = useState<Ladezustand>('laden')
  const [fehler, setFehler] = useState<string | null>(null)
  const [ereignis, setEreignis] = useState<Ereignis | null>(null)

  const ticksRef = useRef<Ticks>({})
  const werteRef = useRef<Werte>({})
  const gewichteRef = useRef<Gewichte>({})
  const meRef = useRef<UserId>('erijon')

  const uebernimm = useCallback((next: Ticks) => {
    ticksRef.current = next
    setTicks(next)
  }, [])

  useEffect(() => {
    let aktiv = true
    setLadezustand('laden')

    /**
     * direkt nach dem anmelden kann eine abfrage noch mit dem alten token
     * rausgehen und 401 kassieren. das ist vorbei, bevor man es lesen kann,
     * also einmal still nachfassen statt den nutzer in eine sackgasse zu schicken.
     */
    const versuche = async (rest: number): Promise<void> => {
      try {
        const anfang = await backend.laden()
        if (!aktiv) return
        meRef.current = anfang.me
        ticksRef.current = anfang.ticks
        werteRef.current = anfang.werte
        gewichteRef.current = anfang.gewichte
        setMe(anfang.me)
        setTicks(anfang.ticks)
        setWerte(anfang.werte)
        setGewichte(anfang.gewichte)
        setSchlaf(anfang.schlaf)
        setAufenthalte(anfang.aufenthalte)
        setLadezustand('bereit')
        setFehler(null)
      } catch (e: unknown) {
        if (!aktiv) return
        if (rest > 0 && !istProfilfehler(e)) {
          await new Promise((r) => setTimeout(r, 700))
          if (!aktiv) return
          return versuche(rest - 1)
        }
        setLadezustand('fehler')
        setFehler(fehlertext(e))
      }
    }

    void versuche(1)

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

  const setzeGewicht = useCallback(
    (tag: string, kg: number) => {
      const u = meRef.current
      const vorher = gewichteRef.current
      // auf hundert gramm runden, und zwar hier: sonst kommt aus 81,4 + 0,1 der
      // wert 81.50000000000001, den die datenbank rundet und die anzeige beim
      // neuladen sichtbar ändert.
      const sauber = Math.round(kg * 10) / 10
      const next: Gewichte = { ...vorher }
      const key = gewichtKey(u, tag)
      if (sauber <= 0) delete next[key]
      else next[key] = sauber

      gewichteRef.current = next
      setGewichte(next)

      backend.schreibeGewicht(tag, sauber).catch(() => {
        gewichteRef.current = vorher
        setGewichte(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend]
  )

  const zustand: Zustand = { ticks, werte, gewichte, aufenthalte }

  return { me, zustand, schlaf, ladezustand, fehler, ereignis, toggle, setWert, setzeGewicht }
}
