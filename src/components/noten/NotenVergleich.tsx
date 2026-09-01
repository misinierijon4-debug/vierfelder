import type { Notenstand, UserId } from '../../lib/types'
import { other } from '../../lib/types'
import { fachSchnitt, gesamtSchnitt } from '../../lib/noten'

const wert = (n: number | null) => n === null ? '–' : n.toFixed(1).replace('.', ',')

export function NotenVergleich({ stand, me }: { stand: Notenstand; me: UserId }) {
  const er = other(me).id
  const namen = [...new Set(stand.faecher.map((fach) => fach.name))].sort((a, b) => a.localeCompare(b, 'de'))
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
        {namen.map((name) => {
          const meine = stand.faecher.find((fach) => fach.user === me && fach.name === name)
          const seine = stand.faecher.find((fach) => fach.user === er && fach.name === name)
          const e = stand.faecher.find((fach) => fach.user === 'erijon' && fach.name === name)
          const k = stand.faecher.find((fach) => fach.user === 'koray' && fach.name === name)
          return (
            <li key={name} className="grid min-h-11 grid-cols-[1fr_64px_64px] items-center gap-2 border-b border-linie text-[12px]">
              <span className="truncate">{name}{meine?.kursart === 'lf' || seine?.kursart === 'lf' ? <span className="ml-1 text-[9px] text-kreide-52"> lf</span> : null}</span>
              <span className="tnum text-right">{wert(e ? fachSchnitt(stand.noten, e).gesamt : null)}</span>
              <span className="tnum text-right">{wert(k ? fachSchnitt(stand.noten, k).gesamt : null)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
