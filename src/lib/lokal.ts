import type { Anfangszustand, Backend, TickEreignis } from './backend'
import { weekDays } from './dates'
import { tickKey, wertKey } from './types'
import type { AreaId, RohsegmentDef, Schlafnacht, Ticks, UserId, Werte } from './types'

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

function erzeugeBeispielSchlaf(): Schlafnacht[] {
  const woche = weekDays(new Date())
  const naechte: Schlafnacht[] = []

  const beispielTage = woche.slice(0, 4)

  const musterErijon = [
    { dauer: 473, start: '23:25:00', end: '08:35:00', tief: 75, rem: 130, core: 268, wach: 18, wachPhasen: 4 },
    { dauer: 445, start: '23:45:00', end: '07:30:00', tief: 65, rem: 110, core: 270, wach: 15, wachPhasen: 3 },
    { dauer: 490, start: '23:10:00', end: '08:15:00', tief: 90, rem: 140, core: 260, wach: 12, wachPhasen: 2 },
    { dauer: 460, start: '00:05:00', end: '08:10:00', tief: 70, rem: 125, core: 265, wach: 20, wachPhasen: 5 },
  ]

  const musterKoray = [
    { dauer: 430, start: '00:30:00', end: '08:10:00', tief: 55, rem: 105, core: 270, wach: 22, wachPhasen: 4 },
    { dauer: 410, start: '00:45:00', end: '07:55:00', tief: 50, rem: 95, core: 265, wach: 18, wachPhasen: 3 },
    { dauer: 465, start: '23:50:00', end: '08:00:00', tief: 80, rem: 120, core: 265, wach: 14, wachPhasen: 3 },
    { dauer: 440, start: '00:15:00', end: '08:00:00', tief: 60, rem: 115, core: 265, wach: 16, wachPhasen: 4 },
  ]

  beispielTage.forEach((tag, i) => {
    const e = musterErijon[i % musterErijon.length]!
    const k = musterKoray[i % musterKoray.length]!

    const segsErijon: RohsegmentDef[] = [
      { start: `${tag}T${e.start}+02:00`, end: `${tag}T01:00:00+02:00`, value: 'AsleepCore' },
      { start: `${tag}T01:00:00+02:00`, end: `${tag}T02:15:00+02:00`, value: 'AsleepDeep' },
      { start: `${tag}T02:15:00+02:00`, end: `${tag}T02:30:00+02:00`, value: 'Awake' },
      { start: `${tag}T02:30:00+02:00`, end: `${tag}T04:30:00+02:00`, value: 'AsleepREM' },
      { start: `${tag}T04:30:00+02:00`, end: `${tag}T${e.end}+02:00`, value: 'AsleepCore' },
    ]

    naechte.push({
      user: 'erijon',
      nacht: tag,
      schlafMinuten: e.dauer,
      einschlafzeit: `${tag}T${e.start}+02:00`,
      wachphasen: e.wachPhasen,
      wachMinuten: e.wach,
      nachtwert: 88,
      bewertungsbasis: 100,
      rohsegmente: segsErijon,
    })

    const segsKoray: RohsegmentDef[] = [
      { start: `${tag}T${k.start}+02:00`, end: `${tag}T01:30:00+02:00`, value: 'AsleepCore' },
      { start: `${tag}T01:30:00+02:00`, end: `${tag}T02:30:00+02:00`, value: 'AsleepDeep' },
      { start: `${tag}T02:30:00+02:00`, end: `${tag}T02:45:00+02:00`, value: 'Awake' },
      { start: `${tag}T02:45:00+02:00`, end: `${tag}T04:30:00+02:00`, value: 'AsleepREM' },
      { start: `${tag}T04:30:00+02:00`, end: `${tag}T${k.end}+02:00`, value: 'AsleepCore' },
    ]

    naechte.push({
      user: 'koray',
      nacht: tag,
      schlafMinuten: k.dauer,
      einschlafzeit: `${tag}T${k.start}+02:00`,
      wachphasen: k.wachPhasen,
      wachMinuten: k.wach,
      nachtwert: 82,
      bewertungsbasis: 100,
      rohsegmente: segsKoray,
    })
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
