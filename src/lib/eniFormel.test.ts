import { describe, expect, it } from 'vitest'
import { formelZuMathml, siehtAusWieText, zerlegeInline, type MathKnoten } from './eniFormel'

/** der baum als kurzer text, damit die erwartung lesbar bleibt */
function kurz(knoten: MathKnoten | string | null): string {
  if (knoten === null) return 'null'
  if (typeof knoten === 'string') return knoten
  return `${knoten.tag}(${knoten.kinder.map(kurz).join(',')})`
}

describe('LaTeX nach MathML', () => {
  it('setzt brueche, potenzen und indizes', () => {
    expect(kurz(formelZuMathml('\\frac{a}{b}'))).toBe('math(mfrac(mi(a),mi(b)))')
    expect(kurz(formelZuMathml('x^2'))).toBe('math(msup(mi(x),mn(2)))')
    expect(kurz(formelZuMathml('a_{n+1}'))).toBe('math(msub(mi(a),mrow(mi(n),mo(+),mn(1))))')
    expect(kurz(formelZuMathml('x_1^2'))).toBe('math(msubsup(mi(x),mn(1),mn(2)))')
  })

  it('kennt wurzeln mit und ohne index', () => {
    expect(kurz(formelZuMathml('\\sqrt{2}'))).toBe('math(msqrt(mn(2)))')
    expect(kurz(formelZuMathml('\\sqrt[3]{8}'))).toBe('math(mroot(mn(8),mn(3)))')
  })

  it('schreibt griechische buchstaben, operatoren und funktionen', () => {
    expect(kurz(formelZuMathml('\\alpha \\cdot \\pi \\le \\infty'))).toBe('math(mrow(mi(α),mo(⋅),mi(π),mo(≤),mo(∞)))')
    const sinus = formelZuMathml('\\sin x')!
    const erster = (sinus.kinder[0] as MathKnoten).kinder[0] as MathKnoten
    expect(erster).toMatchObject({ tag: 'mi', attribute: { mathvariant: 'normal' }, kinder: ['sin'] })
  })

  it('setzt grenzen im abgesetzten satz unter und ueber das summenzeichen', () => {
    expect(kurz(formelZuMathml('\\sum_{i=1}^{n} i', true))).toBe(
      'math(mrow(munderover(mo(∑),mrow(mi(i),mo(=),mn(1)),mi(n)),mi(i)))'
    )
    expect(kurz(formelZuMathml('\\sum_{i=1}^{n} i'))).toBe(
      'math(mrow(msubsup(mo(∑),mrow(mi(i),mo(=),mn(1)),mi(n)),mi(i)))'
    )
    expect(formelZuMathml('x', true)!.attribute).toEqual({ display: 'block' })
  })

  it('versteht text, vektoren, zahlbereiche und klammern mit left und right', () => {
    expect(kurz(formelZuMathml('\\vec{v}'))).toBe('math(mover(mi(v),mo(→)))')
    expect(kurz(formelZuMathml('E_{\\text{kin}}'))).toBe('math(msub(mi(E),mtext(kin)))')
    expect(kurz(formelZuMathml('x \\in \\mathbb{R}'))).toBe('math(mrow(mi(x),mo(∈),mi(ℝ)))')
    expect(kurz(formelZuMathml('\\left( \\frac{1}{2} \\right)^2'))).toBe(
      'math(mrow(mo((),mfrac(mn(1),mn(2)),msup(mo()),mn(2))))'
    )
  })

  it('schreibt minus als echtes minuszeichen und kommazahlen als eine zahl', () => {
    expect(kurz(formelZuMathml('-1,5'))).toBe('math(mrow(mo(−),mn(1,5)))')
  })

  it('gibt bei unbekanntem oder kaputtem null zurueck, statt halb richtig zu zeichnen', () => {
    expect(formelZuMathml('\\unbekannt{x}')).toBeNull()
    expect(formelZuMathml('\\frac{a}{b')).toBeNull()
    expect(formelZuMathml('a}')).toBeNull()
    expect(formelZuMathml('')).toBeNull()
  })
})

describe('formeln im fliesstext finden', () => {
  it('findet $…$ und \\(…\\)', () => {
    expect(zerlegeInline('Die Fläche ist $A = \\pi r^2$ bei Radius $r$.')).toEqual([
      { art: 'text', text: 'Die Fläche ist ' },
      { art: 'formel', quelle: 'A = \\pi r^2', roh: '$A = \\pi r^2$' },
      { art: 'text', text: ' bei Radius ' },
      { art: 'formel', quelle: 'r', roh: '$r$' },
      { art: 'text', text: '.' },
    ])
    expect(zerlegeInline('also \\(x^2\\) gilt')).toEqual([
      { art: 'text', text: 'also ' },
      { art: 'formel', quelle: 'x^2', roh: '\\(x^2\\)' },
      { art: 'text', text: ' gilt' },
    ])
  })

  it('laesst geldbetraege und saetze zwischen dollarzeichen als text stehen', () => {
    expect(zerlegeInline('kostet 5 $ und 10 $')).toEqual([{ art: 'text', text: 'kostet 5 $ und 10 $' }])
    expect(zerlegeInline('erst 5$, dann 10$ mehr')).toEqual([{ art: 'text', text: 'erst 5$, dann 10$ mehr' }])
    expect(siehtAusWieText('E = mgh')).toBe(false)
    expect(siehtAusWieText('\\frac{\\text{Masse}}{V}')).toBe(false)
    expect(siehtAusWieText(', dann 10')).toBe(true)
  })
})
