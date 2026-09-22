import { pruefeAuswahl } from '../../supabase/functions/_shared/ansageSprueche'
import type { SpruchAuswahl } from '../../supabase/functions/_shared/ansageSprueche'
import { vorlageSpruch } from './ansagen'
import type { AnsageVorschlag } from './ansagen'
import { supabase } from './supabase'

/**
 * holt ENIs auswahl und sprüche für die ansage-vorschläge. ENI sieht nur feld,
 * ziel und verlauf und darf keine ziffer schreiben — die zahlen stehen daneben
 * und kommen aus `ansagen.ts`.
 */

export type GezeigterVorschlag = AnsageVorschlag & {
  spruch: string
  /** ob der spruch von ENI kommt oder aus der vorlage */
  vonEni: boolean
}

/** so viele vorschläge stehen höchstens da — wie bei ENI */
export const GEZEIGTE_VORSCHLAEGE = 3

/**
 * eine antwort je satz vorschläge und sitzung. wer den tab wechselt und
 * zurückkommt, fragt ENI nicht noch einmal — die vorschläge ändern sich nur,
 * wenn eine ansage dazukommt oder ein neuer tag beginnt.
 */
const gemerkt = new Map<string, Promise<SpruchAuswahl[] | null>>()

function schluessel(vorschlaege: AnsageVorschlag[]): string {
  return JSON.stringify(vorschlaege.map((v) => [v.feld, v.ziel, v.ab, v.bis, v.verlauf]))
}

/** null heißt: ohne ENI weiter — im prototyp, offline oder bei einer leeren antwort */
export function ladeAnsageSprueche(vorschlaege: AnsageVorschlag[]): Promise<SpruchAuswahl[] | null> {
  const db = supabase
  if (!db || vorschlaege.length === 0) return Promise.resolve(null)
  const key = schluessel(vorschlaege)
  const vorhanden = gemerkt.get(key)
  if (vorhanden) return vorhanden
  const anfrage = db.functions
    .invoke('ansage-sprueche', {
      body: { vorschlaege: vorschlaege.map(({ feld, ziel, verlauf }) => ({ feld, ziel, verlauf })) },
    })
    .then(({ data, error }) => {
      if (error) return null
      const auswahl = pruefeAuswahl(data, vorschlaege.map((v) => v.feld))
      return auswahl.length > 0 ? auswahl : null
    })
    .catch(() => null)
    .then((auswahl) => {
      // ein fehlschlag bleibt nicht gemerkt: beim nächsten öffnen darf ENI wieder
      if (auswahl === null) gemerkt.delete(key)
      return auswahl
    })
  gemerkt.set(key, anfrage)
  return anfrage
}

/**
 * was die oberfläche zeigt: ENIs auswahl in ENIs reihenfolge, sonst die
 * ersten vorschläge mit dem spruch aus der vorlage. ENI kann nur auswählen,
 * was die app vorgeschlagen hat.
 */
export function gezeigteVorschlaege(
  vorschlaege: AnsageVorschlag[],
  auswahl: SpruchAuswahl[] | null,
  name: string
): GezeigterVorschlag[] {
  if (auswahl && auswahl.length > 0) {
    const liste: GezeigterVorschlag[] = []
    for (const { feld, spruch } of auswahl) {
      const v = vorschlaege.find((x) => x.feld === feld)
      if (v) liste.push({ ...v, spruch, vonEni: true })
    }
    if (liste.length > 0) return liste.slice(0, GEZEIGTE_VORSCHLAEGE)
  }
  return vorschlaege
    .slice(0, GEZEIGTE_VORSCHLAEGE)
    .map((v) => ({ ...v, spruch: vorlageSpruch(v, name), vonEni: false }))
}
