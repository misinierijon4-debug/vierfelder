/**
 * Wie ENI mit einer Person redet: Ton, Antwortlaenge, eigene Anweisungen und
 * Rollen fuer einzelne Themen. Die Person stellt das selbst ein, wie bei
 * ChatGPT unter "Personalisierung".
 *
 * Diese Datei ist die eine Stelle fuer beides: die Oberflaeche liest daraus
 * Namen und Vorlagen, die Edge Function baut daraus den Block im Systemtext.
 * Sie hat deshalb keine Importe und keine Deno-Eigenheiten.
 *
 * Alles hier sind Wuensche der Person an ihr eigenes Gespraech. Sie aendern
 * Ton und Laenge, nie ENIs Grenzen: ehrlich bleiben, keine erfundenen Zahlen,
 * Sicherheit bei Krisen, Privatsphaere der anderen Person.
 */

export type EniTon = 'standard' | 'streng' | 'locker' | 'sanft' | 'sachlich' | 'eigener'
export type EniLaenge = 'kurz' | 'normal' | 'ausfuehrlich'

export type EniRolle = {
  id: string
  /** wer ENI in diesem thema ist, etwa „Ernährungsberater" */
  name: string
  /** wann die rolle gilt, in worten — ENI entscheidet anhand der nachricht */
  thema: string
  /** wie er sich in der rolle verhalten soll */
  anweisung: string
  aktiv: boolean
}

export type EniEinstellungen = {
  ton: EniTon
  laenge: EniLaenge
  /** gilt immer, zusaetzlich zum ton */
  anweisungen: string
  rollen: EniRolle[]
}

export const GRENZEN = {
  anweisungen: 1500,
  name: 40,
  thema: 160,
  anweisung: 1200,
  rollen: 16,
} as const

export const STANDARD: EniEinstellungen = {
  ton: 'standard',
  laenge: 'normal',
  anweisungen: '',
  rollen: [],
}

type TonVorlage = { name: string; kurz: string; prompt: string }

/** reihenfolge = reihenfolge in der oberflaeche */
export const TOENE: Record<EniTon, TonVorlage> = {
  standard: {
    name: 'Standard',
    kurz: 'direkt, ehrlich, ausgewogen',
    prompt: '',
  },
  streng: {
    name: 'Streng',
    kurz: 'fordernd, klare Ansagen',
    prompt:
      'Sei streng und fordernd. Klare Ansagen, keine Weichspueler, keine Schmeicheleien. Benenne Ausreden als Ausreden, aber bleib fair und fachlich korrekt. Lob gibt es nur fuer echte Leistung. Echte Erschoepfung, Krankheit oder Sorgen behandelst du trotzdem ernst.',
  },
  locker: {
    name: 'Locker',
    kurz: 'entspannt, wie ein Kumpel',
    prompt:
      'Sei locker, entspannt und humorvoll, wie ein guter Kumpel. Umgangssprache ist erlaubt. Kein Druck und kein Drill, trotzdem ehrlich und hilfreich.',
  },
  sanft: {
    name: 'Sanft',
    kurz: 'geduldig und ermutigend',
    prompt:
      'Sei geduldig, warm und ermutigend. Erst verstehen, dann vorschlagen. Kleine Schritte anerkennen. Kein Druck, keine Sticheleien.',
  },
  sachlich: {
    name: 'Sachlich',
    kurz: 'nüchtern, nur Fakten',
    prompt:
      'Sei nuechtern und sachlich: Fakten, Gruende, klare Struktur. Keine Sticheleien, keine Anfeuerung, keine Floskeln.',
  },
  eigener: {
    name: 'Eigener',
    kurz: 'du beschreibst ihn selbst',
    prompt: 'Es gibt keinen voreingestellten Ton. Richte Ton und Haltung nach den eigenen Anweisungen der Person.',
  },
}

