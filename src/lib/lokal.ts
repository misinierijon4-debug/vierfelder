import type { Anfangszustand, Backend, TickEreignis } from './backend'
import { tickKey, wertKey } from './types'
import type { AreaId, Schlafnacht, Ticks, UserId, Werte } from './types'

/**
 * prototyp-backend ohne konto: daten im localStorage, realtime über
 * BroadcastChannel. gleiche trennung wie in supabase — ticks sehen beide,
 * werte gehören nur dem eigenen nutzer.
 */
const TICKS_KEY = 'vierfelder.ticks.v2'
const WERTE_KEY = 'vierfelder.werte.v2'
const ME_KEY = 'vierfelder.me.v2'
const SCHLAF_KEY = 'vierfelder.schlaf.v1'
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

/** ein kanal für die ganze app: neu erzeugen und schließen würde sich mit StrictMode beißen */
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
      return {
        me,
        ticks: lade<Ticks>(TICKS_KEY, {}),
        werte: alleWerte()[me],
        schlaf: lade<Schlafnacht[]>(SCHLAF_KEY, []),
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
