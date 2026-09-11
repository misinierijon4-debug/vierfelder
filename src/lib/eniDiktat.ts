import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Diktat: gesprochenes wird getippter Text.
 *
 * Das laeuft ueber die Spracherkennung, die im Browser selbst steckt, und
 * nicht ueber das Modell hinter ENI. Der Grund ist schlicht: DeepSeek hat keine
 * Transkription, und jede Gegenstelle, die eine haette, waere ein zweiter
 * Schluessel, eine zweite Rechnung und ein zweiter Ort, an dem eine Tonaufnahme
 * liegt. Der Browser kann es umsonst.
 *
 * Umsonst heisst nicht auf dem Geraet. Chrome schickt das Mikrofon an Google,
 * Safari an Apple; nur wenige Geraete erkennen wirklich lokal. Deshalb sagt die
 * Oberflaeche waehrend der Aufnahme hin, wohin das geht, genau wie die Zeile im
 * Kopf hinschreibt, ob die Vorlage das Geraet verlaesst. Ein Mikrofon, das so
 * tut, als bliebe alles hier, waere gelogen.
 *
 * Es wird nichts aufgenommen und nichts gespeichert: was zurueckkommt, ist
 * Text, und der landet im Eingabefeld, wo er noch geaendert werden kann, bevor
 * er ENI vorgelegt wird.
 */

/**
 * Nur das, was hier wirklich benutzt wird. Die Web Speech API steht nicht in
 * jeder TypeScript-Fassung der DOM-Typen, und ein `any` waere hier genau die
 * Stelle, an der ein Tippfehler im Ereignisnamen unbemerkt bliebe.
 */
type Erkennungsergebnis = {
  isFinal: boolean
  0: { transcript: string }
}

type Erkennungsereignis = {
  resultIndex: number
  results: { length: number } & Record<number, Erkennungsergebnis>
}

type Fehlerereignis = { error: string }

type Erkennung = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((ereignis: Erkennungsereignis) => void) | null
  onerror: ((ereignis: Fehlerereignis) => void) | null
  onend: (() => void) | null
}

type MitErkennung = {
  SpeechRecognition?: new () => Erkennung
  webkitSpeechRecognition?: new () => Erkennung
}

function erkennungsbauer(): (new () => Erkennung) | null {
  if (typeof window === 'undefined') return null
  const fenster = window as unknown as MitErkennung
  return fenster.SpeechRecognition ?? fenster.webkitSpeechRecognition ?? null
}

/** ob dieses geraet ueberhaupt diktieren kann */
export function diktatMoeglich(): boolean {
  return erkennungsbauer() !== null
}

/**
 * Aus dem Fehlercode der Erkennung einen Satz machen, den man jemandem zeigen
 * kann. `aborted` und `no-speech` sind keine Fehler, sondern Alltag: einmal
 * abgebrochen, einmal nichts gesagt.
 */
export function diktatFehlertext(code: string): string | null {
  switch (code) {
    case 'aborted':
    case 'no-speech':
      return null
    case 'not-allowed':
    case 'service-not-allowed':
      return 'das mikrofon ist gesperrt. erlaub es in den einstellungen des browsers.'
    case 'audio-capture':
      return 'kein mikrofon gefunden.'
    case 'network':
      return 'die spracherkennung braucht netz, und es steht keins.'
    case 'language-not-supported':
      return 'dieses gerät erkennt kein deutsch.'
    default:
      return 'die spracherkennung hat abgebrochen.'
  }
}

/**
 * Zwei Texte zusammensetzen, ohne dass Woerter aneinanderkleben und ohne dass
 * am Anfang ein Leerzeichen steht. Rein, damit die Regel geprueft werden kann,
 * statt sie im Hook zu vermuten.
 */
export function fuegeAn(bestand: string, neu: string): string {
  const links = bestand.replace(/\s+$/, '')
  const rechts = neu.trim()
  if (rechts === '') return bestand
  if (links === '') return rechts
  // nach einem satzzeichen faengt der naechste satz gross an, sonst nicht
  return `${links} ${rechts}`
}

export type Diktat = {
  /** ob der knopf ueberhaupt angezeigt wird */
  moeglich: boolean
  laeuft: boolean
  /** was gerade erkannt, aber noch nicht bestaetigt ist */
  vorlaeufig: string
  fehler: string | null
  starte: () => void
  stoppe: () => void
}

/**
 * @param aufText wird mit jedem fertig erkannten stueck gerufen. der aufrufer
 *   haengt es an sein feld an; der hook haelt selbst keinen text.
 */
export function useDiktat(aufText: (stueck: string) => void): Diktat {
  const [laeuft, setLaeuft] = useState(false)
  const [vorlaeufig, setVorlaeufig] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const erkennungRef = useRef<Erkennung | null>(null)
  const [moeglich] = useState(diktatMoeglich)

  // der aufrufer gibt bei jedem rendern eine neue funktion herein; die
  // erkennung soll deshalb nicht bei jedem rendern neu aufgebaut werden.
  const aufTextRef = useRef(aufText)
  useEffect(() => {
    aufTextRef.current = aufText
  }, [aufText])

  const stoppe = useCallback(() => {
    const erkennung = erkennungRef.current
    erkennungRef.current = null
    setLaeuft(false)
    setVorlaeufig('')
    // `stop` liefert noch ein letztes ergebnis, `abort` wirft es weg. wer den
    // knopf drueckt, will das zuletzt gesagte behalten.
    try {
      erkennung?.stop()
    } catch {
      /* eine erkennung, die nie startete, wehrt sich gegen stop */
    }
  }, [])

  const starte = useCallback(() => {
    const Bauer = erkennungsbauer()
    if (!Bauer || erkennungRef.current) return

    setFehler(null)
    let erkennung: Erkennung
    try {
      erkennung = new Bauer()
    } catch {
      setFehler('die spracherkennung ließ sich nicht starten.')
      return
    }

    erkennung.lang = 'de-DE'
    // durchlaufen lassen: man denkt beim sprechen nach, und eine erkennung, die
    // nach der ersten pause abschaltet, zwingt zum hetzen.
    erkennung.continuous = true
    erkennung.interimResults = true

    erkennung.onresult = (ereignis) => {
      let offen = ''
      for (let i = ereignis.resultIndex; i < ereignis.results.length; i += 1) {
        const ergebnis = ereignis.results[i]
        if (!ergebnis) continue
        const stueck = ergebnis[0].transcript
        if (ergebnis.isFinal) aufTextRef.current(stueck)
        else offen += stueck
      }
      setVorlaeufig(offen)
    }

    erkennung.onerror = (ereignis) => {
      const satz = diktatFehlertext(ereignis.error)
      if (satz) setFehler(satz)
    }

    erkennung.onend = () => {
      // manche browser beenden von selbst, etwa nach langer stille. der
      // zustand muss dann mitkommen, sonst leuchtet der knopf weiter.
      erkennungRef.current = null
      setLaeuft(false)
      setVorlaeufig('')
    }

    try {
      erkennung.start()
    } catch {
      setFehler('die spracherkennung ließ sich nicht starten.')
      return
    }
    erkennungRef.current = erkennung
    setLaeuft(true)
  }, [])

  // wer die ansicht verlaesst, laesst kein offenes mikrofon zurueck
  useEffect(() => {
    return () => {
      const erkennung = erkennungRef.current
      erkennungRef.current = null
      try {
        erkennung?.abort()
      } catch {
        /* siehe stoppe */
      }
    }
  }, [])

  return { moeglich, laeuft, vorlaeufig, fehler, starte, stoppe }
}