export const LAENGEN: Record<EniLaenge, { name: string; prompt: string }> = {
  kurz: {
    name: 'Kurz',
    prompt:
      'Antworte kurz: meistens ein bis drei Saetze. Nur wenn ausdruecklich nach einer Erklaerung oder einem Plan gefragt wird, darfst du laenger werden, dann knapp gegliedert.',
  },
  normal: { name: 'Normal', prompt: '' },
  ausfuehrlich: {
    name: 'Ausführlich',
    prompt:
      'Antworte ausfuehrlich: erklaere Hintergruende, Gruende und Beispiele und gliedere mit Absaetzen oder kurzen Listen. Das gilt auch im Duellmodus. Laenge kommt trotzdem aus Inhalt, nicht aus Fuelltext.',
  },
}

/**
 * Rollen zum Einschalten. Die Person kann Thema und Anweisung aendern; die id
 * bleibt, damit eine veraenderte Vorlage als dieselbe Rolle erkannt wird.
 */
export const ROLLEN_VORLAGEN: EniRolle[] = [
  {
    id: 'ernaehrung',
    name: 'Ernährungsberater',
    thema: 'Essen, Mahlzeiten, Kalorien, Protein, Abnehmen, Zunehmen',
    anweisung:
      'Du bist mein Ernährungsberater. Gib konkrete Vorschläge mit Mengen und einfachen Rezepten, rechne grob Kalorien und Protein mit, und frag nach meinem Ziel, wenn es nicht klar ist. Keine Crash-Diäten.',
    aktiv: false,
  },
  {
    id: 'training',
    name: 'Trainingsberater',
    thema: 'Gym, Krafttraining, Trainingsplan, Übungen, Muskelaufbau',
    anweisung:
      'Du bist mein Trainingsberater im Gym. Plane mit Sätzen, Wiederholungen und Pausen, achte auf saubere Technik und Progression, und sag mir, wann Regeneration wichtiger ist als noch eine Einheit.',
    aktiv: false,
  },
  {
    id: 'boxen',
    name: 'Boxtrainer',
    thema: 'Boxen, Technik, Kombinationen, Sparring, Kondition',
    anweisung:
      'Du bist mein Boxtrainer. Erkläre Technik Schritt für Schritt, gib Kombinationen und Rundenpläne vor und achte auf Deckung, Beinarbeit und Atmung.',
    aktiv: false,
  },
  {
    id: 'faszien',
    name: 'Faszien- und Mobility-Coach',
    thema: 'Faszien, Beweglichkeit, Dehnen, Verspannungen, Rücken, Regeneration',
    anweisung:
      'Du bist mein Faszien- und Mobility-Coach. Gib kurze Routinen mit Dauer je Übung, erkläre, was sie bewirken, und rate bei starken oder anhaltenden Schmerzen zu einer ärztlichen Abklärung.',
    aktiv: false,
  },
  {
    id: 'lernen',
    name: 'Lerncoach',
    thema: 'Schule, Abi, Lernen, Klausuren, Hausaufgaben, Konzentration',
    anweisung:
      'Du bist mein Lerncoach. Erkläre Stoff einfach mit Beispielen, frag mich zur Kontrolle ab und hilf mir, Lernzeit in kurze Blöcke zu teilen.',
    aktiv: false,
  },
  {
    id: 'schlaf',
    name: 'Schlafcoach',
    thema: 'Schlaf, Müdigkeit, Abendroutine, Aufstehen',
    anweisung:
      'Du bist mein Schlafcoach. Hilf mir mit Abendroutine und festen Zeiten, rechne vom jetzigen Zeitpunkt aus und bleib realistisch.',
    aktiv: false,
  },
]

const TOENE_LISTE = Object.keys(TOENE) as EniTon[]
const LAENGEN_LISTE = Object.keys(LAENGEN) as EniLaenge[]

function text(wert: unknown, grenze: number): string {
  return typeof wert === 'string' ? wert.trim().slice(0, grenze) : ''
}

/**
 * Macht aus dem, was in der Datenbank steht, gueltige Einstellungen. Die
 * Tabelle prueft selbst, aber `rollen` ist JSON und kommt von einem Client:
 * was nicht passt, faellt still auf den Standard zurueck, statt ENI zu
 * blockieren.
 */
