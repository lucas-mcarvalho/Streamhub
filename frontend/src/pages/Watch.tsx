import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type AudioTrack, type LibraryFile, type MediaInfo, type SubTrack } from '../api'
import { Notice } from '../components/ui'

type Cue = { start: number; end: number; text: string }

const LANGS: Record<string, string> = {
  por: 'Português', eng: 'Inglês', jpn: 'Japonês', spa: 'Espanhol', fre: 'Francês', ger: 'Alemão', ita: 'Italiano',
  ara: 'Árabe', ind: 'Indonésio', tha: 'Tailandês', vie: 'Vietnamita', rus: 'Russo', kor: 'Coreano', chi: 'Chinês', und: 'Indefinido',
}
const langName = (l?: string) => (l ? LANGS[l] ?? l : 'Idioma não marcado')
const audioLabel = (a: AudioTrack) => `${langName(a.language)}${a.title ? ' — ' + a.title : ''} (${a.codec}${a.channels > 2 ? ' ' + a.channels + 'ch' : ''})`
const subLabel = (s: SubTrack) =>
  `${langName(s.language)}${s.language === 'por' && /brazil/i.test(s.title ?? '') ? ' (PT-BR)' : ''}${s.title ? ' — ' + s.title : ''}${s.textBased ? '' : ' [imagem, indisponível]'}`

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60)
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0')
}

function parseTime(s: string) {
  const p = s.trim().split(':').map(parseFloat)
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
}

function parseVtt(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [a, b] = lines[i].split('-->')
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim()
    if (body) cues.push({ start: parseTime(a), end: parseTime(b.trim().split(' ')[0]), text: body })
  }
  return cues
}

