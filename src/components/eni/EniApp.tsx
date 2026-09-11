import { useCallback, useEffect, useRef, useState } from 'react'
import { IconCaretLeft, IconClock, IconPlus, IconSpeakerHigh, IconSpeakerSlash } from './EniSymbole'
import { chatTitel } from '../../lib/eniSpeicher'
import type { DuellKontext, EniChat, EniSpeicher, EniZeile } from '../../lib/eniSpeicher'
import {
  anbieterGemerkt,
  EniModellFehler,
  merkeAnbieter,
  modellAntwort,
  modellBereit,
  NACHHOLBAR,
  stimmenprobeAntwort,
} from '../../lib/eniAntwort'
import type { AnbieterInfo, Antwortgeber, Modellstand } from '../../lib/eniAntwort'
import {
  bereiteVor,
  bildAdressen as holeBildAdressen,
  EniAnhangFehler,
  gibVorschauFrei,
  ladeHoch,
  MAX_ANHAENGE,
} from '../../lib/eniAnhang'
import type { VorbereiteterAnhang } from '../../lib/eniAnhang'
import { useStimme, weckeStimme } from '../../lib/eniStimme'
import type { UserId } from '../../lib/types'
import { IconInfo } from './EniSymbole'
import { EniEingabe } from './EniEingabe'
import { EniInfoDialog } from './EniInfoDialog'
import { EniModellwahl } from './EniModellwahl'
import { EniStrom } from './EniStrom'
import { EniVerlauf } from './EniVerlauf'

type Modus = 'pruefen' | 'modell' | 'stimmenprobe'

type Props = {
  speicher: EniSpeicher
  onZurueck: () => void
  /** prueft, ob eine modellverbindung steht, und welche modelle es gibt */
  pruefeModell?: () => Promise<Modellstand>
  /** baut den antwortgeber. injiziert fuer tests */
  baueGeber?: (bereit: boolean, speicher: EniSpeicher, anbieter: string | null) => Antwortgeber
  initialDuellStand?: DuellKontext | null
}

const STANDARD_GEBER = (
  bereit: boolean,
  speicher: EniSpeicher,
  anbieter: string | null
): Antwortgeber => (bereit ? modellAntwort(anbieter) : stimmenprobeAntwort(speicher))