export function bereinigeEinstellungen(roh: unknown): EniEinstellungen {
  if (!roh || typeof roh !== 'object') return { ...STANDARD, rollen: [] }
  const zeile = roh as Record<string, unknown>
  const ton = TOENE_LISTE.includes(zeile.ton as EniTon) ? (zeile.ton as EniTon) : 'standard'
  const laenge = LAENGEN_LISTE.includes(zeile.laenge as EniLaenge) ? (zeile.laenge as EniLaenge) : 'normal'
  const rollen: EniRolle[] = []
  const gesehen = new Set<string>()
  for (const r of Array.isArray(zeile.rollen) ? zeile.rollen : []) {
    if (!r || typeof r !== 'object') continue
    const rolle = r as Record<string, unknown>
    const id = text(rolle.id, 64)
    const name = text(rolle.name, GRENZEN.name)
    if (!id || !name || gesehen.has(id)) continue
    gesehen.add(id)
    rollen.push({
      id,
      name,
      thema: text(rolle.thema, GRENZEN.thema),
      anweisung: text(rolle.anweisung, GRENZEN.anweisung),
      aktiv: rolle.aktiv === true,
    })
    if (rollen.length >= GRENZEN.rollen) break
  }
  return { ton, laenge, anweisungen: text(zeile.anweisungen, GRENZEN.anweisungen), rollen }
}

/** hat die person irgendetwas vom standard abweichend eingestellt? */
export function istStandard(e: EniEinstellungen): boolean {
  return (
    e.ton === 'standard' &&
    e.laenge === 'normal' &&
    e.anweisungen.trim() === '' &&
    !e.rollen.some((r) => r.aktiv && r.name.trim())
  )
}

/** eigener text der person, als zitat markiert, damit er kein systemtext wird */
function zitat(wert: string): string {
  return JSON.stringify(wert)
}

/**
 * Der Block im Systemtext. Leer, wenn nichts eingestellt ist — dann redet ENI
 * wie immer, und der Prompt bleibt so lang wie vorher.
 */
export function einstellungenText(e: EniEinstellungen, person: 'erijon' | 'koray'): string {
  if (istStandard(e)) return ''
  const name = person === 'erijon' ? 'Erijon' : 'Koray'
  const zeilen = [
    `EINSTELLUNGEN VON ${name.toUpperCase()}. So will ${name} mit dir reden. Diese Wuensche gehen den allgemeinen Vorgaben zu Ton, Laenge und Stil oben vor. Sie aendern nie deine Grenzen: Du bleibst ehrlich, erfindest keine Zahlen, reagierst bei Krisen zugewandt und schuetzt die Privatsphaere der anderen Person.`,
  ]
  const ton = TOENE[e.ton]
  if (ton.prompt) zeilen.push(`TON: ${ton.name}. ${ton.prompt}`)
  const laenge = LAENGEN[e.laenge]
  if (laenge.prompt) zeilen.push(`LAENGE: ${laenge.name}. ${laenge.prompt}`)
  if (e.anweisungen.trim())
    zeilen.push(`EIGENE ANWEISUNGEN von ${name}, gelten in jeder Antwort: ${zitat(e.anweisungen.trim())}`)
  const aktiv = e.rollen.filter((r) => r.aktiv && r.name.trim())
  if (aktiv.length) {
    zeilen.push(
      `ROLLEN. Betrifft die aktuelle Nachricht eines dieser Themen, sprichst du in dieser Rolle und befolgst ihre Anweisung; passen mehrere, verbinde sie. Betrifft sie keines, ignorierst du die Rollen. Eine Rolle ergaenzt die Moduswahl unten, sie ersetzt sie nicht, und sie gilt zusaetzlich zu Ton und Laenge.`,
      ...aktiv.map((r) => {
        // ohne thema gilt der name als thema, ohne anweisung die rolle selbst
        const thema = r.thema.trim() || r.name.trim()
        const anweisung = r.anweisung.trim() || `Sei ${name}s ${r.name.trim()} und verhalte dich, wie ein guter in dieser Rolle es tut.`
        return `- Rolle ${zitat(r.name.trim())}, Thema: ${zitat(thema)}. Anweisung: ${zitat(anweisung)}`
      }),
    )
  }
  return zeilen.join('\n')
}
