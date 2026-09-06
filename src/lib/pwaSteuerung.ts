export const PWA_NACHSEHEN_MS = 60 * 60 * 1000
export const PWA_EREIGNIS_DROSSEL_MS = 60 * 1000
export const PWA_AKTIVIERUNG_FRIST_MS = 15 * 1000

export type PwaUpdateStand = 'keins' | 'bereit' | 'aktivierung' | 'neu-laden'

export type PwaStand = Readonly<{
  online: boolean
  offlineBereit: boolean
  update: PwaUpdateStand
  fehler: string | null
  pruefbar: boolean
}>

export type PwaRegisterOptionen = {
  immediate?: boolean
  onNeedReload?: () => void
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegisteredSW?: (
    pfad: string,
    registrierung: ServiceWorkerRegistration | undefined
  ) => void
  onRegisterError?: (fehler: unknown) => void
}

export type PwaRegistrieren = (
  optionen: PwaRegisterOptionen
) => (reloadPage?: boolean) => Promise<void>

export type PwaUmgebung = {
  online(): boolean
  sichtbar(): boolean
  jetzt(): number
  beiFenster(art: 'online' | 'offline', fn: () => void): void
  ohneFenster(art: 'online' | 'offline', fn: () => void): void
  beiDokument(art: 'visibilitychange', fn: () => void): void
  ohneDokument(art: 'visibilitychange', fn: () => void): void
  setzeIntervall(fn: () => void, ms: number): number
  loescheIntervall(id: number): void
  setzeTimer(fn: () => void, ms: number): number
  loescheTimer(id: number): void
  neuLaden(): void
}

const START: PwaStand = Object.freeze({
  online: true,
  offlineBereit: false,
  update: 'keins',
  fehler: null,
  pruefbar: false,
})

/**
 * Kleine, frameworkfreie Zustandsmaschine um die von vite-plugin-pwa
 * gelieferten Ereignisse. Sie lädt niemals selbst neu.
 */
export class PwaSteuerung {
  private stand: PwaStand
  private readonly beobachter = new Set<() => void>()
  private registrierung: ServiceWorkerRegistration | null = null
  private updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null
  private intervall: number | null = null
  private offlineTimer: number | null = null
  private aktivierungsTimer: number | null = null
  private letztePruefung = Number.NEGATIVE_INFINITY
  private gestartet = false
  private zerstoert = false

  constructor(
    private readonly umgebung: PwaUmgebung,
    private readonly istBlockiert: () => boolean
  ) {
    this.stand = Object.freeze({ ...START, online: umgebung.online() })
  }

  readonly snapshot = () => this.stand

  readonly abonnieren = (melde: () => void) => {
    this.beobachter.add(melde)
    return () => this.beobachter.delete(melde)
  }

  registriere(registrieren: PwaRegistrieren) {
    if (this.gestartet || this.zerstoert) return
    this.gestartet = true
    this.umgebung.beiFenster('online', this.wurdeOnline)
    this.umgebung.beiFenster('offline', this.wurdeOffline)
    this.umgebung.beiDokument('visibilitychange', this.wurdeSichtbar)

    this.updateSW = registrieren({
      immediate: true,
      onNeedRefresh: () => {
        this.beendeAktivierungsfrist()
        this.aendere({ update: 'bereit', fehler: null })
      },
      // Auch wenn ein anderer Tab den Worker aktiviert, bleibt dieser Tab mit
      // seinem Entwurf stehen. Neu geladen wird ausschließlich über `neuLaden`.
      onNeedReload: () => {
        this.beendeAktivierungsfrist()
        this.aendere({ update: 'neu-laden', fehler: null })
      },
      onOfflineReady: () => this.meldeOfflineBereit(),
      onRegisteredSW: (_pfad, registrierung) => {
        if (this.zerstoert) return
        this.registrierung = registrierung ?? null
        this.aendere({ pruefbar: registrierung !== undefined, fehler: null })
        this.letztePruefung = this.umgebung.jetzt()
        if (registrierung && this.intervall === null) {
          this.intervall = this.umgebung.setzeIntervall(
            () => void this.pruefeUpdate(),
            PWA_NACHSEHEN_MS
          )
        }
      },
      onRegisterError: () => {
        this.aendere({ fehler: 'aktualisierung konnte nicht eingerichtet werden.' })
      },
    })
  }

