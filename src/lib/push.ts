import { b64urlZuBytes, bytesZuB64url } from '../../supabase/functions/_shared/webpush'
import { PUSH_ENDPOINT_FEHLER, pushDienst } from '../../supabase/functions/_shared/pushEndpoint'
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
 * Bei diesem Fehler bleibt das Browser-Abo absichtlich erhalten. Ein weiterer
 * Versuch kann die Datenbankmutation bestaetigen, ohne dass die Zustelladresse
 * schon unwiederbringlich vom Browser entfernt wurde.
 */
export class WiederholbarerPushFehler extends Error {
  readonly wiederholbar = true

  constructor(message: string) {
    super(message)
    this.name = 'WiederholbarerPushFehler'
  }
}

const ANMELDUNG_NICHT_PRUEFBAR =
  'die anmeldung konnte nicht geprüft werden. bitte versuche es erneut.'
const PUSH_ABO_UNBESTAETIGT =
  'das push-abo konnte nicht bestätigt werden. bitte versuche es erneut.'
const VORHANDENES_PUSH_ABO_UNBESTAETIGT =
  'das vorhandene push-abo konnte diesem konto nicht sicher zugeordnet werden. es wurde im browser deaktiviert; bitte versuche es erneut.'
const PUSH_ABO_NICHT_DEAKTIVIERT =
  'das push-abo konnte weder bestätigt noch im browser deaktiviert werden. bitte prüfe die browser-einstellungen und versuche es erneut.'
const PUSH_ABMELDUNG_UNBESTAETIGT =
  'die push-abmeldung konnte in der datenbank nicht bestätigt werden. das browser-abo bleibt aktiv; bitte versuche es erneut oder schalte benachrichtigungen in den app- oder browser-einstellungen aus.'

async function aktuelleSitzung(db: NonNullable<typeof supabase>) {
  const { data, error } = await db.auth.getSession()
  if (error) throw new Error(ANMELDUNG_NICHT_PRUEFBAR)
  if (!data.session?.user.id || !data.session.access_token) {
    throw new Error('die anmeldung ist abgelaufen. melde dich neu an.')
  }
  return data.session
}

async function verwerfeUnbestaetigtesAbo(
  abo: PushSubscription,
  warVorhanden: boolean
): Promise<never> {
  let deaktiviert = false
  try {
    deaktiviert = await abo.unsubscribe()
  } catch {
    // Der konkrete Browserfehler wird nicht weitergereicht: er kann den
    // sensiblen Endpoint enthalten. Der Nutzer bekommt stattdessen den
    // sicheren naechsten Schritt.
  }
  if (!deaktiviert) {
    throw new WiederholbarerPushFehler(PUSH_ABO_NICHT_DEAKTIVIERT)
  }
  throw new WiederholbarerPushFehler(
    warVorhanden ? VORHANDENES_PUSH_ABO_UNBESTAETIGT : PUSH_ABO_UNBESTAETIGT
  )
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
  if (zustand !== 'aus' && zustand !== 'an') return zustand
  const db = supabase
  if (!db) return 'ohne-konto'
  // Die Sitzung wird vor Erlaubnisdialog und Browser-Abo geprueft. Ein
  // Auth-/Netzfehler darf keine lokale Zustelladresse ohne Besitzer erzeugen.
  const sitzung = await aktuelleSitzung(db)

  let warVorhanden = zustand === 'an'
  let abo: PushSubscription | null = null
  if (warVorhanden) {
    const anmeldung = await navigator.serviceWorker.getRegistration()
    abo = (await anmeldung?.pushManager.getSubscription()) ?? null
    // Das Abo kann zwischen Zustandspruefung und Zugriff verschwinden. Dann
    // gilt wieder derselbe kontrollierte Pfad wie bei einer ersten Anmeldung.
    warVorhanden = abo !== null
  }

  if (!abo) {
    const erlaubnis = await Notification.requestPermission()
    if (erlaubnis !== 'granted') return erlaubnis === 'denied' ? 'blockiert' : 'aus'

    // `ready` statt `getRegistration`: das abo braucht einen aktiven worker,
    // und beim allerersten start ist der noch am installieren.
    const anmeldung = await navigator.serviceWorker.ready
    abo =
      (await anmeldung.pushManager.getSubscription()) ??
      (await anmeldung.pushManager.subscribe({
        // ohne das flag verweigern alle browser das abo: jede nachricht muss
        // sichtbar werden, stille pushs gibt es im web nicht.
        userVisibleOnly: true,
        applicationServerKey: b64urlZuBytes(vapidSchluessel) as BufferSource,
      }))
  }

  try {
    pushDienst(abo.endpoint)
  } catch {
    // Ein unbrauchbares Browser-Abo darf weder lokal aktiv bleiben noch in die
    // Datenbank gelangen. Die Servergrenze prueft unabhaengig ein zweites Mal.
    await abo.unsubscribe()
    throw new Error(PUSH_ENDPOINT_FEHLER)
  }

  const { data: bestaetigt, error } = await db
    .from('push_abos')
    .upsert(
      {
        endpoint: abo.endpoint,
        user_id: sitzung.user.id,
        p256dh: schluesselAlsText(abo, 'p256dh'),
        auth: schluesselAlsText(abo, 'auth'),
        geraet: geraetName(),
        gesehen: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )
    .select('endpoint,user_id')
    .maybeSingle()
  const zeile = bestaetigt as { endpoint: string; user_id: string } | null
  if (
    error ||
    !zeile ||
    zeile.endpoint !== abo.endpoint ||
    zeile.user_id !== sitzung.user.id
  ) {
    // das abo im browser ohne zeile in der datenbank waere ein geraet, an das
    // nie jemand sendet. lieber zurueckdrehen und den fehler zeigen.
    return verwerfeUnbestaetigtesAbo(abo, warVorhanden)
  }

  return 'an'
}

export async function pushAbmelden(): Promise<PushZustand> {
  const db = supabase
  if (!db) return 'ohne-konto'
  const sitzung = await aktuelleSitzung(db)
  const anmeldung = await navigator.serviceWorker.getRegistration()
  const abo = await anmeldung?.pushManager.getSubscription()
  if (abo) {
    const { data: bestaetigt, error } = await db
      .from('push_abos')
      .delete()
      .match({ endpoint: abo.endpoint, user_id: sitzung.user.id })
      .select('endpoint,user_id')
      .maybeSingle()
    const zeile = bestaetigt as { endpoint: string; user_id: string } | null
    if (
      error ||
      !zeile ||
      zeile.endpoint !== abo.endpoint ||
      zeile.user_id !== sitzung.user.id
    ) {
      // Null ist kein Erfolg: RLS kann eine nicht erlaubte Mutation als
      // fehlerlosen Nulltreffer zurueckgeben. Das Browser-Abo bleibt fuer den
      // kontrollierten Wiederholungsversuch bewusst unangetastet.
      throw new WiederholbarerPushFehler(PUSH_ABMELDUNG_UNBESTAETIGT)
    }
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
  const db = supabase
  if (!db || !url || !schluessel) throw new Error('kein konto')

  const token = (await aktuelleSitzung(db)).access_token

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
