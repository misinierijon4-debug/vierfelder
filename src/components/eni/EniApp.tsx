import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CaretLeft,
  ClockCounterClockwise,
  Plus,
  SpeakerHigh,
  SpeakerSlash,
} from '@phosphor-icons/react'
import { chatTitel } from '../../lib/eniSpeicher'
import type { EniChat, EniSpeicher, EniZeile } from '../../lib/eniSpeicher'
import {
  EniModellFehler,
  modellAntwort,
  modellBereit,
  stimmenprobeAntwort,
} from '../../lib/eniAntwort'
import type { Antwortgeber } from '../../lib/eniAntwort'
import {
  bereiteVor,
  bildAdressen as holeBildAdressen,
  EniAnhangFehler,
  gibVorschauFrei,
  ladeHoch,
  MAX_ANHAENGE,
} from '../../lib/eniAnhang'
import type { VorbereiteterAnhang } from '../../lib/eniAnhang'
import { merkeVorlesen, useStimme, vorlesenGemerkt, weckeStimme } from '../../lib/eniStimme'
import type { UserId } from '../../lib/types'
import { EniEingabe } from './EniEingabe'
import { EniMarke } from './EniMarke'
import { EniStrom } from './EniStrom'
import { EniVerlauf } from './EniVerlauf'

/**
 * so lange steht der takt mindestens. das modell ist manchmal schneller, und
 * eine antwort ohne pause fuehlt sich nicht wie ein urteil an, sondern wie ein
 * echo.
 */
const BEDENKZEIT_MS = 700

type Modus = 'pruefen' | 'modell' | 'stimmenprobe'

type Props = {
  speicher: EniSpeicher
  onZurueck: () => void
  /** prüft, ob eine modellverbindung steht. injiziert für tests */
  pruefeModell?: () => Promise<boolean>
  /** baut den antwortgeber. injiziert für tests */
  baueGeber?: (bereit: boolean, speicher: EniSpeicher) => Antwortgeber
}

const STANDARD_GEBER = (bereit: boolean, speicher: EniSpeicher): Antwortgeber =>
  bereit ? modellAntwort() : stimmenprobeAntwort(speicher)

/**
 * ENI als eigene oberfläche. sie übernimmt den ganzen bildschirm, hat einen
 * eigenen kopf und einen eigenen weg zurück in die anzeigetafel. der grund ist
 * nicht der platz: ein gespräch mit einem schiedsrichter ist etwas anderes als
 * ein häkchen zu setzen, und beides im selben rahmen hätte beides kleiner
 * gemacht.
 */
