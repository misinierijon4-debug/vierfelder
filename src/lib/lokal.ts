import type { Anfangszustand, Backend, TickEreignis } from './backend'
import { weekDays } from './dates'
import { tickKey, wertKey } from './types'
import type { AreaId, Phase, PhasenArt, Schlafnacht, Ticks, UserId, Werte } from './types'

const TICKS_KEY = 'vierfelder.ticks.v2'
const WERTE_KEY = 'vierfelder.werte.v2'
const ME_KEY = 'vierfelder.me.v2'
const SCHLAF_KEY = 'vierfelder.schlaf.v2'
const KANAL = 'vierfelder'

type AlleWerte = Record<UserId, Werte>
type Nachricht = TickEreignis & { von: string }

function lade<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

function alleWerte(): AlleWerte {
  const alle = lade<AlleWerte>(WERTE_KEY, { erijon: {}, koray: {} })
  return { erijon: alle.erijon ?? {}, koray: alle.koray ?? {} }
}

export function lokalesMe(): UserId {
  return localStorage.getItem(ME_KEY) === 'koray' ? 'koray' : 'erijon'
}

export function lokalWechseln(u: UserId) {
  localStorage.setItem(ME_KEY, u)
}

/**
 * Beispielnaechte fuer den Prototyp ohne Supabase. Sie werden aus echten
 * Phasenzyklen aufgebaut, damit Zeitstrahl, Effizienz und Duell dasselbe
 * zeigen wie mit Health-Daten — nur eben erfunden statt gemessen.
 */
function erzeugeBeispielSchlaf(): Schlafnacht[] {
  const woche = weekDays(new Date())
  const naechte: Schlafnacht[] = []

  // je eintrag: stunde und minute des zubettgehens, minuten bis zum
  // einschlafen, laenge der schlafspanne
  const muster: Record<UserId, Array<[number, number, number, number]>> = {
    erijon: [
      [22, 55, 15, 470],
      [23, 10, 12, 490],
      [23, 5, 18, 455],
      [22, 50, 10, 500],
    ],
    koray: [
      [0, 20, 15, 420],
      [0, 55, 25, 400],
      [1, 5, 14, 445],
      [0, 5, 20, 430],
    ],
  }

  const arten: PhasenArt[] = ['kern', 'tief', 'kern', 'rem']
  const dauern = [42, 26, 34, 22]

  const zyklen = (spanne: number, versatz: number): Phase[] => {
    const phasen: Phase[] = []
    let t = 0
    let i = versatz
    while (t < spanne - 6) {
      const dauer = Math.min(dauern[i % 4]!, spanne - t)
      phasen.push({ art: arten[i % 4]!, start: t, dauer })
      t += dauer
      if (i % 4 === 3 && t < spanne - 25) {
        const wach = 4 + ((i + versatz) % 3) * 5
        phasen.push({ art: 'wach', start: t, dauer: wach })
        t += wach
      }
      i++
    }
    return phasen
  }

  // `abend` ist der tag, an dem jemand ins bett geht. eine uhrzeit vor mittag
  // gehoert damit schon zum folgetag.
  const iso = (abend: string, stunde: number, minute: number, plusMinuten = 0): string => {
    const [j, mo, t] = abend.split('-').map(Number)
    const d = new Date(j!, mo! - 1, t! + (stunde >= 12 ? 0 : 1), stunde, minute + plusMinuten)
    return d.toISOString()
  }

  /** lokales datum eines zeitpunkts als yyyy-mm-dd */
  const datumVon = (zeitpunkt: string): string => {
    const d = new Date(zeitpunkt)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
  }

  woche.slice(0, 4).forEach((abend, i) => {
    for (const user of ['erijon', 'koray'] as UserId[]) {
      const [stunde, minute, verzoegerung, spanne] = muster[user][i]!
      const phasen = zyklen(spanne, user === 'erijon' ? i : i + 1)
      const summe = (art: PhasenArt) =>
        phasen.filter((p) => p.art === art).reduce((s, p) => s + p.dauer, 0)
      const wach = summe('wach')
      const aufwachzeit = iso(abend, stunde, minute, verzoegerung + spanne)

      naechte.push({
        user,
        // die datenbank benennt die nacht nach dem morgen
        nacht: datumVon(aufwachzeit),
        schlafMinuten: spanne - wach,
        einschlafzeit: iso(abend, stunde, minute, verzoegerung),
        aufwachzeit,
        bettStart: iso(abend, stunde, minute),
        bettEnde: iso(abend, stunde, minute, verzoegerung + spanne + 8),
        bettMinuten: verzoegerung + spanne + 8,
        tiefMinuten: summe('tief'),
        remMinuten: summe('rem'),
        kernMinuten: summe('kern'),
        unspezMinuten: 0,
        wachMinuten: wach,
        zielMinuten: 540,
        phasen,
      })
    }
  })

  return naechte
}

let kanal: BroadcastChannel | null | undefined
function holeKanal(): BroadcastChannel | null {
  if (kanal === undefined) {
    kanal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(KANAL)
  }
  return kanal
}

export function lokalesBackend(): Backend {
  const absender = Math.random().toString(36).slice(2)

  return {
    art: 'lokal',

    async laden(): Promise<Anfangszustand> {
      const me = lokalesMe()
      const gespeicherterSchlaf = lade<Schlafnacht[]>(SCHLAF_KEY, [])
      const schlaf = gespeicherterSchlaf.length > 0 ? gespeicherterSchlaf : erzeugeBeispielSchlaf()

      return {
        me,
        ticks: lade<Ticks>(TICKS_KEY, {}),
        werte: alleWerte()[me],
        schlaf,
      }
    },

    async schreibeTick(area: AreaId, tag: string, gesetzt: boolean) {
      const me = lokalesMe()
      const ticks = lade<Ticks>(TICKS_KEY, {})
      const key = tickKey(me, area, tag)
      if (gesetzt) ticks[key] = true
      else delete ticks[key]
      localStorage.setItem(TICKS_KEY, JSON.stringify(ticks))
      holeKanal()?.postMessage({ von: absender, user: me, area, tag, gesetzt } satisfies Nachricht)
    },

    async schreibeWert(area: AreaId, tag: string, wert: number) {
      const me = lokalesMe()
      const alle = alleWerte()
      const key = wertKey(area, tag)
      if (wert <= 0) delete alle[me][key]
      else alle[me][key] = wert
      localStorage.setItem(WERTE_KEY, JSON.stringify(alle))
    },

    abonniere(cb) {
      const ch = holeKanal()
      if (!ch) return () => {}
      const onMessage = (e: MessageEvent<Nachricht>) => {
        const n = e.data
        if (!n || n.von === absender) return
        cb({ user: n.user, area: n.area, tag: n.tag, gesetzt: n.gesetzt })
      }
      ch.addEventListener('message', onMessage)
      return () => ch.removeEventListener('message', onMessage)
    },
  }
}
