import type { Fach, Notenstand } from '../../lib/types'
import { fachSchnitt, gesamtSchnitt, kursGewichteterSchnitt, vergleich } from '../../lib/noten'

const wert = (n: number | null) => n === null ? '–' : n.toFixed(1).replace('.', ',')
const schnitt = (stand: Notenstand, fach: Fach) => wert(fachSchnitt(stand.noten, fach).gesamt)

export function NotenVergleich({ stand }: { stand: Notenstand }) {
  const { zeilen, ohnePaar } = vergleich(stand.faecher)
  const eGew = kursGewichteterSchnitt(stand.faecher, stand.noten, 'erijon')
  const kGew = kursGewichteterSchnitt(stand.faecher, stand.noten, 'koray')
  const eFuehrt = eGew !== null && (kGew === null || eGew > kGew)
  const kFuehrt = kGew !== null && (eGew === null || kGew > eGew)
  return (
    <section aria-labelledby="vergleich-titel" className="mt-7 border-t border-linie pt-4">
      <h2 id="vergleich-titel" className="display text-[18px] font-semibold">vergleich</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 border-b border-linie pb-2 text-[10px] text-kreide-52 min-[240px]:grid-cols-[minmax(0,1fr)_64px_64px]">
        <span className="col-span-2 min-[240px]:col-span-1">gesamt</span>
        <span className="text-right" style={{ color: 'var(--erijon)' }}>erijon</span>
        <span className="text-right" style={{ color: 'var(--koray)' }}>koray</span>
        <span aria-hidden="true" className="col-span-2 min-[240px]:col-span-1" />
        <span className="tnum text-right text-[13px] text-kreide">{wert(gesamtSchnitt(stand.faecher, stand.noten, 'erijon'))}</span>
        <span className="tnum text-right text-[13px] text-kreide">{wert(gesamtSchnitt(stand.faecher, stand.noten, 'koray'))}</span>
        <span className="col-span-2 text-[10px] text-kreide-52 min-[240px]:col-span-1">kurs-gewichtet</span>
        <span className={`tnum text-right text-[13px] ${eFuehrt ? 'font-semibold underline decoration-2 underline-offset-2' : ''}`} style={eFuehrt ? { color: 'var(--erijon)' } : undefined}>
          {wert(eGew)}{eFuehrt && <span className="sr-only">, höherer schnitt</span>}
        </span>
        <span className={`tnum text-right text-[13px] ${kFuehrt ? 'font-semibold underline decoration-2 underline-offset-2' : ''}`} style={kFuehrt ? { color: 'var(--koray)' } : undefined}>
          {wert(kGew)}{kFuehrt && <span className="sr-only">, höherer schnitt</span>}
        </span>
      </div>
      <ul>
        {zeilen.map(({ erijon, koray }) => (
          <li key={`${erijon.id}|${koray.id}`} className="grid min-h-11 grid-cols-2 items-center gap-2 border-b border-linie py-1 text-[12px] min-[240px]:grid-cols-[minmax(0,1fr)_64px_64px]">
            <span className="col-span-2 min-w-0 min-[240px]:col-span-1">
              <span className="block break-words min-[240px]:truncate" style={erijon.name === koray.name ? undefined : { color: 'var(--erijon)' }}>
                {erijon.name}
                <span className="ml-1 text-[9px] text-kreide-52">{erijon.kursart === koray.kursart ? erijon.kursart : `${erijon.kursart} · ${koray.kursart}`}</span>
              </span>
              {erijon.name !== koray.name && (
                <span className="block break-words text-[10px] min-[240px]:truncate" style={{ color: 'var(--koray)' }}>{koray.name}</span>
              )}
            </span>
            <span className="tnum text-right">{schnitt(stand, erijon)}</span>
            <span className="tnum text-right">{schnitt(stand, koray)}</span>
          </li>
        ))}
      </ul>
      {ohnePaar.length > 0 && (
        <>
          <p className="mt-3 text-[10px] text-kreide-52">ohne gegenstück</p>
          <ul>
            {ohnePaar.map((fach) => (
              <li key={fach.id} className="grid min-h-11 grid-cols-2 items-center gap-2 border-b border-linie py-1 text-[12px] text-kreide-52 min-[240px]:grid-cols-[minmax(0,1fr)_64px_64px]">
                <span className="col-span-2 min-w-0 break-words min-[240px]:col-span-1 min-[240px]:truncate">{fach.name}<span className="ml-1 text-[9px]">{fach.kursart}</span></span>
                <span className="tnum text-right">{fach.user === 'erijon' ? schnitt(stand, fach) : ''}</span>
                <span className="tnum text-right">{fach.user === 'koray' ? schnitt(stand, fach) : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
