import { CaretRight } from '@phosphor-icons/react'
import { EniMarke } from './EniMarke'

type Props = {
  onOeffnen: () => void
}

/**
 * der weg zu ENI, aus der anzeigetafel heraus. bewusst kein sechster tab:
 * die tabs schalten zwischen ansichten derselben sache um, dieser knopf führt
 * aus der app heraus in eine andere. deshalb sieht er aus wie ein symbol auf
 * einem homescreen und nicht wie eine reiterlasche.
 */
export function EniTuer({ onOeffnen }: Props) {
  return (
    <button
      type="button"
      onClick={onOeffnen}
      aria-label="ENI öffnen"
      className="flex min-h-11 items-center gap-2 rounded-[2px] border border-kontroll-rand bg-flaeche pr-2 pl-2.5"
    >
      <EniMarke groesse={18} />
      <span className="display text-[12px] font-bold leading-none tracking-[0.08em]">ENI</span>
      <CaretRight size={11} weight="bold" aria-hidden="true" className="text-kreide-52" />
    </button>
  )
}
