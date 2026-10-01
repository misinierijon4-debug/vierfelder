import { useCallback, useEffect, useRef, useState } from 'react'
import {
  istFrei,
  kurzesDatum,
  rechercheStand,
  type RechercheApi,
  type RollenAkteStand,
} from '../../lib/eniRollenWissen'
import type { EniRolle } from '../../lib/eniEinstellungen'
import { IconX } from './EniSymbole'

/** so oft fragt die offene seite nach dem stand einer laufenden recherche */
const NACHSEHEN_MS = 4_000
/** und so oft stößt sie den server höchstens an */
const ANSTOSS_ABSTAND_MS = 8_000

/**
 * Die Akten aller Rollen, solange „ENI anpassen“ offen ist. Läuft eine
 * Recherche, wird alle paar Sekunden nachgesehen, und ist sie gerade frei,
 * bekommt der Server einen Stoß — sonst wartet sie auf den nächsten Cron-Lauf.
 */
export function useRollenAkten(offen: boolean, api: RechercheApi) {
  const [akten, setAkten] = useState<Map<string, RollenAkteStand>>(() => new Map())
  const [ladefehler, setLadefehler] = useState<string | null>(null)
  const [aktionsfehler, setAktionsfehler] = useState<{ rolleId: string; text: string } | null>(null)
  const angestossen = useRef(0)

  const laden = useCallback(async () => {
    if (!api.verfuegbar) return null
    try {
      const liste = await api.laden()
      setAkten(new Map(liste.map((a) => [a.rolleId, a])))
      setLadefehler(null)
      return liste
    } catch (e) {
      setLadefehler((e as Error).message)
      return null
    }
  }, [api])

  const anstossen = useCallback(() => {
    angestossen.current = Date.now()
    api.anstossen().catch(() => {})
  }, [api])

  useEffect(() => {
    if (!offen) return
    setAktionsfehler(null)
    void laden()
  }, [offen, laden])

  const laeuft = [...akten.values()].some((a) => a.status === 'laeuft')
  useEffect(() => {
    if (!offen || !laeuft) return
    let aus = false
    let timer: number | undefined
    const runde = async () => {
      const liste = await laden()
      if (aus) return
      const jetzt = Date.now()
      if (liste?.some((a) => istFrei(a, jetzt)) && jetzt - angestossen.current > ANSTOSS_ABSTAND_MS) anstossen()
      timer = window.setTimeout(() => void runde(), NACHSEHEN_MS)
    }
    timer = window.setTimeout(() => void runde(), NACHSEHEN_MS)
    return () => {
      aus = true
      window.clearTimeout(timer)
    }
  }, [offen, laeuft, laden, anstossen])

  const aktion = useCallback(
    async (rolleId: string, arbeit: () => Promise<void>) => {
      try {
        await arbeit()
        setAktionsfehler(null)
      } catch (e) {
        setAktionsfehler({ rolleId, text: (e as Error).message })
        await laden()
        return false
      }
      await laden()
      return true
    },
    [laden],
  )

  return {
    akten,
    ladefehler,
    fehlerFuer: (rolleId: string) => (aktionsfehler?.rolleId === rolleId ? aktionsfehler.text : null),
    starten: (rolle: EniRolle) =>
      aktion(rolle.id, async () => {
        await api.starten(rolle)
        anstossen()
      }),
    abbrechen: (rolleId: string) => aktion(rolleId, () => api.abbrechen(rolleId)),
    loeschen: (rolleId: string) => aktion(rolleId, () => api.loeschen(rolleId)),
    speichern: async (rolleId: string, akte: string) => {
      await api.speichern(rolleId, akte)
      await laden()
    },
  }
}

const KNOPF =
  'min-h-11 rounded-[2px] border border-linie-hell px-3 text-[13px] font-semibold transition-colors hover:border-kreide-60 disabled:opacity-40'
const LEISE = 'min-h-11 px-2 text-[13px] text-kreide-52 transition-colors hover:text-kreide'

/**
 * Der Teil „Wissen“ in einer aufgeklappten Rolle: recherchieren, zusehen,
 * die fertige Akte öffnen.
 */
