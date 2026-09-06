/** @vitest-environment jsdom */

import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppTab } from '../lib/types'
import {
  HAUPTBEREICH_PANEL_ID,
  hauptbereichTabId,
  TabLeiste,
} from './TabLeiste'

afterEach(cleanup)

function TestLeiste() {
  const [aktiv, setAktiv] = useState<AppTab>('tracker')
  return <TabLeiste aktiverTab={aktiv} onTabWechsel={setAktiv} />
}

describe('hauptbereich-tabs', () => {
  it('verknuepft alle tabs mit genau einem panel und nur der aktive ist im tablauf', () => {
    render(<TestLeiste />)
    const tabs = screen.getAllByRole('tab')

    expect(tabs).toHaveLength(4)
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([
      screen.getByRole('tab', { name: 'tracker' }),
    ])
    for (const tab of tabs) expect(tab.getAttribute('aria-controls')).toBe(HAUPTBEREICH_PANEL_ID)
    expect(screen.getByRole('tab', { name: 'tracker' }).id).toBe(hauptbereichTabId('tracker'))
  })

  it('aktiviert und fokussiert mit pfeilen sowie home und end', async () => {
    const user = userEvent.setup()
    render(<TestLeiste />)
    const tracker = screen.getByRole('tab', { name: 'tracker' })
    tracker.focus()

    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'duell' }))
    expect(screen.getByRole('tab', { name: 'duell' }).getAttribute('aria-selected')).toBe('true')

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'noten' }))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tracker)
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'noten' }))
    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(tracker)
  })

  it('laesst sich weiterhin direkt anklicken', async () => {
    const user = userEvent.setup()
    render(<TestLeiste />)

    await user.click(screen.getByRole('tab', { name: 'schlaf' }))
    expect(screen.getByRole('tab', { name: 'schlaf' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'schlaf' }).tabIndex).toBe(0)
  })
})
