/**
 * Formeln in ENIs Antworten: ein kleiner Übersetzer von LaTeX nach MathML.
 *
 * Warum kein KaTeX: das brächte rund 75 KiB gzip Skript plus Schriften, und
 * das Gesamtbudget des Bündels hat kaum ein KiB Luft. MathML zeichnet jeder
 * aktuelle Browser selbst (Safari seit jeher, Chrome seit 109), mit der
 * Systemschrift und ohne ein einziges zusätzliches Byte an Schriften.
 *
 * Verstanden wird, was im Schulstoff vorkommt: Brüche, Wurzeln, Hoch- und
 * Tiefstellung, griechische Buchstaben, die üblichen Operatoren und Pfeile,
 * Summen, Integrale, Grenzwerte, Vektoren, Text in Formeln. Was der Übersetzer
 * nicht kennt, macht die ganze Formel ungültig (`null`): dann steht sie als
 * Quelltext da. Eine halb richtige Formel wäre schlimmer als eine rohe, weil
 * man ihr den Fehler nicht ansieht.
 */

export type MathKnoten = {
  tag: string
  attribute?: Record<string, string>
  kinder: Array<MathKnoten | string>
}

/** griechische buchstaben und ihre zeichen */
const GRIECHISCH: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ',
  sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}

/** operatoren, relationen, pfeile und sonstige zeichen */
const ZEICHEN: Record<string, string> = {
  cdot: '⋅', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈',
  equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐',
  leftrightarrow: '↔', Leftrightarrow: '⇔', implies: '⇒', iff: '⇔',
  mapsto: '↦', uparrow: '↑', downarrow: '↓',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆', supset: '⊃',
  supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖', emptyset: '∅',
  varnothing: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨',
  wedge: '∧', vee: '∨', partial: '∂', nabla: '∇', infty: '∞',
  cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮', circ: '∘', bullet: '∙',
  perp: '⊥', parallel: '∥', angle: '∠', triangle: '△', mid: '∣',
  degree: '°', prime: '′', hbar: 'ℏ', ell: 'ℓ',
}

/** grosse operatoren: grenzen stehen im abgesetzten satz darueber und darunter */
const GROSS: Record<string, string> = {
  sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', bigcup: '⋃', bigcap: '⋂',
}

/** funktionsnamen, aufrecht gesetzt */
const FUNKTIONEN = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min',
  'sup', 'inf', 'det', 'deg', 'gcd', 'ggT', 'kgV',
])

/** akzente ueber einem zeichen */
const AKZENTE: Record<string, string> = {
  vec: '→', overrightarrow: '→', bar: '¯', overline: '¯', hat: '^',
  widehat: '^', tilde: '~', widetilde: '~', dot: '˙', ddot: '¨',
}

/** doppelstrich-buchstaben der zahlbereiche */
const DOPPELSTRICH: Record<string, string> = { N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ', P: 'ℙ' }

/** abstaende. werden zu leerraum, nicht zu zeichen */
const ABSTAENDE: Record<string, string> = { ',': '0.17em', ':': '0.22em', ';': '0.28em', ' ': '0.25em', quad: '1em', qquad: '2em' }

type Token =
  | { art: 'befehl'; name: string }
  | { art: 'auf' }
  | { art: 'zu' }
  | { art: 'hoch' }
  | { art: 'tief' }
  | { art: 'zahl'; wert: string }
  | { art: 'buchstabe'; wert: string }
  | { art: 'zeichen'; wert: string }

class Ungueltig extends Error {}

function zerlege(quelle: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < quelle.length) {
    const c = quelle[i]!
    if (/\s/.test(c)) { i += 1; continue }
    if (c === '\\') {
      const rest = quelle.slice(i + 1)
      const wort = /^[A-Za-z]+/.exec(rest)
      if (wort) {
        tokens.push({ art: 'befehl', name: wort[0] })
        i += 1 + wort[0].length
      } else if (rest.length > 0) {
        tokens.push({ art: 'befehl', name: rest[0]! })
        i += 2
      } else {
        throw new Ungueltig('einzelner backslash')
      }
      continue
    }
    if (c === '{') { tokens.push({ art: 'auf' }); i += 1; continue }
    if (c === '}') { tokens.push({ art: 'zu' }); i += 1; continue }
    if (c === '^') { tokens.push({ art: 'hoch' }); i += 1; continue }
    if (c === '_') { tokens.push({ art: 'tief' }); i += 1; continue }
    const zahl = /^\d+(?:[.,]\d+)?/.exec(quelle.slice(i))
    if (zahl) { tokens.push({ art: 'zahl', wert: zahl[0] }); i += zahl[0].length; continue }
    if (/\p{L}/u.test(c)) { tokens.push({ art: 'buchstabe', wert: c }); i += 1; continue }
    if (c === '$') throw new Ungueltig('dollar in der formel')
    tokens.push({ art: 'zeichen', wert: c })
    i += 1
  }
  return tokens
}

