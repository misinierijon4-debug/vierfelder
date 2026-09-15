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
  'Ich bin ENI. Dein KI-Begleiter – und im Zweikampf ein fairer Schiedsrichter. Frag mich, was du wissen willst.'

/** begruessung und rollensatz, angepasst an die angemeldete person */
export function eniBegruessung(person: UserId = 'erijon'): { gruss: string; rolle: string; gegner: string } {
  const ich = person === 'koray' ? 'Koray' : 'Erijon'
  const gegner = person === 'koray' ? 'Erijon' : 'Koray'
  return {
    gruss: `Hallo ${ich}.`,
    rolle: `Ich bin ENI. Dein KI-Begleiter – und im Zweikampf gegen ${gegner} ein fairer Schiedsrichter. Frag mich, was du wissen willst.`,
    gegner,
  }
}

/** wenn nichts greift, wird gezielt nachgefragt statt abgewertet */
const NACHFRAGEN = [
  'Sag etwas genauer, welcher Zusammenhang fehlt.',
  'Was beschäftigt dich gerade?',
  'Da fehlt mir noch der Zusammenhang. Erzähl weiter.',
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
      muster:
        /\b(wie stehe ich|meine punkte|unser stand|wer f[üu]hrt im duell)\b|\b(duell|tracker|koray|erijon|gegner)\b.*\b(stand|punkte|vorsprung|wette|kw|woche|f[üu]hrt|gewinne|verliere)\b|\b(stand|punkte|vorsprung|wette|f[üu]hrt|gewinne|verliere)\b.*\b(duell|tracker|koray|erijon|gegner)\b/,
      antwort:
        `Ich sehe die Zahlen in dieser Fassung nicht, also behaupte ich auch keine. Sie stehen im Raster. Mit Modellverbindung lese ich sie und sage dir, wo du gegen ${gegner} stehst.`,
    },
    {
      muster: /\b(leber|milch|eigelb|roh|fett|zucker|soja|öl|oel|essen|ern[äa]hrung|kreatin|zink)\b/,
      antwort:
        'Als lokale Stimmenprobe kann ich deine Ernährung nicht individuell beurteilen. Nenn dein Ziel und deinen Alltag; mit Modellverbindung kann ENI die Frage genauer einordnen.',
    },
    {
      muster:
        /\b(ich habe|ich hab|habe|hab)\b.*\b(fertig|erledigt|geschafft|durchgezogen|trainiert|gelernt|gelesen)\b|\b(gym|boxen|training|lernen|lesen|einheit)\b.*\b(fertig|erledigt|geschafft|durchgezogen)\b/,
      antwort:
        'Gute Einheit. Der Punkt steht. Aber eine Woche hat sieben Tage, und heute ist einer davon. Sauber essen, regenerieren und morgen nachlegen.',
    },
    {
      muster:
        /\b(gym|boxen|training|lernen|lesen|einheit|tracker|duell)\b.*\b(morgen|sp[äa]ter|keine zeit|keine lust|m[üu]de|kaputt|ersch[öo]pft|ausfallen|schaffe|kann nicht)\b|\b(morgen|sp[äa]ter|keine zeit|keine lust|m[üu]de|kaputt|ersch[öo]pft|ausfallen|schaffe|kann nicht)\b.*\b(gym|boxen|training|lernen|lesen|einheit|tracker|duell)\b/,
      antwort:
        'Beim Zweikampf muss ich zwischen Aufschub und echter Erschöpfung unterscheiden. Wenn Schlafdefizit, Schmerzen oder Überlastung dahinterstecken, ist Regeneration sinnvoll; wenn es nur Trägheit ist, nenn die kleinste Einheit, die du heute sicher beendest.',
    },
    {
      muster: /\b(hilf|hilfe|rat|tipp|anfangen|starten)\b.*\b(training|gym|boxen|lernen|lesen|duell|tracker)\b|\b(training|gym|boxen|lernen|lesen|duell|tracker)\b.*\b(hilf|hilfe|rat|tipp|anfangen|starten)\b/,
      antwort:
        'Fang mit dem Bereich an, in dem du hinten liegst, und nimm die kleinste Einheit, die noch zählt. Nicht die beste, die kleinste, die du sicher zu Ende bringst.',
    },
    {
      muster: /\?|^(wer|was|wie|warum|weshalb|wieso|wann|wo|welche|welcher|welches)\b/,
      antwort:
        'Das ist eine normale Sachfrage, kein Zweikampf-Signal. Diese lokale Stimmenprobe hat kein Wissensmodell; mit aktiver Modellverbindung beantwortet ENI sie direkt, ohne sie auf Punkte oder Training umzudeuten.',
    },
    {
      muster:
        /\b(duell|tracker|gym|boxen|training|lernen|lesen|einheit)\b.*\b(aufgeben|egal|hasse|sinnlos|keinen sinn|bringt nichts)\b|\b(aufgeben|egal|hasse|sinnlos|keinen sinn|bringt nichts)\b.*\b(duell|tracker|gym|boxen|training|lernen|lesen|einheit)\b/,
      antwort:
        'Du hast dich für diesen Zweikampf entschieden, als es dir gut ging. Dieser Tag zählt genauso wie der. Steh auf und mach die kleinste Einheit.',
    },
    {
      muster: new RegExp(
        `\\b(${gegner.toLowerCase()}|duell|gegner)\\b.*\\b(unfair|betr[üu]g|vorn|vorne|f[üu]hrt)\\b|\\b(unfair|betr[üu]g)\\b.*\\b(${gegner.toLowerCase()}|duell|gegner)\\b`
      ),
      antwort:
        `${gegner} ist nicht dein Problem, er ist dein Maß. Wenn er vorne liegt, hat er gearbeitet, während du geredet hast.`,
    },
  ]

  for (const regel of regeln) {
    if (regel.muster.test(text)) return regel.antwort
  }
  return NACHFRAGEN[Math.abs(zaehler) % NACHFRAGEN.length]!
}
