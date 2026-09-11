import { useEffect, useRef, useState } from 'react'
import { Plus, Trash, X } from '@phosphor-icons/react'
import { fokusRingLoesen } from '../../lib/dialogFokus'
import { useScrollSperre } from '../../lib/scrollsperre'
import type { EniChat } from '../../lib/eniSpeicher'

const DATUM = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })
const UHRZEIT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

type Props = {
  offen: boolean
  chats: EniChat[]
  aktiverChat: string | null
  ladezustand: 'laden' | 'bereit' | 'fehler'
  onWaehlen: (chatId: string) => void
  onNeu: () => void
  onLoeschen: (chatId: string) => void
  onSchliessen: () => void
}

/**
 * der verlauf. dasselbe muster wie kalender und nachtdetail: ein nativer
 * vollbilddialog, kein halb ausgefahrenes seitenblatt. auf einem telefon ist
 * eine schublade, die nur 80 prozent breit ist, kein gewinn — sie verdeckt den
 * chat und lässt sich trotzdem nicht ganz lesen.
 */
export function EniVerlauf({
  offen,
  chats,
  aktiverChat,
  ladezustand,
  onWaehlen,
  onNeu,
  onLoeschen,
  onSchliessen,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [nachfrage, setNachfrage] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (offen && !dialog.open) dialog.showModal()
    if (!offen && dialog.open) {
      dialog.close()
      fokusRingLoesen()
    }
  }, [offen])

  useEffect(() => {
    if (!offen) setNachfrage(null)
  }, [offen])

  useScrollSperre(offen)

  return (
    <dialog
      ref={dialogRef}
      aria-label="verlauf"
      onCancel={(event) => {
        event.preventDefault()
        onSchliessen()
      }}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-grund p-0 text-kreide backdrop:bg-grund/80"
    >
      {/* der inhalt haengt am offenen zustand: ein geschlossener dialog, der
          trotzdem alle chattitel im dokument stehen laesst, taucht sonst in
          jeder suche und in jedem screenreader-durchlauf mit auf. */}
      {offen && (
      <div className="vollbild-safe-x flex h-full flex-col pb-[calc(var(--app-safe-bottom)+1rem)] pt-[calc(var(--app-safe-top)+1rem)]">
        <div className="flex min-h-11 items-center justify-between gap-2 border-b border-linie pb-3">
          <h2 className="display text-[16px] font-bold lowercase leading-none">verlauf</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onNeu}
              className="flex min-h-11 items-center gap-1.5 rounded-[2px] border border-kontroll-rand px-3 text-[12px] font-semibold"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              neuer chat
            </button>
            <button
              type="button"
              onClick={onSchliessen}
              aria-label="verlauf schließen"
              className="flex size-11 items-center justify-center"
            >
              <X size={18} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {ladezustand === 'laden' ? (
            <p className="pt-5 text-[12px] text-kreide-52">verlauf wird geladen …</p>
          ) : ladezustand === 'fehler' ? (
            <p role="alert" className="pt-5 text-[12px]" style={{ color: 'var(--erijon)' }}>
              der verlauf konnte nicht geladen werden.
            </p>
          ) : chats.length === 0 ? (
            <p className="pt-5 max-w-[34ch] text-[12px] leading-relaxed text-kreide-52">
              noch kein chat. was du ENI vorlegst, steht danach hier und bleibt, bis du es
              löschst.
            </p>
          ) : (
            <ul>
              {chats.map((chat) => {
                const istAktiv = chat.id === aktiverChat
                const wann = new Date(chat.zuletzt)
                return (
                  <li key={chat.id} className="flex items-stretch gap-1 border-b border-linie">
                    <button
                      type="button"
                      onClick={() => onWaehlen(chat.id)}
                      aria-current={istAktiv ? 'true' : undefined}
                      className="flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2 pr-2 text-left"
                    >
                      <span
                        className="truncate text-[13px]"
                        style={{ color: istAktiv ? 'var(--kreide)' : 'var(--kreide-60)' }}
                      >
                        {chat.titel}
                      </span>
                      <span className="tnum mt-0.5 text-[10px] text-kreide-52">
                        {DATUM.format(wann)} · {UHRZEIT.format(wann)}
                      </span>
                    </button>

                    {nachfrage === chat.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onLoeschen(chat.id)
                            setNachfrage(null)
                          }}
                          className="min-h-11 px-2 text-[12px] font-semibold"
                          style={{ color: 'var(--erijon)' }}
                        >
                          löschen
                        </button>
                        <button
                          type="button"
                          onClick={() => setNachfrage(null)}
                          className="min-h-11 px-2 text-[12px] text-kreide-52"
                        >
                          zurück
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNachfrage(chat.id)}
                        aria-label={`chat ${chat.titel} löschen`}
                        className="flex size-11 shrink-0 items-center justify-center self-center text-kreide-52"
                      >
                        <Trash size={16} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      )}
    </dialog>
  )
}
