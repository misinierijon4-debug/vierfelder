import { addDays, fromKey, startOfWeek, TAGKUERZEL, toKey } from './dates'
import { wirktNoch, type Erinnerung } from '../../supabase/functions/_shared/eniWissen'

/**
 * was die gedächtnisseite zeigt, ohne selbst zu speichern: ordnen, zählen,
 * datieren. die regel, ob ENI einen eintrag noch liest, kommt aus
 * `wirktNoch` — dieselbe stelle, an der die edge function aussortiert. die
 * seite sagt „ruht" also genau dann, wenn ENI ihn wirklich nicht mehr liest.
 */

export type WissensArt = Erinnerung['art']

/** reihenfolge der abschnitte: was immer gilt zuerst, was zu tun ist zuletzt */
export const ART_REIHE: WissensArt[] = ['stil', 'profil', 'aktuell', 'erfahrung', 'aufgabe']

/** kurzname für die zähltafel, fünf spalten auf 390 px */
export const ART_KURZ: Record<WissensArt, string> = {
  stil: 'ton',
  profil: 'ich',
  aktuell: 'gerade',
  erfahrung: 'klappt',
  aufgabe: 'schritte',
}

/** ein satz je bereich: wofür er da ist und was ENI damit tut */
export const ART_HINWEIS: Record<WissensArt, string> = {
  stil: 'wie ENI mit dir redet. steht bei persönlichen fragen immer vorn und bleibt privat.',
  profil: 'wer du bist, woran du arbeitest, was dir wichtig ist.',
  aktuell: 'was gerade anders ist als sonst. mit enddatum vergisst ENI es von selbst.',
  erfahrung: 'was bei dir wirkt und was nicht. ENI schlägt danach vor.',
  aufgabe: 'ENI hat den schritt im blick, bis du ihn abhakst. keine benachrichtigung, kein trackerpunkt.',
}

export const ART_BEISPIEL: Record<WissensArt, string> = {
  stil: 'Direkt, aber bei persönlichen Sorgen erst zuhören.',
  profil: 'Ich mache Abi 2027, mein Ziel ist …',
  aktuell: 'Diese Woche Klausurphase, kaum Zeit fürs Gym.',
  erfahrung: 'Kurze Lernblöcke nach der Schule klappen besser als einer am Abend.',
  aufgabe: 'Am Montag 20 Minuten Matheaufgaben üben.',
}

export type WissensAnsicht = {
  /** je bereich die einträge, die ENI liest — in ART_REIHE, auch leere */
  abschnitte: { art: WissensArt; eintraege: Erinnerung[] }[]
  /** erledigt oder abgelaufen: sichtbar, aber ENI liest sie nicht mehr */
  ruht: Erinnerung[]
  /** aktive einträge je bereich */
  zahlen: Record<WissensArt, number>
  /** alles, was ENI gerade lesen kann */
  aktiv: number
  /** davon deine, die du geteilt hast */
  geteilt: number
  /** davon die, die der andere mit dir geteilt hat */
  fremd: number
}

/** was du sehen darfst: deins und das, was der andere bewusst geteilt hat */
function sichtbar(e: Erinnerung, kontoId: string): boolean {
  return e.user_id === kontoId || (e.gemeinsam && e.art !== 'stil')
}

/**
 * aufgaben stehen nach fälligkeit, die nächste oben, ohne datum zuletzt. alles
 * andere nach letzter änderung — deins vor dem, was der andere geteilt hat.
 */
function reihenfolge(kontoId: string) {
  return (a: Erinnerung, b: Erinnerung) => {
    if (a.art === 'aufgabe' && b.art === 'aufgabe') {
      if (a.erledigt !== b.erledigt) return a.erledigt ? 1 : -1
      if (a.bis !== b.bis) {
        if (!a.bis) return 1
        if (!b.bis) return -1
        return a.bis < b.bis ? -1 : 1
      }
    }
    const aMeins = a.user_id === kontoId
    if (aMeins !== (b.user_id === kontoId)) return aMeins ? -1 : 1
    return b.geaendert.localeCompare(a.geaendert)
  }
}

/**
 * ordnet die geladene liste in abschnitte. `halten` sind aufgaben, die gerade
 * eben abgehakt wurden: sie bleiben durchgestrichen an ihrem platz stehen,
 * statt unter dem daumen in „ruht" zu verschwinden. beim nächsten öffnen
 * wandern sie dorthin.
 */