export function EniApp({
  speicher,
  onZurueck,
  pruefeModell = modellBereit,
  baueGeber = STANDARD_GEBER,
  initialDuellStand = null,
}: Props) {
  const [me, setMe] = useState<UserId>('erijon')
  const [duellStand, setDuellStand] = useState<DuellKontext | null>(initialDuellStand)
  const [chats, setChats] = useState<EniChat[]>([])
  const [chatsZustand, setChatsZustand] = useState<'laden' | 'bereit' | 'fehler'>('laden')
  const [aktiverChat, setAktiverChat] = useState<string | null>(null)
  const [zeilen, setZeilen] = useState<EniZeile[]>([])
  const [modus, setModus] = useState<Modus>('pruefen')
  const [geber, setGeber] = useState<Antwortgeber | null>(null)
  const [prueft, setPrueft] = useState(false)
  const [verlaufOffen, setVerlaufOffen] = useState(false)
  const [infoOffen, setInfoOffen] = useState(false)
  const [anbieter, setAnbieter] = useState<AnbieterInfo[]>([])
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [wahlOffen, setWahlOffen] = useState(false)
  const [vorgabe, setVorgabe] = useState<{ text: string; nr: number } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [frisch, setFrisch] = useState<string | null>(null)
  const [hinweis, setHinweis] = useState<string | null>(null)
  const [anhaenge, setAnhaenge] = useState<VorbereiteterAnhang[]>([])
  // Standardmaessig ist Audio aus. ENI spricht nur, wenn man es einschaltet.
  const [vorlesen, setVorlesen] = useState(false)
  const [adressen, setAdressen] = useState<Map<string, string>>(() => new Map())

  // Referenzen fuer nebenlaeufige Aktionen & Chatwechsel
  const aktiverChatRef = useRef<string | null>(null)
  aktiverChatRef.current = aktiverChat
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const endeRef = useRef<HTMLDivElement>(null)
  const vorgabeNr = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  /**
   * Was zuletzt schiefging, und wie es aufzuholen ist.
   *
   * Zwei Faelle, und der Unterschied ist wichtig: bei `neu` steht noch nichts
   * im Verlauf, die Vorlage muss also noch einmal geschickt werden. Bei
   * `nochmal` steht sie schon da und nur ENIs Antwort fehlt — dann darf sie
   * kein zweites Mal geschickt werden, sonst stuende derselbe Satz zweimal im
   * Chat.
   */
  const letzterFehlversuchRef = useRef<
    | { art: 'neu'; text: string; anhaenge: VorbereiteterAnhang[] }
    | { art: 'nochmal'; chatId: string }
    | null
  >(null)

  // Entwurfsverwaltung je Chat: Entwuerfe bleiben beim Chatwechsel und bei Fehlern erhalten
  const aktuellerTextRef = useRef('')
  const entwuerfeRef = useRef<Map<string | null, { text: string; anhaenge: VorbereiteterAnhang[] }>>(
    new Map()
  )

  const stimme = useStimme()

  const ladeChats = useCallback(async () => {
    setChatsZustand('laden')
    try {
      const [person, liste] = await Promise.all([speicher.person(), speicher.chats()])
      setMe(person)
      setChats(liste)
      setChatsZustand('bereit')
      if (speicher.duellStand) {
        const stand = await speicher.duellStand()
        if (stand) setDuellStand(stand)
      }
    } catch {
      setChatsZustand('fehler')
    }
  }, [speicher])

  useEffect(() => {
    void ladeChats()
  }, [ladeChats])

  useEffect(() => {
    let abgemeldet = false
    void (async () => {
      const stand = await pruefeModell()
      if (abgemeldet) return
      setModus(stand.bereit ? 'modell' : 'stimmenprobe')
      setAnbieter(stand.anbieter)
      /**
       * Die gemerkte Wahl gilt nur, solange der Server sie noch anbietet.
       * Wird ein Schlüssel entfernt, fällt sie stillschweigend auf den ersten
       * zurück, statt in ein 400 zu laufen, das niemand erklären kann.
       */
      const gemerkt = anbieterGemerkt()
      const gueltig = stand.anbieter.some((eintrag) => eintrag.id === gemerkt)
      const wahl = gueltig ? gemerkt : (stand.anbieter[0]?.id ?? null)
      setGewaehlt(wahl)
      setGeber(baueGeber(stand.bereit, speicher, wahl))
    })()
    return () => {
      abgemeldet = true
    }
  }, [baueGeber, pruefeModell, speicher])

  /** das modell wechseln. der laufende verlauf bleibt, nur die stimme wechselt. */
  const waehleAnbieter = useCallback(
    (id: string) => {
      setWahlOffen(false)
      if (id === gewaehlt) return
      merkeAnbieter(id)
      setGewaehlt(id)
      setGeber(baueGeber(true, speicher, id))
    },
    [baueGeber, gewaehlt, speicher]
  )

  // Intelligentes Scrollen: Zieht den Nutzer nicht nach unten, wenn er aeltere Zeilen liest
  const scrolleZumEndeWennSinnvoll = useCallback((erzwingen = false) => {
    const el = scrollContainerRef.current
    if (!el) return
    const abstandUnten = el.scrollHeight - el.scrollTop - el.clientHeight
    const amEnde = abstandUnten < 120
    if (erzwingen || amEnde) {
      endeRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
    }
  }, [])

  useEffect(() => {
    scrolleZumEndeWennSinnvoll(prueft)
  }, [zeilen.length, prueft, scrolleZumEndeWennSinnvoll])

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
      if (!jetzt) stimme.halt()
      else weckeStimme()
      return jetzt
    })
  }, [stimme])

  const anhaengenMoeglich =
    speicher.art === 'supabase' && speicher.kontoId !== null && modus === 'modell'

  // Bilder signieren
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

  const nimmAnhaenge = useCallback((dateien: File[]) => {
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
  }, [])

  const entferneAnhang = useCallback((id: string) => {
    setAnhaenge((vorher) => {
      const raus = vorher.find((anhang) => anhang.id === id)
      if (raus) gibVorschauFrei(raus)
      return vorher.filter((anhang) => anhang.id !== id)
    })
  }, [])

  // Anfrage lokal abbrechen
  const brecheAb = useCallback(() => {
    if (!prueft) return
    abortControllerRef.current?.abort()
    setPrueft(false)
    setFehler('anfrage abgebrochen.')
  }, [prueft])

  // Vorlage abschicken
  const legeVor = useCallback(
    (text: string, wiederholungsAnhaenge?: VorbereiteterAnhang[]) => {
      if (!geber || prueft) return
      setFehler(null)
      setHinweis(null)
      setFrisch(null)
      setPrueft(true)
      stimme.halt()
      if (vorlesen) weckeStimme()

      const controller = new AbortController()
      abortControllerRef.current = controller

      const mitgeben = wiederholungsAnhaenge ?? anhaenge
      if (!wiederholungsAnhaenge) setAnhaenge([])
      letzterFehlversuchRef.current = null

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

      const bisher = zeilen
      setZeilen((vorher) => [...vorher, vorlaeufig])

      void (async () => {
        const zielChatId = aktiverChatRef.current
        let chatId = zielChatId
        try {
          if (!chatId) {
            const chat = await speicher.neuerChat(chatTitel(text))
            chatId = chat.id
            aktiverChatRef.current = chat.id
            setAktiverChat(chat.id)
            setChats((vorher) => [chat, ...vorher])
          }

          await new Promise((weiter) => setTimeout(weiter, 50))
          const vorlagen = await ladeHoch(mitgeben, speicher.kontoId ?? '', chatId)
          const ergebnis = await geber.antworte(
            chatId,
            text,
            bisher,
            vorlagen,
            controller.signal
          )

          // Wichtig: Spaete Antworten duerfen niemals im falschen Gespraech landen!
          const gehoertZuAktivemChat = zielChatId === null ? (aktiverChatRef.current === null || aktiverChatRef.current === chatId) : (aktiverChatRef.current === zielChatId);
          if (gehoertZuAktivemChat) {
            setZeilen((vorher) => [
              ...vorher.filter((zeile) => zeile.id !== vorlaeufig.id),
              ergebnis.mensch,
              ...(ergebnis.eni ? [ergebnis.eni] : []),
            ])
            setFrisch(ergebnis.eni?.id ?? null)
            if (vorlesen && ergebnis.eni) stimme.sprich(ergebnis.eni.id, ergebnis.eni.text)
            if (ergebnis.hinweis) setHinweis(ergebnis.hinweis)
          }

          // Entwurf fuer diesen Chat bereinigen
          entwuerfeRef.current.delete(chatId)
          for (const anhang of mitgeben) gibVorschauFrei(anhang)
        } catch (ursache) {
          const istAbbruch =
            controller.signal.aborted ||
            (ursache instanceof Error && ursache.message.includes('abgebrochen'))
          const gespeichert = ursache instanceof EniModellFehler ? ursache.mensch : null

          setZeilen((vorher) => [
            ...vorher.filter((zeile) => zeile.id !== vorlaeufig.id),
            ...(gespeichert ? [gespeichert] : []),
          ])

          if (!gespeichert) {
            // Fehlversuch fuer Wiederholung vormerken und Text/Anhaenge wiederherstellen
            letzterFehlversuchRef.current = { art: 'neu', text, anhaenge: mitgeben }
            vorgabeNr.current += 1
            setVorgabe({ text, nr: vorgabeNr.current })
            setAnhaenge((vorher) => [...mitgeben, ...vorher].slice(0, MAX_ANHAENGE))
          } else {
            for (const anhang of mitgeben) gibVorschauFrei(anhang)
            // Die Vorlage steht. Was fehlt, ist nur ENIs Antwort, und die
            // laesst sich nachholen, ohne den Satz noch einmal zu schicken.
            const nachholbar =
              !istAbbruch &&
              chatId !== null &&
              ursache instanceof EniModellFehler &&
              NACHHOLBAR.has(ursache.code ?? '')
            letzterFehlversuchRef.current = nachholbar
              ? { art: 'nochmal', chatId: chatId! }
              : null
          }

          if (istAbbruch) {
            setFehler('anfrage abgebrochen.')
          } else {
            setFehler(
              ursache instanceof EniAnhangFehler
                ? ursache.message
                : ursache instanceof EniModellFehler
                  ? ursache.message
                  : 'deine vorlage wurde nicht gespeichert. versuch es erneut.'
            )
          }
        } finally {
          setPrueft(false)
        }
      })()
    },
    [anhaenge, geber, prueft, speicher, stimme, vorlesen, zeilen]
  )

  /**
   * ENI noch einmal um eine Antwort bitten, auf eine Vorlage, die schon steht.
   * Schreibt nichts: der Server greift die letzte offene Vorlage auf.
   */
  const holeNach = useCallback(
    (chatId: string) => {
      if (!geber || prueft) return
      setFehler(null)
      setHinweis(null)
      setFrisch(null)
      setPrueft(true)
      stimme.halt()
      if (vorlesen) weckeStimme()

      const controller = new AbortController()
      abortControllerRef.current = controller

      void (async () => {
        try {
          const ergebnis = await geber.nochmal(chatId, controller.signal)
          letzterFehlversuchRef.current = null
          if (aktiverChatRef.current === chatId) {
            setZeilen((vorher) => [
              ...vorher.filter((zeile) => zeile.id !== ergebnis.mensch.id),
              ergebnis.mensch,
              ...(ergebnis.eni ? [ergebnis.eni] : []),
            ])
            setFrisch(ergebnis.eni?.id ?? null)
            if (vorlesen && ergebnis.eni) stimme.sprich(ergebnis.eni.id, ergebnis.eni.text)
            if (ergebnis.hinweis) setHinweis(ergebnis.hinweis)
          }
        } catch (ursache) {
          const istAbbruch =
            controller.signal.aborted ||
            (ursache instanceof Error && ursache.message.includes('abgebrochen'))
          // Der Eintrag bleibt stehen: was beim zweiten Mal nicht ging, darf
          // beim dritten noch einmal versucht werden.
          setFehler(
            istAbbruch
              ? 'anfrage abgebrochen.'
              : ursache instanceof EniModellFehler
                ? ursache.message
                : 'ENI hat nicht geantwortet. versuch es gleich noch einmal.'
          )
        } finally {
          setPrueft(false)
        }
      })()
    },
    [geber, prueft, stimme, vorlesen]
  )

  const wiederhole = useCallback(() => {
    const fehl = letzterFehlversuchRef.current
    if (!fehl || prueft) return
    if (fehl.art === 'nochmal') holeNach(fehl.chatId)
    else legeVor(fehl.text, fehl.anhaenge)
  }, [holeNach, legeVor, prueft])

  // Startvorschlag uebernehmen: setzt den gewaehlten Vorschlag direkt ins Feld, ohne zu stacken
  const uebernimmAuftakt = useCallback((text: string) => {
    vorgabeNr.current += 1
    setVorgabe({ text, nr: vorgabeNr.current })
  }, [])

  // Entwurf speichern vor Chatwechsel
  const speichereAktuellenEntwurf = useCallback(() => {
    entwuerfeRef.current.set(aktiverChatRef.current, {
      text: aktuellerTextRef.current,
      anhaenge,
    })
  }, [anhaenge])

  const oeffneChat = useCallback(
    (chatId: string) => {
      speichereAktuellenEntwurf()
      setVerlaufOffen(false)
      setFehler(null)
      setHinweis(null)
      stimme.halt()
      setFrisch(null)
      setAktiverChat(chatId)

      // Gespeicherten Entwurf fuer diesen Chat wiederherstellen
      const entwurf = entwuerfeRef.current.get(chatId) ?? { text: '', anhaenge: [] }
      vorgabeNr.current += 1
      setVorgabe({ text: entwurf.text, nr: vorgabeNr.current })
      setAnhaenge(entwurf.anhaenge)

      void (async () => {
        try {
          const nachrichten = await speicher.nachrichten(chatId)
          if (aktiverChatRef.current === chatId) {
            setZeilen(nachrichten)
          }
        } catch {
          if (aktiverChatRef.current === chatId) {
            setZeilen([])
            setFehler('der chat konnte nicht geladen werden.')
          }
        }
      })()
    },
    [speicher, speichereAktuellenEntwurf, stimme]
  )

  const neuerChat = useCallback(() => {
    speichereAktuellenEntwurf()
    setVerlaufOffen(false)
    setFehler(null)
    setHinweis(null)
    setFrisch(null)
    setAktiverChat(null)
    setZeilen([])
    stimme.halt()

    // Entwurf fuer neuen Chat laden
    const entwurf = entwuerfeRef.current.get(null) ?? { text: '', anhaenge: [] }
    vorgabeNr.current += 1
    setVorgabe({ text: entwurf.text, nr: vorgabeNr.current })
    setAnhaenge(entwurf.anhaenge)
  }, [speichereAktuellenEntwurf, stimme])

  const loescheChat = useCallback(
    (chatId: string) => {
      stimme.halt()
      entwuerfeRef.current.delete(chatId)
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
    [aktiverChat, speicher, stimme]
  )

  return (
    <div className="flex h-[100dvh] flex-col bg-grund">
      <header className="vollbild-safe-x shrink-0 border-b border-linie pt-[calc(var(--app-safe-top)+0.75rem)]">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-2 pb-2.5">
          {/* Ruecknavigation */}
          <button
            type="button"
            onClick={onZurueck}
            aria-label="zurück zum zweikampf"
            className="-ml-2 flex min-h-11 items-center gap-1.5 px-2 text-[12px] text-kreide-60 transition-colors hover:text-kreide"
          >
            <IconCaretLeft size={16} aria-hidden="true" />
            {/*
              Unter 416 Pixeln geht das Wort, der Pfeil bleibt. Die Kopfleiste
              trägt links den Rückweg, in der Mitte ENIs Namen und rechts vier
              Werkzeugflächen zu 44 Pixeln; auf einem 375er-Display passt das
              zusammen nicht mehr, und dann schob es bisher den Knopf für den
              neuen Chat über den Rand. Ein Pfeil ohne Wort ist verständlich,
              ein halb abgeschnittener Knopf nicht. Das Wort bleibt im
              aria-label stehen, damit der Screenreader es weiter vorliest.
            */}
            <span className="max-[415px]:hidden">zweikampf</span>
          </button>

          {/* Eni-Identitaet, und dahinter die wahl des modells */}
          <EniModellwahl
            anbieter={modus === 'modell' ? anbieter : []}
            gewaehlt={gewaehlt}
            offen={wahlOffen}
            gesperrt={prueft}
            onUmschalten={() => setWahlOffen((vorher) => !vorher)}
            onSchliessen={() => setWahlOffen(false)}
            onWaehlen={waehleAnbieter}
          />

          {/* Werkzeugleiste: einheitliche 44px-Flaechen */}
          <div className="-mr-2 flex items-center gap-0.5">
            {stimme.moeglich && (
              <button
                type="button"
                onClick={schalteVorlesen}
                aria-pressed={vorlesen}
                aria-label={vorlesen ? 'nicht mehr vorlesen' : 'antworten vorlesen'}
                className="flex size-11 items-center justify-center transition-colors"
                style={{ color: vorlesen ? 'var(--kreide)' : 'var(--kreide-52)' }}
              >
                {vorlesen ? (
                  <IconSpeakerHigh size={18} />
                ) : (
                  <IconSpeakerSlash size={18} />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setInfoOffen(true)}
              aria-label="informationen und datenschutz"
              className="flex size-11 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
            >
              <IconInfo size={18} className="text-kreide-60 hover:text-kreide" />
            </button>
            <button
              type="button"
              onClick={() => setVerlaufOffen(true)}
              aria-label="verlauf öffnen"
              className="flex size-11 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
            >
              <IconClock size={18} />
            </button>
            <button
              type="button"
              onClick={neuerChat}
              aria-label="neuer chat"
              className="flex size-11 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
            >
              <IconPlus size={18} />
            </button>
          </div>
        </div>

        <p className="sr-only">
          {modus === 'pruefen'
            ? 'verbindung wird geprüft …'
            : modus === 'modell'
              ? `${anbieter.find((eintrag) => eintrag.id === gewaehlt)?.name ?? 'das modell'} über supabase. was du hier schreibst, verlässt dein gerät.`
              : 'lokale stimmenprobe. noch keine modellverbindung.'}
        </p>
      </header>

      {/* Gespraechsbereich */}
      <div
        ref={scrollContainerRef}
        className="vollbild-safe-x min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
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
            duellStand={duellStand}
          />
          {hinweis && (
            <p role="status" className="pt-4 text-[12px] leading-relaxed text-kreide-52">
              {hinweis}
            </p>
          )}
          <div ref={endeRef} aria-hidden="true" className="h-3" />
        </div>
      </div>

      {/* Eingabebereich */}
      <div className="vollbild-safe-x shrink-0 pb-[calc(var(--app-safe-bottom)+0.75rem)]">
        <div className="mx-auto w-full max-w-[560px]">
          {fehler && (
            <div className="flex items-center justify-between gap-2 pb-2">
              <p role="alert" className="text-[11px]" style={{ color: 'var(--erijon)' }}>
                {fehler}
              </p>
              {letzterFehlversuchRef.current && !prueft && (
                <button
                  type="button"
                  onClick={wiederhole}
                  className="text-[11px] font-bold underline underline-offset-2 text-kreide-60 hover:text-kreide"
                >
                  wiederholen
                </button>
              )}
            </div>
          )}
          <EniEingabe
            gesperrt={prueft || geber === null}
            onVorlegen={legeVor}
            vorgabe={vorgabe}
            anhaengenMoeglich={anhaengenMoeglich}
            anhaenge={anhaenge}
            onAnhaengen={nimmAnhaenge}
            onAnhangEntfernen={entferneAnhang}
            onTextChange={(t) => {
              aktuellerTextRef.current = t
            }}
            onAbbrechen={brecheAb}
          />
        </div>
      </div>

      {/* Verlauf Dialog */}
      <EniVerlauf
        offen={verlaufOffen}
        chats={chats}
        aktiverChat={aktiverChat}
        ladezustand={chatsZustand}
        onWaehlen={oeffneChat}
        onNeu={neuerChat}
        onLoeschen={loescheChat}
        onSchliessen={() => setVerlaufOffen(false)}
        onErneutLaden={ladeChats}
      />

      {/* Info Dialog */}
      <EniInfoDialog
        offen={infoOffen}
        onSchliessen={() => setInfoOffen(false)}
        modellName={anbieter.find((eintrag) => eintrag.id === gewaehlt)?.name ?? null}
      />
    </div>
  )
}
