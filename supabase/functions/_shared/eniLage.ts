import { lokaleMinute } from './erinnerung.ts'

/**
 * Die Lage: der Stand des Duells, so knapp wie moeglich, damit ENI vergleichen
 * kann statt zu raten.
 *
 * Sie wird serverseitig gelesen und in den System-Prompt gehaengt. Der Client
 * schickt keine Zahlen mit: sonst koennte man ENI eine Woche vorluegen, die es
 * nie gab, und genau das ist der Selbstbetrug, gegen den sie da ist.
 *
 * Beide Personen duerfen die Zahlen der anderen ohnehin lesen; das ist seit
 * dem ersten Tag der Sinn dieser App. Die Chats bleiben davon unberuehrt.
 */

export type Person = 'erijon' | 'koray'

type Fehler = { message?: string } | null
type Ergebnis<T> = { data: T; error: Fehler }

type LageAbfrage = PromiseLike<Ergebnis<Array<Record<string, unknown>> | null>> & {
  eq(spalte: string, wert: unknown): LageAbfrage
  gte(spalte: string, wert: string): LageAbfrage
  order(spalte: string, optionen: { ascending: boolean }): LageAbfrage
  limit(anzahl: number): LageAbfrage
}

export type LageDatenbank = {
  from(tabelle: string): { select(spalten: string): LageAbfrage }
}

export const BEREICHE = ['lernen', 'gym', 'boxen', 'lesen'] as const

const WOCHENTAG = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
]

/** montag der woche, in der `tag` liegt. tag ist yyyy-mm-dd. */
export function montagVon(tag: string): string {
  const datum = new Date(`${tag}T12:00:00Z`)
  const versatz = (datum.getUTCDay() + 6) % 7
  datum.setUTCDate(datum.getUTCDate() - versatz)
  return datum.toISOString().slice(0, 10)
}

function minusTage(tag: string, anzahl: number): string {
  const datum = new Date(`${tag}T12:00:00Z`)
  datum.setUTCDate(datum.getUTCDate() - anzahl)
  return datum.toISOString().slice(0, 10)
}

function kurz(tag: string): string {
  return `${tag.slice(8, 10)}.${tag.slice(5, 7)}.`
}