export function WissenBlock({
  rolle,
  stand,
  farbe,
  verfuegbar,
  fehler,
  onStarten,
  onAbbrechen,
  onAnsehen,
  onLoeschen,
}: {
  rolle: EniRolle
  stand: RollenAkteStand | undefined
  farbe: string
  verfuegbar: boolean
  fehler: string | null
  onStarten: () => void
  onAbbrechen: () => void
  onAnsehen: () => void
  onLoeschen: () => void
}) {
  const [loeschen, setLoeschen] = useState(false)
  const name = rolle.name.trim()
  const akte = stand?.akte.trim() ? stand : undefined

  let inhalt
  if (stand?.status === 'laeuft') {
    const { prozent, erledigt, gesamt, jetzt } = rechercheStand(stand)
    inhalt = (
      <>
        <div
          role="progressbar"
          aria-label={`Recherche zu ${stand.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={prozent}
          className="h-1 overflow-hidden rounded-[1px] bg-linie"
        >
          <div className="h-full transition-[width] duration-500" style={{ width: `${Math.max(3, prozent)}%`, background: farbe }} />
        </div>
        <p className="tnum mt-2 text-[13px] font-semibold">
          recherchiert · {erledigt} von {gesamt}
        </p>
        <p className="truncate text-[12px] text-kreide-60">{jetzt}</p>
        <p className="mt-1 text-[12px] leading-snug text-kreide-52">
          Läuft auch weiter, wenn du die App schließt.
          {akte ? ' Bis die neue Akte fertig ist, gilt die alte.' : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className={LEISE} onClick={onAbbrechen}>
            abbrechen
          </button>
        </div>
      </>
    )
  } else if (akte) {
    const fuerAnderen = akte.akteName && akte.akteName !== name
    inhalt = (
      <>
        {stand?.status === 'fehler' && stand.fehler ? (
          <p role="alert" className="mb-1 text-[12px] leading-snug text-kreide-60">
            Letzte Recherche gescheitert: {stand.fehler}
          </p>
        ) : null}
        <p className="text-[13px] font-semibold">
          Akte fertig
          <span className="font-normal text-kreide-60">
            {' '}
            · {akte.quellen} {akte.quellen === 1 ? 'Quelle' : 'Quellen'}
            {akte.fertigAm ? ` · ${kurzesDatum(akte.fertigAm)}` : ''}
          </span>
        </p>
        {fuerAnderen ? (
          <p className="text-[12px] text-kreide-52">recherchiert für „{akte.akteName}“</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className={KNOPF} onClick={onAnsehen}>
            Akte ansehen
          </button>
          <button type="button" className={LEISE} disabled={!name || !verfuegbar} onClick={onStarten}>
            neu recherchieren
          </button>
          {loeschen ? (
            <>
              <button type="button" className="min-h-11 px-2 text-[13px] font-semibold" onClick={onLoeschen}>
                ja, Akte löschen
              </button>
              <button type="button" className={LEISE} onClick={() => setLoeschen(false)}>
                doch nicht
              </button>
            </>
          ) : (
            <button type="button" className={LEISE} onClick={() => setLoeschen(true)}>
              löschen
            </button>
          )}
        </div>
      </>
    )
  } else {
    inhalt = (
      <>
        {stand?.status === 'fehler' && stand.fehler ? (
          <p role="alert" className="mb-1 text-[12px] leading-snug text-kreide-60">
            Recherche gescheitert: {stand.fehler}
          </p>
        ) : (
          <p className="text-[12px] leading-snug text-kreide-60">
            ENI liest sich gründlich ein: Wikipedia, gut zwanzig Suchen mit ganzen Seiten, dann eine Akte mit Leben,
            Werken, Ideen und echten Zitaten. Dauert etwa eine halbe Stunde, die App darf dabei zu sein.
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className={KNOPF} disabled={!name || !verfuegbar} onClick={onStarten}>
            {stand?.status === 'fehler' ? 'nochmal recherchieren' : 'recherchieren'}
          </button>
          {!verfuegbar ? (
            <span className="text-[12px] text-kreide-52">Die Recherche braucht eine Anmeldung.</span>
          ) : !name ? (
            <span className="text-[12px] text-kreide-52">Erst einen Namen eintragen.</span>
          ) : null}
        </div>
      </>
    )
  }

  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold text-kreide-60">Wissen</p>
      {inhalt}
      {fehler ? (
        <p role="alert" className="mt-1 break-words text-[12px] leading-snug text-kreide-60">
          {fehler}
        </p>
      ) : null}
    </div>
  )
}

/** die akte lesbar: überschriften als überschriften, der rest als absätze */
function AkteText({ text }: { text: string }) {
  const bloecke = text.split(/\n{2,}/).filter((b) => b.trim())
  return (
    <div className="space-y-3 pb-10 pt-2 text-[14px] leading-relaxed">
      {bloecke.map((block, i) => {
        if (block.startsWith('# '))
          return (
            <h3 key={i} className="display text-[21px] font-bold leading-tight">
              {block.slice(2).trim()}
            </h3>
          )
        if (block.startsWith('## ')) {
          const umbruch = block.indexOf('\n')
          const titel = umbruch < 0 ? block.slice(3) : block.slice(3, umbruch)
          const rest = umbruch < 0 ? '' : block.slice(umbruch + 1)
          return (
            <div key={i} className="pt-4">
              <h4 className="text-[16px] font-bold">{titel.trim()}</h4>
              {rest ? <p className="mt-2 whitespace-pre-wrap break-words">{rest}</p> : null}
            </div>
          )
        }
        return (
          <p key={i} className="whitespace-pre-wrap break-words">
            {block}
          </p>
        )
      })}
    </div>
  )
}

/**
 * Die Akte über der Seite: lesen und, wenn etwas falsch ist, von Hand
 * ändern. Was hier steht, liest ENI im Chat.
 */
export function AkteAnsicht({
  name,
  stand,
  onSchliessen,
  onSpeichern,
}: {
  name: string
  stand: RollenAkteStand
  onSchliessen: () => void
  onSpeichern: (akte: string) => Promise<void>
}) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [text, setText] = useState(stand.akte)
  const [speichert, setSpeichert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const schliessen = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    schliessen.current?.focus()
  }, [])

  async function speichern() {
    setSpeichert(true)
    try {
      await onSpeichern(text)
      setFehler(null)
      setBearbeiten(false)
    } catch (e) {
      setFehler((e as Error).message)
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Akte: ${name}`}
      className="vollbild-safe-x absolute inset-0 z-10 flex flex-col bg-grund pb-[max(0.75rem,var(--app-safe-bottom))] pt-[calc(var(--app-safe-top)+0.75rem)]"
    >
      <header className="mx-auto flex w-full max-w-[560px] shrink-0 items-center justify-between gap-3 pb-2">
        <h3 className="display min-w-0 truncate text-[17px] font-bold leading-none">Akte: {name}</h3>
        <div className="flex shrink-0 items-center gap-1">
          {bearbeiten ? (
            <button
              type="button"
              disabled={speichert}
              onClick={() => void speichern()}
              className="min-h-11 px-2 text-[13px] font-semibold disabled:opacity-40"
            >
              {speichert ? 'speichert …' : 'speichern'}
            </button>
          ) : (
            <button type="button" onClick={() => setBearbeiten(true)} className="min-h-11 px-2 text-[13px] text-kreide-60">
              bearbeiten
            </button>
          )}
          <button
            ref={schliessen}
            type="button"
            aria-label="Akte schließen"
            onClick={onSchliessen}
            className="-mr-2 flex size-11 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
          >
            <IconX size={18} />
          </button>
        </div>
      </header>
      {fehler ? (
        <p role="alert" className="mx-auto w-full max-w-[560px] pb-2 text-[12px] text-kreide-60">
          <b className="text-kreide">Nicht gespeichert.</b> {fehler}
        </p>
      ) : null}
      <div className="ohne-balken mx-auto w-full max-w-[560px] min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {bearbeiten ? (
          <textarea
            aria-label="Akte bearbeiten"
            value={text}
            maxLength={100_000}
            onChange={(e) => setText(e.target.value)}
            className="h-full min-h-[60vh] w-full resize-none rounded-[2px] border border-linie bg-grund px-3 py-2.5 text-[14px] leading-relaxed text-kreide focus:border-kreide-60 focus:outline-none"
          />
        ) : (
          <AkteText text={stand.akte} />
        )}
      </div>
    </div>
  )
}
