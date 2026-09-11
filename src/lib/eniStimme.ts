import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { rufeEniFunktion } from './eniAntwort'

/**
 * ENIs stimme.
 *
 * Wieder der browser selbst, wie beim diktat, und aus demselben grund: DeepSeek
 * hat keine sprachausgabe, und jede gegenstelle, die eine hätte, wäre ein
 * zweiter schlüssel und eine zweite rechnung. Anders als beim diktat ist das
 * hier aber kein kompromiss, sondern der bessere weg: die sprachausgabe arbeitet
 * auf den meisten geräten wirklich lokal. Was ENI sagt, wird dann auf dem
 * telefon zu ton und geht nirgendwohin.
 *
 * „Meistens" ist keine behauptung, die man ungeprüft hinschreiben darf. Jede
 * stimme sagt selbst, ob sie lokal arbeitet (`localService`), und die auswahl
 * hier bevorzugt genau die. Bleibt nur eine übrig, die im netz arbeitet, sagt
 * die oberfläche das hin — dieselbe regel wie die zeile im kopf.
 */

/** ob vorgelesen wird, überlebt das schliessen der ansicht */
export const VORLESEN_KEY = 'vierfelder.eni.vorlesen.v1'

/**
 * So lang darf ein stück höchstens sein, das am stück gesprochen wird.
 *
 * Das ist kein geschmack, sondern eine umgehung: Chrome bricht eine lange
 * äusserung nach etwa fünfzehn sekunden mittendrin ab. ENI darf aber weit
 * ausholen, wenn ihn jemand wirklich etwas fragt — genau das steht in seinem
 * charakter. Also wird der text in sätze zerlegt und in die warteschlange
 * gelegt, statt ihn als einen block zu übergeben.
 */
export const MAX_STUECK = 180

/**
 * ENI spricht etwas tiefer und einen hauch langsamer als die voreinstellung.
 * Nicht als effekt: die voreingestellte stimme klingt nach ansage im bahnhof,
 * und ENI ist ein mann, der einem gegenübersitzt. Weiter zu drehen lohnt nicht,
 * unter 0.85 fängt jede stimme an zu scheppern.
 */
const TONHOEHE = 0.9
const TEMPO = 0.96

/** namen, hinter denen auf den üblichen systemen eine männerstimme steckt */
const MAENNLICH = [
  'markus', 'viktor', 'martin', 'stefan', 'conrad', 'yannick', 'bernd', 'klaus', 'male',
]

/** und diese sind weiblich. ENI ist ein mann, das steht in seinem charakter. */
const WEIBLICH = [
  'anna', 'petra', 'helena', 'hedda', 'katja', 'marlene', 'vicki', 'eva', 'female',
]

export type Stimmwahl = {
  name: string
  lang: string
  localService: boolean
}

/**
 * Namen, an denen eine Stimme sich selbst als die bessere Fassung ausweist.
 * Auf dem iPhone stehen neben jeder Stimme eine kompakte und, wenn man sie in
 * den Einstellungen holt, eine erweiterte oder Premium-Fassung. Der Unterschied
 * ist gross und hörbar; Windows und Edge nennen ihre neuronalen Stimmen
 * „Natural" oder „Online".
 */
const BESSER = ['erweitert', 'enhanced', 'premium', 'natural', 'neural', 'online']

/** und so heisst die alte, blecherne fassung */
const SCHLECHTER = ['kompakt', 'compact']

/**
 * Wie gut eine stimme zu ENI passt. Rein und exportiert, damit die reihenfolge
 * geprüft werden kann, statt sie in der auswahl zu vermuten.
 *
 * Deutsch ist bedingung, nicht wunsch: eine englische stimme, die deutschen
 * text liest, ist unhörbar. Danach kommt die güte der stimme, und zwar vor
 * allem anderen — eine erweiterte frauenstimme ist besser als eine blecherne
 * männerstimme, weil man einer blechernen stimme nicht zuhört, egal wem sie
 * gehört. Erst danach kommt lokal vor netz, und ganz zuletzt das geschlecht.
 *
 * Die reihenfolge stand anfangs andersherum, lokal vor güte, und das ergab auf
 * Windows die alte SAPI-Stimme und auf dem iPhone die kompakte. Beides klang
 * nach anrufbeantworter. Wohin der ton geht, steht weiterhin im kopf; es wird
 * hingeschrieben statt durch eine schlechte stimme erzwungen.
 */
