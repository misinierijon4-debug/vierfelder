import { motion } from 'motion/react'
import type { KeyboardEvent } from 'react'
import type { AppTab } from '../lib/types'
import { STEMPEL } from '../lib/motion'

type Props = {
  aktiverTab: AppTab
  onTabWechsel: (tab: AppTab) => void
}

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: 'tracker', label: 'tracker' },
  { id: 'duell', label: 'duell' },
  { id: 'schlaf', label: 'schlaf' },
  { id: 'noten', label: 'noten' },
]

export const HAUPTBEREICH_PANEL_ID = 'hauptbereich-panel'

export function hauptbereichTabId(tab: AppTab) {
  return `hauptbereich-tab-${tab}`
}

export function TabLeiste({ aktiverTab, onTabWechsel }: Props) {
  const wechslePerTastatur = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let ziel: number | null = null
    if (event.key === 'ArrowRight') ziel = (index + 1) % TABS.length
    if (event.key === 'ArrowLeft') ziel = (index - 1 + TABS.length) % TABS.length
    if (event.key === 'Home') ziel = 0
    if (event.key === 'End') ziel = TABS.length - 1
    if (ziel === null) return

    event.preventDefault()
    const tab = TABS[ziel]!
    onTabWechsel(tab.id)
    document.getElementById(hauptbereichTabId(tab.id))?.focus()
  }

  return (
    <nav
      aria-label="hauptbereiche"
      role="tablist"
      aria-orientation="horizontal"
      className="relative mb-3 flex w-full rounded-[2px] border border-linie bg-flaeche p-1 max-[239px]:grid max-[239px]:grid-cols-2"
    >
      {TABS.map((tab, index) => {
        const istAktiv = aktiverTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={hauptbereichTabId(tab.id)}
            aria-controls={HAUPTBEREICH_PANEL_ID}
            aria-selected={istAktiv}
            tabIndex={istAktiv ? 0 : -1}
            onClick={() => onTabWechsel(tab.id)}
            onKeyDown={(event) => wechslePerTastatur(event, index)}
            className="relative min-h-11 flex-1 py-2 text-center text-[12px] font-semibold transition-colors duration-150"
            style={{
              color: istAktiv ? 'var(--kreide)' : 'var(--kreide-52)',
            }}
          >
            {istAktiv && (
              <motion.div
                layoutId="aktiverTabIndikator"
                transition={STEMPEL}
                className="absolute inset-0 rounded-[1px] bg-grund"
                style={{ border: '1px solid var(--linie-hell)' }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
