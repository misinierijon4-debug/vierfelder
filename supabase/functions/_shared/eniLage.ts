import { lokaleMinute } from './erinnerung.ts'
import { BEREICHE, FELDER, endetInDerWoche, messungZaehlt, tafelAusZeilen } from './duellPunkte.ts'
import type { Feld } from './duellPunkte.ts'

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

/**
 * Deutsche Zahl mit Komma. `toFixed` liefert einen Punkt, und ENI reicht ihn
 * ungeprueft ins deutsche Textbild durch: "74.6 kg", "5.7 Stunden".
 */
function komma(wert: number, stellen: number): string {
  return wert.toFixed(stellen).replace('.', ',')
}

function spalte(text: string, breite: number): string {
  return text.length >= breite ? `${text} ` : text.padEnd(breite, ' ')
}

/** so viele Tage zurueck reicht die Serie; mehr liest die Lage nicht */
const SERIE_TAGE = 35
/** so viele Tage zurueck zaehlt der Gewichtstrend */
const TREND_TAGE = 28
/** Wochen, die die Lage einzeln nennt; die Bilanz zaehlt alle gelesenen */
const WOCHEN_GENANNT = 5
/** so lange nach dem Termin steht eine Klausur noch als geschrieben da */
const KLAUSUR_RUECKBLICK_TAGE = 7
/** so viele kommende Klausuren nennt die Lage je Person */
const KLAUSUREN_GENANNT = 8

function mitVorzeichen(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86_400_000)
}

/**
 * Wie viele Tage in Folge ein Feld erledigt ist. Heute zaehlt, sobald es
 * erledigt ist; sonst beginnt die Serie gestern — wie `streak` im Client.
 */
function serieTage(tafel: { felderAm: (person: string, tag: string) => Feld[] }, person: Person, feld: Feld, heute: string): number {
  let tag = tafel.felderAm(person, heute).includes(feld) ? heute : minusTage(heute, 1)
  let tage = 0
  while (tage < SERIE_TAGE && tafel.felderAm(person, tag).includes(feld)) {
    tage += 1
    tag = minusTage(tag, 1)
  }
  return tage
}

/**
 * Wie viel Zeit diese Woche in einem Bereich steckt, getrennt nach Quelle.
 * Gemessene Aufenthalte und als Einheit erfasste Werte koennen denselben
 * Termin beschreiben, deshalb werden sie nie addiert.
 */
