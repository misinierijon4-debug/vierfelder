import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconTrash, IconX } from './EniSymbole'
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
  onErneutLaden?: () => void
}

/**
 * Der Verlauf als nativer Vollbilddialog.
 * Auf großen Bildschirmen zentriert mit sauber begrenzter Inhaltsbreite (max-w-[560px]).
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
  onErneutLaden,
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
      {offen && (
        <div className="vollbild-safe-x flex h-full flex-col pb-[calc(var(--app-safe-bottom)+1rem)] pt-[calc(var(--app-safe-top)+1rem)]">
          <div className="mx-auto flex w-full max-w-[560px] min-h-11 items-center justify-between gap-2 border-b border-linie pb-3">
            <h2 className="display text-[16px] font-bold lowercase leading-none">verlauf</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onNeu}
                className="flex min-h-11 items-center gap-1.5 rounded-[2px] border border-linie bg-flaeche px-3 text-[12px] font-semibold transition-colors hover:border-linie-hell hover:bg-flaeche/80 active:bg-grund"
              >
                <IconPlus size={14} />
                neuer chat
              </button>
              <button
                type="button"
                onClick={onSchliessen}
                aria-label="verlauf schließen"
                className="flex size-11 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
              >
                <IconX size={18} />
              </button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[560px] min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
            {ladezustand === 'laden' ? (
              <p className="pt-5 text-[12px] text-kreide-52">verlauf wird geladen …</p>
            ) : ladezustand === 'fehler' ? (
              <div className="pt-5 space-y-2">
                <p role="alert" className="text-[12px]" style={{ color: 'var(--erijon)' }}>
                  der verlauf konnte nicht geladen werden.
                </p>
                {onErneutLaden && (
                  <button
                    type="button"
                    onClick={onErneutLaden}
                    className="min-h-11 px-3 rounded-[2px] border border-linie bg-flaeche text-[12px] font-semibold text-kreide hover:border-linie-hell"
                  >
                    erneut versuchen
                  </button>
                )}
              </div>
            ) : chats.length === 0 ? (
              <p className="pt-5 max-w-[34ch] text-[12px] leading-relaxed text-kreide-52">
                noch kein chat. was du ENI vorlegst, steht danach hier und bleibt, bis du es
                löschst.
              </p>
            ) : (
              <ul className="space-y-1">
                {chats.map((chat) => {
                  const istAktiv = chat.id === aktiverChat
                  const wann = new Date(chat.zuletzt)
                  return (
                    <li
                      key={chat.id}
                      className={`flex items-stretch gap-1 rounded-[2px] border transition-colors ${
                        istAktiv
                          ? 'border-linie-hell bg-flaeche/60 pl-2.5'
                          : 'border-b border-transparent border-b-linie pl-2 hover:bg-flaeche/30'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onWaehlen(chat.id)}
                        aria-current={istAktiv ? 'true' : undefined}
                        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center py-2 pr-2 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`truncate text-[13px] ${
                              istAktiv ? 'font-bold text-kreide' : 'text-kreide-60'
                            }`}
                          >
                            {chat.titel}
                          </span>
                          {istAktiv && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-kreide-52">
                              aktiv
                            </span>
                          )}
                        </div>
                        <span className="tnum mt-0.5 text-[10px] text-kreide-52">
                          {DATUM.format(wann)} · {UHRZEIT.format(wann)}
                        </span>
                      </button>

                      {nachfrage === chat.id ? (
                        <span className="flex items-center gap-1 pr-1">
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
                          className="flex size-11 shrink-0 items-center justify-center self-center text-kreide-52 hover:text-kreide transition-colors"
                        >
                          <IconTrash size={16} />
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