const k = (tag: string, kinder: Array<MathKnoten | string>, attribute?: Record<string, string>): MathKnoten =>
  attribute ? { tag, attribute, kinder } : { tag, kinder }
const mo = (zeichen: string, attribute?: Record<string, string>) => k('mo', [zeichen], attribute)
const mi = (zeichen: string, attribute?: Record<string, string>) => k('mi', [zeichen], attribute)
const zeile = (kinder: MathKnoten[]): MathKnoten => (kinder.length === 1 ? kinder[0]! : k('mrow', kinder))

class Leser {
  private pos = 0
  constructor(private readonly tokens: Token[], private readonly abgesetzt: boolean) {}

  fertig() {
    return this.pos >= this.tokens.length
  }

  private sieh(): Token | undefined {
    return this.tokens[this.pos]
  }

  private nimm(): Token {
    const t = this.tokens[this.pos]
    if (!t) throw new Ungueltig('formel endet zu frueh')
    this.pos += 1
    return t
  }

  /** eine folge bis zum ende oder bis zur schliessenden klammer */
  folge(bisKlammer: boolean): MathKnoten[] {
    const knoten: MathKnoten[] = []
    for (;;) {
      const t = this.sieh()
      if (!t) {
        if (bisKlammer) throw new Ungueltig('klammer nicht geschlossen')
        return knoten
      }
      if (t.art === 'zu') {
        if (!bisKlammer) throw new Ungueltig('klammer zu viel')
        this.pos += 1
        return knoten
      }
      const atom = this.atom()
      if (atom) knoten.push(this.skripte(atom))
    }
  }

  /** ein argument: eine gruppe in klammern oder ein einzelnes zeichen */
  argument(): MathKnoten {
    const t = this.sieh()
    if (t?.art === 'auf') {
      this.pos += 1
      return zeile(this.folge(true))
    }
    const atom = this.atom()
    if (!atom) throw new Ungueltig('argument fehlt')
    return atom
  }

  /** text in \text{...}: roh bis zur schliessenden klammer */
  private rohText(): string {
    if (this.nimm().art !== 'auf') throw new Ungueltig('text ohne klammer')
    let tiefe = 1
    let text = ''
    for (;;) {
      const t = this.nimm()
      if (t.art === 'auf') { tiefe += 1; text += '{'; continue }
      if (t.art === 'zu') {
        tiefe -= 1
        if (tiefe === 0) return text
        text += '}'
        continue
      }
      if (t.art === 'befehl') text += t.name.length === 1 ? t.name : ' '
      else if (t.art === 'hoch') text += '^'
      else if (t.art === 'tief') text += '_'
      else text += t.wert
    }
  }

  private skripte(basis: MathKnoten): MathKnoten {
    let hoch: MathKnoten | null = null
    let tief: MathKnoten | null = null
    for (;;) {
      const t = this.sieh()
      if (t?.art === 'hoch' && !hoch) { this.pos += 1; hoch = this.argument(); continue }
      if (t?.art === 'tief' && !tief) { this.pos += 1; tief = this.argument(); continue }
      if (t?.art === 'zeichen' && t.wert === "'" && !hoch) { this.pos += 1; hoch = mo('′'); continue }
      break
    }
    if (!hoch && !tief) return basis
    const untenOben = this.abgesetzt && basis.attribute?.['data-gross'] === 'ja'
    if (hoch && tief) return k(untenOben ? 'munderover' : 'msubsup', [basis, tief, hoch])
    if (hoch) return k(untenOben ? 'mover' : 'msup', [basis, hoch])
    return k(untenOben ? 'munder' : 'msub', [basis, tief!])
  }

