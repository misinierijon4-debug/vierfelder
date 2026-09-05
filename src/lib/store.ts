import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Backend, Wetten } from './backend'
import {
  gewichtKey,
  neueNotenId,
  tickKey,
} from './types'
import type {
  Abrechnung,
  AreaId,
  Aufenthalt,
  Einheit,
  Einheiten,
  Ereignis,
  Fach,
  Gewichte,
  GewichtQuellen,
  Note,
  Notenart,
  Notenstand,
  Schlafnacht,
  TickQuelle,
  UserId,
  Zustand,
} from './types'
import {
  baueEinheit,
  fuegeHinzu,
  mitEinheit,
  mitAufenthalt,
  mitGewicht,
  mitNacht,
  mitWert,
  mitVon,
  ohneEinheit,
  ohneTag,
} from './tracker'
import { istNotenDatum, notenGewicht } from './noten'
import {
  phasenLadeKey,
  phasenLadezustand,
} from './schlafLaden'
import type {
  PhasenLadezustand,
  PhasenTransportzustand,
} from './schlafLaden'

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
export type AbrechnungSchreibstatus = 'speichern' | 'fehler'

type VerlaufAnfrage = {
  id: symbol
  backendLauf: symbol
  controller: AbortController
}

function istAbbruch(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError'
}

/**
 * hält den zustand, schreibt optimistisch und nimmt bei fehlern zurück.
 * refs statt state als schreibgrundlage: zwei taps im selben tick würden sich
 * sonst gegenseitig überschreiben, weil react erst danach neu rendert.
 */