/** namen stehen im prompt gross, wie ueberall sonst auch */
function gross(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function spalte(text: string, breite: number): string {
  return text.length >= breite ? `${text} ` : text.padEnd(breite, ' ')
}

/**
 * Liest die Lage. Faellt eine einzelne Abfrage aus, fehlt nur ihr Abschnitt;
 * ENI bekommt dann eine Zeile, die das sagt, statt einer erfundenen Zahl.
 */
export async function baueLage(
  db: LageDatenbank,
  personen: Map<string, Person>,
  jetzt: Date = new Date()
): Promise<string> {
  const { tag } = lokaleMinute(jetzt)
  const montag = montagVon(tag)
  const wochentag = WOCHENTAG[new Date(`${tag}T12:00:00Z`).getUTCDay()] ?? ''
  const wer = (id: unknown): Person | null => personen.get(String(id)) ?? null

  const zeilen: string[] = [
    `LAGE. Heute ist ${wochentag}, der ${kurz(tag)} Die laufende Woche beginnt am ${kurz(montag)}`,
    '',
  ]

  // Unabhaengige Datenquellen gleichzeitig lesen; Berechnung bleibt identisch.
  const [aufenthalte, gewicht, einheiten, schlaf, faecher, noten] = await Promise.all([
    db
    .from('aufenthalte')
    .select('user_id,bereich,ankunft,abgang')
    // Puffer fuer den Wochenbeginn in Europe/Berlin (UTC liegt am Vortag).
    .gte('ankunft', `${minusTage(montag, 1)}T00:00:00Z`),
    db
    .from('gewicht')
    .select('user_id,tag,kg')
    .gte('tag', minusTage(tag, 13))
    .order('tag', { ascending: false }),
    db
    .from('einheiten')
    .select('user_id,bereich,tag,wert')
    .gte('tag', montag),
    db
    .from('schlafnaechte_ansicht')
    .select('user_id,nacht,schlaf_minuten,nachtwert')
    .gte('nacht', minusTage(tag, 6))
    .order('nacht', { ascending: false }),
    db.from('faecher').select('id,user_id,name'),
    db
    .from('noten')
    .select('user_id,fach_id,art,punkte,datum')
    .order('datum', { ascending: false })
    .limit(20)
  ])
  // Dieselben Quellen wie im Tracker: manuelle Einheiten, Messungen und Gewicht.



  if (einheiten.error || aufenthalte.error || gewicht.error) {
    zeilen.push('Trackerstand: nicht vollstaendig lesbar. Keinen Tages- oder Wochenstand nennen und fehlende Daten nicht als null oder fehlende Leistung werten.')
  } else {
    const punkte = new Set<string>()
    const addiere = (id: unknown, bereich: string, datum: string) => {
      const person = wer(id)
      if (!person || datum < montag || datum > tag) return
      punkte.add(`${person}:${bereich}:${datum}`)
    }
    for (const eintrag of einheiten.data ?? []) {
      const bereich = String(eintrag.bereich)
      if (BEREICHE.some((b) => b === bereich)) {
        addiere(eintrag.user_id, bereich, String(eintrag.tag))
      }
    }
    for (const aufenthalt of aufenthalte.data ?? []) {
      const bereich = String(aufenthalt.bereich)
      if (!BEREICHE.some((b) => b === bereich) || !aufenthalt.abgang) continue
      const start = new Date(String(aufenthalt.ankunft))
      const dauer = (new Date(String(aufenthalt.abgang)).getTime() - start.getTime()) / 60_000
      if (!Number.isFinite(dauer) || dauer < (bereich === 'lesen' ? 10 : 20)) continue
      addiere(aufenthalt.user_id, bereich, lokaleMinute(start).tag)
    }
    for (const eintrag of gewicht.data ?? []) {
      addiere(eintrag.user_id, 'gewicht', String(eintrag.tag))
    }
    const anzahl = (person: Person, bereich?: string, datum?: string) =>
      [...punkte].filter((punkt) => {
        const [p, b, t] = punkt.split(':')
        return p === person && (!bereich || b === bereich) && (!datum || t === datum)
      }).length
    zeilen.push('Trackerregeln: Ein Punkt je Person, Bereich und Tag; mehrere Einheiten oder Messungen am selben Tag geben keinen Zusatzpunkt. Gewicht zaehlt als fuenftes Feld. Messungen zaehlen erst abgeschlossen ab 20 Minuten, Lesen ab 10 Minuten. Punkte sind keine Anzahl von Trainingseinheiten.')
    zeilen.push(`Wochenstand (Erijon : Koray): ${anzahl('erijon')}:${anzahl('koray')}.`)
    zeilen.push(`Tagesstand heute (Erijon : Koray): ${anzahl('erijon', undefined, tag)}:${anzahl('koray', undefined, tag)}.`)
    zeilen.push('Bei Fragen nach dem Stand ohne Zeitraum den Wochenstand nennen. Die aktuelle LAGE hat Vorrang vor alten Aussagen im Chat; falsche fruehere Zahlen korrigieren.')
    zeilen.push('Diese Woche, Tagespunkte je Bereich:')
    zeilen.push(`${spalte('', 8)}${spalte('Erijon', 8)}Koray`)
    let summeE = 0
    let summeK = 0
    for (const bereich of [...BEREICHE, 'gewicht']) {
      const e = anzahl('erijon', bereich)
      const k = anzahl('koray', bereich)
      summeE += e
      summeK += k
      zeilen.push(`${spalte(bereich, 8)}${spalte(String(e), 8)}${k}`)
    }
    zeilen.push(`${spalte('Summe', 8)}${spalte(String(summeE), 8)}${summeK}`)
  }
  zeilen.push('')

  // gewicht, letzte zwei wochen
  if (gewicht.error) {
    zeilen.push('Gewicht: nicht lesbar.')
  } else {
    zeilen.push('Gewicht, letzte Werte in kg:')
    for (const person of ['erijon', 'koray'] as const) {
      const werte = (gewicht.data ?? [])
        .filter((zeile) => wer(zeile.user_id) === person)
        .slice(0, 5)
        .map((zeile) => `${kurz(String(zeile.tag))} ${Number(zeile.kg).toFixed(1)}`)
      zeilen.push(`${spalte(gross(person), 8)}${werte.length ? werte.join('  ') : 'nichts eingetragen'}`)
    }
  }
  zeilen.push('')

  // schlaf, letzte fuenf naechte
  // Die Basistabelle `schlafnaechte` hat keine Lese-Policy: ein Zugriff dort
  // liefert unter RLS still null Zeilen, und ENI haette den Schlaf fuer immer
  // als "nichts importiert" gemeldet. Die App liest denselben Lesemodell-View.

  if (schlaf.error) {
    zeilen.push('Schlaf: nicht lesbar.')
  } else {
    zeilen.push('Schlaf, letzte Naechte als Stunden und Nachtwert:')
    for (const person of ['erijon', 'koray'] as const) {
      const naechte = (schlaf.data ?? [])
        .filter((zeile) => wer(zeile.user_id) === person)
        .slice(0, 5)
        .map((zeile) => {
          const stunden = (Number(zeile.schlaf_minuten) / 60).toFixed(1)
          return `${kurz(String(zeile.nacht))} ${stunden}h/${String(zeile.nachtwert)}`
        })
      zeilen.push(`${spalte(gross(person), 8)}${naechte.length ? naechte.join('  ') : 'nichts importiert'}`)
    }
  }
  zeilen.push('')

  // noten, die letzten sechs


  if (faecher.error || noten.error) {
    zeilen.push('Noten: nicht lesbar.')
  } else {
    const fachname = new Map(
      (faecher.data ?? []).map((zeile) => [String(zeile.id), String(zeile.name)])
    )
    zeilen.push('Noten, zuletzt eingetragen, Punkte von 15:')
    for (const person of ['erijon', 'koray'] as const) {
      const eintraege = (noten.data ?? [])
        .filter((zeile) => wer(zeile.user_id) === person)
        .slice(0, 4)
        .map(
          (zeile) =>
            `${fachname.get(String(zeile.fach_id)) ?? 'fach'} ${String(zeile.art)} ${String(zeile.punkte)}`
        )
      zeilen.push(`${spalte(gross(person), 8)}${eintraege.length ? eintraege.join(', ') : 'nichts eingetragen'}`)
    }
  }

  return zeilen.join('\n')
}
