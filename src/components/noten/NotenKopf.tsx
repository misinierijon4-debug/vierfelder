import type { Notenstand, UserId } from '../../lib/types'
import { user } from '../../lib/types'
import { abiAuswertung, defizite, gesamtSchnitt, punkteZuNote } from '../../lib/noten'
import { Zahl } from '../Zahl'

export function NotenKopf({ stand, me }: { stand: Notenstand; me: UserId }) {
  const schnitt = gesamtSchnitt(stand.faecher, stand.noten, me)
  const auswertung = abiAuswertung(stand.faecher, stand.noten, me)
  const prognose = auswertung.status === 'prognose' ? auswertung : null
  const schwach = defizite(stand.faecher, stand.noten, me)
  const personenfarbe = user(me).farbe
  return (
    <section aria-labelledby="noten-kopf" className="border-b border-linie pb-4">
      <h2 id="noten-kopf" className="sr-only">noten</h2>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-[11px] text-kreide-52">fachschnitt</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            {schnitt === null ? <span className="tnum text-[34px] font-bold text-kreide-52">–</span> : <Zahl value={schnitt.toFixed(1).replace('.', ',')} className="text-[34px] font-bold" />}
            <span className="text-[11px] text-kreide-52">punkte</span>
          </p>
          <p className="mt-1 text-[12px] text-kreide-60">
            {schnitt === null ? 'noch keine note' : `note ${punkteZuNote(schnitt).toFixed(1).replace('.', ',')}`}
          </p>
        </div>
        <div role="group" aria-label="abiprognose" aria-live="polite" aria-atomic="true" className="text-right">
          <p className="text-[11px] text-kreide-52">abiprognose</p>
          <p className="mt-1">
            {auswertung.status === 'unvollstaendig' ? (
              <span className="tnum text-[34px] font-bold text-kreide-52">–</span>
            ) : auswertung.note === null ? (
              <span className="inline-block max-w-[150px] text-[15px] font-bold leading-5" style={{ color: personenfarbe }}>
                keine belastbare abiturnote
              </span>
            ) : (
              <Zahl value={auswertung.note.toFixed(1).replace('.', ',')} className="text-[34px] font-bold" />
            )}
          </p>
          <p className="mt-1 text-[11px] text-kreide-52">
            {auswertung.status === 'unvollstaendig'
              ? `für ${auswertung.belegt} von ${auswertung.faecherGesamt} fächern liegen noten vor`
              : `${auswertung.gesamt} punkte · aus diesem halbjahr hochgerechnet`}
          </p>
        </div>
      </div>

      {schwach.length > 0 && (
        <p className="mt-3 text-[12px]" style={{ color: personenfarbe }}>
          unter 5 punkten: {schwach.map((fach) => fach.name).join(', ')}
        </p>
      )}
      {auswertung.status === 'unvollstaendig' && auswertung.gruende.length > 0 && (
        <p className="mt-1 text-[11px] text-kreide-52">{auswertung.gruende.join(' · ')}</p>
      )}
      {prognose && prognose.huerden.length > 0 && (
        <p className="mt-1 text-[11px]" style={{ color: personenfarbe }}>{prognose.huerden.join(' · ')}</p>
      )}
    </section>
  )
}
