import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Backend, Wetten } from './backend'
import {
  GEWICHT_STANDARD,
  KLAUSUR_ANTEIL_STANDARD,
  gewichtKey,
  neueNotenId,
  tickKey,
} from './types'
import type {
  AreaId,
  Aufenthalt,
  Einheit,
  Einheiten,
  Ereignis,
  Fach,
  Gewichte,
  Note,
  Notenart,
  Notenstand,
  Schlafnacht,
  UserId,
  Zustand,
} from './types'
import {
  baueEinheit,
  fuegeHinzu,
  mitAufenthalt,
  mitGewicht,
  mitNacht,
  mitWert,
  ohneEinheit,
  ohneTag,
} from './tracker'

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
  const [wetten, setWetten] = useState<Wetten>({})
  const [faecher, setFaecher] = useState<Fach[]>([])
  const [noten, setNoten] = useState<Note[]>([])
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

  /**
   * welche verlaeufe gerade unterwegs sind. ohne das loeste jeder render des
   * nachtdetails eine weitere abfrage derselben nacht aus.
   */
  const verlaeufeUnterwegs = useRef(new Set<string>())

  const einheitenRef = useRef<Einheiten>({})
  const gewichteRef = useRef<Gewichte>({})
  const meRef = useRef<UserId>('erijon')
  const wettenRef = useRef<Wetten>({})
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
        wettenRef.current = anfang.wetten
        faecherRef.current = anfang.noten.faecher
        notenRef.current = anfang.noten.noten
        setMe(anfang.me)
        setEinheiten(anfang.einheiten)
        setGewichte(anfang.gewichte)
        setSchlaf(anfang.schlaf)
        setAufenthalte(anfang.aufenthalte)
        setWetten(anfang.wetten)
        setFaecher(anfang.noten.faecher)
        setNoten(anfang.noten.noten)
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
      if (e.typ === 'wette') {
        const next = { ...wettenRef.current, [e.woche]: e.text }
        wettenRef.current = next
        setWetten(next)
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
        setSchlaf((vorher) => mitNacht(vorher, e.nacht))
        return
      }

      // ein gewicht vom zweiten gerät. eine eigene, noch laufende schreibung
      // darf es nicht überholen — deshalb geht es über dieselbe ref wie der
      // optimistische weg und nicht an ihr vorbei
      if (e.typ === 'gewicht') {
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

      nacheinander([einheit.id], () => backend.schreibeEinheit(einheit)).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })

      return einheit
    },
    [backend, nacheinander, uebernimm]
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

      nacheinander([einheit.id], () => backend.loescheEinheit(einheit)).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, nacheinander, uebernimm]
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

      nacheinander(
        vorhandene.map((e) => e.id),
        () => backend.loescheTag(vorhandene)
      ).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, einheitHinzu, nacheinander, uebernimm]
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

      Promise.all(
        aktion.einheiten.map((e) => nacheinander([e.id], () => backend.schreibeEinheit(e)))
      ).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, einheitWeg, nacheinander, toggle, uebernimm]
  )

  /**
   * minuten oder seiten der jüngsten einheit eines tages, um `delta` verschoben.
   * gerechnet wird auf dem ref, nicht auf dem wert, den der render gerade
   * zeigt: zwei schritte kurz hintereinander gingen sonst beide von derselben
   * zahl aus, und der zweite überschriebe den ersten mit demselben ergebnis.
   */
  const wertAendern = useCallback(
    (area: AreaId, tag: string, delta: number) => {
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
        const nachAnlegen = einheitenRef.current
        const erster = Math.max(0, Math.round(delta))
        uebernimm(mitWert(nachAnlegen, neue.id, erster))

        // dieselbe id in der schlange: das anlegen ist durch, bevor der wert
        // auf eine zeile geht, die es sonst noch nicht gäbe.
        nacheinander([neue.id], () => backend.schreibeEinheitWert(neue, erster)).catch(() => {
          uebernimm(nachAnlegen)
          setFehler('nicht gespeichert. tippe nochmal.')
        })
        return
      }

      const sauber = Math.max(0, Math.round((letzte.wert ?? 0) + delta))
      uebernimm(mitWert(vorher, letzte.id, sauber))
      setFehler(null)

      nacheinander([letzte.id], () => backend.schreibeEinheitWert(letzte, sauber)).catch(() => {
        uebernimm(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, einheitHinzu, nacheinander, uebernimm]
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

  /**
   * holt den verlauf einer nacht nach, die ohne ihn geladen wurde.
   *
   * Fehler bleiben still: der Verlauf ist die Zugabe, die Nacht steht auch
   * ohne ihn vollstaendig da. Ein zweiter Aufruf laeuft nach einem Fehler
   * wieder los, weil der Schluessel dann nicht mehr gesperrt ist.
   */
  const phasenNachladen = useCallback(
    (user: UserId, nacht: string) => {
      const key = `${user}|${nacht}`
      if (verlaeufeUnterwegs.current.has(key)) return
      verlaeufeUnterwegs.current.add(key)

      void backend
        .ladePhasen(user, nacht)
        .then((phasen) => {
          setSchlaf((vorher) => {
            const vorhanden = vorher.find((n) => n.user === user && n.nacht === nacht)
            if (!vorhanden || vorhanden.phasen !== null) return vorher
            return mitNacht(vorher, { ...vorhanden, phasen })
          })
        })
        .catch(() => {})
        .finally(() => verlaeufeUnterwegs.current.delete(key))
    },
    [backend]
  )

  const setzeWette = useCallback(
    (woche: string, text: string) => {
      const sauber = text.trim().replace(/\s+/g, ' ').slice(0, 160)
      if (!sauber) return
      const vorher = wettenRef.current
      const next = { ...vorher, [woche]: sauber }
      wettenRef.current = next
      setWetten(next)
      setFehler(null)
      backend.schreibeWette(woche, sauber).catch(() => {
        wettenRef.current = vorher
        setWetten(vorher)
        setFehler('wetteinsatz nicht gespeichert. versuch es nochmal.')
      })
    },
    [backend]
  )

  const fachHinzu = useCallback(
    (name: string): Fach | null => {
      const sauber = name.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').slice(0, 24)
      if (!sauber) return null
      const u = meRef.current
      if (faecherRef.current.some((fach) => fach.user === u && fach.name === sauber)) return null
      const vorher = faecherRef.current
      const sortierung = Math.max(-1, ...vorher.filter((fach) => fach.user === u).map((fach) => fach.sortierung)) + 1
      const fach: Fach = {
        id: neueNotenId(),
        user: u,
        name: sauber,
        kursart: 'gf',
        klausurAnteil: KLAUSUR_ANTEIL_STANDARD,
        pruefungsfach: null,
        sortierung,
      }
      const next = [...vorher, fach]
      faecherRef.current = next
      setFaecher(next)
      setFehler(null)
      nacheinander([fach.id], () => backend.schreibeFach(fach)).catch(() => {
        faecherRef.current = vorher
        setFaecher(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
      return fach
    },
    [backend, nacheinander]
  )

  const fachAendern = useCallback(
    (fach: Fach) => {
      const sauber: Fach = {
        ...fach,
        name: fach.name.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').slice(0, 24),
        klausurAnteil: Math.min(100, Math.max(0, Math.round(fach.klausurAnteil))),
      }
      if (!sauber.name || sauber.user !== meRef.current) return
      const vorher = faecherRef.current
      const next = vorher.map((x) => x.id === sauber.id ? sauber : x)
      faecherRef.current = next
      setFaecher(next)
      setFehler(null)
      nacheinander([sauber.id], () => backend.aendereFach(sauber)).catch(() => {
        faecherRef.current = vorher
        setFaecher(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, nacheinander]
  )

  const fachLoeschen = useCallback(
    (id: string) => {
      const fach = faecherRef.current.find((x) => x.id === id)
      if (!fach || fach.user !== meRef.current) return
      const vorherFaecher = faecherRef.current
      const vorherNoten = notenRef.current
      const nextFaecher = vorherFaecher.filter((x) => x.id !== id)
      const nextNoten = vorherNoten.filter((x) => x.fachId !== id)
      faecherRef.current = nextFaecher
      notenRef.current = nextNoten
      setFaecher(nextFaecher)
      setNoten(nextNoten)
      setFehler(null)
      nacheinander([id], () => backend.loescheFach(id)).catch(() => {
        faecherRef.current = vorherFaecher
        notenRef.current = vorherNoten
        setFaecher(vorherFaecher)
        setNoten(vorherNoten)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, nacheinander]
  )

  const noteHinzu = useCallback(
    (fachId: string, punkte: number, art: Notenart, datum: string, titel = ''): Note | null => {
      const fach = faecherRef.current.find((x) => x.id === fachId)
      if (!fach || fach.user !== meRef.current) return null
      const note: Note = {
        id: neueNotenId(),
        user: meRef.current,
        fachId,
        art,
        punkte: Math.min(15, Math.max(0, Math.round(punkte))),
        gewicht: GEWICHT_STANDARD,
        datum,
        titel: titel.trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').slice(0, 40),
      }
      const vorher = notenRef.current
      const next = [...vorher, note]
      notenRef.current = next
      setNoten(next)
      setFehler(null)
      nacheinander([note.id], () => backend.schreibeNote(note)).catch(() => {
        notenRef.current = vorher
        setNoten(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
      return note
    },
    [backend, nacheinander]
  )

  const noteAendern = useCallback(
    (note: Note) => {
      if (note.user !== meRef.current) return
      const vorher = notenRef.current
      const next = vorher.map((x) => x.id === note.id ? note : x)
      notenRef.current = next
      setNoten(next)
      setFehler(null)
      nacheinander([note.id], () => backend.aendereNote(note)).catch(() => {
        notenRef.current = vorher
        setNoten(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, nacheinander]
  )

  const noteLoeschen = useCallback(
    (id: string) => {
      const note = notenRef.current.find((x) => x.id === id)
      if (!note || note.user !== meRef.current) return
      const vorher = notenRef.current
      const next = vorher.filter((x) => x.id !== id)
      notenRef.current = next
      setNoten(next)
      setFehler(null)
      nacheinander([id], () => backend.loescheNote(id)).catch(() => {
        notenRef.current = vorher
        setNoten(vorher)
        setFehler('nicht gespeichert. tippe nochmal.')
      })
    },
    [backend, nacheinander]
  )

  // eine stabile identität: sonst wäre jeder render ein neuer zustand und
  // jedes useMemo darauf wertlos.
  const zustand = useMemo<Zustand>(
    () => ({ einheiten, gewichte, aufenthalte }),
    [einheiten, gewichte, aufenthalte]
  )

  const notenstand = useMemo<Notenstand>(() => ({ faecher, noten }), [faecher, noten])

  return {
    me,
    zustand,
    schlaf,
    wetten,
    notenstand,
    ladezustand,
    fehler,
    ereignis,
    altbestand,
    toggle,
    einheitHinzu,
    rueckgaengig,
    wertAendern,
    setzeGewicht,
    setzeWette,
    fachHinzu,
    fachAendern,
    fachLoeschen,
    noteHinzu,
    noteAendern,
    noteLoeschen,
    phasenNachladen,
  }
}
