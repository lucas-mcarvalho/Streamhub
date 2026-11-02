import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Settings, SkipForward, Volume2, VolumeX } from 'lucide-react'
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

const ctl = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15 active:bg-white/25'

function MenuGroup({ items, onPick }: { items: { key: number; label: string; on: boolean; disabled?: boolean }[]; onPick: (k: number) => void }) {
  return (
    <div>
      {items.map((i) => (
        <button key={i.key} disabled={i.disabled} onClick={() => onPick(i.key)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-white/10 disabled:opacity-40 ${i.on ? 'font-semibold text-accent-500' : 'text-zinc-200'}`}>
          <span className="min-w-0 flex-1 break-words">{i.label}</span>{i.on && <Check size={16} className="shrink-0" />}
        </button>
      ))}
    </div>
  )
}

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

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

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
  const [menu, setMenu] = useState(false)
  const [reload, setReload] = useState(0)
  const stallSince = useRef<number | null>(null)
  const healthySince = useRef<number | null>(null)
  const retries = useRef(0)
  const [tab, setTab] = useState<'audio' | 'sub' | 'rate'>('sub')
  const [fs, setFs] = useState(false)
  const [fake, setFake] = useState(false)
  const [flash, setFlash] = useState<{ side: number; n: number }>()
  const menuOpen = useRef(false)
  const tapTimer = useRef<number>()
  const lastTap = useRef(0)
  const touch = coarse()
  menuOpen.current = menu

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
        localStorage.setItem('streamhub.dur.' + id, String(i.duration))
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
      ? `/api/library/stream/${id}?token=${encodeURIComponent(token)}&r=${reload}`
      : `/api/library/stream/${id}/transcode?token=${encodeURIComponent(token)}&start=${Math.floor(offset)}&audio=${audio}&r=${reload}`
    : undefined

  // salva posição
  useEffect(() => {
    const t = setInterval(() => { if (playing && abs > 0) { localStorage.setItem(posKey, String(abs)); localStorage.setItem('streamhub.last.' + id, String(Date.now())); localStorage.removeItem('streamhub.done.' + id) } }, 5000)
    return () => clearInterval(t)
  }, [playing, abs, posKey, id])

  // travou (sem dados por vários segundos) ou o fluxo acabou antes da hora: reabre o vídeo na posição atual,
  // o mesmo que voltar 10 s à mão
  const recover = () => {
    if (retries.current >= 5) { setErr('A reprodução travou várias vezes seguidas. Verifique a conexão com o servidor e tente de novo.'); return }
    retries.current++
    if (mode === 'transcode') { setOffset(abs); setCur(0) } else pending.current = abs
    setWaiting(true)
    setReload((r) => r + 1)
  }
  const recoverRef = useRef(recover)
  recoverRef.current = recover

  useEffect(() => {
    const iv = window.setInterval(() => {
      const v = video.current
      if (!v || v.paused || v.ended) { stallSince.current = null; healthySince.current = null; return }
      const now = Date.now()
      if (v.readyState < 3) {
        healthySince.current = null
        stallSince.current ??= now
        if (now - stallSince.current > 8000) { stallSince.current = null; recoverRef.current() }
      } else {
        stallSince.current = null
        healthySince.current ??= now
        if (now - healthySince.current > 20000) retries.current = 0
      }
    }, 1000)
    return () => window.clearInterval(iv)
  }, [])

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

  // tela cheia real quando existe; senão (iPhone) o player ocupa a tela por CSS
  const fullscreen = useCallback(() => {
    const el = box.current
    if (!el) return
    if (document.fullscreenElement) { document.exitFullscreen(); return }
    if (fake) { setFake(false); return }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => setFake(true))
    else setFake(true)
  }, [fake])

  useEffect(() => {
    const h = () => {
      const on = document.fullscreenElement === box.current
      setFs(on)
      try {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        if (on && coarse()) o.lock?.('landscape').catch(() => {}); else if (!on) o.unlock?.()
      } catch { /* orientação não suportada */ }
    }
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])
  useEffect(() => {
    if (!fake) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [fake])

  // atalhos de teclado
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowRight') seek(abs + 10)
      else if (e.key === 'ArrowLeft') seek(abs - 10)
      else if (e.key === 'f') fullscreen()
      else if (e.key === 'm') setMuted((m) => !m)
      else if (e.key === 'Escape' && fake) setFake(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [toggle, seek, fullscreen, abs, fake])

  useEffect(() => { if (video.current) { video.current.volume = volume; video.current.muted = muted } }, [volume, muted, src])
  useEffect(() => { if (video.current) video.current.playbackRate = rate }, [rate, src])

  const poke = () => {
    setShowUi(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => { if (!menuOpen.current) setShowUi(false) }, 3000)
  }

  // toque: 1 toque mostra/esconde os controles, 2 toques nas laterais pulam 10 s, 2 toques no centro pausam
  const onTap = (e: React.MouseEvent<HTMLElement>) => {
    if (menu) { setMenu(false); return }
    if (!touch) { toggle(); return }
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const now = Date.now()
    if (now - lastTap.current < 300) {
      window.clearTimeout(tapTimer.current)
      lastTap.current = 0
      if (x < 0.35) { seek(abs - 10); setFlash({ side: -1, n: now }) }
      else if (x > 0.65) { seek(abs + 10); setFlash({ side: 1, n: now }) }
      else toggle()
      window.setTimeout(() => setFlash((f) => (f?.n === now ? undefined : f)), 600)
      return
    }
    lastTap.current = now
    tapTimer.current = window.setTimeout(() => {
      if (showUi && playing) { window.clearTimeout(hideTimer.current); setShowUi(false) } else poke()
    }, 300)
  }

  const cue = cues.find((c) => abs >= c.start && abs < c.end)
  const uiVisible = showUi || !playing
  const expanded = fs || fake
  const tabs = [
    ...(info && info.audio.length > 1 ? [{ id: 'audio' as const, label: 'Áudio' }] : []),
    ...(info && info.subtitles.length > 0 ? [{ id: 'sub' as const, label: 'Legenda' }] : []),
    { id: 'rate' as const, label: 'Velocidade' },
  ]
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0].id

  if (err && !info) return <Notice text={err} />
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <Link to="/library" className="flex items-center gap-1 text-zinc-400 hover:text-white"><ArrowLeft size={16} />Biblioteca</Link>
        <span className="truncate pl-4 text-zinc-300">{file?.group} {file?.season != null ? `· T${file.season} E${file.episode}` : ''}</span>
      </div>
      <div ref={box} onPointerMove={(e) => { if (e.pointerType === 'mouse') poke() }} onMouseLeave={() => !touch && playing && !menu && setShowUi(false)}
        className={`overflow-hidden bg-black ${fake ? 'fixed inset-0 z-[100] h-[100dvh] w-screen' : fs ? 'h-full w-full' : 'relative mx-auto aspect-video max-h-[calc(100dvh-5.5rem)] w-full rounded-lg'} ${uiVisible ? '' : 'cursor-none'}`}>
        {src && (
          <video key={src} ref={video} src={src} autoPlay playsInline className="h-full w-full" onClick={onTap} onDoubleClick={() => { if (!touch) fullscreen() }}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
            onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)}
            onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (pending.current != null && mode === 'direct') { e.currentTarget.currentTime = pending.current; pending.current = null }
            }}
            onEnded={() => {
              if (mode === 'transcode' && duration > 0 && abs < duration - 10 && retries.current < 5) { recover(); return } // fluxo cortado antes do fim
              localStorage.removeItem(posKey); localStorage.setItem('streamhub.done.' + id, '1'); if (next) nav('/watch/' + next.id) }}
            onError={() => {
              if (mode === 'direct') { setErr(undefined); setOffset(abs); setCur(0); setMode('transcode') }
              else if (abs > 0 && retries.current < 5) recover()
              else setErr('Não foi possível reproduzir este arquivo.')
            }} />
        )}
        {waiting && !err && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 size={40} className="animate-spin text-white/80" /></div>}
        {flash && (
          <div className={`pointer-events-none absolute top-1/2 grid h-24 w-24 -translate-y-1/2 place-items-center rounded-full bg-white/20 text-sm font-bold backdrop-blur ${flash.side < 0 ? 'left-[8%]' : 'right-[8%]'}`}>
            {flash.side < 0 ? <RotateCcw size={26} /> : <RotateCw size={26} />}<span className="-mt-3 text-xs">10 s</span>
          </div>
        )}
        {touch && !playing && !waiting && !err && uiVisible && (
          <button onClick={toggle} aria-label="Reproduzir" className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent-600/90 shadow-xl backdrop-blur active:scale-95">
            <Play size={30} fill="white" className="ml-1" />
          </button>
        )}
        {cue && (
          <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-3 text-center transition-all sm:px-6 ${uiVisible ? 'bottom-24 sm:bottom-24' : 'bottom-6 sm:bottom-8'}`}>
            <span className="whitespace-pre-line rounded bg-black/55 px-2 py-1 text-[15px] font-medium leading-snug text-white [text-shadow:0_1px_3px_#000] sm:text-lg md:text-2xl">{cue.text}</span>
          </div>
        )}
        {expanded && (
          <div className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-4 pb-8 pt-3 text-sm font-semibold transition-opacity ${uiVisible ? 'opacity-100' : 'opacity-0'}`} style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            {file?.group} {file?.season != null ? `· T${file.season} E${file.episode}` : ''}
          </div>
        )}
        {menu && info && (
          <div className="absolute bottom-24 right-2 top-2 z-10 flex w-72 max-w-[calc(100%-1rem)] flex-col rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 text-sm shadow-2xl backdrop-blur">
            <div className="mb-1 flex shrink-0 gap-1">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${activeTab === t.id ? 'bg-accent-600 text-white' : 'text-zinc-300 hover:bg-white/10'}`}>{t.label}</button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {activeTab === 'audio' && <MenuGroup items={info.audio.map((a) => ({ key: a.index, label: audioLabel(a), on: a.index === audio }))} onPick={(k) => { changeAudio(Number(k)); setMenu(false) }} />}
              {activeTab === 'sub' && <MenuGroup items={[{ key: -1, label: 'Sem legenda', on: subIdx === -1 }, ...info.subtitles.map((x) => ({ key: x.index, label: subLabel(x), on: x.index === subIdx, disabled: !x.textBased }))]} onPick={(k) => { setSubIdx(Number(k)); setMenu(false) }} />}
              {activeTab === 'rate' && <MenuGroup items={[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => ({ key: r, label: r === 1 ? 'Normal' : r + 'x', on: r === rate }))} onPick={(k) => { setRate(Number(k)); setMenu(false) }} />}
            </div>
          </div>
        )}
        <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pt-10 transition-opacity sm:px-4 ${uiVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          <input type="range" min={0} max={Math.max(1, Math.floor(duration))} value={Math.floor(abs)} onChange={(e) => seek(Number(e.target.value))}
            className="seek mb-1 h-5 w-full cursor-pointer accent-accent-500" aria-label="Posição" />
          <div className="flex items-center gap-0.5 text-sm sm:gap-1">
            <button onClick={toggle} className={ctl} aria-label="Reproduzir/Pausar">{playing ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" />}</button>
            <button onClick={() => seek(abs - 10)} className={ctl} title="Voltar 10s (←)" aria-label="Voltar 10 segundos"><RotateCcw size={20} /></button>
            <button onClick={() => seek(abs + 10)} className={ctl} title="Avançar 10s (→)" aria-label="Avançar 10 segundos"><RotateCw size={20} /></button>
            <span className="ml-1 whitespace-nowrap text-xs tabular-nums text-zinc-300 sm:text-sm">{fmt(abs)} / {fmt(duration)}</span>
            {!touch && (
              <span className="ml-2 flex items-center gap-1">
                <button onClick={() => setMuted(!muted)} className={ctl} title="Mudo (m)" aria-label="Mudo">{muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
                <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false) }} className="w-20 accent-accent-500" aria-label="Volume" />
              </span>
            )}
            <span className="ml-auto flex items-center gap-0.5 sm:gap-1">
              {next && <button onClick={() => nav('/watch/' + next.id)} className="flex h-10 items-center gap-1 rounded-full px-3 text-xs font-semibold hover:bg-white/15 active:bg-white/25">Próximo<SkipForward size={16} /></button>}
              <button onClick={() => setMenu((m) => !m)} className={ctl} title="Áudio, legenda e velocidade" aria-label="Configurações"><Settings size={20} /></button>
              <button onClick={fullscreen} className={ctl} title="Tela cheia (f)" aria-label="Tela cheia">{expanded ? <Minimize size={20} /> : <Maximize size={20} />}</button>
            </span>
          </div>
        </div>
      </div>
      {err && <div className="mt-3"><Notice text={err} /></div>}
      <p className="mt-3 text-xs text-zinc-500">
        {mode === 'transcode' ? 'Convertendo no servidor para o navegador (vídeo/áudio incompatível ou faixa de áudio trocada). ' : 'Reprodução direta. '}
        {touch ? 'Toque duas vezes nas laterais para pular 10 s e no centro para pausar.' : 'Atalhos: espaço = pausar · ←/→ = ±10s · f = tela cheia · m = mudo.'}
      </p>
    </div>
  )
}
