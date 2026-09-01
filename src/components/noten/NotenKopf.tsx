import type { Notenstand, UserId } from '../../lib/types'
import { abiPrognose, ABI_FORMEL_GEPRUEFT, defizite, gesamtSchnitt, punkteZuNote } from '../../lib/noten'
import { Zahl } from '../Zahl'

export function NotenKopf({ stand, me }: { stand: Notenstand; me: UserId }) {
  const schnitt = gesamtSchnitt(stand.faecher, stand.noten, me)
  const prognose = abiPrognose(stand.faecher, stand.noten, me)
  const schwach = defizite(stand.faecher, stand.noten, me)
  return (
    <section aria-labelledby="noten-kopf" className="border-b border-linie pb-4">
      <h1 id="noten-kopf" className="sr-only">noten</h1>
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
        <div className="text-right">
          <p className="text-[11px] text-kreide-52">abiprognose</p>
          <p className="mt-1">
            {prognose === null ? <span className="tnum text-[34px] font-bold text-kreide-52">–</span> : <Zahl value={prognose.note.toFixed(1).replace('.', ',')} className="text-[34px] font-bold" />}
          </p>
          <p className="mt-1 text-[11px] text-kreide-52">aus diesem halbjahr hochgerechnet</p>
        </div>
      </div>

      {schwach.length > 0 && (
        <p className="mt-3 text-[12px]" style={{ color: 'var(--erijon)' }}>
          defizitwarnung: {schwach.map((fach) => fach.name).join(', ')} unter 5 punkten
        </p>
      )}
      {prognose && prognose.huerden.length > 0 && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--erijon)' }}>{prognose.huerden.join(' · ')}</p>
      )}
      <p className="mt-3 text-[10px] leading-4 text-kreide-52">
        {ABI_FORMEL_GEPRUEFT ? 'mss rheinland-pfalz · abitur 2027 geprüft.' : 'die mss-zahlen dieser prognose sind ungeprüft.'}
        {' '}bis zur wahl des mündlichen prüfungsfachs rechnet die hochrechnung mit dem gf-schnitt.
      </p>
    </section>
  )
}
