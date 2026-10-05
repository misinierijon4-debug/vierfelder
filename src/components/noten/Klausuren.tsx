import { useState } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import type { Notenstand, UserId } from '../../lib/types'
import { other, user } from '../../lib/types'
import { abstandText, datumKurz, kommendeKlausuren, ohneNote, zeitText } from '../../lib/klausuren'
import type { KlausurZeile } from '../../lib/klausuren'
import { Zahl } from '../Zahl'

type Props = {
  stand: Notenstand
  me: UserId
  heute: string
  /** öffnet das eigene fach, um die note einzutragen */
  onFachOeffnen: (fachId: string) => void
}

/** ab hier steht der countdown in der farbe der person */
const NAH_TAGE = 7

const fachLabel = (zeile: KlausurZeile) =>
  `${zeile.fach.name}${zeile.fach.kursart === 'lk' ? ' lk' : ''}`

/**
 * die klausuren stehen ganz oben im abi-tab: was als nächstes kommt, mit
 * countdown, darunter der rest des plans. umschaltbar auf den plan der
 * anderen person — gelesen, nicht bearbeitet.
 */
export function Klausuren({ stand, me, heute, onFachOeffnen }: Props) {
  const [wer, setWer] = useState<UserId>(me)
  if (!stand.klausuren) return null
  const eigen = wer === me
  const kommend = kommendeKlausuren(stand, wer, heute)
  const offen = eigen ? ohneNote(stand, me, heute) : []
  const [naechste, ...rest] = kommend
  const farbe = user(wer).farbe
  const partner = other(wer).name

  return (
    <section aria-labelledby="klausuren-titel" className="border-b border-linie pb-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="klausuren-titel" className="display text-[18px] font-semibold">klausuren</h2>
        <div role="group" aria-label="wessen klausuren" className="flex rounded-[2px] border border-linie p-0.5 text-[11px]">
          {([me, other(me).id] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={wer === id}
              onClick={() => setWer(id)}
              className="min-h-9 rounded-[1px] px-3 font-semibold"
              style={wer === id ? { background: 'var(--grund)', color: user(id).farbe } : { color: 'var(--kreide-52)' }}
            >
              {id === me ? 'du' : user(id).name}
            </button>
          ))}
        </div>
      </div>

      {naechste ? (
        <div className="mt-3 flex items-end justify-between gap-4" aria-live="polite">
          <div className="min-w-0">
            <p className="text-[11px] text-kreide-52">nächste</p>
            <p className="display mt-1 break-words text-[24px] font-bold lowercase leading-none">{fachLabel(naechste)}</p>
            <p className="mt-1.5 text-[12px] text-kreide-60">
              {datumKurz(naechste.klausur.datum)} · {zeitText(naechste.klausur) ?? 'uhrzeit offen'}
              {naechste.klausur.kurs ? ` · ${naechste.klausur.kurs}` : ''}
            </p>
            {naechste.zusammen && <p className="mt-0.5 text-[11px]" style={{ color: user(other(wer).id).farbe }}>{partner} schreibt sie auch</p>}
          </div>
          <div className="shrink-0 text-right" style={naechste.tage <= NAH_TAGE ? { color: farbe } : undefined}>
            {naechste.tage >= 2 ? (
              <>
                <Zahl value={naechste.tage} className="text-[34px] font-bold" />
                <p className="text-[11px] text-kreide-52">tage</p>
              </>
            ) : (
              <p className="display text-[24px] font-bold">{abstandText(naechste.tage)}</p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-kreide-52">keine klausur mehr im plan</p>
      )}

      {rest.length > 0 && (
        <ul className="mt-3 border-t border-linie">
          {rest.map((zeile) => (
            <li key={zeile.klausur.id} className="grid min-h-11 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 border-b border-linie py-1 text-[12px]">
              <span className="tnum text-[11px] text-kreide-60">{datumKurz(zeile.klausur.datum)}</span>
              <span className="min-w-0">
                <span className="block truncate lowercase">{fachLabel(zeile)}</span>
                <span className="block truncate text-[10px] text-kreide-52">
                  {zeitText(zeile.klausur) ?? 'uhrzeit offen'}
                  {zeile.zusammen ? ` · ${partner} auch` : ''}
                </span>
              </span>
              <span className="tnum text-right text-[11px] text-kreide-52" style={zeile.tage <= NAH_TAGE ? { color: farbe } : undefined}>
                {abstandText(zeile.tage)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {offen.length > 0 && (
        <ul className="mt-3" aria-label="geschrieben, note fehlt">
          {offen.map((zeile) => (
            <li key={zeile.klausur.id}>
              <button
                type="button"
                onClick={() => onFachOeffnen(zeile.fach.id)}
                aria-label={`${fachLabel(zeile)}, geschrieben ${datumKurz(zeile.klausur.datum)}: note eintragen`}
                className="flex min-h-11 w-full items-center gap-2 text-left text-[12px] active:translate-y-px"
              >
                <span className="min-w-0 flex-1">
                  <span className="lowercase">{fachLabel(zeile)}</span>
                  <span className="text-kreide-52"> · geschrieben {datumKurz(zeile.klausur.datum)} · </span>
                  <span style={{ color: farbe }}>note eintragen</span>
                </span>
                <CaretRight size={14} className="shrink-0 text-kreide-52" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
