/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /**
   * oeffentlicher VAPID-schluessel, base64url. nur er gehoert in den browser —
   * der private bleibt als geheimnis der edge function.
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Zeitpunkt des Baus, von `vite.config.ts` eingesetzt.
 *
 * Steht klein in der Fusszeile. Der Grund ist eine verlorene Stunde: eine
 * Fehlermeldung aus der App liess sich nicht deuten, weil niemand sagen
 * konnte, ob das Telefon ueberhaupt die neue Fassung ausfuehrt — ein
 * Homescreen-PWA haelt seinen Service Worker hartnaeckig. Mit der Bauzeit im
 * Bild ist das eine Frage von einem Blick.
 */
declare const __BAUZEIT__: string
