import type { UserId } from './types'

/**
 * ENIs stimme, solange keine modellverbindung steht.
 *
 * das hier ist ausdrücklich eine stimmenprobe: sie läuft vollständig auf dem
 * gerät, jeder satz steht in diesem code, und der kopf der ansicht schreibt das
 * hin. eine oberfläche, die eine verbindung andeutet, die es nicht gibt, wäre
 * genau der selbstbetrug, gegen den ENI sonst redet.
 *
 * sein wirklicher charakter steht nicht hier, sondern in
 * `supabase/functions/_shared/eniCharakter.ts`. der geht niemanden etwas an,
 * der die seite öffnet.
 *
 * die sätze stehen in normaler groß- und kleinschreibung, weil ENI so spricht.
 * die oberfläche drumherum bleibt klein, das ist die schrift des hauses; was
 * ENI sagt, ist kein etikett, sondern rede.
 */

/** kompakter erster satz fuer abwaertskompatibilitaet */
export const ERSTER_SATZ =
  'Ich bin ENI. Schiedsrichter und Begleiter im Zweikampf: nach Punkten, nicht nach Sympathie. Sag, was ansteht.'

/** begruessung und rollensatz, angepasst an die angemeldete person */
export function eniBegruessung(person: UserId = 'erijon'): { gruss: string; rolle: string; gegner: string } {
  const ich = person === 'koray' ? 'Koray' : 'Erijon'
  const gegner = person === 'koray' ? 'Erijon' : 'Koray'
  return {
    gruss: `Hallo ${ich}.`,
    rolle: `Ich bin ENI. Schiedsrichter und Begleiter im Zweikampf gegen ${gegner}: nach Punkten, nicht nach Sympathie. Sag, was ansteht.`,
    gegner,
  }
}

/** wenn nichts greift, wird gezielt nachgefragt statt abgewertet */
const NACHFRAGEN = [
  'Zu vage. Nenn den Bereich, die Zahl und den Tag, dann urteile ich.',
  'Was beschäftigt dich gerade? Geht es um deinen Stand im Duell oder um etwas Persönliches?',
  'Gesagt ist nichts. Was davon steht am Sonntag im Raster? Nenn den konkreten nächsten Schritt.',
]

/**
 * die antwort auf eine vorlage in der lokalen stimmenprobe.
 * rein und reproduzierbar.
 */
export function eniAntwort(frage: string, zaehler: number, person: UserId = 'erijon'): string {
  const text = frage.trim().toLowerCase()
  if (!text) return NACHFRAGEN[0]!

  const gegner = person === 'koray' ? 'Erijon' : 'Koray'

  const regeln: Array<{ muster: RegExp; antwort: string }> = [
    {
      muster: /\b(ki|ai|bot|chatbot|modell|gpt|prompt)\b|bist du (echt|wirklich|ein)|wer bist du|was bist du/,
      antwort:
        'Ich bin heute eine Stimmenprobe auf deinem Gerät, kein Modell im Netz. Jeder Satz, den ich sage, steht fest im Code, und ich sehe deine Zahlen nicht. Wenn du mehr von mir willst, dann bau die Verbindung.',
    },
    {
      muster: /\b(morgen|sp[äa]ter|irgendwann|vielleicht|eigentlich|wollte)\b|keine zeit|kann (ich )?nicht|schaffe? .*nicht|\b(m[üu]de|kaputt|ersch[öo]pft)\b/,
      antwort:
        'Das ist kein Grund, das ist ein Aufschub oder echte Erschöpfung. Wenn der Schlaf unter 6 Stunden lag oder Gelenke schmerzen: schlaf oder mach Mobilität. Wenn du nur träge bist: nenn die kleinste Einheit und zieh sie durch.',
    },
    {
      muster: /\b(stand|punkte|vorsprung|wette|kw|woche)\b|wer f[üu]hrt|(ge)?winne|verliere/,
      antwort:
        `Ich sehe die Zahlen in dieser Fassung nicht, also behaupte ich auch keine. Sie stehen im Raster. Mit Modellverbindung lese ich sie und sage dir, wo du gegen ${gegner} stehst.`,
    },
    {
      muster: /\b(leber|milch|eigelb|roh|fett|zucker|soja|öl|oel|essen|ern[äa]hrung|kreatin|zink)\b/,
      antwort:
        'Als lokale Stimmenprobe kann ich deine Ernährung nicht individuell beurteilen. Nenn dein Ziel und deinen Alltag; mit Modellverbindung kann ENI die Frage genauer einordnen.',
    },
    {
      muster: /\b(fertig|erledigt|geschafft|durchgezogen|trainiert|gelernt|gelesen)\b/,
      antwort:
        'Gute Einheit. Der Punkt steht. Aber eine Woche hat sieben Tage, und heute ist einer davon. Sauber essen, regenerieren und morgen nachlegen.',
    },
    {
      muster: /\b(wie|hilf|hilfe|rat|tipp|anfangen|starten|training|gym|boxen)\b|was soll ich/,
      antwort:
        'Fang mit dem Bereich an, in dem du hinten liegst, und nimm die kleinste Einheit, die noch zählt. Nicht die beste, die kleinste, die du sicher zu Ende bringst.',
    },
    {
      muster: /\b(aufgeben|egal|hasse|sinnlos)\b|keinen sinn|bringt nichts|schlecht drauf/,
      antwort:
        'Du hast dich für diesen Zweikampf entschieden, als es dir gut ging. Dieser Tag zählt genauso wie der. Steh auf und mach die kleinste Einheit.',
    },
    {
      muster: new RegExp(`\\b(${gegner.toLowerCase()}|duell|gegner|unfair)\\b|er hat|der andere|betr[üu]g`),
      antwort:
        `${gegner} ist nicht dein Problem, er ist dein Maß. Wenn er vorne liegt, hat er gearbeitet, während du geredet hast.`,
    },
  ]

  for (const regel of regeln) {
    if (regel.muster.test(text)) return regel.antwort
  }
  return NACHFRAGEN[Math.abs(zaehler) % NACHFRAGEN.length]!
}
