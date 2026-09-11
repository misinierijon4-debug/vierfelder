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

/** der erste satz. er steht vor der ersten frage und setzt den ton. */
export const ERSTER_SATZ =
  'Ich bin ENI. Ich führe den Zweikampf zwischen dir und Koray, und ich zähle nach Punkten, nicht nach Sympathie. Sag, was du wissen willst.'

/**
 * die reihenfolge ist die entscheidung: die erste passende regel gewinnt.
 * ausreden stehen weit vorn, weil sie sich hinter allem anderen verstecken.
 */
const REGELN: Array<{ muster: RegExp; antwort: string }> = [
  {
    muster: /\b(ki|ai|bot|chatbot|modell|gpt|prompt)\b|bist du (echt|wirklich|ein)|wer bist du|was bist du/,
    antwort:
      'Ich bin heute eine Stimmenprobe auf deinem Gerät, kein Modell im Netz. Jeder Satz, den ich sage, steht fest im Code, und ich sehe deine Zahlen nicht. Wenn du mehr von mir willst, dann bau die Verbindung.',
  },
  {
    muster: /\b(morgen|sp[äa]ter|m[üu]de|kaputt|irgendwann|vielleicht|eigentlich|wollte)\b|keine zeit|kann (ich )?nicht|schaffe? .*nicht/,
    antwort:
      'Das ist kein Grund, das ist ein Aufschub. Nenn mir die eine Sache, die du heute noch machst, und mach sie, bevor du wieder mit mir redest.',
  },
  {
    muster: /\b(stand|punkte|vorsprung|wette|kw|woche)\b|wer f[üu]hrt|(ge)?winne|verliere/,
    antwort:
      'Ich sehe die Zahlen in dieser Fassung nicht, also behaupte ich auch keine. Sie stehen im Raster. Mit Modellverbindung lese ich sie und sage dir, wo du hinten liegst.',
  },
  {
    muster: /\b(leber|milch|eigelb|roh|fett|zucker|soja|öl|oel|essen|ern[äa]hrung|kreatin|zink)\b/,
    antwort:
      'Rohe Leber, rohe Milch, Eigelb, rohes Fett. Dazu Vitamin D mit K2 und Zink. Kein Zucker, kein Soja, keine Pflanzenöle. Der Körper baut aus dem, was du ihm gibst, und Industriefutter baut nichts.',
  },
  {
    muster: /\b(fertig|erledigt|geschafft|durchgezogen|trainiert|gelernt|gelesen)\b/,
    antwort:
      'Gut. Das war heute. Eine Woche hat sieben Tage, und heute ist einer davon. Leg morgen dasselbe hin, dann reden wir über Stolz.',
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
    muster: /\b(koray|erijon|unfair)\b|er hat|der andere|betr[üu]g/,
    antwort:
      'Der andere ist nicht dein Problem, er ist dein Maß. Wenn er vorne liegt, hat er gearbeitet, während du geredet hast.',
  },
]

/** wenn nichts greift, wird nachgefragt statt geraten */
const NACHFRAGEN = [
  'Zu vage. Nenn den Bereich, die Zahl und den Tag, dann urteile ich.',
  'Ich bin kein Zuhörer für Stimmungen. Bring mir etwas, das man nachprüfen kann.',
  'Gesagt ist nichts. Was davon steht am Sonntag im Raster?',
]

/**
 * die antwort auf eine vorlage. rein, damit sie prüfbar ist: derselbe satz und
 * derselbe zähler ergeben immer dasselbe urteil.
 *
 * @param zaehler laufende nummer der vorlage, rotiert die nachfragen
 */
export function eniAntwort(frage: string, zaehler: number): string {
  const text = frage.trim().toLowerCase()
  if (!text) return NACHFRAGEN[0]!
  for (const regel of REGELN) {
    if (regel.muster.test(text)) return regel.antwort
  }
  return NACHFRAGEN[Math.abs(zaehler) % NACHFRAGEN.length]!
}