function zeitDerWoche(
  einheiten: Array<Record<string, unknown>>,
  aufenthalte: Array<Record<string, unknown>>,
  wer: (id: unknown) => Person | null,
  tagVon: (zeitpunkt: Date) => string,
  montag: string,
  heute: string,
): Map<string, { gemessen: number; erfasst: number }> {
  const summen = new Map<string, { gemessen: number; erfasst: number }>()
  const eintrag = (person: Person, bereich: string) => {
    const schluessel = `${person}:${bereich}`
    const alt = summen.get(schluessel) ?? { gemessen: 0, erfasst: 0 }
    summen.set(schluessel, alt)
    return alt
  }
  for (const e of einheiten) {
    const person = wer(e.user_id)
    const tag = String(e.tag)
    const wert = Number(e.wert)
    if (!person || tag < montag || tag > heute || !Number.isFinite(wert) || wert <= 0) continue
    if ((BEREICHE as readonly string[]).includes(String(e.bereich))) eintrag(person, String(e.bereich)).erfasst += wert
  }
  for (const a of aufenthalte) {
    const person = wer(a.user_id)
    const bereich = String(a.bereich)
    if (!person || !a.abgang || !(BEREICHE as readonly string[]).includes(bereich)) continue
    const start = new Date(String(a.ankunft))
    const ende = new Date(String(a.abgang))
    const minuten = (ende.getTime() - start.getTime()) / 60_000
    const startTag = tagVon(start)
    if (!messungZaehlt(bereich, minuten) || !endetInDerWoche(startTag, tagVon(ende))) continue
    if (startTag < montag || startTag > heute) continue
    eintrag(person, bereich).gemessen += minuten
  }
  return summen
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
  const { tag, minute } = lokaleMinute(jetzt)
  const montag = montagVon(tag)
  const wochentag = WOCHENTAG[new Date(`${tag}T12:00:00Z`).getUTCDay()] ?? ''
  const wer = (id: unknown): Person | null => personen.get(String(id)) ?? null

  const zeilen: string[] = [
    `LAGE. Heute ist ${wochentag}, der ${kurz(tag)}, ${minute} Uhr Ortszeit. Die laufende Woche beginnt am ${kurz(montag)}`,
    '',
  ]

  // Unabhaengige Datenquellen gleichzeitig lesen; Berechnung bleibt identisch.
  // Die Noten je Person: eine gemeinsame Abfrage mit Grenze liess die Person
  // mit weniger Eintraegen leer ausgehen, und ENI sagte „nichts eingetragen“.
  const notenVon = (person: Person) =>
    db
      .from('noten')
      .select('user_id,fach_id,art,punkte,datum')
      .eq('user_id', [...personen].find(([, name]) => name === person)?.[0] ?? '')
      .order('datum', { ascending: false })
      .limit(6)
  const [aufenthalte, gewicht, einheiten, schlaf, faecher, notenErijon, notenKoray, ansagen, wochen, klausuren] = await Promise.all([
    db
    .from('aufenthalte')
    .select('user_id,bereich,ankunft,abgang')
    // Fuenf Wochen zurueck fuer die Serie; Puffer fuer den Tagesbeginn in
    // Europe/Berlin (UTC liegt am Vortag). Neueste zuerst, falls die Grenze
    // der Abfrage greift: dann fehlt das Alte, nicht die laufende Woche.
    .gte('ankunft', `${minusTage(tag, SERIE_TAGE + 1)}T00:00:00Z`)
    .order('ankunft', { ascending: false })
    .limit(1000),
    db
    .from('gewicht')
    .select('user_id,tag,kg')
    .gte('tag', minusTage(tag, SERIE_TAGE))
    .order('tag', { ascending: false }),
    db
    .from('einheiten')
    .select('user_id,bereich,tag,wert')
    .gte('tag', minusTage(tag, SERIE_TAGE)),
    db
    .from('schlafnaechte_ansicht')
    .select('user_id,nacht,schlaf_minuten,nachtwert')
    .gte('nacht', minusTage(tag, 6))
    .order('nacht', { ascending: false }),
    db.from('faecher').select('id,user_id,name,kursart'),
    notenVon('erijon'),
    notenVon('koray'),
    // ansagen enden spaetestens sonntag; alles ab montag ist die laufende woche
    db
    .from('duell_ansagen')
    .select('von,an,feld,ziel,bis,ergebnis,version,stufe,einsatz,reaktion,bezug')
    .gte('bis', montag),
    // das Ergebnis jeder abgeschlossenen Woche, wie der Server es festgeschrieben hat
    db
    .from('wochenabrechnung')
    .select('woche,sieger,grund,differenz,punkte_erijon,punkte_koray')
    .order('woche', { ascending: false })
    .limit(52),
    // der feste Klausurplan; eine Woche zurueck, damit ENI nach einer
    // gerade geschriebenen fragen kann
    db
    .from('klausuren')
    .select('user_id,fach_id,art,kurs,datum,beginn,ende,bemerkung')
    .gte('datum', minusTage(tag, KLAUSUR_RUECKBLICK_TAGE))
    .order('datum', { ascending: true }),
  ])
  const noten = {
    data: [...(notenErijon.data ?? []), ...(notenKoray.data ?? [])],
    error: notenErijon.error ?? notenKoray.error,
  }
  // Dieselben Quellen wie im Tracker: manuelle Einheiten, Messungen und Gewicht.



  if (einheiten.error || aufenthalte.error || gewicht.error) {
    zeilen.push('Trackerstand: nicht vollstaendig lesbar. Keinen Tages- oder Wochenstand nennen und fehlende Daten nicht als null oder fehlende Leistung werten.')
  } else {
    const tafel = tafelAusZeilen(
      { einheiten: einheiten.data, aufenthalte: aufenthalte.data, gewicht: gewicht.data },
      wer,
      (zeitpunkt) => lokaleMinute(zeitpunkt).tag,
      montag,
      tag
    )
    const anzahl = (person: Person, bereich?: string, datum?: string) =>
      tafel.anzahl(person, bereich, datum)
    zeilen.push('Trackerregeln: Ein Punkt je Person, Bereich und Tag; mehrere Einheiten oder Messungen am selben Tag geben keinen Zusatzpunkt. Gewicht zaehlt als fuenftes Feld. Messungen zaehlen erst abgeschlossen ab 20 Minuten, Lesen ab 10 Minuten. Punkte sind keine Anzahl von Trainingseinheiten.')
    // Ansagen zaehlen zur Wertung wie in der App (src/lib/ansagen.ts).
    // Version 2: geschafft → der Einsatz (gekontert doppelt) an die
    // herausgeforderte Person, verfehlt → an die ansagende, offen → nichts.
    // Version 1 (erste Fassung): -1 fuer den Ansager, +1 wenn verfehlt.
    const ansageZeilen = ansagen.error ? [] : (ansagen.data ?? [])
    const ansagePunkte = { erijon: 0, koray: 0 }
    const einsatzVon = (a: Record<string, unknown>) =>
      Number(a.einsatz ?? 1) * (a.reaktion === 'kontern' ? 2 : 1)
    for (const a of ansageZeilen) {
      const von = wer(a.von)
      const an = wer(a.an)
      if (!von || !an) continue
      if (a.version === 2) {
        if (a.ergebnis === 'geschafft') ansagePunkte[an] += einsatzVon(a)
        else if (a.ergebnis === 'verfehlt') ansagePunkte[von] += einsatzVon(a)
      } else {
        ansagePunkte[von] += a.ergebnis === 'verfehlt' ? 1 : -1
      }
    }
    zeilen.push(`Wochenstand (Erijon : Koray): ${anzahl('erijon') + ansagePunkte.erijon}:${anzahl('koray') + ansagePunkte.koray}.`)
    if (ansageZeilen.length > 0) {
      zeilen.push(`Davon Ansagen: Erijon ${mitVorzeichen(ansagePunkte.erijon)}, Koray ${mitVorzeichen(ansagePunkte.koray)}. Die Bereichstabelle unten zaehlt nur die Felder.`)
      zeilen.push('Ansageregel: Wer ansagt, fordert die andere Person in einem Feld heraus; das Ziel liegt ueber ihrem Schnitt der letzten vier Wochen. Stufen: sicher 1, mutig 2, all-in 3 Punkte. Schafft sie es bis Sonntag 18 Uhr, bekommt SIE den Einsatz, sonst der Ansager. Sie kann einmal reagieren: kontern verdoppelt den Einsatz, „du auch" verlangt dasselbe vom Ansager. Es zaehlt nur, was nach der Ansage passiert und am selben Tag eingetragen wird.')
      for (const a of ansageZeilen) {
        const von = wer(a.von)
        const an = wer(a.an)
        if (!von || !an) continue
        const stand = a.ergebnis === 'geschafft' ? 'geschafft' : a.ergebnis === 'verfehlt' ? 'verfehlt' : 'laeuft noch'
        const feld = a.feld === 'gewicht' ? 'wiegen' : String(a.feld)
        if (a.version === 2) {
          const art = a.bezug ? `„du auch" von ${gross(von)} an ${gross(an)}` : `Ansage ${gross(von)} an ${gross(an)}`
          const stufe = a.stufe === 'allin' ? 'all-in' : String(a.stufe ?? 'sicher')
          const kontra = a.reaktion === 'kontern' ? ', gekontert' : ''
          zeilen.push(`${art}: ${Number(a.ziel)}x ${feld} bis Sonntag 18 Uhr, ${stufe}${kontra}, Einsatz ${einsatzVon(a)}, ${stand}.`)
        } else {
          zeilen.push(`Ansage ${gross(von)} an ${gross(an)}: ${Number(a.ziel)}x ${feld} bis Samstag, ${stand}.`)
        }
      }
    }
    zeilen.push(`Tagesstand heute (Erijon : Koray): ${anzahl('erijon', undefined, tag)}:${anzahl('koray', undefined, tag)}.`)
    // Ohne diese Zeile las die Gegenstelle die Wochentabelle als heutigen Stand
    // und erklaerte offene Bereiche fuer erledigt. Der Tag steht deshalb
    // ausgeschrieben da, mit beiden Seiten: erledigt und offen.
    zeilen.push('Heute erledigt und heute noch offen, nur der heutige Tag:')
    for (const person of ['erijon', 'koray'] as const) {
      const erledigt = tafel.felderAm(person, tag)
      const offen = FELDER.filter((feld) => !erledigt.includes(feld))
      const teile = [
        `erledigt: ${erledigt.length ? erledigt.join(', ') : 'nichts'}`,
        `offen: ${offen.length ? offen.join(', ') : 'nichts'}`,
      ]
      zeilen.push(`${spalte(gross(person), 8)}${teile.join('; ')}`)
    }
    zeilen.push('Bei Fragen nach dem Stand ohne Zeitraum den Wochenstand nennen. Die aktuelle LAGE hat Vorrang vor alten Aussagen im Chat; falsche fruehere Zahlen korrigieren.')
    zeilen.push('Punkte dieser Woche je Bereich, Montag bis heute zusammengezaehlt. Das ist nicht der heutige Stand:')
    zeilen.push(`${spalte('', 8)}${spalte('Erijon', 8)}Koray`)
    let summeE = 0
    let summeK = 0
    for (const bereich of FELDER) {
      const e = anzahl('erijon', bereich)
      const k = anzahl('koray', bereich)
      summeE += e
      summeK += k
      zeilen.push(`${spalte(bereich, 8)}${spalte(String(e), 8)}${k}`)
    }
    zeilen.push(`${spalte('Summe', 8)}${spalte(String(summeE), 8)}${summeK}`)

    // Serie: dieselbe Tafel, nur fuenf Wochen breit statt einer.
    const verlauf = tafelAusZeilen(
      { einheiten: einheiten.data, aufenthalte: aufenthalte.data, gewicht: gewicht.data },
      wer,
      (zeitpunkt) => lokaleMinute(zeitpunkt).tag,
      minusTage(tag, SERIE_TAGE),
      tag
    )
    zeilen.push('')
    zeilen.push(`Serie, Tage in Folge je Feld (heute zaehlt, sobald es erledigt ist, sonst beginnt die Serie gestern; mehr als ${SERIE_TAGE} Tage liest die Lage nicht):`)
    for (const person of ['erijon', 'koray'] as const) {
      zeilen.push(`${spalte(gross(person), 8)}${FELDER.map((feld) => `${feld} ${serieTage(verlauf, person, feld, tag)}`).join(', ')}`)
    }

    // Zeit: aus Messungen und aus erfassten Einheiten, nie addiert.
    const zeit = zeitDerWoche(einheiten.data ?? [], aufenthalte.data ?? [], wer, (zeitpunkt) => lokaleMinute(zeitpunkt).tag, montag, tag)
    zeilen.push('')
    zeilen.push('Zeit dieser Woche, Montag bis heute. Gemessen sind abgeschlossene Aufenthalte ab der Mindestdauer, erfasst sind Einheiten mit Minuten (beim Lesen Seiten), ob vom Fokus-Modus oder von Hand. Beides kann denselben Termin meinen und wird nie addiert: nenne es getrennt oder als „mindestens“ den groesseren Wert.')
    for (const person of ['erijon', 'koray'] as const) {
      const teile = BEREICHE.flatMap((bereich) => {
        const summe = zeit.get(`${person}:${bereich}`)
        if (!summe || (summe.gemessen === 0 && summe.erfasst === 0)) return []
        const einheit = bereich === 'lesen' ? 'Seiten' : 'min'
        const wo = [
          summe.gemessen > 0 ? `${Math.round(summe.gemessen)} min gemessen` : '',
          summe.erfasst > 0 ? `${Math.round(summe.erfasst)} ${einheit} erfasst` : '',
        ].filter(Boolean)
        return [`${bereich} ${wo.join(', ')}`]
      })
      zeilen.push(`${spalte(gross(person), 8)}${teile.length ? teile.join('; ') : 'nichts mit Minuten'}`)
    }
  }
  zeilen.push('')

  // abgeschlossene Wochen: gelesen wird das Ergebnis, nicht neu gerechnet
  if (wochen.error) {
    zeilen.push('Abgeschlossene Wochen: nicht lesbar.')
  } else if ((wochen.data ?? []).length > 0) {
    const liste = wochen.data ?? []
    const stand = (z: Record<string, unknown>) => {
      const e = z.punkte_erijon
      const k = z.punkte_koray
      const punkte = e == null || k == null ? `Differenz ${mitVorzeichen(Number(z.differenz))} fuer Erijon` : `${Number(e)}:${Number(k)}`
      const sieger = z.sieger === 'unentschieden' ? 'unentschieden' : gross(String(z.sieger))
      return `Woche ab ${kurz(String(z.woche))} ${sieger} (${punkte}${z.grund === 'beleg' ? ', nach Beleg' : ''})`
    }
    const siege = (wer: string) => liste.filter((z) => z.sieger === wer).length
    zeilen.push(`Abgeschlossene Wochen, neueste zuerst (Erijon : Koray): ${liste.slice(0, WOCHEN_GENANNT).map(stand).join('; ')}.`)
    zeilen.push(`Bilanz aus ${liste.length} abgeschlossenen Wochen: Erijon ${siege('erijon')} Siege, Koray ${siege('koray')}, unentschieden ${siege('unentschieden')}. Die laufende Woche ist darin nicht enthalten.`)
    zeilen.push('')
  }

  // gewicht, letzte zwei wochen
  if (gewicht.error) {
    zeilen.push('Gewicht: nicht lesbar.')
  } else {
    zeilen.push('Gewicht, letzte Werte in kg:')
    for (const person of ['erijon', 'koray'] as const) {
      const werte = (gewicht.data ?? [])
        .filter((zeile) => wer(zeile.user_id) === person)
        .slice(0, 5)
        .map((zeile) => `${kurz(String(zeile.tag))} ${komma(Number(zeile.kg), 1)}`)
      zeilen.push(`${spalte(gross(person), 8)}${werte.length ? werte.join('  ') : 'nichts eingetragen'}`)
    }
    // Trend: aeltester gegen neuester Wert der letzten Wochen. Unter einer
    // Woche Abstand sagt der Unterschied nichts ueber eine Richtung.
    const trend = (['erijon', 'koray'] as const).flatMap((person) => {
      const werte = (gewicht.data ?? [])
        .filter((zeile) => wer(zeile.user_id) === person && String(zeile.tag) >= minusTage(tag, TREND_TAGE))
        .map((zeile) => ({ tag: String(zeile.tag), kg: Number(zeile.kg) }))
        .sort((a, b) => a.tag.localeCompare(b.tag))
      const erster = werte[0]
      const letzter = werte[werte.length - 1]
      if (!erster || !letzter || tageZwischen(erster.tag, letzter.tag) < 7) return []
      const unterschied = Math.round((letzter.kg - erster.kg) * 10) / 10
      const richtung = unterschied === 0 ? 'unveraendert' : `${unterschied > 0 ? 'plus' : 'minus'} ${komma(Math.abs(unterschied), 1)} kg`
      return [`${spalte(gross(person), 8)}${kurz(erster.tag)} ${komma(erster.kg, 1)} auf ${kurz(letzter.tag)} ${komma(letzter.kg, 1)}: ${richtung}`]
    })
    if (trend.length) zeilen.push(`Gewichtstrend, erster und letzter Wert der letzten ${TREND_TAGE / 7} Wochen (Schwankungen im Tagesverlauf sind normal, ein Wert ist kein Trend):`, ...trend)
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
          const stunden = komma(Number(zeile.schlaf_minuten) / 60, 1)
          return `${kurz(String(zeile.nacht))} ${stunden}h/${String(zeile.nachtwert)}`
        })
      const minuten = (schlaf.data ?? [])
        .filter((zeile) => wer(zeile.user_id) === person)
        .slice(0, 5)
        .map((zeile) => Number(zeile.schlaf_minuten))
        .filter((m) => Number.isFinite(m))
      const schnitt = minuten.length >= 2 ? `  (Schnitt ${komma(minuten.reduce((a, b) => a + b, 0) / minuten.length / 60, 1)}h aus ${minuten.length} Naechten)` : ''
      zeilen.push(`${spalte(gross(person), 8)}${naechte.length ? naechte.join('  ') + schnitt : 'nichts importiert'}`)
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

  zeilen.push('')

  // klausuren aus dem festen plan der schule
  if (faecher.error || klausuren.error) {
    zeilen.push('Klausuren: nicht lesbar. Keine Termine nennen oder schaetzen.')
  } else {
    const fach = new Map(
      (faecher.data ?? []).map((zeile) => [String(zeile.id), { name: String(zeile.name), lk: zeile.kursart === 'lk' }])
    )
    const termine = (klausuren.data ?? []).flatMap((zeile) => {
      const person = wer(zeile.user_id)
      const f = fach.get(String(zeile.fach_id))
      if (!person || !f) return []
      return [{
        person,
        name: f.name,
        lk: f.lk,
        abitur: zeile.art === 'abitur',
        datum: String(zeile.datum),
        zeit: zeile.beginn && zeile.ende ? `${String(zeile.beginn).slice(0, 5)}-${String(zeile.ende).slice(0, 5)}` : 'Uhrzeit offen',
        tage: tageZwischen(tag, String(zeile.datum)),
      }]
    })
    const wochentagKurz = (datum: string) => (WOCHENTAG[new Date(`${datum}T12:00:00Z`).getUTCDay()] ?? '').slice(0, 2)
    const abstand = (tage: number) =>
      tage === 0 ? 'heute' : tage === 1 ? 'morgen' : tage > 0 ? `in ${tage} Tagen` : tage === -1 ? 'gestern' : `vor ${-tage} Tagen`
    const beschreibe = (t: (typeof termine)[number]) =>
      `${wochentagKurz(t.datum)} ${kurz(t.datum)} ${t.abitur ? 'Abiturpruefung ' : ''}${t.name}${t.lk ? ' LK' : ''} (${abstand(t.tage)}, ${t.zeit})`
    zeilen.push('Klausuren, aus dem festen Kursarbeitsplan der Schule (MSS 13), naechste zuerst. Nur diese Termine gelten; keine erfinden oder verschieben:')
    for (const person of ['erijon', 'koray'] as const) {
      const kommend = termine.filter((t) => t.person === person && t.tage >= 0).slice(0, KLAUSUREN_GENANNT)
      zeilen.push(`${spalte(gross(person), 8)}${kommend.length ? kommend.map(beschreibe).join('; ') : 'keine mehr im Plan'}`)
      const geschrieben = termine.filter((t) => t.person === person && t.tage < 0)
      if (geschrieben.length) zeilen.push(`${spalte('', 8)}zuletzt geschrieben: ${geschrieben.map(beschreibe).join('; ')}`)
    }
    const gemeinsam = termine.filter((t) =>
      t.person === 'erijon' && t.tage >= 0 &&
      termine.some((k) => k.person === 'koray' && k.datum === t.datum && k.name === t.name))
    if (gemeinsam.length) zeilen.push(`Am selben Tag im selben Fach: ${gemeinsam.map((t) => `${kurz(t.datum)} ${t.name}`).join(', ')}.`)
    zeilen.push('Bei Lernplaenen und der Frage, was als Naechstes dran ist: vom naechsten Termin rueckwaerts planen, Leistungskurse (4 bis 4,5 Stunden) frueher anfangen, und die Lernzeit dieser Woche aus der Tabelle oben mitdenken. Nach einer gerade geschriebenen Klausur darfst du fragen, wie sie lief, und an das Eintragen der Note erinnern, sobald sie da ist.')
  }

  return zeilen.join('\n')
}
