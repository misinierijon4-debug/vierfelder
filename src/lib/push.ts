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

/**
 * Der oeffentliche VAPID-Schluessel des Projekts.
 *
 * Er steht hier im Klartext, und das ist kein Versehen: er liegt ohnehin in
 * jedem ausgelieferten Buendel und in jedem Abo, das ein Handy anlegt.
 * Geheim ist allein sein privater Gegenpart, und der bleibt Secret der Edge
 * Function. Was er hier gewinnt, ist die eine Sache, die er woanders kostet:
 * ein Build ohne gesetzte Variable liefert sonst eine App aus, in der die
 * Benachrichtigungen wortlos fehlen.
 *
 * Ein neues Paar macht alle bestehenden Abos ungueltig — wer ihn tauscht,
 * tauscht ihn auch in den Secrets der Function, und jedes Geraet muss die
 * Benachrichtigungen neu einschalten.
 */
const VAPID_STANDARD = 'BPBikYfCtufw6fHehwcew3_mc_8Su8IZdON2Ne39ZxiFCNwTXhDCw53RLu4IFlYLP1J7gNMsEtqpnLcWnZsAISg'

/** eine gesetzte umgebungsvariable geht vor, etwa fuer ein zweites projekt */
const vapidSchluessel = import.meta.env.VITE_VAPID_PUBLIC_KEY || VAPID_STANDARD

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

/** eine zeile aus einer fremden antwort, kurz genug fuer die kleine schrift */
function kurz(text: string, zeichen = 120): string {
  const eine = text.replace(/\s+/g, ' ').trim()
  return eine.length > zeichen ? `${eine.slice(0, zeichen)}…` : eine
}

/**
 * Aus der rohen Antwort wird entweder ein Ergebnis oder ein Satz, der sagt,
 * was wirklich kam.
 *
 * Der Umweg ueber den Text statt ueber `response.json()` ist der Punkt: kommt
 * etwas anderes als JSON zurueck — eine Fehlerseite eines Zwischenstueckes,
 * eine leere Antwort —, dann lautete die Meldung bisher "Unexpected token '<'".
 * Das nennt die Sprache, in der der Fehler geschrieben ist, und nicht den
 * Fehler. Jetzt stehen Status und Anfang der Antwort da.
 */
export function deuteProbe(status: number, text: string): Probeergebnis {
  let inhalt: { gesendet?: number; entfernt?: number; error?: string }
  try {
    inhalt = JSON.parse(text)
  } catch {
    const rumpf = text.trim() === '' ? 'leere antwort' : kurz(text)
    throw new Error(`server antwortet ${status}, aber kein json: ${rumpf}`)
  }
  if (status < 200 || status >= 300) {
    throw new Error(inhalt.error ?? `server antwortet ${status}`)
  }
  return { gesendet: inhalt.gesendet ?? 0, entfernt: inhalt.entfernt ?? 0 }
}

/**
 * Einmal durch die ganze Kette: server, verschluesselung, push-dienst, worker.
 *
 * Bewusst ein blankes `fetch` statt `functions.invoke`: der Aufruf liest die
 * Antwort selbst und entscheidet selbst, was ein Fehler ist. `invoke` parst
 * dazwischen JSON und wirft dabei eine Meldung, die von der eigentlichen
 * Antwort nichts mehr uebrig laesst — bei einer Funktion, deren einziger Zweck
 * die Fehlersuche ist, ist das die falsche Schicht.
 */
export async function pushProbe(): Promise<Probeergebnis> {
  const url = import.meta.env.VITE_SUPABASE_URL
  const schluessel = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabase || !url || !schluessel) throw new Error('kein konto')

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('die anmeldung ist abgelaufen. melde dich neu an.')

  const antwort = await fetch(`${url.replace(/\/+$/, '')}/functions/v1/push-test`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: schluessel,
      'content-type': 'application/json',
    },
    // die function liest den koerper nicht. er steht hier, weil ein POST ohne
    // koerper unterwegs schon an einem zwischenstueck haengen geblieben ist.
    body: '{}',
  })

  return deuteProbe(antwort.status, await antwort.text())
}