export function bewerteStimme(stimme: Stimmwahl): number {
  if (!stimme.lang.toLowerCase().startsWith('de')) return -1
  const name = stimme.name.toLowerCase()
  let punkte = 1
  if (BESSER.some((teil) => name.includes(teil))) punkte += 8
  if (SCHLECHTER.some((teil) => name.includes(teil))) punkte -= 4
  if (stimme.localService) punkte += 3
  if (MAENNLICH.some((teil) => name.includes(teil))) punkte += 2
  if (WEIBLICH.some((teil) => name.includes(teil))) punkte -= 1
  // de-DE vor de-AT und de-CH: ENI redet nicht wienerisch
  if (stimme.lang.toLowerCase().startsWith('de-de')) punkte += 1
  return punkte
}

/** die beste verfügbare stimme, oder null, wenn keine deutsche dabei ist */
export function waehleStimme<T extends Stimmwahl>(stimmen: readonly T[]): T | null {
  let beste: T | null = null
  let bestwert = 0
  for (const stimme of stimmen) {
    const wert = bewerteStimme(stimme)
    // strikt groesser: bei gleichstand gewinnt die erste, und die reihenfolge
    // des systems ist die voreinstellung des menschen.
    if (wert > bestwert) {
      bestwert = wert
      beste = stimme
    }
  }
  return beste
}

/**
 * Einen langen text in sprechbare stücke schneiden, an satzenden und absätzen.
 * Ein satz, der allein schon zu lang ist, wird am letzten leerzeichen vor der
 * grenze getrennt: lieber eine atempause an der falschen stelle als ein satz,
 * den Chrome mittendrin abschneidet.
 */
export function teileFuerStimme(text: string, grenze = MAX_STUECK): string[] {
  const saetze = text
    .split(/(?<=[.!?:])\s+|\n+/)
    .map((satz) => satz.trim())
    .filter((satz) => satz !== '')

  const stuecke: string[] = []
  let offen = ''

  const lege = (satz: string) => {
    if (offen === '') offen = satz
    else if (offen.length + 1 + satz.length <= grenze) offen = `${offen} ${satz}`
    else {
      stuecke.push(offen)
      offen = satz
    }
  }

  for (const satz of saetze) {
    if (satz.length <= grenze) {
      lege(satz)
      continue
    }
    if (offen !== '') {
      stuecke.push(offen)
      offen = ''
    }
    let rest = satz
    while (rest.length > grenze) {
      const schnitt = rest.lastIndexOf(' ', grenze)
      const bei = schnitt > grenze / 2 ? schnitt : grenze
      stuecke.push(rest.slice(0, bei).trim())
      rest = rest.slice(bei).trim()
    }
    if (rest !== '') offen = rest
  }

  if (offen !== '') stuecke.push(offen)
  return stuecke
}

