import { describe, expect, it } from 'vitest'
// `?raw` statt einer node-datei-api: so bleibt der test im selben
// modulsystem wie die app und die tsconfig ohne node-typen.
import quelle from '../../public/push-sw.js?raw'

/**
 * `public/push-sw.js` laeuft im Betrieb nur im Service Worker, also dort, wo
 * niemand zusieht und ein Tippfehler als "es kam nichts an" auftaucht. Hier
 * bekommt die Datei einen ausgedachten Worker-Kontext untergeschoben und wird
 * ganz normal aufgerufen.
 *
 * Getestet wird das, was der Nutzer sieht: welcher Titel, welcher Text, welche
 * Mitteilung eine aeltere ersetzt, und wohin ein Tipp fuehrt.
 */

const SCOPE = 'https://misinierijon4-debug.github.io/vierfelder/'

type Mitteilung = { titel: string; optionen: Record<string, unknown> }

type Fenster = {
  url: string
  fokussiert?: boolean
  gefuehrtNach?: string
}

function ladeWorker(fenster: Fenster[] = []) {
  const zuhoerer = new Map<string, (ereignis: unknown) => void>()
  const gezeigt: Mitteilung[] = []
  const geoeffnet: string[] = []
  const wartet: Promise<unknown>[] = []

  const self = {
    addEventListener: (name: string, fn: (ereignis: unknown) => void) => zuhoerer.set(name, fn),
    registration: {
      scope: SCOPE,
      showNotification: (titel: string, optionen: Record<string, unknown>) => {
        gezeigt.push({ titel, optionen })
        return Promise.resolve()
      },
    },
    clients: {
      matchAll: () =>
        Promise.resolve(
          fenster.map((f) => ({
            get url() {
              return f.gefuehrtNach ?? f.url
            },
            focus: () => {
              f.fokussiert = true
              return Promise.resolve(f)
            },
            navigate: (ziel: string) => {
              f.gefuehrtNach = ziel
              return Promise.resolve({
                focus: () => {
                  f.fokussiert = true
                  return Promise.resolve(f)
                },
              })
            },
          }))
        ),
      openWindow: (ziel: string) => {
        geoeffnet.push(ziel)
        return Promise.resolve(null)
      },
    },
  }

  new Function('self', quelle)(self)

  async function push(nutzlast: string | null) {
    const ereignis = {
      data:
        nutzlast === null
          ? null
          : {
              json: () => JSON.parse(nutzlast),
              text: () => nutzlast,
            },
      waitUntil: (p: Promise<unknown>) => wartet.push(p),
    }
    zuhoerer.get('push')?.(ereignis)
    await Promise.all(wartet)
  }

  async function klick(daten: Record<string, unknown> | undefined) {
    let geschlossen = false
    const ereignis = {
      notification: { data: daten, close: () => (geschlossen = true) },
      waitUntil: (p: Promise<unknown>) => wartet.push(p),
    }
    zuhoerer.get('notificationclick')?.(ereignis)
    await Promise.all(wartet)
    return geschlossen
  }

  return { push, klick, gezeigt, geoeffnet, fenster }
}

describe('push-sw: eine nachricht anzeigen', () => {
  it('nimmt titel, text und tag aus dem paket', async () => {
    const w = ladeWorker()
    await w.push(
      JSON.stringify({ titel: 'zweikampf', text: 'heute noch nicht gewogen.', tag: 'gewicht' })
    )
    expect(w.gezeigt).toHaveLength(1)
    expect(w.gezeigt[0]!.titel).toBe('zweikampf')
    expect(w.gezeigt[0]!.optionen.body).toBe('heute noch nicht gewogen.')
    // gleicher tag heisst: die neue mitteilung ersetzt die alte, statt sich
    // danebenzulegen. zwei mal dieselbe erinnerung ist eine erinnerung.
    expect(w.gezeigt[0]!.optionen.tag).toBe('gewicht')
  })

  it('zeigt auch ohne paket etwas an, statt still zu bleiben', async () => {
    // stille pushs sind im web nicht erlaubt: bleibt die mitteilung aus,
    // entzieht der browser irgendwann die erlaubnis.
    const w = ladeWorker()
    await w.push(null)
    expect(w.gezeigt).toHaveLength(1)
    expect(w.gezeigt[0]!.titel).toBe('zweikampf')
  })

  it('nimmt rohtext, wenn das paket kein json ist', async () => {
    const w = ladeWorker()
    await w.push('kein json, nur text')
    expect(w.gezeigt[0]!.optionen.body).toBe('kein json, nur text')
  })
})

describe('push-sw: ein tipp auf die mitteilung', () => {
  it('holt ein offenes fenster nach vorn, statt ein zweites zu öffnen', async () => {
    const w = ladeWorker([{ url: SCOPE }])
    const geschlossen = await w.klick({ url: './' })
    expect(geschlossen).toBe(true)
    expect(w.fenster[0]!.fokussiert).toBe(true)
    expect(w.geoeffnet).toEqual([])
  })

  it('führt ein offenes fenster zum ziel, wenn es woanders steht', async () => {
    const w = ladeWorker([{ url: SCOPE }])
    await w.klick({ url: `${SCOPE}noten` })
    expect(w.fenster[0]!.gefuehrtNach).toBe(`${SCOPE}noten`)
    expect(w.fenster[0]!.fokussiert).toBe(true)
  })

  it('öffnet ein fenster, wenn keines offen ist', async () => {
    const w = ladeWorker()
    await w.klick(undefined)
    expect(w.geoeffnet).toEqual([SCOPE])
  })

  it('lässt fremde fenster in ruhe', async () => {
    const w = ladeWorker([{ url: 'https://example.com/anderes' }])
    await w.klick({ url: './' })
    expect(w.fenster[0]!.fokussiert).toBeUndefined()
    expect(w.geoeffnet).toEqual([SCOPE])
  })
})
