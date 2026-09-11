import { useEffect, useRef } from 'react'
import { IconX, IconMicrophone, IconSpeakerHigh } from './EniSymbole'
import { IconShield, IconCpu } from './EniSymbole'
import { fokusRingLoesen } from '../../lib/dialogFokus'
import { useScrollSperre } from '../../lib/scrollsperre'

type Props = {
  offen: boolean
  onSchliessen: () => void
  /**
   * Der Name des gewählten Modells. Steht hier, weil dieser Dialog eine
   * Datenschutzaussage ist: er muss sagen, wohin die Sätze wirklich gehen, und
   * das ist seit der Modellwahl nicht mehr für immer dieselbe Stelle.
   */
  modellName?: string | null
}

/**
 * Informationsdialog zu Datenverarbeitung, Sichtbarkeit und externen Diensten bei ENI.
 * Ersetzt unklare oder widersprüchliche dauerhafte Hinweiszeilen im Kopfbereich.
 */
export function EniInfoDialog({ offen, onSchliessen, modellName = null }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (offen && !dialog.open) dialog.showModal()
    if (!offen && dialog.open) {
      dialog.close()
      fokusRingLoesen()
    }
  }, [offen])

  useScrollSperre(offen)

  return (
    <dialog
      ref={dialogRef}
      aria-label="informationen zu datenschutz und verarbeitung"
      onCancel={(event) => {
        event.preventDefault()
        onSchliessen()
      }}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-grund p-0 text-kreide backdrop:bg-grund/80"
    >
      {offen && (
        <div className="vollbild-safe-x flex h-full flex-col pb-[calc(var(--app-safe-bottom)+1rem)] pt-[calc(var(--app-safe-top)+1rem)]">
          <div className="mx-auto flex w-full max-w-[560px] min-h-11 items-center justify-between gap-2 border-b border-linie pb-3">
            <h2 className="display text-[16px] font-bold lowercase leading-none">
              verarbeitung & datenschutz
            </h2>
            <button
              type="button"
              onClick={onSchliessen}
              aria-label="info schließen"
              className="flex size-11 items-center justify-center text-kreide-60 transition-colors hover:text-kreide"
            >
              <IconX size={18} />
            </button>
          </div>

          <div className="mx-auto w-full max-w-[560px] min-h-0 flex-1 overflow-y-auto overscroll-contain py-4 space-y-6">
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-kreide">
                <IconShield size={18} weight="bold" className="shrink-0 text-kreide-60" aria-hidden="true" />
                <h3 className="text-[13px] font-bold uppercase tracking-wider">
                  Privat im Duell
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed text-kreide-60 pl-6">
                Deine Chats gehören dir allein. Dein Duell-Gegner kann deine Unterhaltungen mit ENI
                nicht einsehen. Die Datenbank trennt den Verlauf über Konten und Row-Level-Security ab.
              </p>
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2 text-kreide">
                <IconCpu size={18} weight="bold" className="shrink-0 text-kreide-60" aria-hidden="true" />
                <h3 className="text-[13px] font-bold uppercase tracking-wider">
                  Modellverarbeitung{modellName ? ` (${modellName})` : ''}
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed text-kreide-60 pl-6">
                Besteht eine Modellverbindung, verlassen deine eingegebenen Nachrichten und mitgegebenen
                Anhänge dein Gerät. Sie werden über eine Supabase Edge Function an das
                {modellName ? ` gewählte Modell (${modellName})` : ' gewählte Modell'} übermittelt,
                um ENIs Urteil zu berechnen. Welches Modell das ist, wählst du oben im Kopf; der
                Schlüssel dafür liegt ausschließlich auf dem Server. In der lokalen Stimmenprobe
                rechnet nichts im Netz.
              </p>
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2 text-kreide">
                <IconMicrophone size={18} weight="bold" className="shrink-0 text-kreide-60" aria-hidden="true" />
                <h3 className="text-[13px] font-bold uppercase tracking-wider">
                  Diktat (Browser-Spracherkennung)
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed text-kreide-60 pl-6">
                Das Diktat verwendet die Web Speech API deines Browsers. Dein Ton wird je nach
                Browser an Apple oder Google zur Transkription gesendet. Wir speichern kein Rohaudio.
              </p>
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2 text-kreide">
                <IconSpeakerHigh size={18} weight="bold" className="shrink-0 text-kreide-60" aria-hidden="true" />
                <h3 className="text-[13px] font-bold uppercase tracking-wider">
                  Sprachausgabe (ENIs Stimme)
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed text-kreide-60 pl-6">
                Wenn das Vorlesen aktiviert ist, wird ENIs Stimme über die Google Gemini API
                (AI Studio) erzeugt oder lokal vom Browser gesprochen. Gesprochen werden ausschließlich
                bereits gespeicherte Zeilen von ENI, niemals beliebiger Client-Text.
              </p>
            </section>
          </div>
        </div>
      )}
    </dialog>
  )
}