export function useTracker(backend: Backend) {
  const [me, setMe] = useState<UserId>('erijon')
  const [einheiten, setEinheiten] = useState<Einheiten>({})
  const [gewichte, setGewichte] = useState<Gewichte>({})
  const [gewichtQuellen, setGewichtQuellen] = useState<GewichtQuellen>({})
  const [schlaf, setSchlaf] = useState<Schlafnacht[]>([])
  const [phasenTransport, setPhasenTransport] = useState<
    Record<string, PhasenTransportzustand>
  >({})
  // messungen schreibt nur die datenbank, deshalb gibt es hier kein ref und
  // keine optimistische rücknahme: der zustand ändert sich nur beim laden.
  const [aufenthalte, setAufenthalte] = useState<Aufenthalt[]>([])
  const [wetten, setWetten] = useState<Wetten>({})
  const [abrechnungen, setAbrechnungen] = useState<Abrechnung[]>([])
  const [abrechnungStatus, setAbrechnungStatus] = useState<Record<string, AbrechnungSchreibstatus>>({})
  const [faecher, setFaecher] = useState<Fach[]>([])
  const [noten, setNoten] = useState<Note[]>([])
  const [ladezustand, setLadezustand] = useState<Ladezustand>('laden')
  const [fehler, setFehler] = useState<string | null>(null)
  const [ereignis, setEreignis] = useState<Ereignis | null>(null)
  /** ohne die tabelle `einheiten` bleibt es bei einer einheit pro tag */
  const [altbestand, setAltbestand] = useState(false)
  const [einheitVonVerfuegbar, setEinheitVonVerfuegbar] = useState(false)

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

  /**
   * welche verlaeufe gerade unterwegs sind. ohne das loeste jeder render des
   * nachtdetails eine weitere abfrage derselben nacht aus.
   */
  const verlaeufeUnterwegs = useRef(new Map<string, VerlaufAnfrage>())
  const verlaufBeobachter = useRef(new Map<string, Set<symbol>>())
  const startePhasenAbrufRef = useRef(
    (_user: UserId, _nacht: string, _erneut: boolean) => {}
  )

  const einheitenRef = useRef<Einheiten>({})
  const gewichteRef = useRef<Gewichte>({})
  const gewichtQuellenRef = useRef<GewichtQuellen>({})
  const schlafRef = useRef<Schlafnacht[]>([])
  const phasenTransportRef = useRef<Record<string, PhasenTransportzustand>>({})

  /**
   * hält fest, wie eine zahl entstanden ist. `null` heißt: der eintrag ist weg.
   * eine getippte zahl braucht keinen eintrag — sie ist der normalfall, und ein
   * leerer schlüssel darf nie als messung gelesen werden.
   */
  const merkeGewichtQuelle = useCallback(
    (u: UserId, tag: string, q: TickQuelle | null) => {
      const key = gewichtKey(u, tag)
      const vorher = gewichtQuellenRef.current
      if (q === 'gemessen' ? vorher[key] === 'gemessen' : vorher[key] === undefined) return
      const next = { ...vorher }
      if (q === 'gemessen') next[key] = 'gemessen'
      else delete next[key]
      gewichtQuellenRef.current = next
      setGewichtQuellen(next)
    },
    []
  )
  const meRef = useRef<UserId>('erijon')
  const wettenRef = useRef<Wetten>({})
  const abrechnungenRef = useRef<Abrechnung[]>([])
  const abrechnungStatusRef = useRef<Record<string, AbrechnungSchreibstatus>>({})
  const faecherRef = useRef<Fach[]>([])
  const notenRef = useRef<Note[]>([])

  /**
   * je einheit der zuletzt losgeschickte schreibvorgang. schreiben derselben
   * einheit laufen nacheinander, weil das netz die reihenfolge nicht garantiert:
   * käme das anlegen nach dem ersten wertupdate an, ginge das update auf eine
   * zeile, die es noch nicht gibt — ohne fehler, die minuten wären still weg.
   * Und zwei schnelle schritte könnten sich in der datenbank vertauschen.
   */
  const kette = useRef(new Map<string, Promise<unknown>>())

  /**
   * Ein Backendwechsel ist zugleich ein Wechsel der Daten- und oft der
   * Benutzeridentitaet. Der Lauf-Token verhindert, dass alte Eventhandler oder
   * spaete Promise-Antworten in den neu geladenen Zustand schreiben.
   */
  const backendLauf = useMemo(() => Symbol('backend-lauf'), [backend])
  const aktiveLadungRef = useRef<symbol | null>(null)
  const bereiteLadungRef = useRef<symbol | null>(null)

  const merkeAbrechnungStatus = useCallback(
    (woche: string, status: AbrechnungSchreibstatus | null) => {
      const vorher = abrechnungStatusRef.current
      if (status === null && vorher[woche] === undefined) return
      if (status !== null && vorher[woche] === status) return
      const next = { ...vorher }
      if (status === null) delete next[woche]
      else next[woche] = status
      abrechnungStatusRef.current = next
      setAbrechnungStatus(next)
    },
    []
  )

  useLayoutEffect(() => {
    aktiveLadungRef.current = backendLauf
    bereiteLadungRef.current = null
    letzteAktion.current = null
    kette.current.clear()
    for (const anfrage of verlaeufeUnterwegs.current.values()) anfrage.controller.abort()
    verlaeufeUnterwegs.current.clear()
    verlaufBeobachter.current.clear()
    phasenTransportRef.current = {}
    setPhasenTransport({})
    abrechnungStatusRef.current = {}
    setAbrechnungStatus({})

    return () => {
      if (aktiveLadungRef.current === backendLauf) aktiveLadungRef.current = null
      if (bereiteLadungRef.current === backendLauf) bereiteLadungRef.current = null
      for (const anfrage of verlaeufeUnterwegs.current.values()) {
        if (anfrage.backendLauf === backendLauf) anfrage.controller.abort()
      }
      verlaeufeUnterwegs.current.clear()
      verlaufBeobachter.current.clear()
      phasenTransportRef.current = {}
    }
  }, [backendLauf])

  const istAktuell = useCallback(
    () => aktiveLadungRef.current === backendLauf,
    [backendLauf]
  )

  const darfSchreiben = useCallback(
    () => istAktuell() && bereiteLadungRef.current === backendLauf,
    [backendLauf, istAktuell]
  )

  const nacheinander = useCallback((ids: string[], schreibe: () => Promise<void>) => {
    const laufende = ids.map((id) => kette.current.get(id)).filter(Boolean)
    const lauf = Promise.allSettled(laufende).then(schreibe)
    // die kette selbst darf nicht abreißen; den fehler behandelt der aufrufer
    const still = lauf.catch(() => {})
    for (const id of ids) kette.current.set(id, still)
    void still.then(() => {
      for (const id of ids) if (kette.current.get(id) === still) kette.current.delete(id)
    })
    return lauf
  }, [])

  const uebernimm = useCallback((next: Einheiten) => {
    einheitenRef.current = next
    setEinheiten(next)
  }, [])

  const uebernimmSchlaf = useCallback((next: Schlafnacht[]) => {
    schlafRef.current = next
    setSchlaf(next)
  }, [])

  const merkePhasenTransport = useCallback(
    (key: string, status: PhasenTransportzustand | null) => {
      const vorher = phasenTransportRef.current
      if (status === null && vorher[key] === undefined) return
      if (
        status !== null &&
        vorher[key]?.status === status.status &&
        (status.status !== 'error' ||
          (vorher[key] as Extract<PhasenTransportzustand, { status: 'error' }>).text === status.text)
      ) return

      const next = { ...vorher }
      if (status === null) delete next[key]
      else next[key] = status
      phasenTransportRef.current = next
      setPhasenTransport(next)
    },
    []
  )

  useEffect(() => {
    let aktiv = true
    bereiteLadungRef.current = null
    setLadezustand('laden')

    /**
     * direkt nach dem anmelden kann eine abfrage noch mit dem alten token
     * rausgehen und 401 kassieren. das ist vorbei, bevor man es lesen kann,
     * also einmal still nachfassen statt den nutzer in eine sackgasse zu schicken.
     */
    const versuche = async (rest: number): Promise<void> => {
      try {
        const anfang = await backend.laden()
        if (!aktiv || !istAktuell()) return
        meRef.current = anfang.me
        einheitenRef.current = anfang.einheiten
        gewichteRef.current = anfang.gewichte
        gewichtQuellenRef.current = anfang.gewichtQuellen
        wettenRef.current = anfang.wetten
        abrechnungenRef.current = anfang.abrechnungen
        faecherRef.current = anfang.noten.faecher
        notenRef.current = anfang.noten.noten
        setMe(anfang.me)
        setEinheiten(anfang.einheiten)
        setGewichte(anfang.gewichte)
        setGewichtQuellen(anfang.gewichtQuellen)
        uebernimmSchlaf(anfang.schlaf)
        phasenTransportRef.current = {}
        setPhasenTransport({})
        setAufenthalte(anfang.aufenthalte)
        setWetten(anfang.wetten)
        setAbrechnungen(anfang.abrechnungen)
        setFaecher(anfang.noten.faecher)
        setNoten(anfang.noten.noten)
        setEinheitVonVerfuegbar(anfang.einheitVonVerfuegbar)
        setAltbestand(anfang.altbestand)
        bereiteLadungRef.current = backendLauf
        setLadezustand('bereit')
        setFehler(null)
      } catch (e: unknown) {
        if (!aktiv || !istAktuell()) return
        if (rest > 0 && !istProfilfehler(e)) {
          await new Promise((r) => setTimeout(r, 700))
          if (!aktiv) return
          return versuche(rest - 1)
        }
        bereiteLadungRef.current = null
        setLadezustand('fehler')
        setFehler(fehlertext(e))
      }
    }

    void versuche(1)

    const abmelden = backend.abonniere((e) => {
      if (!aktiv || !istAktuell()) return
      if (e.typ === 'wette') {
        const next = { ...wettenRef.current, [e.woche]: e.text }
        wettenRef.current = next
        setWetten(next)
        return
      }

      if (e.typ === 'abrechnung') {
        const vorher = abrechnungenRef.current
        const ohne = vorher.filter((a) => a.woche !== e.abrechnung.woche)
        const next = [...ohne, e.abrechnung].sort((a, b) => (a.woche < b.woche ? -1 : 1))
        abrechnungenRef.current = next
        setAbrechnungen(next)
        merkeAbrechnungStatus(e.abrechnung.woche, null)
        return
      }

      if (e.typ === 'fach') {
        const vorher = faecherRef.current
        const ohne = vorher.filter((fach) => fach.id !== e.fach.id)
        const next = e.art === 'weg' ? ohne : [...ohne, e.fach]
        faecherRef.current = next
        setFaecher(next)
        if (e.art === 'weg') {
          const neueNoten = notenRef.current.filter((note) => note.fachId !== e.fach.id)
          notenRef.current = neueNoten
          setNoten(neueNoten)
        }
        return
      }

      if (e.typ === 'note') {
        const vorher = notenRef.current
        const ohne = vorher.filter((note) => note.id !== e.note.id)
        const next = e.art === 'weg' ? ohne : [...ohne, e.note]
        notenRef.current = next
        setNoten(next)
        return
      }

      // eine nacht ersetzt die vorhandene derselben person: ein zweiter lauf
      // des kurzbefehls meldet dieselbe nacht noch einmal, und zwei zeilen für
      // eine nacht würden den kalender und den wochenschnitt verdoppeln
      if (e.typ === 'schlaf') {
        const user = e.art === 'weg' ? e.user : e.nacht.user
        const nachtKey = e.art === 'weg' ? e.nacht : e.nacht.nacht
        const key = phasenLadeKey(user, nachtKey)
        const anfrage = verlaeufeUnterwegs.current.get(key)
        if (anfrage) {
          anfrage.controller.abort()
          verlaeufeUnterwegs.current.delete(key)
        }
        merkePhasenTransport(key, null)
        if (e.art === 'weg') {
          verlaufBeobachter.current.delete(key)
          uebernimmSchlaf(
            schlafRef.current.filter((n) => n.user !== e.user || n.nacht !== e.nacht)
          )
        } else {
          uebernimmSchlaf(mitNacht(schlafRef.current, e.nacht))
          if (
            e.nacht.phasen === null &&
            (verlaufBeobachter.current.get(key)?.size ?? 0) > 0
          ) {
            queueMicrotask(() => startePhasenAbrufRef.current(user, nachtKey, false))
          }
        }
        return
      }

      // ein gewicht vom zweiten gerät. eine eigene, noch laufende schreibung
      // darf es nicht überholen — deshalb geht es über dieselbe ref wie der
      // optimistische weg und nicht an ihr vorbei
      if (e.typ === 'gewicht') {
        merkeGewichtQuelle(e.user, e.tag, e.kg === null ? null : e.quelle ?? 'getippt')
        const vorher = gewichteRef.current
        const next = mitGewicht(vorher, e.user, e.tag, e.kg)
        if (next === vorher) return
        gewichteRef.current = next
        setGewichte(next)
        return
      }

      // ankunft legt an, abgang schließt: dieselbe ankunft kommt zweimal, das
      // zweite mal mit abgang. der schlüssel ist person, bereich und ankunft
      if (e.typ === 'aufenthalt') {
        setAufenthalte((vorher) => mitAufenthalt(vorher, e.aufenthalt))
        return
      }

      const einheit = e.einheit
      // über die id zusammengeführt: ein doppelt gemeldetes ereignis ändert
      // nichts, und ein eigener schreibvorgang kommt nicht doppelt zurück.
      const vorher = einheitenRef.current
      const next =
        e.art === 'neu'
          ? fuegeHinzu(vorher, einheit)
          : e.art === 'weg'
            ? ohneEinheit(vorher, einheit.id)
            : mitEinheit(vorher, einheit)
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
      if (bereiteLadungRef.current === backendLauf) bereiteLadungRef.current = null
      abmelden()
    }
  }, [
    backend,
    backendLauf,
    istAktuell,
    merkeAbrechnungStatus,
    merkePhasenTransport,
    uebernimm,
    uebernimmSchlaf,
  ])

  /** legt eine weitere durchführung an. gibt sie zurück, damit undo sie kennt */
  const einheitHinzu = useCallback(
    (area: AreaId, tag: string, von: string | null = null): Einheit | null => {
      if (!darfSchreiben()) return null
      const u = meRef.current
      const vorher = einheitenRef.current
      const einheit = baueEinheit(u, area, tag, null, new Date(), von)

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

      nacheinander([einheit.id], () => backend.schreibeEinheit(einheit)).catch(() => {
        if (!darfSchreiben()) return
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })

      return einheit
    },
    [backend, darfSchreiben, nacheinander, uebernimm]
  )

  /** nimmt eine einzelne durchführung zurück */
  const einheitWeg = useCallback(
    (einheit: Einheit) => {
      if (!darfSchreiben()) return
      if (einheit.user !== meRef.current) return
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

      nacheinander([einheit.id], () => backend.loescheEinheit(einheit)).catch(() => {
        if (!darfSchreiben()) return
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, nacheinander, uebernimm]
  )

  /** der an/aus-schalter: an legt die erste einheit an, aus räumt den tag */
  const toggle = useCallback(
    (area: AreaId, tag: string) => {
      if (!darfSchreiben()) return
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

      nacheinander(
        vorhandene.map((e) => e.id),
        () => backend.loescheTag(vorhandene)
      ).catch(() => {
        if (!darfSchreiben()) return
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, einheitHinzu, nacheinander, uebernimm]
  )

  /**
   * „rückgängig" macht genau die letzte handlung rückgängig: eine angelegte
   * einheit verschwindet wieder, ein abgehakter tag kommt mit allen einheiten
   * und ihren minuten zurück. dieselben ids, also legt das nichts doppelt an.
   */
  const rueckgaengig = useCallback(
    (area: AreaId, tag: string) => {
      if (!darfSchreiben()) return
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

      Promise.all(
        aktion.einheiten.map((e) => nacheinander([e.id], () => backend.schreibeEinheit(e)))
      ).catch(() => {
        if (!darfSchreiben()) return
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, einheitWeg, nacheinander, toggle, uebernimm]
  )

  /** setzt den wert einer einzelnen einheit — das detail bearbeitet jede zeile */
  const wertSetzen = useCallback(
    (id: string, wert: number) => {
      if (!darfSchreiben()) return
      const vorher = einheitenRef.current
      const einheit = Object.values(vorher)
        .flat()
        .find((e) => e.id === id)
      if (!einheit) return
      const sauber = Math.max(0, Math.round(wert))
      uebernimm(mitWert(vorher, id, sauber))
      setFehler(null)
      nacheinander([id], () => backend.schreibeEinheitWert(einheit, sauber)).catch(() => {
        if (!darfSchreiben()) return
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, nacheinander, uebernimm]
  )

  /** setzt die durchführungszeit einer einzelnen einheit. null löscht sie */
  const zeitSetzen = useCallback(
    (id: string, von: string | null) => {
      if (!darfSchreiben()) return
      const vorher = einheitenRef.current
      const einheit = Object.values(vorher)
        .flat()
        .find((e) => e.id === id)
      if (!einheit) return
      uebernimm(mitVon(vorher, id, von))
      setFehler(null)
      nacheinander([id], () => backend.schreibeEinheitVon(einheit, von)).catch(() => {
        if (!darfSchreiben()) return
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, nacheinander, uebernimm]
  )

  /** archiviert erst nach kanonischer Backend-Bestaetigung; die erste Zeile gewinnt */
  const abrechnungHinzu = useCallback(
    (a: Abrechnung) => {
      if (!darfSchreiben()) return
      if (abrechnungenRef.current.some((x) => x.woche === a.woche)) return
      if (abrechnungStatusRef.current[a.woche] === 'speichern') return
      merkeAbrechnungStatus(a.woche, 'speichern')
      setFehler(null)
      backend.schreibeAbrechnung(a)
        .then((kanonisch) => {
          if (!darfSchreiben()) return
          const aktuell = abrechnungenRef.current
          const neue = [
            ...aktuell.filter((x) => x.woche !== kanonisch.woche),
            kanonisch,
          ].sort((x, y) => (x.woche < y.woche ? -1 : 1))
          abrechnungenRef.current = neue
          setAbrechnungen(neue)
          merkeAbrechnungStatus(a.woche, null)
        })
        .catch(() => {
          if (!darfSchreiben()) return
          // Kam die echte Zeile bereits per Realtime, ist die verlorene
          // HTTP-Antwort kein fachlicher Fehler mehr.
          if (abrechnungenRef.current.some((x) => x.woche === a.woche)) {
            merkeAbrechnungStatus(a.woche, null)
            return
          }
          merkeAbrechnungStatus(a.woche, 'fehler')
          setFehler('wochenabschluss fehlgeschlagen.')
        })
    },
    [backend, darfSchreiben, merkeAbrechnungStatus]
  )

  /**
   * minuten oder seiten der jüngsten einheit eines tages, um `delta` verschoben.
   * gerechnet wird auf dem ref, nicht auf dem wert, den der render gerade
   * zeigt: zwei schritte kurz hintereinander gingen sonst beide von derselben
   * zahl aus, und der zweite überschriebe den ersten mit demselben ergebnis.
   */
  const wertAendern = useCallback(
    (area: AreaId, tag: string, delta: number) => {
      if (!darfSchreiben()) return
      const u = meRef.current
      const vorher = einheitenRef.current
      const liste = vorher[tickKey(u, area, tag)] ?? []
      const letzte = liste[liste.length - 1]

      if (!letzte) {
        // gemessen und trotzdem nichts getippt: das gibt es beim lesen, wo der
        // fokus die zeit misst und die seiten niemand kennt. dann legt der
        // erste schritt die einheit an, statt ins leere zu laufen.
        if (delta <= 0) return
        const neue = einheitHinzu(area, tag)
        if (!neue) return
        const nachAnlegen = einheitenRef.current
        const erster = Math.max(0, Math.round(delta))
        uebernimm(mitWert(nachAnlegen, neue.id, erster))

        // dieselbe id in der schlange: das anlegen ist durch, bevor der wert
        // auf eine zeile geht, die es sonst noch nicht gäbe.
        nacheinander([neue.id], () => backend.schreibeEinheitWert(neue, erster)).catch(() => {
          if (!darfSchreiben()) return
          uebernimm(nachAnlegen)
          setFehler('nicht gespeichert. tippe nochmal.')
        })
        return
      }

      const sauber = Math.max(0, Math.round((letzte.wert ?? 0) + delta))
      uebernimm(mitWert(vorher, letzte.id, sauber))
      setFehler(null)

      nacheinander([letzte.id], () => backend.schreibeEinheitWert(letzte, sauber)).catch(() => {
        if (!darfSchreiben()) return
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, einheitHinzu, nacheinander, uebernimm]
  )

  const setzeGewicht = useCallback(
    (tag: string, kg: number) => {
      if (!darfSchreiben()) return
      const u = meRef.current
      const vorher = gewichteRef.current
      const vorherQuellen = gewichtQuellenRef.current
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
      // die app schreibt nur getippte zahlen. eine messung kommt über die
      // automation zurück und setzt die quelle dann selbst.
      merkeGewichtQuelle(u, tag, sauber <= 0 ? null : 'getippt')

      backend.schreibeGewicht(tag, sauber).catch(() => {
        if (!darfSchreiben()) return
        gewichteRef.current = vorher
        setGewichte(vorher)
        gewichtQuellenRef.current = vorherQuellen
        setGewichtQuellen(vorherQuellen)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, merkeGewichtQuelle]
  )

  /**
   * Startet genau einen Verlaufabruf je Nacht. Die individuelle Request-ID
   * verhindert, dass ein spaeter Abschluss eines abgebrochenen Abrufs einen
   * neueren Retry entfernt oder dessen Zustand ueberschreibt.
   */
  const startePhasenAbruf = useCallback(
    (user: UserId, nacht: string, erneut: boolean) => {
      if (!darfSchreiben()) return
      const key = phasenLadeKey(user, nacht)
      const vorhanden = schlafRef.current.find((n) => n.user === user && n.nacht === nacht)
      if (!vorhanden || vorhanden.phasen !== null) return
      if (verlaeufeUnterwegs.current.has(key)) return
      if (!erneut && phasenTransportRef.current[key]?.status === 'error') return

      const anfrage: VerlaufAnfrage = {
        id: Symbol('phasen-abruf'),
        backendLauf,
        controller: new AbortController(),
      }
      verlaeufeUnterwegs.current.set(key, anfrage)
      merkePhasenTransport(key, { status: 'loading' })

      void backend
        .ladePhasen(user, nacht, anfrage.controller.signal)
        .then((phasen) => {
          const aktuell = verlaeufeUnterwegs.current.get(key)
          if (
            !darfSchreiben() ||
            aktuell?.id !== anfrage.id ||
            aktuell.backendLauf !== backendLauf
          ) return
          const nachtJetzt = schlafRef.current.find(
            (eintrag) => eintrag.user === user && eintrag.nacht === nacht
          )
          if (nachtJetzt?.phasen === null) {
            uebernimmSchlaf(mitNacht(schlafRef.current, { ...nachtJetzt, phasen }))
          }
          merkePhasenTransport(key, null)
        })
        .catch((e: unknown) => {
          const aktuell = verlaeufeUnterwegs.current.get(key)
          if (
            aktuell?.id !== anfrage.id ||
            aktuell.backendLauf !== backendLauf ||
            !darfSchreiben()
          ) return
          merkePhasenTransport(
            key,
            istAbbruch(e)
              ? null
              : { status: 'error', text: 'verlauf konnte nicht geladen werden.' }
          )
        })
        .finally(() => {
          if (verlaeufeUnterwegs.current.get(key)?.id === anfrage.id) {
            verlaeufeUnterwegs.current.delete(key)
          }
        })
    },
    [backend, backendLauf, darfSchreiben, merkePhasenTransport, uebernimmSchlaf]
  )
  useLayoutEffect(() => {
    startePhasenAbrufRef.current = startePhasenAbruf
    return () => {
      if (startePhasenAbrufRef.current === startePhasenAbruf) {
        startePhasenAbrufRef.current = () => {}
      }
    }
  }, [startePhasenAbruf])

  /**
   * Registriert eine sichtbare Nacht als Consumer. Der um eine Microtask
   * verzoegerte Abbruch laesst Reacts StrictMode setup/cleanup/setup dieselbe
   * Anfrage weiterverwenden, beendet sie aber beim echten Nachtwechsel.
   */
  const phasenNachladen = useCallback(
    (user: UserId, nacht: string): (() => void) | void => {
      if (!darfSchreiben()) return
      const key = phasenLadeKey(user, nacht)
      const consumer = Symbol('phasen-consumer')
      const consumers = verlaufBeobachter.current.get(key) ?? new Set<symbol>()
      consumers.add(consumer)
      verlaufBeobachter.current.set(key, consumers)
      startePhasenAbruf(user, nacht, false)

      return () => {
        const aktuell = verlaufBeobachter.current.get(key)
        aktuell?.delete(consumer)
        if (aktuell?.size === 0) verlaufBeobachter.current.delete(key)
        queueMicrotask(() => {
          if ((verlaufBeobachter.current.get(key)?.size ?? 0) > 0) return
          const anfrage = verlaeufeUnterwegs.current.get(key)
          if (!anfrage || anfrage.backendLauf !== backendLauf) return
          anfrage.controller.abort()
          verlaeufeUnterwegs.current.delete(key)
          merkePhasenTransport(key, null)
        })
      }
    },
    [backendLauf, darfSchreiben, merkePhasenTransport, startePhasenAbruf]
  )

  const phasenNeuLaden = useCallback(
    (user: UserId, nacht: string) => startePhasenAbruf(user, nacht, true),
    [startePhasenAbruf]
  )

  const setzeWette = useCallback(
    (woche: string, text: string) => {
      if (!darfSchreiben()) return
      const sauber = text.trim().replace(/\s+/g, ' ').slice(0, 160)
      if (!sauber) return
      const vorher = wettenRef.current
      const next = { ...vorher, [woche]: sauber }
      wettenRef.current = next
      setWetten(next)
      setFehler(null)
      backend.schreibeWette(woche, sauber).catch(() => {
        if (!darfSchreiben()) return
        wettenRef.current = vorher
        setWetten(vorher)
        setFehler('wetteinsatz nicht gespeichert. versuch es nochmal.')
      })
    },
    [backend, darfSchreiben]
  )

  /**
   * es gibt genau ein muendliches pruefungsfach je person — die vierte pruefung
   * neben den drei lk. der eindeutige index in der datenbank laesst kein zweites
   * zu, deshalb faellt das alte erst weg und das neue kommt danach.
   */
  const setzePruefungsfach = useCallback(
    (fachId: string, nummer: number | null) => {
      if (!darfSchreiben()) return
      if (nummer !== null && nummer !== 4) return
      const fach = faecherRef.current.find((x) => x.id === fachId)
      if (!fach || fach.user !== meRef.current || fach.kursart !== 'gk') return
      const altes = nummer === null
        ? undefined
        : faecherRef.current.find(
            (x) => x.user === meRef.current && x.id !== fachId && x.pruefungsfach !== null
          )
      const vorher = faecherRef.current
      const next = vorher.map((x) =>
        x.id === fachId ? { ...x, pruefungsfach: nummer }
          : x.id === altes?.id ? { ...x, pruefungsfach: null }
          : x
      )
      faecherRef.current = next
      setFaecher(next)
      setFehler(null)
      const ids = altes ? [fachId, altes.id] : [fachId]
      nacheinander(ids, async () => {
        if (altes) await backend.setzePruefungsfach(altes.id, null)
        await backend.setzePruefungsfach(fachId, nummer)
      }).catch(() => {
        if (!darfSchreiben()) return
        faecherRef.current = vorher
        setFaecher(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, nacheinander]
  )

  const noteHinzu = useCallback(
    (fachId: string, punkte: number, art: Notenart, datum: string, titel = ''): Note | null => {
      if (!darfSchreiben()) return null
      const fach = faecherRef.current.find((x) => x.id === fachId)
      if (!fach || fach.user !== meRef.current || !istNotenDatum(datum)) return null
      const note: Note = {
        id: neueNotenId(),
        user: meRef.current,
        fachId,
        art,
        punkte: Math.min(15, Math.max(0, Math.round(punkte))),
        gewicht: notenGewicht(art),
        datum,
        titel: titel.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').slice(0, 40),
      }
      const vorher = notenRef.current
      const next = [...vorher, note]
      notenRef.current = next
      setNoten(next)
      setFehler(null)
      nacheinander([note.id], () => backend.schreibeNote(note)).catch(() => {
        if (!darfSchreiben()) return
        notenRef.current = vorher
        setNoten(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
      return note
    },
    [backend, darfSchreiben, nacheinander]
  )

  const noteLoeschen = useCallback(
    (id: string) => {
      if (!darfSchreiben()) return
      const note = notenRef.current.find((x) => x.id === id)
      if (!note || note.user !== meRef.current) return
      const vorher = notenRef.current
      const next = vorher.filter((x) => x.id !== id)
      notenRef.current = next
      setNoten(next)
      setFehler(null)
      nacheinander([id], () => backend.loescheNote(id)).catch(() => {
        if (!darfSchreiben()) return
        notenRef.current = vorher
        setNoten(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, darfSchreiben, nacheinander]
  )

  // eine stabile identität: sonst wäre jeder render ein neuer zustand und
  // jedes useMemo darauf wertlos.
  const zustand = useMemo<Zustand>(
    () => ({ einheiten, gewichte, gewichtQuellen, aufenthalte }),
    [einheiten, gewichte, gewichtQuellen, aufenthalte]
  )

  const notenstand = useMemo<Notenstand>(() => ({ faecher, noten }), [faecher, noten])

  const phasenLadezustaende = useMemo<Record<string, PhasenLadezustand>>(() => {
    const next: Record<string, PhasenLadezustand> = {}
    for (const nacht of schlaf) {
      const key = phasenLadeKey(nacht.user, nacht.nacht)
      next[key] = phasenLadezustand(nacht, phasenTransport[key])
    }
    return next
  }, [phasenTransport, schlaf])

  return {
    me,
    zustand,
    schlaf,
    phasenLadezustaende,
    wetten,
    abrechnungen,
    abrechnungStatus,
    notenstand,
    ladezustand,
    fehler,
    ereignis,
    altbestand,
    einheitVonVerfuegbar,
    toggle,
    einheitHinzu,
    einheitWeg,
    rueckgaengig,
    wertAendern,
    wertSetzen,
    zeitSetzen,
    setzeGewicht,
    setzeWette,
    abrechnungHinzu,
    setzePruefungsfach,
    noteHinzu,
    noteLoeschen,
    phasenNachladen,
    phasenNeuLaden,
  }
}
