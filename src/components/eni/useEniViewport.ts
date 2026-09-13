import { useLayoutEffect, useRef } from 'react'
import { scrollSperre } from '../../lib/scrollsperre'

/** iOS verkleinert bei der Tastatur den VisualViewport, nicht zuverlässig dvh. */
export function useEniViewport() {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const shell = ref.current
    if (!shell) return
    const viewport = window.visualViewport
    const releaseScroll = scrollSperre()
    let frame = 0
    const update = () => {
      // Pinch-Zoom bleibt dem Browser überlassen.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
      const scroller = shell.querySelector<HTMLElement>('.overflow-y-auto')
      const atBottom = scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120
      shell.style.height = `${viewport?.height ?? window.innerHeight}px`
      shell.style.top = `${viewport?.offsetTop ?? 0}px`
      if (atBottom && scroller) scroller.scrollTop = scroller.scrollHeight
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      releaseScroll()
    }
  }, [])

  return ref
}
