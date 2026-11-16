import { describe, expect, it } from 'vitest'
import { parseProgressLine } from '../src/main/downloads/progress'

describe('parseProgressLine', () => {
  it('parses a full progress line', () => {
    const p = parseProgressLine('TBPROG|2386814|4773628|NA|5530559.31|3')!
    expect(p.progress).toBeCloseTo(0.5)
    expect(p.speed).toBeCloseTo(5530559.31)
    expect(p.eta).toBe(3)
  })
  it('falls back to the size estimate', () => {
    expect(parseProgressLine('TBPROG|500|NA|1000|NA|NA')!.progress).toBeCloseTo(0.5)
  })
  it('handles unknown totals', () => {
    expect(parseProgressLine('TBPROG|500|NA|NA|NA|NA')).toEqual({
      progress: 0,
      speed: null,
      eta: null
    })
  })
  it('ignores other output', () => {
    expect(parseProgressLine('[youtube] abc: Downloading webpage')).toBeNull()
  })
  it('clamps to 1', () => {
    expect(parseProgressLine('TBPROG|2000|1000|NA|NA|NA')!.progress).toBe(1)
  })
})
