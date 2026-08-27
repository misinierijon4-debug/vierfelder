import { Fragment } from 'react'
import { USERS } from '../../lib/types'
import type { Schlafnacht } from '../../lib/types'
import { abendDatum, duell, wochenwerte } from '../../lib/schlafPhasen'

type Props = {
  naechte: Schlafnacht[]
  woche: string[]
}

/**
 * Das Duell der Woche. Jede Zeile ist eine gemessene Größe, der Sieger steht
 * in seiner Farbe. Bei zu kleinem Unterschied bleibt beides grau — sonst
 * wechselt die Farbe bei jeder Minute Rauschen.
 */
export function SchlafRhythmus({ naechte, woche }: Props) {
  const wochenNaechte = naechte.filter((n) => woche.includes(abendDatum(n.einschlafzeit)))
  const [a, b] = USERS.map((u) => wochenwerte(u.id, wochenNaechte))
  const zeilen = duell(a!, b!)

  return (
    <section aria-labelledby="rhythmus-titel" className="mt-5">
      <h2
        id="rhythmus-titel"
        className="border-b border-linie pb-2 text-[12px] font-semibold text-kreide"
      >
        duell der woche
      </h2>

      <div className="mt-3 overflow-hidden rounded-[2px] border border-linie bg-flaeche">
        <div className="grid grid-cols-[1fr_72px_72px] items-baseline gap-x-2 border-b border-linie px-3 py-2.5">
          <span className="text-[10px] text-kreide-52">
            {a!.naechte + b!.naechte === 0 ? 'noch keine nacht' : 'nächte'}
          </span>
          {USERS.map((u, i) => (
            <span key={u.id} className="text-right text-[11px] font-medium" style={{ color: u.farbe }}>
              {u.name}{' '}
              <span className="tnum text-kreide-52">{(i === 0 ? a! : b!).naechte}</span>
            </span>
          ))}
        </div>

        <dl className="divide-y divide-linie">
          {zeilen.map((z) => (
            <Fragment key={z.id}>
              <div className="grid grid-cols-[1fr_72px_72px] items-baseline gap-x-2 px-3 py-2.5">
                <dt className="truncate text-[11px] text-kreide-52">{z.label}</dt>
                {USERS.map((u) => (
                  <dd
                    key={u.id}
                    className="tnum text-right text-[13px] font-semibold transition-colors duration-200"
                    style={{ color: z.sieger === u.id ? u.farbe : 'var(--kreide-52)' }}
                  >
                    {z.text[u.id]}
                  </dd>
                ))}
              </div>
            </Fragment>
          ))}
        </dl>
      </div>

      <p className="mt-2 text-[10px] leading-snug text-kreide-52">
        konstanz ist die mittlere abweichung von der eigenen üblichen einschlafzeit. kleiner heißt:
        du gehst jeden abend etwa zur selben zeit ins bett.
      </p>
    </section>
  )
}
