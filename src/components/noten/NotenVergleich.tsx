import type { Fach, Notenstand } from '../../lib/types'
import { fachSchnitt, gesamtSchnitt, vergleich } from '../../lib/noten'

const wert = (n: number | null) => n === null ? '–' : n.toFixed(1).replace('.', ',')
const schnitt = (stand: Notenstand, fach: Fach) => wert(fachSchnitt(stand.noten, fach).gesamt)

export function NotenVergleich({ stand }: { stand: Notenstand }) {
  const { zeilen, ohnePaar } = vergleich(stand.faecher)
  return (
    <section aria-labelledby="vergleich-titel" className="mt-7 border-t border-linie pt-4">
      <h2 id="vergleich-titel" className="display text-[18px] font-semibold">vergleich</h2>
      <div className="mt-3 grid grid-cols-[1fr_64px_64px] gap-2 border-b border-linie pb-2 text-[10px] text-kreide-52">
        <span>gesamt</span>
        <span className="text-right" style={{ color: 'var(--erijon)' }}>erijon</span>
        <span className="text-right" style={{ color: 'var(--koray)' }}>koray</span>
        <span />
        <span className="tnum text-right text-[13px] text-kreide">{wert(gesamtSchnitt(stand.faecher, stand.noten, 'erijon'))}</span>
        <span className="tnum text-right text-[13px] text-kreide">{wert(gesamtSchnitt(stand.faecher, stand.noten, 'koray'))}</span>
      </div>
      <ul>
        {zeilen.map(({ erijon, koray }) => (
          <li key={`${erijon.id}|${koray.id}`} className="grid min-h-11 grid-cols-[1fr_64px_64px] items-center gap-2 border-b border-linie text-[12px]">
            <span className="min-w-0">
              <span className="block truncate" style={erijon.name === koray.name ? undefined : { color: 'var(--erijon)' }}>
                {erijon.name}
                <span className="ml-1 text-[9px] text-kreide-52">{erijon.kursart === koray.kursart ? erijon.kursart : `${erijon.kursart} · ${koray.kursart}`}</span>
              </span>
              {erijon.name !== koray.name && (
                <span className="block truncate text-[10px]" style={{ color: 'var(--koray)' }}>{koray.name}</span>
              )}
            </span>
            <span className="tnum text-right">{schnitt(stand, erijon)}</span>
            <span className="tnum text-right">{schnitt(stand, koray)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-4 text-kreide-52">
        verglichen wird nur, was denselben platz im stundenplan hat. wo die fächer verschieden heißen, steht jeder name in der farbe seiner spalte.
      </p>
      {ohnePaar.length > 0 && (
        <>
          <p className="mt-3 text-[10px] text-kreide-52">ohne gegenstück</p>
          <ul>
            {ohnePaar.map((fach) => (
              <li key={fach.id} className="grid min-h-11 grid-cols-[1fr_64px_64px] items-center gap-2 border-b border-linie text-[12px] text-kreide-52">
                <span className="min-w-0 truncate">{fach.name}<span className="ml-1 text-[9px]">{fach.kursart}</span></span>
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
