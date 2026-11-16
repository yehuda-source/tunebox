import { app, net, safeStorage, shell } from 'electron'
import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SpotifyStatus } from '../../shared/types'
import log from '../log'

// Spotify only allows plain-http redirects to a loopback IP, on a fixed port you register.
const PORT = 43821
export const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`
const SCOPES = 'playlist-read-private playlist-read-collaborative user-library-read'

interface Stored {
  clientId: string
  refresh: string | null
  user: string | null
}

let stored: Stored | null = null
let access: { token: string; expires: number } | null = null

const file = (): string => join(app.getPath('userData'), 'spotify.json')

/** The refresh token is a long-lived login, so keep it encrypted when the OS allows. */
function seal(v: string): string {
  return safeStorage.isEncryptionAvailable()
    ? `enc:${safeStorage.encryptString(v).toString('base64')}`
    : v
}
function unseal(v: string): string {
  return v.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(v.slice(4), 'base64')) : v
}

function load(): Stored {
  if (stored) return stored
  stored = { clientId: '', refresh: null, user: null }
  try {
    if (existsSync(file())) {
      const raw = JSON.parse(readFileSync(file(), 'utf8'))
      stored = {
        clientId: raw.clientId ?? '',
        refresh: raw.refresh ? unseal(raw.refresh) : null,
        user: raw.user ?? null
      }
    }
  } catch (err) {
    log.warn('Could not read Spotify settings', err)
  }
  return stored
}

function save(): void {
  const s = load()
  writeFileSync(
    file(),
    JSON.stringify({
      clientId: s.clientId,
      refresh: s.refresh ? seal(s.refresh) : null,
      user: s.user
    })
  )
}

export function status(): SpotifyStatus {
  const s = load()
  return {
    clientId: s.clientId,
    signedIn: Boolean(s.refresh),
    user: s.user,
    redirectUri: REDIRECT_URI
  }
}

export function setClientId(clientId: string): SpotifyStatus {
  const s = load()
  const id = clientId.trim()
  if (id && !/^[0-9a-f]{32}$/i.test(id)) {
    throw new Error(
      'That doesn’t look like a Spotify Client ID (32 letters and numbers, from the app’s settings page).'
    )
  }
  if (id !== s.clientId) {
    s.refresh = null
    s.user = null
    access = null
  }
  s.clientId = id
  save()
  return status()
}

export function signOut(): SpotifyStatus {
  const s = load()
  s.refresh = null
  s.user = null
  access = null
  save()
  return status()
}

const b64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function tokenRequest(
  body: Record<string, string>
): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const res = await net.fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  })
  const json = (await res.json()) as Record<string, string>
  if (!res.ok)
    throw new Error(
      json.error_description || json.error || `Spotify sign-in failed (HTTP ${res.status})`
    )
  return json as never
}

/** Wait for Spotify to redirect the browser back to us with a code. */
function waitForCode(state: string): { promise: Promise<string>; server: Server } {
  let server!: Server
  const promise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Sign-in timed out. Try again.')),
      5 * 60 * 1000
    )
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error')
      const ok = !error && url.searchParams.get('state') === state && url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><meta charset="utf-8"><title>TuneBox</title><body style="font-family:system-ui;background:#0b0b0f;color:#f2f2f7;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${ok ? 'Connected to Spotify' : 'Spotify sign-in failed'}</h2><p style="color:#a0a0b0">You can close this tab and return to TuneBox.</p></div>`
      )
      clearTimeout(timer)
      if (ok) resolve(url.searchParams.get('code')!)
      else
        reject(
          new Error(
            error === 'access_denied'
              ? 'Sign-in was cancelled.'
              : `Spotify sign-in failed: ${error ?? 'invalid response'}`
          )
        )
    })
    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(
              `Port ${PORT} is in use by another program, so the Spotify sign-in can’t complete. Close it and try again.`
            )
          : err
      )
    })
    server.listen(PORT, '127.0.0.1')
  })
  return { promise, server }
}

/** Sign in with Spotify in the browser (Authorization Code + PKCE, no client secret). */
export async function signIn(): Promise<SpotifyStatus> {
  const s = load()
  if (!s.clientId) throw new Error('Add your Spotify Client ID first.')
  const verifier = b64url(randomBytes(48))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))
  const { promise, server } = waitForCode(state)
  try {
    const url = new URL('https://accounts.spotify.com/authorize')
    url.search = new URLSearchParams({
      client_id: s.clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: SCOPES,
      state
    }).toString()
    await shell.openExternal(url.toString())
    const code = await promise
    const tok = await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: s.clientId,
      code_verifier: verifier
    })
    s.refresh = tok.refresh_token ?? null
    access = { token: tok.access_token, expires: Date.now() + (tok.expires_in - 60) * 1000 }
    const me = await net.fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access.token}` }
    })
    const profile = me.ok ? ((await me.json()) as { display_name?: string; id?: string }) : {}
    s.user = profile.display_name || profile.id || null
    save()
    return status()
  } finally {
    server.close()
  }
}

/** A valid access token, refreshing it when needed. */
export async function accessToken(): Promise<string> {
  if (access && access.expires > Date.now()) return access.token
  const s = load()
  if (!s.clientId || !s.refresh)
    throw new Error('Sign in to Spotify first (Spotify import → Sign in with Spotify).')
  try {
    const tok = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: s.refresh,
      client_id: s.clientId
    })
    if (tok.refresh_token) s.refresh = tok.refresh_token
    access = { token: tok.access_token, expires: Date.now() + (tok.expires_in - 60) * 1000 }
    save()
    return access.token
  } catch (err) {
    log.warn('Spotify token refresh failed', err)
    s.refresh = null
    save()
    throw new Error('Your Spotify sign-in expired. Sign in again.', { cause: err })
  }
}
