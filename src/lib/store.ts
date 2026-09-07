import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  Anfangszustand,
  Backend,
  BackendDatenEreignis,
  WetteStand,
  Wetten,
  WettenMeta,
} from './backend'
import {
  KEINE_WETTE_VERSION,
  vergleicheWetteVersion,
} from './backend'
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
  ohneAufenthalt,
  ohneTag,
} from './tracker'
import { istNotenDatum, notenGewicht } from './noten'
import { blockiereNeustart } from './pwaBlocker'
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
export type Synchronisationszustand = 'verbindet' | 'abgleichen' | 'aktuell' | 'veraltet'

type VerlaufAnfrage = {
  id: symbol
  backendLauf: symbol
  controller: AbortController
}

function einheitMitId(einheiten: Einheiten, id: string): Einheit | undefined {
  for (const liste of Object.values(einheiten)) {
    const einheit = liste.find((e) => e.id === id)
    if (einheit) return einheit
  }
  return undefined
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
  const [ladeversuch, setLadeversuch] = useState(0)
  const [synchronisationszustand, setSynchronisationszustand] =
    useState<Synchronisationszustand>(backend.art === 'lokal' ? 'aktuell' : 'verbindet')
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
  /** Nur bestaetigte CAS-Staende; optimistische UI-Texte leben separat in wettenRef. */
  const wettenMetaRef = useRef<WettenMeta>({})
  const wetteKetteRef = useRef(new Map<string, Promise<WetteStand>>())
  const letzteWetteAbsichtRef = useRef(new Map<string, symbol>())
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
  const laufendeMutationen = useRef(new Set<Promise<unknown>>())
  const mutationsBlocker = useRef(new Set<{ lauf: symbol; loese: () => void }>())
  const beiMutationsruheRef = useRef<() => void>(() => {})
  const abgleichAnfordernRef = useRef<(_stark?: boolean) => void>(() => {})

  /**
   * Ein Backendwechsel ist zugleich ein Wechsel der Daten- und oft der
   * Benutzeridentitaet. Der Lauf-Token verhindert, dass alte Eventhandler oder
   * spaete Promise-Antworten in den neu geladenen Zustand schreiben.
   */
  const backendLauf = useMemo(() => Symbol('backend-lauf'), [backend])
  const aktiveLadungRef = useRef<symbol | null>(null)
  const bereiteLadungRef = useRef<symbol | null>(null)
  const abgleichSperreRef = useRef<symbol | null>(null)

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
    wetteKetteRef.current.clear()
    letzteWetteAbsichtRef.current.clear()
    wettenMetaRef.current = {}
    laufendeMutationen.current.clear()
    for (const blocker of [...mutationsBlocker.current]) {
      blocker.loese()
      mutationsBlocker.current.delete(blocker)
    }
    abgleichSperreRef.current = null
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
      if (abgleichSperreRef.current === backendLauf) abgleichSperreRef.current = null
      for (const blocker of [...mutationsBlocker.current]) {
        if (blocker.lauf !== backendLauf) continue
        blocker.loese()
        mutationsBlocker.current.delete(blocker)
      }
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

  const darfMutationStarten = useCallback(
    () => {
      if (!darfSchreiben() || abgleichSperreRef.current === backendLauf) return false
      if (backend.art === 'supabase' && typeof navigator !== 'undefined' && !navigator.onLine) {
        setFehler('offline: eingaben sind ohne sichere warteschlange gesperrt.')
        return false
      }
      return true
    },
    [backend.art, backendLauf, darfSchreiben]
  )

  const ladenNeu = useCallback(() => {
    if (!istAktuell()) return
    bereiteLadungRef.current = null
    setLadezustand('laden')
    setFehler(null)
    setSynchronisationszustand(backend.art === 'lokal' ? 'aktuell' : 'verbindet')
    setLadeversuch((versuch) => versuch + 1)
  }, [backend.art, istAktuell])

  const verfolgeMutation = useCallback(<T,>(starte: () => Promise<T>): Promise<T> => {
    const loeseNeustartblocker = blockiereNeustart()
    const blocker = { lauf: backendLauf, loese: loeseNeustartblocker }
    mutationsBlocker.current.add(blocker)
    let promise: Promise<T>
    try {
      // Der Blocker steht bereits, bevor das Backend den Request oder eine
      // davor wartende Schreibkette anlegt.
      promise = starte()
    } catch (e: unknown) {
      promise = Promise.reject(e)
    }
    let verfolgt: Promise<T>
    verfolgt = promise.finally(() => {
      laufendeMutationen.current.delete(verfolgt)
      mutationsBlocker.current.delete(blocker)
      loeseNeustartblocker()
      if (
        aktiveLadungRef.current === backendLauf &&
        laufendeMutationen.current.size === 0
      ) {
        beiMutationsruheRef.current()
      }
    })
    laufendeMutationen.current.add(verfolgt)
    return verfolgt
  }, [backendLauf])

  const behandleMutationsfehler = useCallback((
    _lokalZurueck: () => void,
    lokalText: string,
    abgleichText: string
  ) => {
    if (!darfSchreiben()) return
    // Auch im lokalen Mehrtabbetrieb ist ein vor der Mutation aufgenommener
    // React-Snapshot keine sichere Rollback-Basis: schnell aufeinanderfolgende
    // Writes koennen ihn bereits ueberholt haben. Nach Ruhe der gesamten
    // Schreibkette wird deshalb in beiden Backends der kanonische Bestand neu
    // geladen. So kann weder ein alter Optimistic-Wert einen neueren Erfolg
    // verdecken noch ein Teilfehler auf einen ebenfalls unbestaetigten Wert
    // zurueckrollen.
    abgleichAnfordernRef.current(true)
    setFehler(backend.art === 'lokal' ? lokalText : abgleichText)
  }, [backend.art, darfSchreiben])

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

  const uebernimmAnfang = useCallback((anfang: Anfangszustand, ersterLauf: boolean) => {
    meRef.current = anfang.me
    einheitenRef.current = anfang.einheiten
    gewichteRef.current = anfang.gewichte
    gewichtQuellenRef.current = anfang.gewichtQuellen
    wettenRef.current = anfang.wetten
    wettenMetaRef.current = anfang.wettenMeta
    abrechnungenRef.current = anfang.abrechnungen
    faecherRef.current = anfang.noten.faecher
    notenRef.current = anfang.noten.noten

    // Ein Kontrollabgleich laedt alte Schlafphasen absichtlich nicht erneut.
    // Bereits geoeffnete Verlaeufe bleiben deshalb erhalten, solange die Nacht
    // im kanonischen Snapshot noch existiert.
    const schlafstand = ersterLauf
      ? anfang.schlaf
      : anfang.schlaf.map((nacht) => {
          if (nacht.phasen !== null) return nacht
          const vorher = schlafRef.current.find(
            (alt) => alt.user === nacht.user && alt.nacht === nacht.nacht
          )
          return vorher?.phasen === null || vorher === undefined
            ? nacht
            : { ...nacht, phasen: vorher.phasen }
        })

    setMe(anfang.me)
    setEinheiten(anfang.einheiten)
    setGewichte(anfang.gewichte)
    setGewichtQuellen(anfang.gewichtQuellen)
    uebernimmSchlaf(schlafstand)
    setAufenthalte(anfang.aufenthalte)
    setWetten(anfang.wetten)
    setAbrechnungen(anfang.abrechnungen)
    setFaecher(anfang.noten.faecher)
    setNoten(anfang.noten.noten)
    setEinheitVonVerfuegbar(anfang.einheitVonVerfuegbar)
    setAltbestand(anfang.altbestand)
    if (ersterLauf) {
      phasenTransportRef.current = {}
      setPhasenTransport({})
    }
  }, [uebernimmSchlaf])

  const uebernimmWetteStand = useCallback((stand: WetteStand, sichtbar = true): boolean => {
    const bisher = wettenMetaRef.current[stand.woche]
    if (bisher && vergleicheWetteVersion(stand.version, bisher.version) <= 0) return false
    wettenMetaRef.current = {
      ...wettenMetaRef.current,
      [stand.woche]: {
        version: stand.version,
        updatedBy: stand.updatedBy,
        updatedAt: stand.updatedAt,
      },
    }
    if (!sichtbar) return true
    const next = { ...wettenRef.current }
    if (stand.text === null) delete next[stand.woche]
    else next[stand.woche] = stand.text
    wettenRef.current = next
    setWetten(next)
    return true
  }, [])

  const verarbeiteBackendEreignis = useCallback((e: BackendDatenEreignis) => {
    if (e.typ === 'wette') {
      if (e.art === 'invalidierung') {
        abgleichAnfordernRef.current(true)
        return
      }
      uebernimmWetteStand(e.stand)
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
      const id = e.art === 'weg' ? e.id : e.fach.id
      const ohne = vorher.filter((fach) => fach.id !== id)
      let next: Fach[]
      if (e.art === 'weg') {
        next = ohne
      } else if (e.fach.pruefungsfach === 4) {
        // Der positive Teil eines atomaren Wechsels ist kanonisch: selbst wenn
        // das Null-Event des alten Fachs fehlt, bleibt genau dieses Ziel aktiv.
        next = [...ohne, e.fach].map((fach) =>
          fach.user === e.fach.user && fach.id !== e.fach.id && fach.pruefungsfach !== null
            ? { ...fach, pruefungsfach: null }
            : fach
        )
      } else {
        const bisher = vorher.find((fach) => fach.id === e.fach.id)
        const anderesAktiv = vorher.some(
          (fach) => fach.user === e.fach.user && fach.id !== e.fach.id && fach.pruefungsfach === 4
        )
        // Das erste Realtime-Event der Transaktion kann das alte Fach leeren.
        // Solange das neue positive Event noch fehlt, zeigen wir keinen
        // fachlich unmoeglichen Nullstand.
        next = bisher?.pruefungsfach === 4 && !anderesAktiv
          ? [...ohne, { ...e.fach, pruefungsfach: 4 }]
          : [...ohne, e.fach]
      }
      faecherRef.current = next
      setFaecher(next)
      if (e.art === 'weg') {
        const neueNoten = notenRef.current.filter((note) => note.fachId !== id)
        notenRef.current = neueNoten
        setNoten(neueNoten)
      }
      return
    }

    if (e.typ === 'note') {
      const vorher = notenRef.current
      const id = e.art === 'weg' ? e.id : e.note.id
      const ohne = vorher.filter((note) => note.id !== id)
      const next = e.art === 'weg' ? ohne : [...ohne, e.note]
      notenRef.current = next
      setNoten(next)
      return
    }

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

    if (e.typ === 'gewicht') {
      merkeGewichtQuelle(e.user, e.tag, e.kg === null ? null : e.quelle ?? 'getippt')
      const vorher = gewichteRef.current
      const next = mitGewicht(vorher, e.user, e.tag, e.kg)
      if (next === vorher) return
      gewichteRef.current = next
      setGewichte(next)
      return
    }

    if (e.typ === 'aufenthalt') {
      setAufenthalte((vorher) => e.art === 'weg'
        ? ohneAufenthalt(vorher, e.id)
        : mitAufenthalt(vorher, e.aufenthalt))
      return
    }

    const einheit = e.art === 'weg'
      ? Object.values(einheitenRef.current).flat().find((x) => x.id === e.id)
      : e.einheit
    if (!einheit) return
    const vorher = einheitenRef.current
    let next = e.art === 'neu'
      ? fuegeHinzu(vorher, einheit)
      : e.art === 'weg'
        ? ohneEinheit(vorher, e.id)
        : mitEinheit(vorher, einheit)
    // Ein UPDATE kann nach einem Verbindungsabbruch ohne sein INSERT
    // eintreffen. Die komplette Realtime-Zeile reicht dann zum Nachtragen.
    if (e.art === 'wert' && next === vorher) next = fuegeHinzu(vorher, einheit)
    if (next === vorher) return
    uebernimm(next)

    if (e.art === 'wert') return
    const gesetzt = (next[tickKey(einheit.user, einheit.area, einheit.tag)] ?? []).length > 0
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
  }, [
    merkeAbrechnungStatus,
    merkeGewichtQuelle,
    merkePhasenTransport,
    uebernimm,
    uebernimmSchlaf,
    uebernimmWetteStand,
  ])

  useEffect(() => {
    const ABGLEICH_DROSSEL_MS = 5_000
    const MUTATION_WARTEZEIT_MS = 10_000
    const SNAPSHOT_WARTEZEIT_MS = 15_000

    let aktiv = true
    let initialGeladen = false
    let kanalEpoche = 0
    let replikationBereit = backend.art === 'lokal'
    let abgleichLaeuft = false
    let erneutNoetig = false
    let erneutStark = false
    let nachInitialNoetig = false
    let nachInitialStark = false
    let wartetAufMutationsruhe = false
    let abgleichNachMutationsruheStark = false
    let letzterAbgleich = 0
    let abgleichTimer: ReturnType<typeof setTimeout> | null = null
    let frueheEreignisse: BackendDatenEreignis[] = []
    let puffer: Array<{ epoche: number; ereignis: BackendDatenEreignis }> | null = null

    bereiteLadungRef.current = null
    abgleichSperreRef.current = null
    setLadezustand('laden')
    setSynchronisationszustand(backend.art === 'lokal' ? 'aktuell' : 'verbindet')

    const nochAktuell = () => aktiv && istAktuell()

    const spielePuffer = (epoche: number) => {
      if (!puffer) return
      const passend = puffer.filter((eintrag) => eintrag.epoche === epoche)
      puffer = puffer.filter((eintrag) => eintrag.epoche !== epoche)
      for (const eintrag of passend) verarbeiteBackendEreignis(eintrag.ereignis)
    }

    const warteAufMutationen = async (): Promise<boolean> => {
      const ende = Date.now() + MUTATION_WARTEZEIT_MS
      while (laufendeMutationen.current.size > 0) {
        const rest = ende - Date.now()
        if (rest <= 0) return false
        let timer: ReturnType<typeof setTimeout> | undefined
        const fertig = await Promise.race([
          Promise.allSettled([...laufendeMutationen.current]).then(() => true),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), rest)
          }),
        ])
        if (timer) clearTimeout(timer)
        if (!fertig) return false
      }
      return true
    }

    const ladeSnapshot = async (): Promise<Anfangszustand> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          backend.laden(),
          new Promise<Anfangszustand>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('kontrollabgleich hat das zeitlimit ueberschritten')),
              SNAPSHOT_WARTEZEIT_MS
            )
          }),
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    let starteAbgleich = (_stark: boolean) => {}

    const fuehreAbgleich = async (startEpoche: number, stark: boolean) => {
      abgleichLaeuft = true
      letzterAbgleich = Date.now()
      abgleichSperreRef.current = backendLauf
      // Ein neuer Snapshot startet nach allen bisher empfangenen Events. Nur
      // Ereignisse ab jetzt muessen danach replayt werden.
      puffer = []
      if (nochAktuell()) setSynchronisationszustand('abgleichen')

      let erfolgreich = false
      try {
        const mutationenFertig = await warteAufMutationen()
        if (!nochAktuell()) return
        if (!mutationenFertig) {
          // Den optimistischen Stand nicht mit einem Snapshot ueberschreiben,
          // solange eine HTTP-Antwort noch aussteht. Auch der Puffer bleibt
          // stehen; beim spaeteren Settle folgt automatisch ein neuer Lauf.
          if (laufendeMutationen.current.size === 0) {
            // Settle und Timeout koennen in derselben Microtask konkurrieren.
            // Dann ist kein spaeterer Ruhe-Callback mehr zu erwarten.
            erneutNoetig = true
            erneutStark ||= stark
          } else {
            wartetAufMutationsruhe = true
            abgleichNachMutationsruheStark ||= stark
          }
          setSynchronisationszustand('veraltet')
          return
        }

        const anfang = await ladeSnapshot()
        if (!nochAktuell()) return
        if (kanalEpoche !== startEpoche) {
          // Ein Disconnect macht die zeitliche Garantie dieses Snapshots
          // unbrauchbar. Der Reconnect fordert unten einen neuen Lauf an.
          return
        }

        uebernimmAnfang(anfang, false)
        spielePuffer(startEpoche)
        erfolgreich = true
      } catch {
        if (!nochAktuell()) return
        // REST-Fehler duerfen weder den letzten Stand noch bereits empfangene
        // Live-Ereignisse vernichten.
        if (kanalEpoche === startEpoche) spielePuffer(startEpoche)
        setSynchronisationszustand('veraltet')
      } finally {
        abgleichLaeuft = false
        if (abgleichSperreRef.current === backendLauf) abgleichSperreRef.current = null

        const nochmal = erneutNoetig
        const nochmalStark = erneutStark
        erneutNoetig = false
        erneutStark = false

        if (nochAktuell()) {
          if (erfolgreich) {
            setSynchronisationszustand(
              stark && replikationBereit ? 'aktuell' : 'veraltet'
            )
          }
          if (wartetAufMutationsruhe) {
            abgleichNachMutationsruheStark ||= nochmalStark
          } else if (nochmal) {
            queueMicrotask(() => {
              if (nochAktuell()) starteAbgleich(nochmalStark)
            })
          } else {
            puffer = null
          }
        }
      }
    }

    starteAbgleich = (stark: boolean) => {
      if (!nochAktuell()) return
      if (!initialGeladen) {
        nachInitialNoetig = true
        nachInitialStark ||= stark
        return
      }
      if (wartetAufMutationsruhe && laufendeMutationen.current.size > 0) {
        abgleichNachMutationsruheStark ||= stark
        return
      }
      if (abgleichLaeuft) {
        erneutNoetig = true
        erneutStark ||= stark
        return
      }
      void fuehreAbgleich(kanalEpoche, stark)
    }

    const beiMutationsruhe = () => {
      if (!nochAktuell() || !wartetAufMutationsruhe) return
      wartetAufMutationsruhe = false
      const stark = abgleichNachMutationsruheStark || replikationBereit
      abgleichNachMutationsruheStark = false
      starteAbgleich(stark)
    }
    beiMutationsruheRef.current = beiMutationsruhe
    const fordereAbgleich = (stark = true) => starteAbgleich(stark)
    abgleichAnfordernRef.current = fordereAbgleich

    const planeGedrosseltenAbgleich = () => {
      if (!nochAktuell() || backend.art !== 'supabase') return
      if (abgleichLaeuft) return
      const rest = ABGLEICH_DROSSEL_MS - (Date.now() - letzterAbgleich)
      if (rest <= 0) {
        starteAbgleich(replikationBereit)
        return
      }
      if (abgleichTimer !== null) return
      abgleichTimer = setTimeout(() => {
        abgleichTimer = null
        starteAbgleich(replikationBereit)
      }, rest)
    }

    /**
     * Direkt nach dem Anmelden kann eine Abfrage noch mit dem alten Token
     * rausgehen und 401 kassieren. Das ist vorbei, bevor man es lesen kann,
     * also einmal still nachfassen statt den Nutzer in eine Sackgasse zu schicken.
     */
    const versuche = async (rest: number): Promise<void> => {
      try {
        const anfang = await backend.laden()
        if (!nochAktuell()) return
        uebernimmAnfang(anfang, true)
        bereiteLadungRef.current = backendLauf
        initialGeladen = true
        setLadezustand('bereit')
        setFehler(null)

        const frueh = frueheEreignisse
        frueheEreignisse = []
        for (const ereignis of frueh) verarbeiteBackendEreignis(ereignis)

        if (backend.art === 'lokal') {
          setSynchronisationszustand('aktuell')
        }
        if (nachInitialNoetig) {
          const stark = nachInitialStark
          nachInitialNoetig = false
          nachInitialStark = false
          starteAbgleich(stark)
        }
      } catch (e: unknown) {
        if (!nochAktuell()) return
        if (rest > 0 && !istProfilfehler(e)) {
          await new Promise((resolve) => setTimeout(resolve, 700))
          if (!nochAktuell()) return
          return versuche(rest - 1)
        }
        bereiteLadungRef.current = null
        setLadezustand('fehler')
        setSynchronisationszustand('veraltet')
        setFehler(fehlertext(e))
      }
    }

    void versuche(1)

    const abmelden = backend.abonniere((e) => {
      if (!nochAktuell()) return
      if (e.typ !== 'verbindung') {
        if (backend.art === 'lokal') {
          // BroadcastChannel garantiert zwischen mehreren Absendern keine
          // kanonische Gesamtordnung. Seine Payload ist lokal deshalb nur ein
          // Wecksignal: der unter Web Locks gespeicherte Bestand entscheidet.
          // Wichtig: nicht puffern oder replayen, sonst koennte genau die
          // verspaetete Payload den frischen Snapshot wieder ueberschreiben.
          starteAbgleich(true)
          return
        }
        if (!initialGeladen) {
          frueheEreignisse.push(e)
        } else if (puffer !== null) {
          puffer.push({ epoche: kanalEpoche, ereignis: e })
        } else {
          verarbeiteBackendEreignis(e)
        }
        return
      }

      if (e.status === 'verbindet') {
        replikationBereit = false
        setSynchronisationszustand('verbindet')
        return
      }
      if (e.status === 'transportbereit') {
        kanalEpoche += 1
        replikationBereit = false
        setSynchronisationszustand('verbindet')
        // Fallback fuer Server ohne replication_ready: schliesst die bekannte
        // Luecke mit einem REST-Abgleich, bleibt aber ehrlich als veraltet
        // markiert, bis der starke Systemevent eintrifft.
        starteAbgleich(false)
        return
      }
      if (e.status === 'bereit') {
        if (kanalEpoche === 0) kanalEpoche = 1
        replikationBereit = true
        starteAbgleich(true)
        return
      }

      kanalEpoche += 1
      replikationBereit = false
      setSynchronisationszustand('veraltet')
    })

    const beiOnline = () => planeGedrosseltenAbgleich()
    const beiSichtbarkeit = () => {
      if (document.visibilityState === 'visible') planeGedrosseltenAbgleich()
    }
    const beiOffline = () => {
      if (!nochAktuell() || backend.art !== 'supabase') return
      kanalEpoche += 1
      replikationBereit = false
      setSynchronisationszustand('veraltet')
    }

    window.addEventListener('online', beiOnline)
    window.addEventListener('offline', beiOffline)
    document.addEventListener('visibilitychange', beiSichtbarkeit)

    return () => {
      aktiv = false
      if (abgleichTimer !== null) clearTimeout(abgleichTimer)
      if (beiMutationsruheRef.current === beiMutationsruhe) {
        beiMutationsruheRef.current = () => {}
      }
      if (abgleichAnfordernRef.current === fordereAbgleich) {
        abgleichAnfordernRef.current = () => {}
      }
      if (bereiteLadungRef.current === backendLauf) bereiteLadungRef.current = null
      if (abgleichSperreRef.current === backendLauf) abgleichSperreRef.current = null
      puffer = null
      frueheEreignisse = []
      window.removeEventListener('online', beiOnline)
      window.removeEventListener('offline', beiOffline)
      document.removeEventListener('visibilitychange', beiSichtbarkeit)
      abmelden()
    }
  }, [
    backend,
    backendLauf,
    istAktuell,
    ladeversuch,
    uebernimmAnfang,
    verarbeiteBackendEreignis,
  ])

  /** legt eine weitere durchführung an. gibt sie zurück, damit undo sie kennt */
  const einheitHinzu = useCallback(
    (area: AreaId, tag: string, von: string | null = null): Einheit | null => {
      if (!darfMutationStarten()) return null
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

      void verfolgeMutation(() =>
        nacheinander([einheit.id], () => backend.schreibeEinheit(einheit)).catch(() => {
          behandleMutationsfehler(
            () => uebernimm(ohneEinheit(einheitenRef.current, einheit.id)),
            'nicht gespeichert. tippe nochmal.',
            'einheit nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )

      return einheit
    },
    [backend, behandleMutationsfehler, darfMutationStarten, nacheinander, uebernimm, verfolgeMutation]
  )

  /** nimmt eine einzelne durchführung zurück */
  const einheitWeg = useCallback(
    (einheit: Einheit) => {
      if (!darfMutationStarten()) return
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

      void verfolgeMutation(() =>
        nacheinander([einheit.id], () => backend.loescheEinheit(einheit)).catch(() => {
          behandleMutationsfehler(
            () => uebernimm(fuegeHinzu(einheitenRef.current, einheit)),
            'nicht gespeichert. tippe nochmal.',
            'löschung nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [backend, behandleMutationsfehler, darfMutationStarten, nacheinander, uebernimm, verfolgeMutation]
  )

  /** der an/aus-schalter: an legt die erste einheit an, aus räumt den tag */
  const toggle = useCallback(
    (area: AreaId, tag: string) => {
      if (!darfMutationStarten()) return
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

      void verfolgeMutation(() =>
        nacheinander(
          vorhandene.map((e) => e.id),
          () => backend.loescheTag(vorhandene)
        ).catch(() => {
          behandleMutationsfehler(
            () => {
              let zurueck = einheitenRef.current
              for (const einheit of vorhandene) zurueck = fuegeHinzu(zurueck, einheit)
              uebernimm(zurueck)
            },
            'nicht gespeichert. tippe nochmal.',
            'taglöschung nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [
      backend,
      behandleMutationsfehler,
      darfMutationStarten,
      einheitHinzu,
      nacheinander,
      uebernimm,
      verfolgeMutation,
    ]
  )

  /**
   * „rückgängig" macht genau die letzte handlung rückgängig: eine angelegte
   * einheit verschwindet wieder, ein abgehakter tag kommt mit allen einheiten
   * und ihren minuten zurück. dieselben ids, also legt das nichts doppelt an.
   */
  const rueckgaengig = useCallback(
    (area: AreaId, tag: string) => {
      if (!darfMutationStarten()) return
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

      void verfolgeMutation(() =>
        nacheinander(
          aktion.einheiten.map((e) => e.id),
          () => backend.stelleEinheitenWiederHer(aktion.einheiten)
        ).catch(() => {
          // Eine verlorene RPC-Antwort ist vom echten Rollback nicht zu
          // unterscheiden. Die identischen IDs machen einen erneuten Undo
          // sicher; eine inzwischen neuere Benutzeraktion bleibt vorrangig.
          if (letzteAktion.current === null) letzteAktion.current = aktion
          behandleMutationsfehler(
            () => {
              let zurueck = einheitenRef.current
              for (const einheit of aktion.einheiten) {
                zurueck = ohneEinheit(zurueck, einheit.id)
              }
              uebernimm(zurueck)
            },
            'nicht gespeichert. tippe nochmal.',
            'wiederherstellung nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [
      backend,
      behandleMutationsfehler,
      darfMutationStarten,
      einheitWeg,
      nacheinander,
      toggle,
      uebernimm,
      verfolgeMutation,
    ]
  )

  /** setzt den wert einer einzelnen einheit — das detail bearbeitet jede zeile */
  const wertSetzen = useCallback(
    (id: string, wert: number) => {
      if (!darfMutationStarten()) return
      const vorher = einheitenRef.current
      const einheit = Object.values(vorher)
        .flat()
        .find((e) => e.id === id)
      if (!einheit) return
      const sauber = Math.max(0, Math.round(wert))
      uebernimm(mitWert(vorher, id, sauber))
      setFehler(null)
      void verfolgeMutation(() =>
        nacheinander([id], () => backend.schreibeEinheitWert(einheit, sauber)).catch(() => {
          if (einheitMitId(einheitenRef.current, id)?.wert !== sauber) return
          behandleMutationsfehler(
            () => uebernimm(mitWert(einheitenRef.current, id, einheit.wert)),
            'nicht gespeichert. tippe nochmal.',
            'wert nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [backend, behandleMutationsfehler, darfMutationStarten, nacheinander, uebernimm, verfolgeMutation]
  )

  /** setzt die durchführungszeit einer einzelnen einheit. null löscht sie */
  const zeitSetzen = useCallback(
    (id: string, von: string | null) => {
      if (!darfMutationStarten()) return
      const vorher = einheitenRef.current
      const einheit = Object.values(vorher)
        .flat()
        .find((e) => e.id === id)
      if (!einheit) return
      uebernimm(mitVon(vorher, id, von))
      setFehler(null)
      void verfolgeMutation(() =>
        nacheinander([id], () => backend.schreibeEinheitVon(einheit, von)).catch(() => {
          if ((einheitMitId(einheitenRef.current, id)?.von ?? null) !== von) return
          behandleMutationsfehler(
            () => uebernimm(mitVon(einheitenRef.current, id, einheit.von ?? null)),
            'nicht gespeichert. tippe nochmal.',
            'zeitpunkt nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [backend, behandleMutationsfehler, darfMutationStarten, nacheinander, uebernimm, verfolgeMutation]
  )

  /** archiviert erst nach kanonischer Backend-Bestaetigung; die erste Zeile gewinnt */
  const abrechnungHinzu = useCallback(
    (a: Abrechnung) => {
      if (!darfMutationStarten()) return
      if (abrechnungenRef.current.some((x) => x.woche === a.woche)) return
      if (abrechnungStatusRef.current[a.woche] === 'speichern') return
      merkeAbrechnungStatus(a.woche, 'speichern')
      setFehler(null)
      void verfolgeMutation(() =>
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
      )
    },
    [backend, darfMutationStarten, darfSchreiben, merkeAbrechnungStatus, verfolgeMutation]
  )

  /**
   * minuten oder seiten der jüngsten einheit eines tages, um `delta` verschoben.
   * gerechnet wird auf dem ref, nicht auf dem wert, den der render gerade
   * zeigt: zwei schritte kurz hintereinander gingen sonst beide von derselben
   * zahl aus, und der zweite überschriebe den ersten mit demselben ergebnis.
   */
  const wertAendern = useCallback(
    (area: AreaId, tag: string, delta: number) => {
      if (!darfMutationStarten()) return
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
        void verfolgeMutation(() =>
          nacheinander([neue.id], () => backend.schreibeEinheitWert(neue, erster)).catch(() => {
            if (einheitMitId(einheitenRef.current, neue.id)?.wert !== erster) return
            behandleMutationsfehler(
              () => uebernimm(mitWert(einheitenRef.current, neue.id, neue.wert)),
              'nicht gespeichert. tippe nochmal.',
              'wert nicht bestätigt. stand wird abgeglichen.'
            )
          })
        )
        return
      }

      const sauber = Math.max(0, Math.round((letzte.wert ?? 0) + delta))
      uebernimm(mitWert(vorher, letzte.id, sauber))
      setFehler(null)

      void verfolgeMutation(() =>
        nacheinander([letzte.id], () => backend.schreibeEinheitWert(letzte, sauber)).catch(() => {
          if (einheitMitId(einheitenRef.current, letzte.id)?.wert !== sauber) return
          behandleMutationsfehler(
            () => uebernimm(mitWert(einheitenRef.current, letzte.id, letzte.wert)),
            'nicht gespeichert. tippe nochmal.',
            'wert nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [
      backend,
      behandleMutationsfehler,
      darfMutationStarten,
      einheitHinzu,
      nacheinander,
      uebernimm,
      verfolgeMutation,
    ]
  )

  const setzeGewicht = useCallback(
    (tag: string, kg: number) => {
      if (!darfMutationStarten()) return
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

      void verfolgeMutation(() =>
        nacheinander([`gewicht|${key}`], () => backend.schreibeGewicht(tag, sauber)).catch(() => {
          const istNochDieseAenderung = sauber <= 0
            ? !Object.hasOwn(gewichteRef.current, key)
            : gewichteRef.current[key] === sauber
          const quelleIstNochDieseAenderung = sauber <= 0
            ? !Object.hasOwn(gewichtQuellenRef.current, key)
            : gewichtQuellenRef.current[key] === undefined
          if (!istNochDieseAenderung || !quelleIstNochDieseAenderung) return
          behandleMutationsfehler(
            () => {
              const zurueck = { ...gewichteRef.current }
              if (Object.hasOwn(vorher, key)) zurueck[key] = vorher[key]
              else delete zurueck[key]
              gewichteRef.current = zurueck
              setGewichte(zurueck)

              const quellenZurueck = { ...gewichtQuellenRef.current }
              if (Object.hasOwn(vorherQuellen, key)) quellenZurueck[key] = vorherQuellen[key]
              else delete quellenZurueck[key]
              gewichtQuellenRef.current = quellenZurueck
              setGewichtQuellen(quellenZurueck)
            },
            'nicht gespeichert. tippe nochmal.',
            'gewicht nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [backend, behandleMutationsfehler, darfMutationStarten, merkeGewichtQuelle, nacheinander, verfolgeMutation]
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
      if (!darfMutationStarten()) return
      const sauber = text.trim().replace(/\s+/g, ' ').slice(0, 160)
      const vorher = wettenRef.current
      if (!sauber && !Object.hasOwn(vorher, woche)) return
      const next = { ...vorher }
      if (sauber) next[woche] = sauber
      else delete next[woche]
      wettenRef.current = next
      setWetten(next)
      setFehler(null)

      const absicht = Symbol('wette-absicht')
      letzteWetteAbsichtRef.current.set(woche, absicht)
      const basisVersion = wettenMetaRef.current[woche]?.version ?? KEINE_WETTE_VERSION
      const vorgaenger = wetteKetteRef.current.get(woche)
      // Eine schnelle Folgeaktion baut kausal auf der bestaetigten Version der
      // eigenen Vorgaengeraktion auf. Scheitert diese, wird niemals eine
      // inzwischen eingetroffene Partner-Version still als Schreibbasis benutzt.
      const lauf = (vorgaenger
        ? vorgaenger.then((stand) => stand.version, () => basisVersion)
        : Promise.resolve(basisVersion)
      ).then((erwarteteVersion) => backend.schreibeWette(woche, sauber, erwarteteVersion))
      wetteKetteRef.current.set(woche, lauf)
      const raeumeKette = () => {
        if (wetteKetteRef.current.get(woche) === lauf) wetteKetteRef.current.delete(woche)
      }
      void lauf.then(raeumeKette, raeumeKette)

      void verfolgeMutation(() =>
        lauf.then((stand) => {
          if (!darfSchreiben()) return
          uebernimmWetteStand(
            stand,
            letzteWetteAbsichtRef.current.get(woche) === absicht
          )
        }).catch(() => {
          const istNochDieseAenderung = sauber
            ? wettenRef.current[woche] === sauber
            : !Object.hasOwn(wettenRef.current, woche)
          if (!istNochDieseAenderung) return
          behandleMutationsfehler(
            () => {
              const zurueck = { ...wettenRef.current }
              if (Object.hasOwn(vorher, woche)) zurueck[woche] = vorher[woche]
              else delete zurueck[woche]
              wettenRef.current = zurueck
              setWetten(zurueck)
            },
            'wetteinsatz nicht gespeichert. versuch es nochmal.',
            'wetteinsatz nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [
      backend,
      behandleMutationsfehler,
      darfMutationStarten,
      darfSchreiben,
      uebernimmWetteStand,
      verfolgeMutation,
    ]
  )

  /**
   * Es gibt genau ein muendliches Pruefungsfach je Person. Der Browser sendet
   * nur Ziel und erwarteten Ausgangsstand; die Datenbank wechselt beide Zeilen
   * in einer Transaktion und erkennt parallele Entscheidungen.
   */
  const setzePruefungsfach = useCallback(
    (fachId: string) => {
      if (!darfMutationStarten()) return
      const fach = faecherRef.current.find((x) => x.id === fachId)
      if (
        !fach ||
        fach.user !== meRef.current ||
        fach.kursart !== 'gk' ||
        fach.name.trim().toLocaleLowerCase('de-DE') === 'sport'
      ) return
      const altes = faecherRef.current.find(
        (x) => x.user === meRef.current && x.pruefungsfach === 4
      )
      if (!altes || altes.id === fachId) return

      const vorher = faecherRef.current
      const next = vorher.map((x) =>
        x.id === fachId ? { ...x, pruefungsfach: 4 }
          : x.id === altes.id ? { ...x, pruefungsfach: null }
          : x
      )
      faecherRef.current = next
      setFaecher(next)
      setFehler(null)

      void verfolgeMutation(() =>
        nacheinander([`pruefungsfach:${meRef.current}`], async () => {
          const bestaetigt = await backend.setzePruefungsfach(fachId, altes.id)
          if (bestaetigt !== fachId) {
            throw new Error('pruefungsfachwechsel wurde nicht bestaetigt')
          }
        }).catch((e: unknown) => {
          const konflikt = (e as { code?: string } | null)?.code === '40001'
          behandleMutationsfehler(
            () => {},
            konflikt
              ? 'prüfungsfach wurde in einem anderen tab geändert. stand wird abgeglichen.'
              : 'prüfungsfach nicht gespeichert. stand wird abgeglichen.',
            konflikt
              ? 'prüfungsfach wurde auf einem anderen gerät geändert. stand wird abgeglichen.'
              : 'prüfungsfach nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
    },
    [backend, behandleMutationsfehler, darfMutationStarten, nacheinander, verfolgeMutation]
  )

  const noteHinzu = useCallback(
    (fachId: string, punkte: number, art: Notenart, datum: string, titel = ''): Note | null => {
      if (!darfMutationStarten()) return null
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
      const next = [...notenRef.current, note]
      notenRef.current = next
      setNoten(next)
      setFehler(null)
      void verfolgeMutation(() =>
        nacheinander([note.id], () => backend.schreibeNote(note).then((bestaetigt) => {
          if (bestaetigt !== note.id) throw new Error('note wurde nicht bestaetigt')
        })).catch(() => {
          behandleMutationsfehler(
            () => {},
            'note nicht gespeichert. stand wird abgeglichen.',
            'note nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
      return note
    },
    [backend, behandleMutationsfehler, darfMutationStarten, nacheinander, verfolgeMutation]
  )

  const noteLoeschen = useCallback(
    (id: string): Note | null => {
      if (!darfMutationStarten()) return null
      const note = notenRef.current.find((x) => x.id === id)
      if (!note || note.user !== meRef.current) return null
      const next = notenRef.current.filter((x) => x.id !== id)
      notenRef.current = next
      setNoten(next)
      setFehler(null)
      void verfolgeMutation(() =>
        nacheinander([id], () => backend.loescheNote(id).then((bestaetigt) => {
          if (bestaetigt !== id) throw new Error('notenloeschung wurde nicht bestaetigt')
        })).catch(() => {
          behandleMutationsfehler(
            () => {},
            'löschung nicht gespeichert. stand wird abgeglichen.',
            'löschung nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
      return note
    },
    [backend, behandleMutationsfehler, darfMutationStarten, nacheinander, verfolgeMutation]
  )

  const noteWiederherstellen = useCallback(
    (note: Note): boolean => {
      if (!darfMutationStarten() || note.user !== meRef.current) return false
      const fach = faecherRef.current.find((x) => x.id === note.fachId)
      if (!fach || fach.user !== meRef.current) return false
      if (notenRef.current.some((aktuell) => aktuell.id === note.id)) return true

      notenRef.current = [...notenRef.current, note]
      setNoten(notenRef.current)
      setFehler(null)
      void verfolgeMutation(() =>
        nacheinander([note.id], () => backend.schreibeNote(note).then((bestaetigt) => {
          if (bestaetigt !== note.id) throw new Error('note wurde nicht bestaetigt')
        })).catch(() => {
          behandleMutationsfehler(
            () => {},
            'wiederherstellung nicht gespeichert. stand wird abgeglichen.',
            'wiederherstellung nicht bestätigt. stand wird abgeglichen.'
          )
        })
      )
      return true
    },
    [backend, behandleMutationsfehler, darfMutationStarten, nacheinander, verfolgeMutation]
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
    synchronisationszustand,
    ladenNeu,
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
    noteWiederherstellen,
    phasenNachladen,
    phasenNeuLaden,
  }
}
