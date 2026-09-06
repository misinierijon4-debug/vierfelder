import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'

type BlockerStand = Readonly<{ anzahl: number }>

const blocker = new Set<symbol>()
const beobachter = new Set<() => void>()
let stand: BlockerStand = Object.freeze({ anzahl: 0 })
let beforeUnloadAktiv = false

function vorVerlassenSchuetzen(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}

function aktualisiere() {
  const anzahl = blocker.size
  if (stand.anzahl !== anzahl) {
    stand = Object.freeze({ anzahl })
    for (const melde of beobachter) melde()
  }

  if (typeof window === 'undefined') return
  if (anzahl > 0 && !beforeUnloadAktiv) {
    window.addEventListener('beforeunload', vorVerlassenSchuetzen)
    beforeUnloadAktiv = true
  } else if (anzahl === 0 && beforeUnloadAktiv) {
    window.removeEventListener('beforeunload', vorVerlassenSchuetzen)
    beforeUnloadAktiv = false
  }
}

/**
 * Hält einen tablokalen Neustartschutz, bis die zurückgegebene Funktion
 * aufgerufen wird. Mehrere Formulare dürfen sich dabei unabhängig überlappen.
 */
export function blockiereNeustart(): () => void {
  const id = Symbol('pwa-neustartblocker')
  let aktiv = true
  blocker.add(id)
  aktualisiere()

  return () => {
    if (!aktiv) return
    aktiv = false
    blocker.delete(id)
    aktualisiere()
  }
}

/** Registriert genau solange einen Blocker, wie ein lokaler Entwurf offen ist. */
export function useNeustartBlocker(aktiv: boolean) {
  const loesen = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    loesen.current?.()
    loesen.current = aktiv ? blockiereNeustart() : null
    return () => {
      loesen.current?.()
      loesen.current = null
    }
  }, [aktiv])
}

export function hatNeustartBlocker(): boolean {
  return blocker.size > 0
}

export function useNeustartBlockerStand(): BlockerStand {
  return useSyncExternalStore(
    (melde) => {
      beobachter.add(melde)
      return () => beobachter.delete(melde)
    },
    () => stand,
    () => stand
  )
}
