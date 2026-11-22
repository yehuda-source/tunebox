// Installs the mock API and maps tunebox-media:// URLs to things a plain browser can load.
import { mockApi } from './api'
import { coverSvg } from './fixtures'
import { enablePhoneLayout } from '../lib/platform'

Object.assign(window, { api: mockApi })
// ?phone shows the phone layout (open the preview in a phone-sized viewport).
if (new URLSearchParams(location.search).has('phone')) enablePhoneLayout()

// A short silent WAV so the player can actually "play" library tracks and streams.
function silentWav(seconds: number): string {
  const rate = 8000
  const n = rate * seconds
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const str = (o: number, s: string): void =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  str(36, 'data')
  v.setUint32(40, n, true)
  new Uint8Array(buf, 44).fill(128)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}
const silence = silentWav(60)

function mapUrl(url: string): string {
  const m = url.match(/^tunebox-media:\/\/(\w+)\/(.+)$/)
  if (!m) return url
  if (m[1] === 'cover')
    return Number(m[2]) % 7 === 0 ? 'data:,missing' : coverSvg(`#${m[2]}`, Number(m[2]))
  return silence
}

const mediaSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!
Object.defineProperty(HTMLMediaElement.prototype, 'src', {
  ...mediaSrc,
  set(this: HTMLMediaElement, v: string) {
    mediaSrc.set!.call(this, mapUrl(v))
  }
})
const imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  ...imgSrc,
  set(this: HTMLImageElement, v: string) {
    imgSrc.set!.call(this, mapUrl(v))
  }
})
const setAttr = Element.prototype.setAttribute
Element.prototype.setAttribute = function (name: string, value: string) {
  return setAttr.call(this, name, name === 'src' ? mapUrl(String(value)) : value)
}
