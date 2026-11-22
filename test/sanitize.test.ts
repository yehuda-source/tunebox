import { describe, expect, it } from 'vitest'
import { safeName } from '../src/shared/sanitize'

describe('safeName', () => {
  it('replaces characters Windows forbids', () => {
    expect(safeName('AC/DC: Back in Black?')).toBe('AC_DC_ Back in Black_')
    expect(safeName('a<b>c"d|e*f\\g')).toBe('a_b_c_d_e_f_g')
  })
  it('strips trailing dots and spaces', () => {
    expect(safeName('Mr. Jones...  ')).toBe('Mr. Jones')
  })
  it('avoids reserved device names', () => {
    expect(safeName('CON')).toBe('_CON')
    expect(safeName('lpt1')).toBe('_lpt1')
  })
  it('falls back when empty', () => {
    expect(safeName('   ', 'Unknown')).toBe('Unknown')
    expect(safeName(undefined, 'Singles')).toBe('Singles')
    expect(safeName('...')).toBe('Unknown')
  })
  it('limits length in bytes', () => {
    expect(Buffer.byteLength(safeName('é'.repeat(300)))).toBeLessThanOrEqual(120)
  })
  it('removes control characters', () => {
    expect(safeName('a\u0000b\u0007c')).toBe('abc')
  })
})
