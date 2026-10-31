export type CatalogItem = {
  ref: string; source: string; type: string; id: string; kind: 'MOVIE' | 'SERIES' | 'ANIME'
  title: string; originalTitle?: string; overview?: string; posterUrl?: string; backdropUrl?: string
  year?: number; rating?: number; genres: string[]; episodes?: number; seasons?: number; status?: string; runtime?: number
  format?: string; studio?: string
}
export type Genre = { id: string; name: string }
export type Section = { key: string; title: string; items: CatalogItem[]; error?: string }
export type Season = { number: number; name: string; episodeCount: number; airDate?: string }
export type Episode = { number: number; name: string; overview?: string; airDate?: string; stillUrl?: string; runtime?: number }
export type Release = {
  guid: string; title: string; resolution: string; source?: string; codec?: string; sizeBytes: number
  seeders?: number; leechers?: number; indexer: string; indexerId: number; publishDate?: string
  magnetUrl?: string; downloadUrl?: string; infoUrl?: string; audioHints: string[]; subtitleHints: string[]
  season?: number; seasonEnd?: number; episode?: number
}
export type Usage = { total: number; free: number; used: number }
export type Location = {
  id: number; name: string; path: string; kind: string; isDefault: boolean; exists: boolean; writable: boolean
  usage: Usage; percentUsed: number; lowSpace: boolean
}
export type Root = { index: number; path: string; exists: boolean; usage: Usage }
export type Download = {
  id: number; title: string; kind: string; indexer?: string; status: string; progress: number; sizeBytes: number
  downloadedBytes: number; dlSpeed: number; upSpeed: number; etaSeconds?: number; destination: string
  errorMessage?: string; createdAt: string
}
export type LibraryFile = {
  id: string; name: string; group: string; kind: string; sizeBytes: number; season?: number; episode?: number
  location: string; relativePath: string; modified: string
}
export type Indexer = { id: number; name: string; enabled: boolean; protocol: string; privacy: string; implementation: string; failing: boolean }
export type Integration = {
  service: string; label: string; baseUrl?: string; username?: string; hasSecret: boolean; enabled: boolean; configured: boolean; source: string
}

const KEY = 'streamhub.auth'
export const auth = {
  get: () => sessionStorage.getItem(KEY),
  set: (user: string, pass: string) => sessionStorage.setItem(KEY, 'Basic ' + btoa(`${user}:${pass}`)),
  clear: () => sessionStorage.removeItem(KEY),
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export function authHeaders(): Record<string, string> {
  const a = auth.get()
  return a ? { Authorization: a } : {}
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders() }
  if (init.json !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch('/api' + path, {
    ...init, headers: { ...headers, ...(init.headers as Record<string, string>) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })
  if (res.status === 401) {
    auth.clear()
    window.dispatchEvent(new Event('streamhub:logout'))
  }
  if (!res.ok) {
    let body: { code?: string; message?: string } = {}
    try { body = await res.json() } catch { /* sem corpo */ }
    throw new ApiError(res.status, body.code ?? 'ERROR', body.message ?? `Erro ${res.status}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const fmtBytes = (n: number) => {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1)
  return `${(n / 1024 ** i).toFixed(i > 1 ? 1 : 0)} ${u[i]}`
}
export const fmtEta = (s?: number) => {
  if (s == null) return '—'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`
}
export const kindLabel: Record<string, string> = { MOVIE: 'Filme', SERIES: 'Série', ANIME: 'Anime', GENERAL: 'Geral' }
export type Person = { name: string; role?: string; photoUrl?: string }
export type TitleDetailsT = { item: CatalogItem; seasons: Season[]; directors: Person[]; cast: Person[] }
export type AudioTrack = { index: number; codec?: string; language?: string; title?: string; channels: number }
export type SubTrack = { index: number; codec?: string; language?: string; title?: string; textBased: boolean }
export type MediaInfo = { duration: number; videoCodec?: string; directPlay: boolean; audio: AudioTrack[]; subtitles: SubTrack[] }

const STATUS: Record<string, string> = {
  FINISHED: 'Finalizado', RELEASING: 'Em exibição', NOT_YET_RELEASED: 'Em breve', CANCELLED: 'Cancelado', HIATUS: 'Em hiato',
  'Returning Series': 'Em exibição', Ended: 'Finalizada', Released: 'Lançado', Canceled: 'Cancelada', 'In Production': 'Em produção',
}
export const statusPt = (s?: string) => (s ? STATUS[s] ?? s : undefined)

const FORMAT: Record<string, string> = { TV: 'Série de TV', TV_SHORT: 'Curta', MOVIE: 'Filme', SPECIAL: 'Especial', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Música' }
export const formatPt = (f?: string) => (f ? FORMAT[f] ?? f : undefined)

const GENRES: Record<string, string> = {
  Action: 'Ação', Adventure: 'Aventura', Comedy: 'Comédia', Drama: 'Drama', Fantasy: 'Fantasia', Horror: 'Terror',
  'Mahou Shoujo': 'Garota Mágica', Mecha: 'Mecha', Music: 'Música', Mystery: 'Mistério', Psychological: 'Psicológico',
  Romance: 'Romance', 'Sci-Fi': 'Ficção Científica', 'Slice of Life': 'Cotidiano', Sports: 'Esportes',
  Supernatural: 'Sobrenatural', Thriller: 'Suspense', Ecchi: 'Ecchi',
}
export const genrePt = (g: string) => GENRES[g] ?? g

/** Progresso local de reprodução (guardado pelo player no navegador). */
export const progressOf = (id: string) => {
  try {
    const pos = Number(localStorage.getItem('streamhub.pos.' + id)) || 0
    const dur = Number(localStorage.getItem('streamhub.dur.' + id)) || 0
    const last = Number(localStorage.getItem('streamhub.last.' + id)) || 0
    const done = localStorage.getItem('streamhub.done.' + id) === '1'
    return { pos, dur, last, done, ratio: dur > 0 ? Math.min(1, pos / dur) : 0 }
  } catch { return { pos: 0, dur: 0, last: 0, done: false, ratio: 0 } }
}

export type DownloadFile = { index: number; name: string; size: number; progress: number; selected: boolean }