export function EniApp({
  speicher,
  onZurueck,
  pruefeModell = modellBereit,
  baueGeber = STANDARD_GEBER,
}: Props) {
  const [me, setMe] = useState<UserId>('erijon')
  const [chats, setChats] = useState<EniChat[]>([])
  const [chatsZustand, setChatsZustand] = useState<'laden' | 'bereit' | 'fehler'>('laden')
  const [aktiverChat, setAktiverChat] = useState<string | null>(null)
  const [zeilen, setZeilen] = useState<EniZeile[]>([])
  const [modus, setModus] = useState<Modus>('pruefen')
  const [geber, setGeber] = useState<Antwortgeber | null>(null)
  const [prueft, setPrueft] = useState(false)
  const [verlaufOffen, setVerlaufOffen] = useState(false)
  const [vorgabe, setVorgabe] = useState<{ text: string; nr: number } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  /** die zeile, die gerade hereingekommen ist. sie klappt auf, alles andere steht. */
  const [frisch, setFrisch] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [anhaenge, setAnhaenge] = useState<VorbereiteterAnhang[]>([])
  /**
   * ob ENI von selbst vorliest. das überlebt die ansicht: wer ihn einmal hören
   * wollte, will ihn beim nächsten mal wieder hören, und den schalter jedes mal
   * neu zu suchen wäre die art von reibung, an der eine gewohnheit stirbt.
   */
  const [vorlesen, setVorlesen] = useState(vorlesenGemerkt)
  /** signierte adressen der bilder im offenen chat, nach bucket-pfad */
  const [adressen, setAdressen] = useState<Map<string, string>>(() => new Map())
  const endeRef = useRef<HTMLDivElement>(null)
  const vorgabeNr = useRef(0)
  const stimme = useStimme()

  /** der knopf an einer einzelnen antwort: anhalten, wenn sie gerade läuft */
  const lieseVor = useCallback(
    (zeile: EniZeile) => {
      if (stimme.spricht === zeile.id) stimme.halt()
      else stimme.sprich(zeile.id, zeile.text)
    },
    [stimme]
  )

  const schalteVorlesen = useCallback(() => {
    setVorlesen((vorher) => {
      const jetzt = !vorher
      merkeVorlesen(jetzt)
      // wer abschaltet, will sofort ruhe und nicht erst nach dem letzten satz
      if (!jetzt) stimme.halt()
      // und wer einschaltet, tut das mit dem finger auf dem knopf: der moment,
      // in dem safari die ausgabe für den rest der sitzung aufmacht.
      else weckeStimme()
      return jetzt
    })
  }, [stimme])

  // anhänge brauchen beides: einen bucket, in dem ein bild liegen kann, und
  // augen, die es ansehen. die stimmenprobe hat keine — sie ist ein paar regeln
  // in einer datei —, und ohne konto gibt es keinen bucket. dann ist die
  // büroklammer nicht grau, sondern weg: ein bild hochzuladen, das nie jemand
  // ansieht, wäre genau die art von schein, gegen die die zeile im kopf steht.
  const anhaengenMoeglich =
    speicher.art === 'supabase' && speicher.kontoId !== null && modus === 'modell'

  useEffect(() => {
    let abgemeldet = false
    void (async () => {
      try {
        const [person, liste] = await Promise.all([speicher.person(), speicher.chats()])
        if (abgemeldet) return
        setMe(person)
        setChats(liste)
        setChatsZustand('bereit')
      } catch {
        if (!abgemeldet) setChatsZustand('fehler')
      }
    })()
    return () => {
      abgemeldet = true
    }
  }, [speicher])

  // die zeile im kopf darf erst behaupten, dass ein modell antwortet, wenn das
  // geprueft ist. bis dahin nimmt ENI auch nichts an.
  useEffect(() => {
    let abgemeldet = false
    void (async () => {
      const bereit = await pruefeModell()
      if (abgemeldet) return
      setModus(bereit ? 'modell' : 'stimmenprobe')
      setGeber(baueGeber(bereit, speicher))
    })()
    return () => {
      abgemeldet = true
    }
  }, [baueGeber, pruefeModell, speicher])

  useEffect(() => {
    endeRef.current?.scrollIntoView?.({ block: 'end' })
  }, [zeilen.length, prueft])

  /**
   * die bilder des offenen chats sichtbar machen. der bucket ist nicht
   * öffentlich, also braucht jedes bild eine signierte adresse; sie werden in
   * einem zug geholt, nicht eine je bild.
   *
   * die karte wächst nur. eine adresse, die einmal steht, wird nicht noch
   * einmal geholt, und ein zurückgeblätterter chat zeigt seine bilder sofort.
   */
  useEffect(() => {
    const fehlend = [
      ...new Set(
        zeilen
          .flatMap((zeile) => zeile.anhaenge ?? [])
          .map((anhang) => anhang.pfad)
          .filter((pfad): pfad is string => Boolean(pfad) && !pfad!.startsWith('vorschau:'))
      ),
    ].filter((pfad) => !adressen.has(pfad))
    if (fehlend.length === 0) return

    let abgemeldet = false
    void (async () => {
      const neue = await holeBildAdressen(fehlend)
      if (abgemeldet || neue.size === 0) return
      setAdressen((vorher) => new Map([...vorher, ...neue]))
    })()
    return () => {
      abgemeldet = true
    }
  }, [zeilen, adressen])

  /**
   * eine ausgewählte datei annehmen. jede für sich: wer drei bilder und ein pdf
   * markiert, soll die drei bilder behalten und einen satz über das pdf lesen,
   * statt alles zurückzubekommen.
   */
  const nimmAnhaenge = useCallback(
    (dateien: File[]) => {
      setFehler(null)
      void (async () => {
        const fertig: VorbereiteterAnhang[] = []
        let abgelehnt: string | null = null
        for (const datei of dateien) {
          try {
            fertig.push(await bereiteVor(datei))
          } catch (ursache) {
            abgelehnt =
              ursache instanceof EniAnhangFehler
                ? ursache.message
                : 'die datei ließ sich nicht anhängen.'
          }
        }
        if (fertig.length > 0) {
          setAnhaenge((vorher) => [...vorher, ...fertig].slice(0, MAX_ANHAENGE))
        }
        if (abgelehnt) setFehler(abgelehnt)
      })()
    },
    []
  )

  const entferneAnhang = useCallback((id: string) => {
    setAnhaenge((vorher) => {
      const raus = vorher.find((anhang) => anhang.id === id)
      if (raus) gibVorschauFrei(raus)
      return vorher.filter((anhang) => anhang.id !== id)
    })
  }, [])

  const legeVor = useCallback(
    (text: string) => {
      if (!geber || prueft) return
      setFehler(null)
      setHinweis(null)
      setFrisch(null)
      setPrueft(true)
      // was noch gesprochen wird, gehört zur vorigen runde
      stimme.halt()
      // ENIs antwort kommt sekunden später, safari lässt eine stimme aber nur
      // aus einer echten handlung heraus zu. dies hier ist diese handlung.
      if (vorlesen) weckeStimme()

      // die anhänge gehen mit dieser vorlage. der streifen wird sofort leer:
      // was einmal vorgelegt ist, hängt nicht mehr am nächsten satz.
      const mitgeben = anhaenge
      setAnhaenge([])

      /**
       * die vorschau der eigenen bilder, bis die echten zeilen da sind. sie
       * steht unter einem schlüssel, den es im bucket nicht gibt, damit die
       * signier-schleife sie nicht zu holen versucht.
       */
      const vorschau = new Map<string, string>()
      for (const anhang of mitgeben) {
        if (anhang.art === 'bild' && anhang.vorschau) {
          vorschau.set(`vorschau:${anhang.id}`, anhang.vorschau)
        }
      }
      if (vorschau.size > 0) setAdressen((vorher) => new Map([...vorher, ...vorschau]))

      const vorlaeufig: EniZeile = {
        id: `vorlaeufig-${Date.now()}`,
        rolle: 'mensch',
        text,
        erstellt: new Date().toISOString(),
        ...(mitgeben.length > 0
          ? {
              anhaenge: mitgeben.map((anhang) => ({
                id: anhang.id,
                art: anhang.art,
                name: anhang.name,
                groesse: anhang.groesse,
                ...(anhang.art === 'bild'
                  ? { pfad: `vorschau:${anhang.id}` }
                  : { inhalt: anhang.inhalt }),
              })),
            }
          : {}),
      }
      // die eigenen worte stehen sofort da. auf ein urteil wartet man, auf das
      // eigene echo nicht.
      const bisher = zeilen
      setZeilen((vorher) => [...vorher, vorlaeufig])

      void (async () => {
        const start = Date.now()
        const takt = async () => {
          const rest = BEDENKZEIT_MS - (Date.now() - start)
          if (rest > 0) await new Promise((weiter) => setTimeout(weiter, rest))
        }
        try {
          let chatId = aktiverChat
          if (!chatId) {
            const chat = await speicher.neuerChat(chatTitel(text))
            chatId = chat.id
            setAktiverChat(chat.id)
            setChats((vorher) => [chat, ...vorher])
          }
          // die bilder liegen, bevor die vorlage abgeht. ein abgebrochener
          // upload erzeugt so keine nachricht, die auf ein bild zeigt, das es
          // nicht gibt.
          const vorlagen = await ladeHoch(mitgeben, speicher.kontoId ?? '', chatId)

          const ergebnis = await geber.antworte(chatId, text, bisher, vorlagen)
          await takt()
          setZeilen((vorher) => [
            ...vorher.filter((zeile) => zeile.id !== vorlaeufig.id),
            ergebnis.mensch,
            ...(ergebnis.eni ? [ergebnis.eni] : []),
          ])
          setFrisch(ergebnis.eni?.id ?? null)
          if (vorlesen && ergebnis.eni) stimme.sprich(ergebnis.eni.id, ergebnis.eni.text)
          if (ergebnis.hinweis) setHinweis(ergebnis.hinweis)
          // die echte zeile steht, die vorschau wird nicht mehr gebraucht
          for (const anhang of mitgeben) gibVorschauFrei(anhang)
        } catch (ursache) {
          await takt()
          const gespeichert = ursache instanceof EniModellFehler ? ursache.mensch : null
          setZeilen((vorher) => [
            ...vorher.filter((zeile) => zeile.id !== vorlaeufig.id),
            ...(gespeichert ? [gespeichert] : []),
          ])
          if (!gespeichert) {
            // nichts ist gespeichert, also darf auch nichts stehen bleiben.
            // der satz gehoert zurueck ins feld, und die anhaenge auch: sie
            // sind ausgesucht, zugeschnitten und vielleicht schon hochgeladen,
            // und wer sie noch einmal heraussuchen muss, laesst es sein.
            vorgabeNr.current += 1
            setVorgabe({ text, nr: vorgabeNr.current })
            setAnhaenge((vorher) => [...mitgeben, ...vorher].slice(0, MAX_ANHAENGE))
          } else {
            for (const anhang of mitgeben) gibVorschauFrei(anhang)
          }
          setFehler(
            ursache instanceof EniAnhangFehler
              ? ursache.message
              : ursache instanceof EniModellFehler
                ? ursache.message
                : 'deine vorlage wurde nicht gespeichert. versuch es erneut.'
          )
        } finally {
          setPrueft(false)
        }
      })()
    },
    [aktiverChat, anhaenge, geber, prueft, speicher, stimme, vorlesen, zeilen]
  )

  const uebernimmAuftakt = useCallback((text: string) => {
    vorgabeNr.current += 1
    setVorgabe({ text, nr: vorgabeNr.current })
  }, [])

  /** ein angefangener anhang gehört zu dem chat, in dem er ausgesucht wurde */
  const leereAnhaenge = useCallback(() => {
    setAnhaenge((vorher) => {
      for (const anhang of vorher) gibVorschauFrei(anhang)
      return []
    })
  }, [])

  const oeffneChat = useCallback(
    (chatId: string) => {
      setVerlaufOffen(false)
      setFehler(null)
      setHinweis(null)
      stimme.halt()
      leereAnhaenge()
      // ein alter chat wird gelesen, nicht empfangen: er steht sofort ganz da
      setFrisch(null)
      setAktiverChat(chatId)
      void (async () => {
        try {
          setZeilen(await speicher.nachrichten(chatId))
        } catch {
          setZeilen([])
          setFehler('der chat konnte nicht geladen werden.')
        }
      })()
    },
    [leereAnhaenge, speicher, stimme]
  )

  const neuerChat = useCallback(() => {
    setVerlaufOffen(false)
    setFehler(null)
    setHinweis(null)
    setFrisch(null)
    setAktiverChat(null)
    setZeilen([])
    stimme.halt()
    leereAnhaenge()
  }, [leereAnhaenge, stimme])

  const loescheChat = useCallback(
    (chatId: string) => {
      void (async () => {
        try {
          await speicher.loesche(chatId)
          setChats((vorher) => vorher.filter((chat) => chat.id !== chatId))
          if (chatId === aktiverChat) {
            setAktiverChat(null)
            setZeilen([])
          }
        } catch {
          setFehler('der chat wurde nicht gelöscht.')
        }
      })()
    },
    [aktiverChat, speicher]
  )

  return (
    <div className="flex h-[100dvh] flex-col bg-grund">
      <header className="vollbild-safe-x shrink-0 border-b border-linie pt-[calc(var(--app-safe-top)+0.75rem)]">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-2">
          <button
            type="button"
            onClick={onZurueck}
            className="-ml-2 flex min-h-11 items-center gap-1 px-2 text-[12px] text-kreide-60"
          >
            <CaretLeft size={14} weight="bold" aria-hidden="true" />
            zweikampf
          </button>

          <div className="flex items-center gap-2">
            <EniMarke groesse={22} grund="var(--grund)" />
            <span className="display text-[17px] font-bold leading-none tracking-[0.06em]">
              ENI
            </span>
          </div>

          <div className="-mr-2 flex items-center">
            {/* der schalter steht im kopf und nicht bei den knöpfen unten: er
                gilt für das ganze gespräch und nicht für die nächste vorlage. */}
            {stimme.moeglich && (
              <button
                type="button"
                onClick={schalteVorlesen}
                aria-pressed={vorlesen}
                aria-label={vorlesen ? 'nicht mehr vorlesen' : 'antworten vorlesen'}
                className="flex size-11 items-center justify-center"
                style={{ color: vorlesen ? 'var(--kreide)' : 'var(--kreide-52)' }}
              >
                {vorlesen ? (
                  <SpeakerHigh size={18} aria-hidden="true" />
                ) : (
                  <SpeakerSlash size={18} aria-hidden="true" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setVerlaufOffen(true)}
              aria-label="verlauf öffnen"
              className="flex size-11 items-center justify-center text-kreide-60"
            >
              <ClockCounterClockwise size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={neuerChat}
              aria-label="neuer chat"
              className="flex size-11 items-center justify-center text-kreide-60"
            >
              <Plus size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* diese zeile sagt, was gerade laeuft, und sie sagt es genau. solange
            keine verbindung steht, heisst das stimmenprobe; sobald eine steht,
            heisst das: deine worte verlassen das geraet. */}
        <p className="mx-auto w-full max-w-[560px] pb-2 text-[10px] leading-4 text-kreide-52">
          {modus === 'pruefen'
            ? 'verbindung wird geprüft …'
            : modus === 'modell'
              ? 'deepseek über supabase. was du hier schreibst, verlässt dein gerät.'
              : 'lokale stimmenprobe. noch keine modellverbindung.'}
        </p>

        {/* dieselbe regel wie eine zeile höher und wie beim mikrofon: wohin
            etwas geht, wird hingeschrieben. hier gibt es zwei verschiedene
            wege, und sie dürfen nicht denselben satz bekommen: bei ENIs eigener
            stimme rechnet google, was der server ohnehin schon geschrieben hat;
            bei der eingebauten wäre es der browser-anbieter. */}
        {vorlesen && stimme.serverBereit && (
          <p className="mx-auto w-full max-w-[560px] pb-2 text-[10px] leading-4 text-kreide-52">
            ENIs stimme kommt von google. gesprochen wird nur, was er selbst gesagt hat.
          </p>
        )}
        {vorlesen && !stimme.serverBereit && stimme.oertlich === false && (
          <p className="mx-auto w-full max-w-[560px] pb-2 text-[10px] leading-4 text-kreide-52">
            diese stimme rechnet im netz. was ENI sagt, geht dafür an deinen browser-anbieter.
          </p>
        )}
      </header>

      <div className="vollbild-safe-x min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col">
          <EniStrom
            zeilen={zeilen}
            me={me}
            prueft={prueft}
            frisch={frisch}
            bildAdressen={adressen}
            spricht={stimme.spricht}
            onVorlesen={stimme.moeglich ? lieseVor : undefined}
            onAuftakt={uebernimmAuftakt}
          />
          {hinweis && (
            <p role="status" className="pt-5 text-[12px] leading-relaxed text-kreide-52">
              {hinweis}
            </p>
          )}
          <div ref={endeRef} aria-hidden="true" className="h-2" />
        </div>
      </div>

      <div className="vollbild-safe-x shrink-0 pb-[calc(var(--app-safe-bottom)+0.75rem)]">
        <div className="mx-auto w-full max-w-[560px]">
          {fehler && (
            <p role="alert" className="pb-2 text-[11px]" style={{ color: 'var(--erijon)' }}>
              {fehler}
            </p>
          )}
          <EniEingabe
            gesperrt={prueft || geber === null}
            onVorlegen={legeVor}
            vorgabe={vorgabe}
            anhaengenMoeglich={anhaengenMoeglich}
            anhaenge={anhaenge}
            onAnhaengen={nimmAnhaenge}
            onAnhangEntfernen={entferneAnhang}
          />
        </div>
      </div>

      <EniVerlauf
        offen={verlaufOffen}
        chats={chats}
        aktiverChat={aktiverChat}
        ladezustand={chatsZustand}
        onWaehlen={oeffneChat}
        onNeu={neuerChat}
        onLoeschen={loescheChat}
        onSchliessen={() => setVerlaufOffen(false)}
      />
    </div>
  )
}