  private atom(): MathKnoten | null {
    const t = this.nimm()
    switch (t.art) {
      case 'zahl':
        return k('mn', [t.wert])
      case 'buchstabe':
        return mi(t.wert)
      case 'auf':
        return zeile(this.folge(true))
      case 'zu':
        throw new Ungueltig('klammer zu viel')
      case 'hoch':
      case 'tief':
        // hoch- oder tiefstellung ohne basis, etwa ^{2} am anfang: das token
        // gehoert zu den skripten, also zurueck damit
        this.pos -= 1
        return this.skripte(k('mrow', []))
      case 'zeichen':
        return mo(t.wert === '*' ? '∗' : t.wert === '-' ? '−' : t.wert)
      case 'befehl':
        return this.befehl(t.name)
    }
  }

  private befehl(name: string): MathKnoten | null {
    if (name in GRIECHISCH) return mi(GRIECHISCH[name]!)
    if (name in ZEICHEN) return mo(ZEICHEN[name]!)
    if (name in GROSS) {
      const zeichen = GROSS[name]!
      const attribute: Record<string, string> = { 'data-gross': name.includes('int') ? 'nein' : 'ja' }
      if (this.abgesetzt) attribute.largeop = 'true'
      return mo(zeichen, attribute)
    }
    if (FUNKTIONEN.has(name)) {
      return name === 'lim' || name === 'max' || name === 'min' || name === 'sup' || name === 'inf'
        ? mi(name, { mathvariant: 'normal', 'data-gross': 'ja' })
        : mi(name, { mathvariant: 'normal' })
    }
    if (name in AKZENTE) return k('mover', [this.argument(), mo(AKZENTE[name]!)], { accent: 'true' })
    if (name in ABSTAENDE) return k('mspace', [], { width: ABSTAENDE[name]! })
    switch (name) {
      case 'frac':
      case 'dfrac':
      case 'tfrac':
        return k('mfrac', [this.argument(), this.argument()])
      case 'sqrt': {
        if (this.sieh()?.art === 'zeichen' && (this.sieh() as { wert: string }).wert === '[') {
          this.pos += 1
          const index: MathKnoten[] = []
          for (;;) {
            const t = this.sieh()
            if (!t) throw new Ungueltig('wurzelindex offen')
            if (t.art === 'zeichen' && t.wert === ']') { this.pos += 1; break }
            const atom = this.atom()
            if (atom) index.push(atom)
          }
          const radikand = this.argument()
          return k('mroot', [radikand, zeile(index)])
        }
        return k('msqrt', [this.argument()])
      }
      case 'text':
      case 'textrm':
      case 'mbox':
      case 'textit':
      case 'textbf':
        return k('mtext', [this.rohText()])
      case 'mathrm':
      case 'operatorname':
        return mi(this.rohText(), { mathvariant: 'normal' })
      case 'mathbf':
      case 'boldsymbol':
        return k('mstyle', [this.argument()], { mathvariant: 'bold' })
      case 'mathbb': {
        const text = this.rohText()
        return mi([...text].map((b) => DOPPELSTRICH[b] ?? b).join(''))
      }
      case 'left':
      case 'right':
      case 'big':
      case 'Big':
      case 'bigl':
      case 'bigr':
      case 'Bigl':
      case 'Bigr': {
        // die klammer danach zaehlt, die groesse regelt der browser selbst
        const t = this.nimm()
        if (t.art === 'zeichen') return t.wert === '.' ? null : mo(t.wert)
        if (t.art === 'befehl' && (t.name === '{' || t.name === '}' || t.name === '|')) return mo(t.name)
        if (t.art === 'befehl' && t.name in ZEICHEN) return mo(ZEICHEN[t.name]!)
        if (t.art === 'befehl' && (t.name === 'langle' || t.name === 'rangle')) return mo(t.name === 'langle' ? '⟨' : '⟩')
        throw new Ungueltig('unbekannte klammer')
      }
      case 'langle':
        return mo('⟨')
      case 'rangle':
        return mo('⟩')
      case '{':
      case '}':
      case '%':
      case '#':
      case '&':
      case '_':
      case '|':
        return mo(name)
      case '!':
        return null
      case '\\':
        return k('mspace', [], { width: '1em' })
      default:
        throw new Ungueltig(`unbekannter befehl ${name}`)
    }
  }
}

