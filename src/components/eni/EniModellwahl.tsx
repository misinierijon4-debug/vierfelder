import { useEffect, useRef } from 'react'
import { IconCaretDown } from './EniSymbole'
import { EniMarke } from './EniMarke'
import type { AnbieterInfo } from '../../lib/eniAntwort'

type Props = {
  anbieter: AnbieterInfo[]
  gewaehlt: string | null
  offen: boolean
  /** gesperrt, solange ENI gerade antwortet: mitten im satz wechselt niemand */
  gesperrt?: boolean
  onUmschalten: () => void
  onSchliessen: () => void
  onWaehlen: (id: string) => void
}

/**
 * ENIs name im kopf, und dahinter die wahl, wer für ihn spricht.
 *
 * Beides an derselben Stelle, und das ist kein Platzsparen, sondern die
 * Aussage: das Modell ist nicht ENI, es ist nur die Stimme, mit der er gerade
 * redet. Wer wissen will, wer spricht, greift nach dem Namen.
 *
 * Praktisch war es auch eine Platzfrage. Die Kopfleiste trug schon vier
 * Werkzeugflächen zu 44 Pixeln; eine fünfte hätte auf einem 375er-Display den
 * Knopf für den neuen Chat über den Rand geschoben. Ein Menü, das den Weg zum
 * neuen Chat verstellt, wäre ein schlechter Tausch.
 *
 * Steht nur ein Anbieter zur Wahl, bleibt der Name ein Name und kein Knopf.
 * Ein Menü mit einer Wahlmöglichkeit ist keine Wahl.
 *
 * Was hier steht, kommt vom Server: genau die Schlüssel, die gesetzt sind. Der
 * Browser kennt weder Adresse noch Schlüssel, nur den Namen und eine id.
 */
export function EniModellwahl({
  anbieter,
  gewaehlt,
  offen,
  gesperrt = false,
  onUmschalten,
  onSchliessen,
  onWaehlen,
}: Props) {
  const huelleRef = useRef<HTMLDivElement>(null)

  // Ein Klick daneben oder Escape schließt. Beides am Dokument, weil der Klick
  // sonst erst ankommt, wenn er schon etwas anderes getroffen hat.
  useEffect(() => {
    if (!offen) return
    const daneben = (event: MouseEvent) => {
      if (!huelleRef.current?.contains(event.target as Node)) onSchliessen()
    }
    const taste = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSchliessen()
    }
    document.addEventListener('pointerdown', daneben)
    document.addEventListener('keydown', taste)
    return () => {
      document.removeEventListener('pointerdown', daneben)
      document.removeEventListener('keydown', taste)
    }
  }, [offen, onSchliessen])

  const marke = (
    <>
      <EniMarke groesse={20} grund="var(--grund)" />
      <span className="display text-[17px] font-bold leading-none tracking-[0.06em] text-kreide">
        ENI
      </span>
    </>
  )

  if (anbieter.length < 2) {
    return <div className="flex items-center gap-2">{marke}</div>
  }

  const aktiv = anbieter.find((eintrag) => eintrag.id === gewaehlt) ?? anbieter[0]!

  return (
    <div ref={huelleRef} className="relative">
      <button
        type="button"
        onClick={onUmschalten}
        disabled={gesperrt}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-label={`modell wählen, gerade ${aktiv.name}`}
        className="flex min-h-11 items-center gap-2 px-1 transition-opacity disabled:opacity-40"
      >
        {marke}
        <IconCaretDown
          size={12}
          className="shrink-0 transition-transform"
          style={{
            color: offen ? 'var(--kreide)' : 'var(--kreide-52)',
            transform: offen ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {offen && (
        <div
          role="menu"
          aria-label="modell"
          className="absolute left-1/2 top-full z-20 mt-1 w-[230px] -translate-x-1/2 border border-linie bg-flaeche py-1 shadow-lg"
        >
          {anbieter.map((eintrag) => {
            const dran = eintrag.id === aktiv.id
            return (
              <button
                key={eintrag.id}
                type="button"
                role="menuitemradio"
                aria-checked={dran}
                onClick={() => onWaehlen(eintrag.id)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-grund"
              >
                <span
                  aria-hidden="true"
                  className="mt-[3px] text-[11px] leading-none"
                  style={{ color: dran ? 'var(--kreide)' : 'transparent' }}
                >
                  ›
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[12px] font-bold leading-tight"
                    style={{ color: dran ? 'var(--kreide)' : 'var(--kreide-60)' }}
                  >
                    {eintrag.name}
                  </span>
                  <span className="block pt-0.5 text-[10px] leading-tight text-kreide-52">
                    {eintrag.hinweis}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