export default function Watch() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const box = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const pending = useRef<number | null>(null)
  const hideTimer = useRef<number>()
  const posKey = 'streamhub.pos.' + id

  const [info, setInfo] = useState<MediaInfo>()
  const [token, setToken] = useState<string>()
  const [err, setErr] = useState<string>()
  const [mode, setMode] = useState<'direct' | 'transcode'>('direct')
  const [offset, setOffset] = useState(0)
  const [cur, setCur] = useState(0)
  const [audio, setAudio] = useState(0)
  const [subIdx, setSubIdx] = useState(-1)
  const [cues, setCues] = useState<Cue[]>([])
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(true)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [showUi, setShowUi] = useState(true)
  const [files, setFiles] = useState<LibraryFile[]>([])

  const abs = mode === 'transcode' ? offset + cur : cur
  const duration = info?.duration || video.current?.duration || 0
  const file = files.find((f) => f.id === id)
  const next = useMemo(() => {
    const i = files.findIndex((f) => f.id === id)
    return i >= 0 && files[i + 1]?.group === files[i].group ? files[i + 1] : undefined
  }, [files, id])

  // carrega informações, token e lista da biblioteca
  useEffect(() => {
    setInfo(undefined); setToken(undefined); setErr(undefined); setCues([]); setCur(0); setOffset(0); setAudio(0); setWaiting(true)
    Promise.all([api<MediaInfo>(`/library/${id}/info`), api<{ token: string }>(`/library/${id}/token`)])
      .then(([i, t]) => {
        const saved = Number(localStorage.getItem(posKey))
        pending.current = saved > 5 && saved < i.duration - 30 ? saved : null
        setMode(i.directPlay ? 'direct' : 'transcode')
        if (!i.directPlay && pending.current != null) { setOffset(pending.current); pending.current = null }
        const pt = i.subtitles.find((s) => s.language === 'por' && s.textBased && /brazil/i.test(s.title ?? ''))
          ?? i.subtitles.find((s) => s.language === 'por' && s.textBased)
        setSubIdx(pt ? pt.index : -1)
        setInfo(i); setToken(t.token)
      })
      .catch((e) => setErr(e.message))
    api<LibraryFile[]>('/library').then(setFiles).catch(() => {})
  }, [id, posKey])

  // legenda selecionada
  useEffect(() => {
    setCues([])
    if (subIdx < 0 || !token) return
    let dead = false
    fetch(`/api/library/stream/${id}/subtitle/${subIdx}?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((t) => { if (!dead) setCues(parseVtt(t)) })
      .catch(() => { if (!dead) setErr('Não foi possível carregar a legenda selecionada.') })
    return () => { dead = true }
  }, [subIdx, token, id])

  const src = token
    ? mode === 'direct'
      ? `/api/library/stream/${id}?token=${encodeURIComponent(token)}`
      : `/api/library/stream/${id}/transcode?token=${encodeURIComponent(token)}&start=${Math.floor(offset)}&audio=${audio}`
    : undefined

  // salva posição
  useEffect(() => {
    const t = setInterval(() => { if (playing && abs > 0) localStorage.setItem(posKey, String(abs)) }, 5000)
    return () => clearInterval(t)
  }, [playing, abs, posKey])

  const seek = useCallback((t: number) => {
    const target = Math.max(0, Math.min(t, (info?.duration ?? t) - 1))
    if (mode === 'direct') { if (video.current) video.current.currentTime = target }
    else { setOffset(target); setCur(0); setWaiting(true) }
  }, [mode, info])

  const toggle = useCallback(() => {
    const v = video.current
    if (v) v.paused ? v.play() : v.pause()
  }, [])

  const changeAudio = (i: number) => {
    if (i === audio) return
    const t = abs
    setAudio(i)
    if (i === 0 && info?.directPlay) { pending.current = t; setMode('direct'); setOffset(0) }
    else { setMode('transcode'); setOffset(t); setCur(0) }
    setWaiting(true)
  }

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen()
    else box.current?.requestFullscreen()
  }, [])

  // atalhos de teclado
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowRight') seek(abs + 10)
      else if (e.key === 'ArrowLeft') seek(abs - 10)
      else if (e.key === 'f') fullscreen()
      else if (e.key === 'm') setMuted((m) => !m)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [toggle, seek, fullscreen, abs])

  useEffect(() => { if (video.current) { video.current.volume = volume; video.current.muted = muted } }, [volume, muted, src])
  useEffect(() => { if (video.current) video.current.playbackRate = rate }, [rate, src])

  const poke = () => {
    setShowUi(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShowUi(false), 3000)
  }

  const cue = cues.find((c) => abs >= c.start && abs < c.end)
  const uiVisible = showUi || !playing

  if (err && !info) return <Notice text={err} />
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <Link to="/library" className="text-zinc-400 hover:text-white">← Biblioteca</Link>
        <span className="truncate pl-4 text-zinc-300">{file?.group} {file?.season != null ? `· T${file.season} E${file.episode}` : ''}</span>
      </div>
      <div ref={box} onMouseMove={poke} onMouseLeave={() => playing && setShowUi(false)}
        className={`relative mx-auto aspect-video w-full overflow-hidden rounded-lg bg-black ${uiVisible ? '' : 'cursor-none'}`}>
        {src && (
          <video key={src} ref={video} src={src} autoPlay className="h-full w-full" onClick={toggle} onDoubleClick={fullscreen}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)}
            onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (pending.current != null && mode === 'direct') { e.currentTarget.currentTime = pending.current; pending.current = null }
            }}
            onEnded={() => { localStorage.removeItem(posKey); if (next) nav('/watch/' + next.id) }}
            onError={() => {
              if (mode === 'direct') { setErr(undefined); setOffset(abs); setCur(0); setMode('transcode') }
              else setErr('Não foi possível reproduzir este arquivo.')
            }} />
        )}
        {waiting && !err && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-300">Carregando…</div>}
        {cue && (
          <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-6 text-center transition-all ${uiVisible ? 'bottom-24' : 'bottom-8'}`}>
            <span className="whitespace-pre-line rounded bg-black/50 px-2 py-1 text-lg font-medium leading-snug text-white [text-shadow:0_1px_3px_#000] md:text-2xl">{cue.text}</span>
          </div>
        )}
        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-3 pt-10 transition-opacity ${uiVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          <input type="range" min={0} max={Math.max(1, Math.floor(duration))} value={Math.floor(abs)} onChange={(e) => seek(Number(e.target.value))}
            className="mb-2 h-1 w-full cursor-pointer accent-red-500" aria-label="Posição" />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button onClick={toggle} className="w-8 text-xl" aria-label="Reproduzir/Pausar">{playing ? '❚❚' : '▶'}</button>
            <button onClick={() => seek(abs - 10)} className="text-zinc-300 hover:text-white" title="Voltar 10s (←)">⟲ 10</button>
            <button onClick={() => seek(abs + 10)} className="text-zinc-300 hover:text-white" title="Avançar 10s (→)">10 ⟳</button>
            <span className="tabular-nums text-zinc-300">{fmt(abs)} / {fmt(duration)}</span>
            <span className="flex items-center gap-1">
              <button onClick={() => setMuted(!muted)} title="Mudo (m)">{muted || volume === 0 ? '🔇' : '🔊'}</button>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false) }} className="w-20 accent-red-500" aria-label="Volume" />
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {info && info.audio.length > 1 && (
                <select value={audio} onChange={(e) => changeAudio(Number(e.target.value))} className="max-w-40 rounded bg-zinc-800/90 px-2 py-1 text-xs" title="Áudio">
                  {info.audio.map((a) => <option key={a.index} value={a.index}>🔊 {audioLabel(a)}</option>)}
                </select>
              )}
              {info && info.subtitles.length > 0 && (
                <select value={subIdx} onChange={(e) => setSubIdx(Number(e.target.value))} className="max-w-48 rounded bg-zinc-800/90 px-2 py-1 text-xs" title="Legenda">
                  <option value={-1}>💬 Sem legenda</option>
                  {info.subtitles.map((s) => <option key={s.index} value={s.index} disabled={!s.textBased}>💬 {subLabel(s)}</option>)}
                </select>
              )}
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded bg-zinc-800/90 px-2 py-1 text-xs" title="Velocidade">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}x</option>)}
              </select>
              {next && <button onClick={() => nav('/watch/' + next.id)} className="rounded bg-zinc-800/90 px-2 py-1 text-xs hover:bg-zinc-700">Próximo ⏭</button>}
              <button onClick={fullscreen} title="Tela cheia (f)">⛶</button>
            </span>
          </div>
        </div>
      </div>
      {err && <div className="mt-3"><Notice text={err} /></div>}
      <p className="mt-3 text-xs text-zinc-500">
        {mode === 'transcode' ? 'Convertendo no servidor para o navegador (vídeo/áudio incompatível ou faixa de áudio trocada). ' : 'Reprodução direta. '}
        Atalhos: espaço = pausar · ←/→ = ±10s · f = tela cheia · m = mudo.
      </p>
    </div>
  )
}
