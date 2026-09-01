import { useEffect } from 'react'

/**
 * Solange ein Blatt offen ist, steht die Seite dahinter still. Der Zaehler
 * traegt die Sperre: zwei gleichzeitig offene Blaetter merken sich den
 * urspruenglichen Wert nur einmal, sonst schriebe das zweite `hidden` als
 * "vorher" weg und die Seite bliebe nach dem Schliessen fuer immer gesperrt.
 *
 * `overflow: hidden` allein haelt auf iOS nicht jede Wischgeste auf, deshalb
 * steht `overscroll-behavior: none` daneben — das Blatt selbst scrollt weiter,
 * nur die Kette nach draussen ist unterbrochen.
 */
let sperren = 0
let vorher: { overflow: string; overscroll: string } | null = null

function anziehen(): void {
  sperren += 1
  if (sperren > 1) return
  const wurzel = document.documentElement
  vorher = { overflow: wurzel.style.overflow, overscroll: wurzel.style.overscrollBehavior }
  wurzel.style.overflow = 'hidden'
  wurzel.style.overscrollBehavior = 'none'
}

function loesen(): void {
  sperren = Math.max(0, sperren - 1)
  if (sperren > 0 || !vorher) return
  const wurzel = document.documentElement
  wurzel.style.overflow = vorher.overflow
  wurzel.style.overscrollBehavior = vorher.overscroll
  vorher = null
}

/** sperrt sofort und gibt das aufraeumen zurueck */
export function scrollSperre(): () => void {
  anziehen()
  let offen = true
  return () => {
    if (!offen) return
    offen = false
    loesen()
  }
}

export function useScrollSperre(offen: boolean): void {
  useEffect(() => (offen ? scrollSperre() : undefined), [offen])
}