function ausgabe(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

/** ob dieses gerät überhaupt vorlesen kann */
export function stimmeMoeglich(): boolean {
  return ausgabe() !== null && typeof window.SpeechSynthesisUtterance === 'function'
}

/**
 * Die Sprachausgabe anstossen, solange der Finger noch auf dem Knopf ist.
 *
 * Safari auf dem iPhone lässt die erste Äusserung nur aus einer echten
 * Handlung heraus zu. Wenn ENI von selbst vorliest, kommt seine Antwort aber
 * erst Sekunden nach dem Tippen, und dann bleibt sie stumm. Ein leeres Stück,
 * abgeschickt im Moment des Tippens, macht die Ausgabe für den Rest der Sitzung
 * auf. Auf allen anderen Geräten kostet es nichts.
 */
export function weckeStimme() {
  // beide wege wollen dieselbe erlaubnis, und beide bekommen sie nur jetzt
  const klang = ton()
  if (klang) {
    try {
      klang.src = stilleWav()
      void klang.play()?.catch(() => {})
    } catch {
      /* siehe unten */
    }
  }

  const synth = ausgabe()
  if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return
  try {
    const leer = new SpeechSynthesisUtterance(' ')
    leer.volume = 0
    synth.speak(leer)
  } catch {
    /* ein gerät, das sich hier wehrt, wehrt sich auch beim echten stück */
  }
}

/**
 * Ein einziges Audio-Element für die ganze Sitzung, absichtlich ausserhalb von
 * React.
 *
 * Safari auf dem iPhone gibt die Erlaubnis zum Abspielen nicht der Seite,
 * sondern genau dem Element, auf dem einmal aus einer echten Handlung heraus
 * `play()` lief. Ein Element je Antwort wäre also ein Element je Antwort, das
 * neu um Erlaubnis bitten muss — und die bekäme es nie, weil ENIs Antwort erst
 * Sekunden nach dem Tippen kommt.
 */
let tonElement: HTMLAudioElement | null = null

function ton(): HTMLAudioElement | null {
  if (typeof Audio !== 'function') return null
  if (!tonElement) {
    tonElement = new Audio()
    // sobald eine adresse gesetzt ist, soll geladen werden und nicht erst beim
    // `play()`. das spart genau die zeit, die zwischen beidem liegt.
    tonElement.preload = 'auto'
  }
  return tonElement
}

/**
 * Zwei Sample Stille als WAV, im Code gebaut statt als base64-Klumpen
 * hingeschrieben. Es geht nicht um den Klang, sondern darum, dass `play()`
 * einmal wirklich gelingt: das ist der Moment, in dem iOS das Element
 * freigibt. Ein ungültiger Ton täte es nicht, ein abgeschriebener wäre nicht
 * nachprüfbar.
 */
function stilleWav(): string {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x28, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, // RIFF .. WAVE
    0x66, 0x6d, 0x74, 0x20, 16, 0, 0, 0, 1, 0, 1, 0, // fmt , PCM, mono
    0x44, 0xac, 0, 0, 0x88, 0x58, 0x01, 0, // 44100 Hz, 88200 byte/s
    2, 0, 16, 0, // blockausrichtung, 16 bit
    0x64, 0x61, 0x74, 0x61, 4, 0, 0, 0, 0, 0, 0, 0, // data, vier byte null
  ])
  let roh = ''
  for (const wert of bytes) roh += String.fromCharCode(wert)
  return `data:audio/wav;base64,${btoa(roh)}`
}

/** ob eine echte stimme hinter der function steht. ein fehler heisst nein. */
export async function serverStimmeBereit(): Promise<boolean> {
  try {
    const { status, inhalt } = await rufeEniFunktion('eni-stimme', { pruefen: true })
    return status === 200 && inhalt.bereit === true
  } catch {
    return false
  }
}

/**
 * Die Adresse des gesprochenen Tons zu einer Antwort. Der Server entscheidet,
 * ob er ihn erzeugt oder aus dem Regal nimmt; hier kommt nur eine Adresse an.
 */
export async function holeTonAdresse(nachrichtId: string): Promise<string | null> {
  const { status, inhalt } = await rufeEniFunktion('eni-stimme', { nachrichtId })
  if (status !== 200 || typeof inhalt.adresse !== 'string') return null
  return inhalt.adresse
}

/**
 * So lange darf ENIs eigene Stimme auf sich warten lassen, bevor die eingebaute
 * einspringt.
 *
 * Hier standen acht Sekunden, mit der Begründung, dass Stille wie ein Defekt
 * aussieht. Die Begründung stimmt, die Zahl war falsch. Der erste Ton einer
 * Antwort muss drüben wirklich gesprochen werden, und das dauert länger als
 * acht Sekunden — die Frist hat also praktisch immer gewonnen, und gehört hat
 * man nie ENI, sondern jedes Mal die eingebaute Stimme. Genau die ist der
 * Grund, warum es die echte überhaupt gibt: auf dem iPhone ist sie blechern,
 * und auf Windows klingt sie nach Ansage im Bahnhof.
 *
 * Wer eine gute Stimme hat, wartet auf sie. Diese Frist ist deshalb kein
 * Taktgeber mehr, sondern ein Notnagel gegen eine Anfrage, die überhaupt nicht
 * mehr zurückkommt. Ein echter Fehlschlag fällt weiterhin sofort zurück, denn
 * bei dem gibt es nichts mehr, worauf man warten könnte.
 *
 * Dass etwas passiert, sagt jetzt die Oberfläche über `holt` — nicht eine
 * schlechte Stimme.
 */
