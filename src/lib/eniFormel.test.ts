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
    // leerzeichen im text bleiben, am rand geschuetzt
    expect(kurz(formelZuMathml('a \\text{ und } b'))).toBe('math(mrow(mi(a),mtext(\u00A0und\u00A0),mi(b)))')
    expect(kurz(formelZuMathml('\\text{Kosten in \\%}'))).toBe('math(mtext(Kosten in %))')
    expect(kurz(formelZuMathml('x \\in \\mathbb{R}'))).toBe('math(mrow(mi(x),mo(∈),mi(ℝ)))')
    expect(kurz(formelZuMathml('\\left( \\frac{1}{2} \\right)^2'))).toBe(
      'math(mrow(mo((),mfrac(mn(1),mn(2)),msup(mo()),mn(2))))'
    )
  })

  it('schreibt minus als echtes minuszeichen und kommazahlen als eine zahl', () => {
    expect(kurz(formelZuMathml('-1,5'))).toBe('math(mrow(mo(−),mn(1,5)))')
  })

  it('setzt binomialkoeffizienten als bruch ohne strich in klammern', () => {
    const n = formelZuMathml('\\binom{n}{k}')!
    expect(kurz(n)).toBe('math(mrow(mo((),mfrac(mi(n),mi(k)),mo())))')
    const bruch = (n.kinder[0] as MathKnoten).kinder[1] as MathKnoten
    expect(bruch.attribute).toEqual({ linethickness: '0' })
    expect(kurz(formelZuMathml('\\tbinom{3}{1}'))).toBe('math(mrow(mo((),mfrac(mn(3),mn(1)),mo())))')
  })

  it('versteht die formeln aus einer antwort zum binomischen lehrsatz', () => {
    // so kamen sie in einer echten antwort an und standen als quelltext da
    for (const quelle of [
      '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k}\\, a^{\\,n-k}\\, b^{k}',
      '\\binom{n}{k} = \\frac{n!}{k!\\,(n-k)!}',
      '\\binom{3}{0}=1,\\quad \\binom{3}{1}=3,\\quad \\binom{3}{2}=3,\\quad \\binom{3}{3}=1',
      '(a+b)^3 = a^3 + 3a^2b + 3ab^2 + b^3',
    ]) {
      expect(formelZuMathml(quelle, true), quelle).not.toBeNull()
    }
  })

  it('setzt vektoren und matrizen als tabelle in klammern', () => {
    expect(kurz(formelZuMathml('\\begin{pmatrix} 1 \\\\ -2 \\\\ 3 \\end{pmatrix}'))).toBe(
      'math(mrow(mo((),mtable(mtr(mtd(mn(1))),mtr(mtd(mrow(mo(−),mn(2)))),mtr(mtd(mn(3)))),mo())))'
    )
    expect(kurz(formelZuMathml('\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}'))).toBe(
      'math(mrow(mo(|),mtable(mtr(mtd(mi(a)),mtd(mi(b))),mtr(mtd(mi(c)),mtd(mi(d)))),mo(|)))'
    )
    // ein \\ vor \end laesst keine leere zeile stehen
    expect(kurz(formelZuMathml('\\begin{matrix} x \\\\ y \\\\ \\end{matrix}'))).toBe(
      'math(mtable(mtr(mtd(mi(x))),mtr(mtd(mi(y)))))'
    )
  })

  it('setzt fallunterscheidungen links buendig hinter eine geschweifte klammer', () => {
    const f = formelZuMathml('f(x) = \\begin{cases} x^2 & \\text{für } x \\ge 0 \\\\ -x & \\text{sonst} \\end{cases}', true)!
    expect(kurz(f)).toContain('mrow(mo({),mtable(mtr(mtd(msup(mi(x),mn(2))),mtd(mrow(mtext(für\u00A0),mi(x),mo(≥),mn(0)))),')
    const tabelle = ((f.kinder[0] as MathKnoten).kinder.at(-1) as MathKnoten).kinder[1] as MathKnoten
    expect(tabelle).toMatchObject({ tag: 'mtable', attribute: { columnalign: 'left' } })
  })

  it('richtet umformungen in aligned am & aus', () => {
    const f = formelZuMathml('\\begin{aligned} 2x + 4 &= 10 \\\\[2pt] x &= 3 \\end{aligned}', true)!
    expect(kurz(f)).toBe(
      'math(mtable(mtr(mtd(mrow(mn(2),mi(x),mo(+),mn(4))),mtd(mrow(mo(=),mn(10)))),mtr(mtd(mi(x)),mtd(mrow(mo(=),mn(3))))))'
    )
    expect((f.kinder[0] as MathKnoten).attribute).toEqual({ columnalign: 'right left' })
    // eckige klammern nach \\ sind nur dann ein abstand, wenn eine laenge drinsteht
    expect(kurz(formelZuMathml('\\begin{matrix} a \\\\ [b] \\end{matrix}'))).toBe(
      'math(mtable(mtr(mtd(mi(a))),mtr(mtd(mrow(mo([),mi(b),mo(]))))))'
    )
  })

  it('kennt boxed, overset, underbrace, betragsstriche und limits', () => {
    expect(kurz(formelZuMathml('\\boxed{x = 2}'))).toBe('math(menclose(mrow(mi(x),mo(=),mn(2))))')
    expect(kurz(formelZuMathml('\\overset{!}{=}'))).toBe('math(mover(mo(=),mo(!)))')
    expect(kurz(formelZuMathml('\\underbrace{a-a}_{=0}', true))).toBe(
      'math(munder(munder(mrow(mi(a),mo(−),mi(a)),mo(⏟)),mrow(mo(=),mn(0))))'
    )
    expect(kurz(formelZuMathml('\\left\\lvert x \\right\\rvert + \\|v\\|'))).toBe(
      'math(mrow(mo(|),mi(x),mo(|),mo(+),mo(‖),mi(v),mo(‖)))'
    )
    expect(kurz(formelZuMathml('\\displaystyle\\sum\\limits_{k=1}^{n} k', true))).toBe(
      'math(mrow(munderover(mo(∑),mrow(mi(k),mo(=),mn(1)),mi(n)),mi(k)))'
    )
  })

  it('gibt bei unbekanntem oder kaputtem null zurueck, statt halb richtig zu zeichnen', () => {
    expect(formelZuMathml('\\unbekannt{x}')).toBeNull()
    expect(formelZuMathml('\\frac{a}{b')).toBeNull()
    expect(formelZuMathml('a}')).toBeNull()
    expect(formelZuMathml('')).toBeNull()
    expect(formelZuMathml('\\begin{tabular} a \\end{tabular}')).toBeNull()
    expect(formelZuMathml('\\begin{pmatrix} 1 & 2')).toBeNull()
    expect(formelZuMathml('\\begin{pmatrix} 1 \\end{bmatrix}')).toBeNull()
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
