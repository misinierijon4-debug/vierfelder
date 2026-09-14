/** PDF/OCR wird erst bei einem PDF geladen. Dokumentdaten bleiben beim Lesen lokal.
 * APIs: https://mozilla.github.io/pdf.js/examples/
 * https://github.com/naptha/tesseract.js/blob/v5.1.1/docs/api.md
 */
const PDF_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38'
const OCR_BASE = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist'
export const MAX_PDF_BYTE = 15 * 1024 * 1024
export const MAX_PDF_SEITEN = 20

type Seite = {
  getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>
  getViewport(options: { scale: number }): { width: number; height: number }
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): { promise: Promise<unknown> }
  cleanup(): void
}
type Pdf = { numPages: number; getPage(n: number): Promise<Seite> }
type Ocr = {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>
  terminate(): Promise<unknown>
}

export async function liesPdf(datei: File, fortschritt: (text: string) => void = () => {}): Promise<string> {
  if (datei.size > MAX_PDF_BYTE) throw new Error('PDF zu groß. Bis 15 MB gehen.')
  fortschritt('PDF wird geöffnet …')
  const adresse = PDF_BASE + '/legacy/build/pdf.min.mjs'
  const pdfjs = await import(/* @vite-ignore */ adresse)
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_BASE + '/legacy/build/pdf.worker.min.mjs'
  const task = pdfjs.getDocument({
    data: new Uint8Array(await datei.arrayBuffer()),
    isEvalSupported: false,
    cMapUrl: PDF_BASE + '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: PDF_BASE + '/standard_fonts/',
  })
  let ocr: Ocr | undefined
  try {
    const pdf: Pdf = await task.promise
    if (pdf.numPages > MAX_PDF_SEITEN) throw new Error('Bitte das PDF auf höchstens 20 Seiten aufteilen.')
    const teile: string[] = ['PDF-Textextraktion. Grafiken und Layout werden nicht übertragen. OCR kann Fehler enthalten.']
    let lesbar = false
    for (let nr = 1; nr <= pdf.numPages; nr++) {
      fortschritt('PDF: Seite ' + nr + ' von ' + pdf.numPages)
      const seite = await pdf.getPage(nr)
      try {
        const inhalt = await seite.getTextContent()
        let text = inhalt.items.map((item) => (item.str ?? '') + (item.hasEOL ? '\n' : ' ')).join('').trim()
        let erkannt = false
        if (text.length < 20) {
          fortschritt('Texterkennung: Seite ' + nr + ' von ' + pdf.numPages + ' …')
          if (!ocr) {
            const url = OCR_BASE + '/tesseract.esm.min.js'
            const modul = await import(/* @vite-ignore */ url)
            ocr = await modul.createWorker('deu+eng', 1, {
              workerPath: OCR_BASE + '/worker.min.js',
              corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
            }) as Ocr
          }
          const basis = seite.getViewport({ scale: 1 })
          const viewport = seite.getViewport({ scale: Math.min(2, 2000 / Math.max(basis.width, basis.height)) })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          try {
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('Die PDF-Seite konnte nicht vorbereitet werden.')
            await seite.render({ canvasContext: ctx, viewport }).promise
            const ergebnis = await ocr.recognize(canvas)
            if (ergebnis.data.text.trim().length > text.length) text = ergebnis.data.text.trim()
            erkannt = true
          } finally {
            canvas.width = canvas.height = 0
          }
        }
        if (text) lesbar = true
        teile.push('[Seite ' + nr + (erkannt ? ' · Texterkennung' : '') + ']\n' + (text || '[Kein lesbarer Text auf dieser Seite]'))
        // Der bestehende Server nimmt maximal 20.000 Zeichen pro Anhang an.
        if (teile.join('\n\n').length > 20_000) {
          if (nr < pdf.numPages) teile.push('[Weitere Seiten nicht übertragen]')
          break
        }
      } finally {
        seite.cleanup()
      }
    }
    if (!lesbar) throw new Error('Im PDF wurde kein lesbarer Text erkannt. Bitte die betreffenden Seiten als Bilder senden.')
    return teile.join('\n\n')
  } catch (fehler) {
    if (fehler instanceof Error && fehler.name === 'PasswordException') {
      throw new Error('Das PDF ist passwortgeschützt. Bitte eine entsperrte Kopie senden.')
    }
    throw fehler
  } finally {
    await Promise.allSettled([task.destroy(), ocr?.terminate()])
  }
}
