import { b64urlZuBytes, bytesZuB64url } from '../../supabase/functions/_shared/webpush'
import { hatSupabase, supabase } from './supabase'

/**
 * Die Anmeldung eines Geraets fuer Benachrichtigungen.
 *
 * Der Reihe nach muessen fuenf Dinge stimmen, und wenn eines fehlt, kommt
 * nichts an, ohne dass irgendwo ein Fehler stuende. Deshalb ist der Zustand
 * hier kein `boolean`, sondern ein Wort je Ursache: der Knopf kann dann genau
 * sagen, woran es liegt, statt "geht nicht".
 *
 * Auf dem iPhone gilt zusaetzlich: Push gibt es nur, wenn die App ueber
 * "Zum Home-Bildschirm" installiert ist. Im Safari-Tab existiert `PushManager`
 * schlicht nicht — das ist der haeufigste Grund fuer `unmoeglich`, und der
 * einzige, den man selbst beheben kann.
 */
export type PushZustand =
  | 'ohne-konto'
  | 'ohne-schluessel'
  | 'unmoeglich'
  | 'blockiert'
  | 'aus'
  | 'an'

export type Probeergebnis = {
  gesendet: number
  entfernt: number
}

const vapidSchluessel = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/** die api-teile, die es im safari-tab und in alten browsern nicht gibt */
export function pushImBrowser(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** laeuft die app vom homescreen oder in einem browser-tab? */
export function alsAppInstalliert(): boolean {
  if (typeof window === 'undefined') return false
  const safari = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    safari.standalone === true
  )
}

export function istApple(): boolean {
  if (typeof navigator === 'undefined') return false
  // ipados meldet sich seit jahren als macintosh; der touchpunkt verraet es.
  const kennung = navigator.userAgent
  return (
    /iphone|ipad|ipod/i.test(kennung) ||
    (/macintosh/i.test(kennung) && navigator.maxTouchPoints > 1)
  )
}

/**
 * Ein Name fuer die Zeile in der Datenbank, damit man zwei Geraete
 * auseinanderhaelt. Absichtlich grob: mehr als "welches der beiden ist das"
 * muss die Tabelle nicht wissen.
 */
export function geraetName(kennung: string = navigator.userAgent): string {
  if (/iphone/i.test(kennung)) return 'iphone'
  if (/ipad/i.test(kennung)) return 'ipad'
  if (/android/i.test(kennung)) return 'android'
  if (/macintosh|mac os/i.test(kennung)) return 'mac'
  if (/windows/i.test(kennung)) return 'windows'
  return 'gerät'
}

/**
 * Warum die Reihenfolge so ist: erst die Gruende, gegen die kein Knopf hilft
 * (kein Konto, kein Schluessel, kein Push im Browser), dann die Erlaubnis,
 * zuletzt das Abo. So beschreibt das erste zutreffende Wort immer die Huerde,
 * die als naechstes im Weg steht.
 */
export async function pushZustand(): Promise<PushZustand> {
  if (!hatSupabase || !supabase) return 'ohne-konto'
  if (!vapidSchluessel) return 'ohne-schluessel'
  if (!pushImBrowser()) return 'unmoeglich'
  if (Notification.permission === 'denied') return 'blockiert'

  const anmeldung = await navigator.serviceWorker.getRegistration()
  const abo = await anmeldung?.pushManager.getSubscription()
  return abo ? 'an' : 'aus'
}

function schluesselAlsText(abo: PushSubscription, name: 'p256dh' | 'auth'): string {
  const roh = abo.getKey(name)
  if (!roh) throw new Error(`das abo hat keinen ${name}-schlüssel`)
  return bytesZuB64url(new Uint8Array(roh))
}

/**
 * Erlaubnis holen, Abo anlegen, Adresse speichern.
 *
 * Die Erlaubnisfrage darf nur direkt aus einem Tipp kommen — iOS verwirft sie
 * sonst wortlos. Deshalb steht hier kein `useEffect` dahinter, sondern ein
 * Knopf.
 */
export async function pushAnmelden(): Promise<PushZustand> {
  const zustand = await pushZustand()
  if (zustand !== 'aus') return zustand
  const db = supabase
  if (!db) return 'ohne-konto'

  const erlaubnis = await Notification.requestPermission()
  if (erlaubnis !== 'granted') return erlaubnis === 'denied' ? 'blockiert' : 'aus'

  // `ready` statt `getRegistration`: das abo braucht einen aktiven worker, und
  // beim allerersten start ist der noch am installieren.
  const anmeldung = await navigator.serviceWorker.ready
  const abo =
    (await anmeldung.pushManager.getSubscription()) ??
    (await anmeldung.pushManager.subscribe({
      // ohne das flag verweigern alle browser das abo: jede nachricht muss
      // sichtbar werden, stille pushs gibt es im web nicht.
      userVisibleOnly: true,
      applicationServerKey: b64urlZuBytes(vapidSchluessel) as BufferSource,
    }))

  const { error } = await db.from('push_abos').upsert(
    {
      endpoint: abo.endpoint,
      p256dh: schluesselAlsText(abo, 'p256dh'),
      auth: schluesselAlsText(abo, 'auth'),
      geraet: geraetName(),
      gesehen: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )
  if (error) {
    // das abo im browser ohne zeile in der datenbank waere ein geraet, an das
    // nie jemand sendet. lieber zurueckdrehen und den fehler zeigen.
    await abo.unsubscribe()
    throw new Error(error.message)
  }

  return 'an'
}

export async function pushAbmelden(): Promise<PushZustand> {
  if (!supabase) return 'ohne-konto'
  const anmeldung = await navigator.serviceWorker.getRegistration()
  const abo = await anmeldung?.pushManager.getSubscription()
  if (abo) {
    await supabase.from('push_abos').delete().eq('endpoint', abo.endpoint)
    await abo.unsubscribe()
  }
  return 'aus'
}

/** einmal durch die ganze kette: server, verschluesselung, push-dienst, worker */
export async function pushProbe(): Promise<Probeergebnis> {
  if (!supabase) throw new Error('kein konto')
  const { data, error } = await supabase.functions.invoke<Probeergebnis & { error?: string }>(
    'push-test',
    { method: 'POST' }
  )
  if (error) {
    // die function antwortet bei fehlern mit json; die meldung darin ist
    // brauchbarer als "non-2xx status code".
    const context = (error as { context?: Response }).context
    const text = await context?.clone().text()
    let grund = ''
    try {
      grund = text ? (JSON.parse(text).error ?? '') : ''
    } catch {
      grund = ''
    }
    throw new Error(grund || error.message)
  }
  if (!data) throw new Error('keine antwort vom server')
  return { gesendet: data.gesendet ?? 0, entfernt: data.entfernt ?? 0 }
}