  async aktiviereUpdate(): Promise<boolean> {
    if (this.zerstoert || this.stand.update !== 'bereit' || !this.updateSW || this.istBlockiert()) return false
    this.aendere({ update: 'aktivierung', fehler: null })
    this.beendeAktivierungsfrist()
    this.aktivierungsTimer = this.umgebung.setzeTimer(() => {
      this.aktivierungsTimer = null
      if (this.stand.update !== 'aktivierung') return
      // Kein automatischer Reload: Ist controllerchange in einem Mehrtab-
      // Rennen ausgeblieben, bleibt wenigstens ein expliziter Ausweg sichtbar.
      this.aendere({
        update: 'neu-laden',
        fehler: 'aktivierung konnte nicht bestätigt werden.',
      })
    }, PWA_AKTIVIERUNG_FRIST_MS)
    try {
      // Bei `registerType: prompt` sendet dies SKIP_WAITING. Das Argument darf
      // keine Reload-Semantik tragen; onNeedReload fängt die Übernahme ab.
      await this.updateSW(false)
      return true
    } catch {
      this.beendeAktivierungsfrist()
      if (this.snapshot().update === 'aktivierung') {
        this.aendere({ update: 'bereit', fehler: 'aktualisierung konnte nicht aktiviert werden.' })
      }
      return false
    }
  }

  neuLaden(): boolean {
    if (this.istBlockiert()) return false
    this.umgebung.neuLaden()
    return true
  }

  async pruefeUpdate(erzwungen = false): Promise<boolean> {
    if (this.zerstoert || !this.registrierung || !this.stand.online || !this.umgebung.sichtbar()) return false
    const jetzt = this.umgebung.jetzt()
    if (!erzwungen && jetzt - this.letztePruefung < PWA_EREIGNIS_DROSSEL_MS) return false
    this.letztePruefung = jetzt
    try {
      await this.registrierung.update()
      this.aendere({ fehler: null })
      return true
    } catch {
      this.aendere({ fehler: 'aktualisierung konnte nicht geprüft werden.' })
      return false
    }
  }

  zerstoere() {
    if (this.zerstoert) return
    this.zerstoert = true
    this.umgebung.ohneFenster('online', this.wurdeOnline)
    this.umgebung.ohneFenster('offline', this.wurdeOffline)
    this.umgebung.ohneDokument('visibilitychange', this.wurdeSichtbar)
    if (this.intervall !== null) this.umgebung.loescheIntervall(this.intervall)
    if (this.offlineTimer !== null) this.umgebung.loescheTimer(this.offlineTimer)
    this.beendeAktivierungsfrist()
    this.intervall = null
    this.offlineTimer = null
    this.registrierung = null
    this.updateSW = null
    this.beobachter.clear()
  }

  private readonly wurdeOnline = () => {
    this.aendere({ online: true })
    void this.pruefeUpdate()
  }

  private readonly wurdeOffline = () => this.aendere({ online: false })

  private readonly wurdeSichtbar = () => {
    if (this.umgebung.sichtbar()) void this.pruefeUpdate()
  }

  private meldeOfflineBereit() {
    if (this.zerstoert) return
    this.aendere({ offlineBereit: true })
    if (this.offlineTimer !== null) this.umgebung.loescheTimer(this.offlineTimer)
    this.offlineTimer = this.umgebung.setzeTimer(() => {
      this.offlineTimer = null
      this.aendere({ offlineBereit: false })
    }, 8000)
  }

  private beendeAktivierungsfrist() {
    if (this.aktivierungsTimer === null) return
    this.umgebung.loescheTimer(this.aktivierungsTimer)
    this.aktivierungsTimer = null
  }

  private aendere(teil: Partial<PwaStand>) {
    // Die Registrierungsbibliothek darf Callbacks noch liefern, nachdem React
    // die Steuerung abgebaut hat. Danach entstehen weder Timer noch UI-Updates.
    if (this.zerstoert) return
    const next = Object.freeze({ ...this.stand, ...teil })
    if (
      next.online === this.stand.online &&
      next.offlineBereit === this.stand.offlineBereit &&
      next.update === this.stand.update &&
      next.fehler === this.stand.fehler &&
      next.pruefbar === this.stand.pruefbar
    ) return
    this.stand = next
    for (const melde of this.beobachter) melde()
  }
}
