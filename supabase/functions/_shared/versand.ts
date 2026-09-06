import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.4'
import { sende as sendePush } from './webpush.ts'
import type { Abo, Sendeergebnis, VapidSchluessel } from './webpush.ts'

/**
 * Der gemeinsame Versandweg aller Erinnerungen.
 *
 * `erinnerungs_versand` ist eine kleine serverseitige Outbox. Ein
 * Fencing-Token begleitet jeden Zustandswechsel. Vor dem externen Request darf
 * eine abgelaufene Lease uebernommen werden; nach Sendebeginn wird ein unklarer
 * Ausgang dagegen niemals automatisch wiederholt. Web Push bietet keine
 * belastbare Ende-zu-Ende-Idempotenz, deshalb ist diese Grenze wichtig.
 */

export type AboZeile = Abo & { endpoint: string }
export type Erinnerungsart = 'gewicht' | 'schlaf'
export type Fehlerausgang = 'wiederholen' | 'fehlgeschlagen' | 'unbestaetigt'

export type Nachricht = {
  titel: string
  text: string
  tag: string
  url: string
}

export type VersandZahlen = {
  gesendet: number
  uebersprungen: number
  entfernt: number
  fehler: number
}

export type VersandAbhaengigkeiten = {
  sende?: typeof sendePush
  erzeugeToken?: () => string
}

type RpcName =
  | 'reserviere_erinnerungsversand'
  | 'starte_erinnerungsversand'
  | 'bestaetige_erinnerungsversand'
  | 'melde_erinnerungsversand_fehler'

type RpcErgebnis = 'ja' | 'nein' | 'fehler'

function istVoruebergehend(status: number): boolean {
  return status === 408 || status === 425 || status === 429
}

/**
 * Ein Netzwerkfehler (`status === 0`) ist fachlich unklar: Der Provider kann
 * die Nachricht trotz verlorener Antwort angenommen haben. Nur eine explizite
 * transiente HTTP-Ablehnung darf erneut versucht werden.
 */
export function fehlerausgang(ergebnisse: Sendeergebnis[]): Fehlerausgang {
  // Bei einem Transportfehler und bei 5xx ist nicht sicher, ob ein Gateway
  // den nicht-idempotenten POST bereits an den Push-Dienst weitergereicht hat.
  // Beides darf deshalb keinen automatischen Doppelversand ausloesen.
  if (
    ergebnisse.some(
      (ergebnis) =>
        !ergebnis.weg &&
        (ergebnis.status === 0 || (ergebnis.status >= 500 && ergebnis.status <= 599))
    )
  ) {
    return 'unbestaetigt'
  }
  if (
    ergebnisse.some(
      (ergebnis) => !ergebnis.weg && ergebnis.fehler !== null && istVoruebergehend(ergebnis.status)
    )
  ) {
    return 'wiederholen'
  }
  return 'fehlgeschlagen'
}

async function rufeRpc(
  db: SupabaseClient,
  name: RpcName,
  parameter: Record<string, string>
): Promise<RpcErgebnis> {
  try {
    const { data, error } = await db.rpc(name, parameter)
    if (error || typeof data !== 'boolean') return 'fehler'
    return data ? 'ja' : 'nein'
  } catch {
    return 'fehler'
  }
}

function rpcParameter(
  userId: string,
  art: Erinnerungsart,
  tag: string,
  leaseToken: string
): Record<string, string> {
  return {
    p_user_id: userId,
    p_art: art,
    p_tag: tag,
    p_lease_token: leaseToken,
  }
}

export async function versende(
  db: SupabaseClient,
  art: Erinnerungsart,
  tag: string,
  offen: string[],
  nachricht: Nachricht,
  schluessel: VapidSchluessel,
  abhaengigkeiten: VersandAbhaengigkeiten = {}
): Promise<VersandZahlen> {
  const zahlen: VersandZahlen = { gesendet: 0, uebersprungen: 0, entfernt: 0, fehler: 0 }
  const nutzlast = JSON.stringify(nachricht)
  const pushSenden = abhaengigkeiten.sende ?? sendePush
  const erzeugeToken = abhaengigkeiten.erzeugeToken ?? (() => crypto.randomUUID())

  for (const userId of offen) {
    const { data: aboDaten, error: aboFehler } = await db
      .from('push_abos')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (aboFehler) {
      console.error(`${art}-erinnerung: abos konnten nicht gelesen werden`)
      zahlen.fehler += 1
      continue
    }

    const abos = (aboDaten ?? []) as AboZeile[]
    if (abos.length === 0) {
      zahlen.uebersprungen += 1
      continue
    }

    const leaseToken = erzeugeToken()
    const basis = rpcParameter(userId, art, tag, leaseToken)
    const reserviert = await rufeRpc(db, 'reserviere_erinnerungsversand', basis)
    if (reserviert === 'nein') {
      zahlen.uebersprungen += 1
      continue
    }
    if (reserviert === 'fehler') {
      console.error(`${art}-erinnerung: reservierung konnte nicht bestaetigt werden`)
      zahlen.fehler += 1
      continue
    }

    // Ab hier kann ein externer Side Effect entstehen. Ohne bestaetigten
    // Fencing-Uebergang wird deshalb kein Provider aufgerufen.
    const gestartet = await rufeRpc(db, 'starte_erinnerungsversand', basis)
    if (gestartet !== 'ja') {
      console.error(`${art}-erinnerung: sendebeginn konnte nicht bestaetigt werden`)
      zahlen.fehler += 1
      continue
    }

    const ergebnisse = await Promise.all(
      abos.map(async (abo) => {
        try {
          return { endpoint: abo.endpoint, ...(await pushSenden(abo, nutzlast, schluessel)) }
        } catch {
          return {
            endpoint: abo.endpoint,
            status: 0,
            weg: false,
            fehler: 'push konnte nicht gesendet werden',
          }
        }
      })
    )

    const weg = ergebnisse.filter((ergebnis) => ergebnis.weg).map((ergebnis) => ergebnis.endpoint)
    if (weg.length > 0) {
      const loeschen = await db.from('push_abos').delete().in('endpoint', weg).select('endpoint')
      const entfernt = loeschen.data?.length ?? 0
      zahlen.entfernt += entfernt
      if (loeschen.error || entfernt !== weg.length) {
        console.error(`${art}-erinnerung: alte abos konnten nicht vollständig entfernt werden`)
        zahlen.fehler += 1
      }
    }

    // Die bestehende Produktsemantik bleibt: Sobald mindestens ein Geraet die
    // Nachricht sicher angenommen hat, gilt die Erinnerung der Person als
    // zugestellt. Andere Geraetefehler loesen dann keinen Doppelversand aus.
    const angenommen = ergebnisse.filter(
      (ergebnis) => !ergebnis.weg && ergebnis.fehler === null
    ).length
    if (angenommen > 0) {
      const bestaetigt = await rufeRpc(db, 'bestaetige_erinnerungsversand', basis)
      if (bestaetigt !== 'ja') {
        console.error(`${art}-erinnerung: versand konnte nicht bestaetigt werden`)
        zahlen.fehler += 1
        continue
      }
      zahlen.gesendet += angenommen
      continue
    }

    const ausgang = fehlerausgang(ergebnisse)
    const fehlgeschlagen = await rufeRpc(db, 'melde_erinnerungsversand_fehler', {
      ...basis,
      p_ausgang: ausgang,
    })
    if (fehlgeschlagen !== 'ja') {
      console.error(`${art}-erinnerung: fehlerzustand konnte nicht bestaetigt werden`)
    }
    zahlen.fehler += 1
  }

  return zahlen
}
