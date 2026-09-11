import { supabase } from './supabase'
import { eniAntwort } from './eni'
import type { AnhangVorlage } from './eniAnhang'
import type { EniSpeicher, EniZeile } from './eniSpeicher'

/**
 * Wer ENI antworten laesst.
 *
 * Zwei Fassungen mit derselben Form: das Modell hinter der Edge Function, und
 * die lokale Stimmenprobe im Prototyp oder solange kein Schluessel gesetzt ist.
 * Die Oberflaeche kennt nur diese Schnittstelle und muss deshalb nirgends
 * unterscheiden, wo das Urteil herkommt. Nur eine Stelle unterscheidet: die
 * Zeile im Kopf, die sagt, was gerade laeuft. Sie muss die Wahrheit sagen.
 */
export type Antwortgeber = {
  art: 'modell' | 'stimmenprobe'
  /**
   * schreibt vorlage und urteil und gibt beide zurueck. `eni` ist null, wenn
   * ENI zu dieser vorlage nichts sagt; dann steht der grund in `hinweis`.
   */
  antworte: (
    chatId: string,
    text: string,
    bisher: EniZeile[],
    /** bilder und dateien, die schon hochgeladen sind. leer ist der normalfall. */
    anhaenge?: AnhangVorlage[]
  ) => Promise<{ mensch: EniZeile; eni: EniZeile | null; hinweis?: string }>
}

export class EniModellFehler extends Error {
  constructor(
    message: string,
    /** die vorlage, wenn sie trotz des fehlers schon im verlauf steht */
    readonly mensch: EniZeile | null = null
  ) {
    super(message)
    this.name = 'EniModellFehler'
  }
}

function funktionsAdresse(name: string): { url: string; schluessel: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL
  const schluessel = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabase || !url || !schluessel) return null
  return { url: `${url.replace(/\/+$/, '')}/functions/v1/${name}`, schluessel }
}

/**
 * Eine ENI-Function rufen. Exportiert, weil die Stimme dieselbe Anmeldung,
 * dieselben Kopfzeilen und dieselbe Behandlung einer Antwort braucht, die kein
 * JSON ist — und weil zwei Kopien davon garantiert auseinanderlaufen.
 */
export async function rufeEniFunktion(name: string, rumpf: Record<string, unknown>) {
  const adresse = funktionsAdresse(name)
  const db = supabase
  if (!adresse || !db) throw new EniModellFehler('kein konto')

  const { data, error } = await db.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new EniModellFehler('die anmeldung ist abgelaufen. melde dich neu an.')
  }

  const antwort = await fetch(adresse.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${data.session.access_token}`,
      apikey: adresse.schluessel,
      'content-type': 'application/json',
    },
    body: JSON.stringify(rumpf),
  })

  const text = await antwort.text()
  let inhalt: Record<string, unknown>
  try {
    inhalt = text.trim() === '' ? {} : (JSON.parse(text) as Record<string, unknown>)
  } catch {
    throw new EniModellFehler(`server antwortet ${antwort.status}, aber kein json`)
  }
  return { status: antwort.status, inhalt }
}

const rufe = (rumpf: Record<string, unknown>) => rufeEniFunktion('eni', rumpf)

/**
 * Ob ueberhaupt ein Schluessel gesetzt ist. Kostet nichts: die Function ruft
 * dafuer kein Modell auf. Ein Fehler heisst hier immer "nein" statt zu werfen,
 * damit ENI auch ohne Netz aufgeht.
 */
export async function modellBereit(): Promise<boolean> {
  try {
    const { status, inhalt } = await rufe({ pruefen: true })
    return status === 200 && inhalt.bereit === true
  } catch {
    return false
  }
}

/** ENI hinter der Edge Function. Vorlage und Urteil schreibt der Server. */
export function modellAntwort(): Antwortgeber {
  return {
    art: 'modell',
    async antworte(chatId, text, _bisher, anhaenge) {
      const { status, inhalt } = await rufe({
        chatId,
        text,
        ...(anhaenge && anhaenge.length > 0 ? { anhaenge } : {}),
      })
      const mensch = (inhalt.mensch ?? null) as EniZeile | null

      if (status === 200 && inhalt.eni === null) {
        if (!mensch) throw new EniModellFehler('ENI hat nicht geantwortet.')
        return { mensch, eni: null, hinweis: String(inhalt.hinweis ?? '') }
      }
      if (status !== 200) {
        throw new EniModellFehler(
          String(inhalt.error ?? `server antwortet ${status}`),
          mensch
        )
      }
      if (!mensch || !inhalt.eni) throw new EniModellFehler('ENI hat nicht geantwortet.')
      return { mensch, eni: inhalt.eni as EniZeile }
    },
  }
}

/**
 * Die lokale Stimmenprobe. Sie schreibt selbst in den Speicher, weil es hier
 * keinen Server gibt, der das uebernehmen koennte.
 */
export function stimmenprobeAntwort(speicher: EniSpeicher): Antwortgeber {
  return {
    art: 'stimmenprobe',
    async antworte(chatId, text, bisher) {
      const nr = bisher.filter((zeile) => zeile.rolle === 'mensch').length
      const mensch = await speicher.schreibe(chatId, 'mensch', text)
      const eni = await speicher.schreibe(chatId, 'eni', eniAntwort(text, nr))
      return { mensch, eni }
    },
  }
}