export function ordneWissen(
  liste: Erinnerung[],
  kontoId: string,
  heute: string,
  halten: ReadonlySet<string> = new Set(),
): WissensAnsicht {
  const zahlen = { stil: 0, profil: 0, aktuell: 0, erfahrung: 0, aufgabe: 0 }
  const je = new Map<WissensArt, Erinnerung[]>(ART_REIHE.map((art) => [art, []]))
  const ruht: Erinnerung[] = []
  let geteilt = 0
  let fremd = 0
  for (const e of liste) {
    if (!sichtbar(e, kontoId)) continue
    const wirkt = wirktNoch(e, heute)
    if (!wirkt && !halten.has(e.id)) {
      ruht.push(e)
      continue
    }
    je.get(e.art)?.push(e)
    if (!wirkt) continue
    zahlen[e.art]++
    if (e.user_id !== kontoId) fremd++
    else if (e.gemeinsam) geteilt++
  }
  const sortiere = reihenfolge(kontoId)
  return {
    abschnitte: ART_REIHE.map((art) => ({ art, eintraege: je.get(art)!.sort(sortiere) })),
    ruht: ruht.sort((a, b) => b.geaendert.localeCompare(a.geaendert)),
    zahlen,
    aktiv: Object.values(zahlen).reduce((summe, n) => summe + n, 0),
    geteilt,
    fremd,
  }
}

/** suche über den text, gross/klein egal, alle wörter müssen vorkommen */
export function passtZurSuche(e: Erinnerung, suche: string): boolean {
  const woerter = suche.toLocaleLowerCase('de').split(/\s+/).filter(Boolean)
  if (woerter.length === 0) return true
  const text = e.text.toLocaleLowerCase('de')
  return woerter.every((wort) => text.includes(wort))
}

/** `06.10.`, in einem anderen jahr mit jahreszahl */
function tagMonat(key: string, heute: string): string {
  const [jahr, monat, tag] = key.split('-')
  return `${tag}.${monat}.${jahr === heute.slice(0, 4) ? '' : jahr}`
}

/** `mo 06.10.` — bei fristen hilft der wochentag, man plant in wochen */
export function kurzDatum(key: string, heute: string): string {
  return `${TAGKUERZEL[(fromKey(key).getDay() + 6) % 7]} ${tagMonat(key, heute)}`
}

function tageZwischen(von: string, bis: string): number {
  return Math.round((fromKey(bis).getTime() - fromKey(von).getTime()) / 86_400_000)
}

/** wann zuletzt geändert: `heute`, `gestern`, `vor 3 tagen`, sonst das datum */
export function standText(geaendert: string, heute: string): string {
  const d = new Date(geaendert)
  if (Number.isNaN(d.getTime())) return ''
  const tage = tageZwischen(toKey(d), heute)
  if (tage <= 0) return 'heute'
  if (tage === 1) return 'gestern'
  if (tage < 7) return `vor ${tage} tagen`
  return `am ${tagMonat(toKey(d), heute)}`
}

/**
 * die zeitangabe unter einem eintrag. `dringend` heisst: heute fällig oder
 * überfällig — das steht dann als wort da, nicht nur als farbe.
 */
export function fristText(e: Erinnerung, heute: string): { text: string; dringend: boolean } | null {
  if (e.art === 'aufgabe') {
    if (e.erledigt) return { text: 'erledigt', dringend: false }
    if (!e.bis) return null
    const tage = tageZwischen(heute, e.bis)
    if (tage < 0) return { text: `überfällig seit ${kurzDatum(e.bis, heute)}`, dringend: true }
    if (tage === 0) return { text: 'heute fällig', dringend: true }
    if (tage === 1) return { text: 'morgen fällig', dringend: false }
    return { text: `fällig ${kurzDatum(e.bis, heute)}`, dringend: false }
  }
  if (!e.bis) return null
  if (e.bis < heute) return { text: `abgelaufen ${kurzDatum(e.bis, heute)}`, dringend: false }
  if (e.bis === heute) return { text: 'gilt bis heute', dringend: false }
  return { text: `gilt bis ${kurzDatum(e.bis, heute)}`, dringend: false }
}

export type Schnellwahl = { text: string; bis: string | null }

/**
 * die üblichen enddaten als ein tipp statt eines kalenders. „bis sonntag"
 * schliesst den sonntag ein — ENI liest einen eintrag bis einschliesslich
 * `bis`. der kalender bleibt für alles andere daneben.
 */
export function schnellwahl(art: WissensArt, heute: Date): Schnellwahl[] {
  const sonntag = toKey(addDays(startOfWeek(heute), 6))
  if (art === 'aufgabe')
    return [
      { text: 'ohne datum', bis: null },
      { text: 'heute', bis: toKey(heute) },
      { text: 'morgen', bis: toKey(addDays(heute, 1)) },
      { text: 'bis sonntag', bis: sonntag },
    ]
  return [
    { text: 'ohne ende', bis: null },
    { text: 'bis sonntag', bis: sonntag },
    { text: '4 wochen', bis: toKey(addDays(heute, 28)) },
  ]
}