export const TON_FRIST_MS = 45_000

/**
 * Wie lange eine einmal geholte Adresse hier gilt. Der Server unterschreibt sie
 * für eine Stunde; fünfzig Minuten lassen Luft, damit nie eine Adresse benutzt
 * wird, die unterwegs abläuft.
 */
const ADRESSE_GILT_MS = 50 * 60 * 1000

/**
 * Zeilen, die noch gar nicht in der Datenbank stehen: die vorläufige eigene
 * Zeile und alles aus der lokalen Stimmenprobe. Für die kann es serverseitig
 * keinen Ton geben, und es lohnt nicht, danach zu fragen.
 */
function istServerZeile(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export type Stimme = {
  /** ob der knopf überhaupt angezeigt wird */
  moeglich: boolean
  /** die id der zeile, die gerade gesprochen wird */
  spricht: string | null
  /**
   * die id der zeile, deren ton gerade geholt wird — also gedrückt, aber noch
   * nicht zu hören. Der knopf sagt das hin, damit die stille dazwischen nach
   * warten aussieht und nicht nach einem defekt. Das war der eigentliche grund
   * für die alte acht-sekunden-frist, und dies ist die richtige antwort darauf.
   */
  holt: string | null
  /**
   * welche stimme gerade zuständig ist. `server` ist die neuronale hinter der
   * Function, `browser` die eingebaute. der unterschied ist hörbar, also darf
   * die oberfläche ihn auch benennen.
   */
  art: 'server' | 'browser'
  /**
   * ob eine echte stimme eingerichtet ist. das steht fest, bevor irgendetwas
   * gesprochen wurde, und genau darauf muss der hinweis im kopf hören: die
   * zeile über die modellverbindung sagt auch vorher, wohin etwas geht, und
   * nicht hinterher. `art` weiß es erst, wenn es passiert ist.
   */
  serverBereit: boolean
  /** ob die gewählte stimme auf dem gerät arbeitet. null, solange unbekannt */
  oertlich: boolean | null
  /** der name der stimme, für den hinweis */
  name: string | null
  sprich: (id: string, text: string) => void
  halt: () => void
}

export function useStimme(): Stimme {
  const [browserMoeglich] = useState(stimmeMoeglich)
  const [serverBereit, setServerBereit] = useState(false)
  const [spricht, setSpricht] = useState<string | null>(null)
  const [holt, setHolt] = useState<string | null>(null)
  const [art, setArt] = useState<'server' | 'browser'>('browser')
  const [gewaehlt, setGewaehlt] = useState<SpeechSynthesisVoice | null>(null)
  /** welche zeile gerade laufen soll. gegen ein spätes `onend` der vorherigen. */
  const laufendeRef = useRef<string | null>(null)
  /**
   * Adressen, die schon einmal geholt wurden.
   *
   * Der Ton selbst liegt drüben im Regal, aber die Adresse dorthin kostet jedes
   * Mal einen Ruf an die Function — bei einer Antwort, die man zweimal hören
   * will, eine Sekunde Warten für etwas, das man schon hat. Am Hook und nicht am
   * Modul, damit zwei Ansichten sich nicht gegenseitig etwas unterschieben.
   */
  const regalRef = useRef(new Map<string, { adresse: string; bis: number }>())

  // einmal fragen, ob eine echte stimme eingerichtet ist. das kostet nichts:
  // die function ruft dafür google nicht auf.
  useEffect(() => {
    let abgemeldet = false
    void (async () => {
      const bereit = await serverStimmeBereit()
      if (!abgemeldet) setServerBereit(bereit)
    })()
    return () => {
      abgemeldet = true
    }
  }, [])

  // die stimmen des browsers stehen nicht sofort bereit: Chrome lädt sie nach
  // und meldet das erst mit `voiceschanged`. einmal jetzt fragen, dann zuhören.
  useEffect(() => {
    const synth = ausgabe()
    if (!synth) return
    const lies = () => {
      const stimmen = synth.getVoices()
      if (stimmen.length > 0) setGewaehlt(waehleStimme(stimmen))
    }
    lies()
    synth.addEventListener('voiceschanged', lies)
    return () => synth.removeEventListener('voiceschanged', lies)
  }, [])

  const halt = useCallback(() => {
    laufendeRef.current = null
    setSpricht(null)
    setHolt(null)
    ausgabe()?.cancel()
    const klang = tonElement
    if (klang?.src) {
      klang.pause()
      // an den anfang zurück, sonst setzt ein erneutes abspielen mitten im
      // satz wieder ein, in dem gerade abgebrochen wurde
      try {
        klang.currentTime = 0
      } catch {
        /* ein element ohne geladene quelle wehrt sich dagegen */
      }
    }
  }, [])

  /** die eingebaute stimme. rückfall und einziger weg ohne modellverbindung. */
  const sprichImBrowser = useCallback(
    (id: string, text: string) => {
      // ab hier wird geredet, nicht mehr geholt
      setHolt(null)
      const synth = ausgabe()
      if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
        if (laufendeRef.current === id) {
          laufendeRef.current = null
          setSpricht(null)
        }
        return
      }

      synth.cancel()
      /**
       * Chrome bleibt gelegentlich stehen, wenn direkt nach einem `cancel` ein
       * `speak` kommt: die Ausgabe gilt dann als angehalten und sagt nie wieder
       * etwas. Ein `resume` auf eine Ausgabe, die gar nicht angehalten ist, tut
       * nichts — genau deshalb steht es hier unbedingt.
       */
      synth.resume()
      const stuecke = teileFuerStimme(text)
      if (stuecke.length === 0) {
        laufendeRef.current = null
        setSpricht(null)
        return
      }
      setArt('browser')

      stuecke.forEach((stueck, nr) => {
        const aeusserung = new SpeechSynthesisUtterance(stueck)
        if (gewaehlt) aeusserung.voice = gewaehlt
        aeusserung.lang = gewaehlt?.lang ?? 'de-DE'
        aeusserung.pitch = TONHOEHE
        aeusserung.rate = TEMPO
        if (nr === stuecke.length - 1) {
          aeusserung.onend = () => {
            // nur aufräumen, wenn immer noch dieselbe zeile gemeint ist
            if (laufendeRef.current !== id) return
            laufendeRef.current = null
            setSpricht(null)
          }
        }
        aeusserung.onerror = () => {
          if (laufendeRef.current !== id) return
          laufendeRef.current = null
          setSpricht(null)
        }
        synth.speak(aeusserung)
      })
    },
    [gewaehlt]
  )

  /**
   * Erst die echte Stimme, dann die eingebaute.
   *
   * Der Rückfall ist kein Notnagel für seltene Fälle: ohne Modellverbindung,
   * in der Stimmenprobe und bei der eigenen, noch nicht gespeicherten Zeile
   * gibt es serverseitig gar keinen Ton, den man holen könnte. Und wenn das
   * Netz weg ist, ist eine blecherne Stimme immer noch besser als Schweigen.
   */
  const sprich = useCallback(
    (id: string, text: string) => {
      // was noch läuft, hört auf. zwei stimmen übereinander sind kein gespräch.
      ausgabe()?.cancel()
      if (tonElement?.src) tonElement.pause()

      laufendeRef.current = id
      setSpricht(id)

      const klang = ton()
      if (!serverBereit || !klang || !istServerZeile(id)) {
        sprichImBrowser(id, text)
        return
      }

      const spiele = (adresse: string) => {
        setHolt(null)
        setArt('server')
        klang.src = adresse
        klang.onended = () => {
          if (laufendeRef.current !== id) return
          laufendeRef.current = null
          setSpricht(null)
        }
        klang.onerror = () => {
          if (laufendeRef.current === id) sprichImBrowser(id, text)
        }
        void klang.play()?.catch(() => {
          if (laufendeRef.current === id) sprichImBrowser(id, text)
        })
      }

      // schon einmal geholt und noch gültig: dann gibt es nichts zu warten
      const gemerkt = regalRef.current.get(id)
      if (gemerkt && gemerkt.bis > Date.now()) {
        spiele(gemerkt.adresse)
        return
      }

      setHolt(id)
      void (async () => {
        /**
         * Zwei Uhren laufen gegeneinander: die Function, die den Ton holt, und
         * die Frist, nach der stattdessen der Browser anfängt. Wer zuerst
         * ankommt, spricht; der andere hält dann still. `gefallen` ist die
         * Notiz darüber, damit ENI nicht zweimal übereinander redet.
         */
        let gefallen = false
        const wecker = setTimeout(() => {
          if (laufendeRef.current !== id) return
          gefallen = true
          sprichImBrowser(id, text)
        }, TON_FRIST_MS)

        try {
          const adresse = await holeTonAdresse(id)
          clearTimeout(wecker)
          // auch wenn hier niemand mehr zuhört: gemerkt wird sie. genau dafür
          // hat sich das warten dann wenigstens gelohnt.
          if (adresse) {
            regalRef.current.set(id, { adresse, bis: Date.now() + ADRESSE_GILT_MS })
          }
          // in der zwischenzeit kann längst etwas anderes drankommen sein
          if (laufendeRef.current !== id || gefallen) return
          if (!adresse) {
            sprichImBrowser(id, text)
            return
          }
          spiele(adresse)
        } catch {
          // netz weg, adresse abgelaufen, abspielen verweigert: alles derselbe
          // fall, und die antwort darauf ist dieselbe.
          clearTimeout(wecker)
          if (laufendeRef.current === id && !gefallen) sprichImBrowser(id, text)
        }
      })()
    },
    [serverBereit, sprichImBrowser]
  )

  /**
   * Chrome hält die eingebaute Ausgabe nach etwa fünfzehn Sekunden von selbst
   * an, ohne `onend` zu melden. Ein `resume` im Takt weckt sie wieder. Das ist
   * eine Krücke um einen Browserfehler, und sie läuft nur, solange die
   * eingebaute Stimme wirklich spricht — eine abgespielte Datei hat den Fehler
   * nicht.
   */
  useEffect(() => {
    if (spricht === null || art === 'server') return
    const synth = ausgabe()
    if (!synth) return
    const takt = setInterval(() => {
      if (synth.speaking && !synth.paused) {
        synth.pause()
        synth.resume()
      }
    }, 10_000)
    return () => clearInterval(takt)
  }, [art, spricht])

  // wer die ansicht verlässt, lässt weder stimme noch ton weiterlaufen
  useEffect(
    () => () => {
      ausgabe()?.cancel()
      if (tonElement?.src) tonElement.pause()
    },
    []
  )

  // ein stabiles objekt: die aufrufer hängen ihre eigenen `useCallback` daran
  // auf, und eine neue identität je rendern machte die alle wertlos.
  return useMemo(
    () => ({
      // eine echte stimme reicht als grund für den knopf, auch wenn der browser
      // selbst keine hat — dann spricht eben nur ENIs eigene.
      moeglich: browserMoeglich || serverBereit,
      spricht,
      holt,
      art,
      serverBereit,
      oertlich: art === 'server' ? false : gewaehlt ? gewaehlt.localService : null,
      name: art === 'server' ? null : (gewaehlt?.name ?? null),
      sprich,
      halt,
    }),
    [art, browserMoeglich, gewaehlt, halt, holt, serverBereit, spricht, sprich]
  )
}

/** ob beim letzten mal vorgelesen wurde */
export function vorlesenGemerkt(): boolean {
  return false
}

export function merkeVorlesen(an: boolean) {
  try {
    localStorage.setItem(VORLESEN_KEY, an ? 'ja' : 'nein')
  } catch {
    /* ein voller oder gesperrter speicher darf ENI nicht stumm machen */
  }
}
