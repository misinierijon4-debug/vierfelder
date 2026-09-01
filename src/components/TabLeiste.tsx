import { motion } from 'motion/react'
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

export function TabLeiste({ aktiverTab, onTabWechsel }: Props) {
  return (
    <nav
      aria-label="hauptbereiche"
      role="tablist"
      className="relative mb-3 flex w-full rounded-[2px] border border-linie bg-flaeche p-1"
    >
      {TABS.map((tab) => {
        const istAktiv = aktiverTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={istAktiv}
            onClick={() => onTabWechsel(tab.id)}
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
