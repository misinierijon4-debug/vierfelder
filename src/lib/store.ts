import { useCallback, useEffect, useRef, useState } from 'react'
import type { Backend } from './backend'
import { gewichtKey, tickKey } from './types'
import type {
  AreaId,
  Aufenthalt,
  Einheit,
  Einheiten,
  Ereignis,
  Gewichte,
  Schlafnacht,
  UserId,
  Zustand,
} from './types'
import { baueEinheit, fuegeHinzu, mitWert, ohneEinheit, ohneTag } from './tracker'

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
  const [einheiten, setEinheiten] = useState<Einheiten>({})
  const [gewichte, setGewichte] = useState<Gewichte>({})
  const [schlaf, setSchlaf] = useState<Schlafnacht[]>([])
  // messungen schreibt nur die datenbank, deshalb gibt es hier kein ref und
  // keine optimistische rücknahme: der zustand ändert sich nur beim laden.
  const [aufenthalte, setAufenthalte] = useState<Aufenthalt[]>([])
  const [ladezustand, setLadezustand] = useState<Ladezustand>('laden')
  const [fehler, setFehler] = useState<string | null>(null)
  const [ereignis, setEreignis] = useState<Ereignis | null>(null)
  /** ohne die tabelle `einheiten` bleibt es bei einer einheit pro tag */
  const [altbestand, setAltbestand] = useState(false)

  /**
   * was „rückgängig" zurücknimmt. beim abhaken merkt sich das die einheiten
   * mitsamt ihren minuten — sonst käme nach dem versehentlichen abhaken ein
   * leerer eintrag zurück statt der stunde, die da stand.
   */
  const letzteAktion = useRef<
    { art: 'neu'; area: AreaId; tag: string; einheit: Einheit } | 
    { art: 'weg'; area: AreaId; tag: string; einheiten: Einheit[] } |
    null
  >(null)

  const einheitenRef = useRef<Einheiten>({})
  const gewichteRef = useRef<Gewichte>({})
  const meRef = useRef<UserId>('erijon')

  const uebernimm = useCallback((next: Einheiten) => {
    einheitenRef.current = next
    setEinheiten(next)
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
        einheitenRef.current = anfang.einheiten
        gewichteRef.current = anfang.gewichte
        setMe(anfang.me)
        setEinheiten(anfang.einheiten)
        setGewichte(anfang.gewichte)
        setSchlaf(anfang.schlaf)
        setAufenthalte(anfang.aufenthalte)
        setAltbestand(anfang.altbestand)
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
      const einheit = e.einheit
      // über die id zusammengeführt: ein doppelt gemeldetes ereignis ändert
      // nichts, und ein eigener schreibvorgang kommt nicht doppelt zurück.
      const vorher = einheitenRef.current
      const next =
        e.art === 'neu'
          ? fuegeHinzu(vorher, einheit)
          : e.art === 'weg'
            ? ohneEinheit(vorher, einheit.id)
            : mitWert(vorher, einheit.id, einheit.wert)
      if (next === vorher) return
      uebernimm(next)

      if (e.art === 'wert') return
      const gesetzt = (next[tickKey(einheit.user, einheit.area, einheit.tag)] ?? []).length > 0

      // nur live eintreffende ereignisse werden animiert
      if (document.visibilityState === 'visible') {
        setEreignis({
          id: ++ereignisId,
          user: einheit.user,
          area: einheit.area,
          tag: einheit.tag,
          gesetzt,
          quelle: einheit.user === meRef.current ? 'selbst' : 'fremd',
        })
      }
    })

    return () => {
      aktiv = false
      abmelden()
    }
  }, [backend, uebernimm])

  /** legt eine weitere durchführung an. gibt sie zurück, damit undo sie kennt */
  const einheitHinzu = useCallback(
    (area: AreaId, tag: string): Einheit => {
      const u = meRef.current
      const vorher = einheitenRef.current
      const einheit = baueEinheit(u, area, tag, null)

      letzteAktion.current = { art: 'neu', area, tag, einheit }
      uebernimm(fuegeHinzu(vorher, einheit))
      setEreignis({
        id: ++ereignisId,
        user: u,
        area,
        tag,
        gesetzt: true,
        quelle: 'selbst',
      })
      setFehler(null)

      backend.schreibeEinheit(einheit).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })

      return einheit
    },
    [backend, uebernimm]
  )

  /** nimmt eine einzelne durchführung zurück */
  const einheitWeg = useCallback(
    (einheit: Einheit) => {
      const vorher = einheitenRef.current
      const next = ohneEinheit(vorher, einheit.id)
      uebernimm(next)
      setEreignis({
        id: ++ereignisId,
        user: einheit.user,
        area: einheit.area,
        tag: einheit.tag,
        gesetzt: (next[tickKey(einheit.user, einheit.area, einheit.tag)] ?? []).length > 0,
        quelle: 'selbst',
      })
      setFehler(null)

      backend.loescheEinheit(einheit).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, uebernimm]
  )

  /** der an/aus-schalter: an legt die erste einheit an, aus räumt den tag */
  const toggle = useCallback(
    (area: AreaId, tag: string) => {
      const u = meRef.current
      const vorher = einheitenRef.current
      const vorhandene = vorher[tickKey(u, area, tag)] ?? []

      if (vorhandene.length === 0) {
        einheitHinzu(area, tag)
        return
      }

      letzteAktion.current = { art: 'weg', area, tag, einheiten: vorhandene }
      uebernimm(ohneTag(vorher, u, area, tag))
      setEreignis({ id: ++ereignisId, user: u, area, tag, gesetzt: false, quelle: 'selbst' })
      setFehler(null)

      backend.loescheTag(vorhandene).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, einheitHinzu, uebernimm]
  )

  /**
   * „rückgängig" macht genau die letzte handlung rückgängig: eine angelegte
   * einheit verschwindet wieder, ein abgehakter tag kommt mit allen einheiten
   * und ihren minuten zurück. dieselben ids, also legt das nichts doppelt an.
   */
  const rueckgaengig = useCallback(
    (area: AreaId, tag: string) => {
      const aktion = letzteAktion.current
      if (!aktion || aktion.area !== area || aktion.tag !== tag) {
        // nichts gemerkt: dann ist der schalter die ehrlichste antwort
        toggle(area, tag)
        return
      }
      letzteAktion.current = null

      if (aktion.art === 'neu') {
        einheitWeg(aktion.einheit)
        return
      }

      const u = meRef.current
      const vorher = einheitenRef.current
      let next = vorher
      for (const e of aktion.einheiten) next = fuegeHinzu(next, e)
      uebernimm(next)
      setEreignis({ id: ++ereignisId, user: u, area, tag, gesetzt: true, quelle: 'selbst' })
      setFehler(null)

      Promise.all(aktion.einheiten.map((e) => backend.schreibeEinheit(e))).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, einheitWeg, toggle, uebernimm]
  )

  /** minuten oder seiten einer einzelnen einheit */
  const setWert = useCallback(
    (einheit: Einheit, v: number) => {
      const vorher = einheitenRef.current
      const sauber = Math.max(0, Math.round(v))
      uebernimm(mitWert(vorher, einheit.id, sauber))

      backend.schreibeEinheitWert(einheit, sauber).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, uebernimm]
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

  const zustand: Zustand = { einheiten, gewichte, aufenthalte }

  return {
    me,
    zustand,
    schlaf,
    ladezustand,
    fehler,
    ereignis,
    altbestand,
    toggle,
    einheitHinzu,
    rueckgaengig,
    setWert,
    setzeGewicht,
  }
}