/**
 * LaTeX in einen MathML-Baum. `null`, wenn die Formel etwas enthaelt, das
 * hier nicht verstanden wird — dann soll sie roh dastehen.
 */
export function formelZuMathml(quelle: string, abgesetzt = false): MathKnoten | null {
  const text = quelle.trim()
  if (!text || text.length > 2000) return null
  try {
    const leser = new Leser(zerlege(text), abgesetzt)
    const kinder = leser.folge(false)
    if (!leser.fertig()) return null
    return k('math', [zeile(kinder.length ? kinder : [k('mrow', [])])], abgesetzt ? { display: 'block' } : undefined)
  } catch (fehler) {
    if (fehler instanceof Ungueltig) return null
    throw fehler
  }
}

/**
 * Wo im fliesstext eine formel steht: `$…$` oder `\(…\)`.
 *
 * Fuer `$` gelten die Regeln von Pandoc, damit Geldbetraege Text bleiben:
 * direkt nach dem oeffnenden `$` steht kein Leerzeichen, direkt vor dem
 * schliessenden auch nicht, und nach ihm folgt keine Ziffer. „5$ und 10$“
 * bleibt also stehen, wie es ist.
 */
export const INLINE_FORMEL_MUSTER = /(?<![\\$\w])\$(?=\S)([^$\n]*?\S)\$(?![\d$])|\\\((.+?)\\\)/g

/** abgesetzte formel, die eine ganze zeile einnimmt: `$$…$$` oder `\[…\]` */
export const ABGESETZT_AUF = /^\s*(\$\$|\\\[)/
export const ABGESETZT_ZU = /(\$\$|\\\])\s*$/

/**
 * Sieht der Inhalt zwischen zwei `$` eher nach Satz als nach Formel aus?
 * Ein Wort aus vier oder mehr Buchstaben, das kein Befehl ist und nicht in
 * `\text{…}` steht, kommt in Schulformeln so gut wie nie vor — in „5 $ und
 * dann 10$“ aber sofort.
 */
export function siehtAusWieText(inhalt: string): boolean {
  const ohneText = inhalt.replace(/\\(?:text|textrm|mbox|textit|textbf|mathrm|operatorname|mathbb)\s*\{[^{}]*\}/g, ' ')
  return /(?:^|[^\\A-Za-zÄÖÜäöüß])[A-Za-zÄÖÜäöüß]{4,}/.test(ohneText)
}

export type InlineTeil = { art: 'text'; text: string } | { art: 'formel'; quelle: string; roh: string }

/** fliesstext in text und formeln zerlegen */
export function zerlegeInline(text: string): InlineTeil[] {
  const teile: InlineTeil[] = []
  let rest = 0
  for (const treffer of text.matchAll(new RegExp(INLINE_FORMEL_MUSTER.source, 'g'))) {
    const quelle = treffer[1] ?? treffer[2] ?? ''
    // `$…$` mit Satzinhalt bleibt Text; `\(…\)` meint immer eine Formel
    if (treffer[1] !== undefined && siehtAusWieText(quelle)) continue
    if (treffer.index! > rest) teile.push({ art: 'text', text: text.slice(rest, treffer.index) })
    teile.push({ art: 'formel', quelle, roh: treffer[0] })
    rest = treffer.index! + treffer[0].length
  }
  if (rest < text.length) teile.push({ art: 'text', text: text.slice(rest) })
  return teile
}
