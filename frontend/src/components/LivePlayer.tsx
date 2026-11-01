import { useCallback, useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Heart, Loader2, RotateCcw, RotateCw, Maximize, Minimize, PictureInPicture2, Pause, Play, RefreshCw, Settings, SkipBack, SkipForward, Tv, Volume2, VolumeX } from 'lucide-react'
import type { Channel } from '../api'

type Level = { index: number; label: string }

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60)
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0')
}

// aceita 90, 1:30 ou 1:02:30
function parseTime(txt: string): number | undefined {
  const p = txt.trim().split(':').map(Number)
  if (!p.length || p.length > 3 || p.some((n) => !isFinite(n) || n < 0)) return undefined
  return p.reduce((acc, n) => acc * 60 + n, 0)
}

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

export default function LivePlayer({ channel, favorite, onFavorite, onPrev, onNext }: {
  channel: Channel
  favorite: boolean
  onFavorite: () => void
  onPrev?: () => void
  onNext?: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const hls = useRef<Hls>()
  const hideTimer = useRef<number>()
  const menuOpen = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>()
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showUi, setShowUi] = useState(true)
  const [fs, setFs] = useState(false)
  const [fake, setFake] = useState(false)
  const [levels, setLevels] = useState<Level[]>([])
  const [level, setLevel] = useState(-1)
  const [menu, setMenu] = useState(false)
  const [tries, setTries] = useState(0)
  // filme/série (arquivo ou HLS com fim definido) tem duração e permite pular; canal ao vivo não
  const [vod, setVod] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [goto, setGoto] = useState<string | null>(null)
  const touch = coarse()
  const expanded = fs || fake

  menuOpen.current = menu

  const poke = useCallback(() => {
    setShowUi(true)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => { if (!menuOpen.current) setShowUi(false) }, 3500)
  }, [])

  // reprodução: HLS pelo hls.js (ou nativo no Safari); filmes e séries (MP4) direto na tag de vídeo
  useEffect(() => {
    const v = video.current
    if (!v) return
    setErr(undefined); setLoading(true); setLevels([]); setLevel(-1); setVod(channel.direct && !channel.hls); setCur(0); setDur(0); setGoto(null)
    let h: Hls | undefined
    // se nada tocar em 25 s, avisa em vez de ficar girando para sempre
    const watchdog = window.setTimeout(() => { if (v.readyState < 3) setErr('Este canal demorou demais para responder.') }, 25000)
    if (channel.direct && !channel.hls) {
      v.src = channel.playUrl
      v.onerror = () => setErr('Não foi possível abrir este vídeo. O arquivo pode ter saído do ar ou usar um formato que o navegador não toca.')
      v.play().catch(() => {})
    } else if (Hls.isSupported()) {
      h = new Hls({ maxBufferLength: 20, enableWorker: true, lowLatencyMode: false })
      hls.current = h
      h.loadSource(channel.playUrl)
      h.attachMedia(v)
      h.on(Hls.Events.LEVEL_LOADED, (_e, data) => setVod(!data.details.live))
      h.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        const seen = new Set<number>()
        const ls: Level[] = []
        data.levels.forEach((l, index) => {
          if (l.height && !seen.has(l.height)) { seen.add(l.height); ls.push({ index, label: l.height + 'p' }) }
        })
        setLevels(ls.sort((a, b) => parseInt(b.label) - parseInt(a.label)))
        v.play().catch(() => setLoading(false))
      })
      let netRetries = 0, mediaRetries = 0
      h.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        // tenta se recuperar antes de avisar (trocas de anúncio e quedas de rede são comuns em TV ao vivo)
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 3) { netRetries++; h?.startLoad(); return }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) { mediaRetries++; h?.recoverMediaError(); return }
        if (v.currentTime > 0 && !v.paused && !v.ended && v.readyState > 2) return // continua tocando
        setErr('Este canal está indisponível no momento. Listas públicas mudam e falham com frequência.')
      })
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = channel.playUrl
      v.onerror = () => setErr('Este canal está indisponível no momento.')
      v.play().catch(() => {})
    } else {
      setErr('Este navegador não suporta reprodução de TV ao vivo (HLS).')
    }
    return () => {
      window.clearTimeout(watchdog)
      h?.destroy(); hls.current = undefined
      v.onerror = null; v.removeAttribute('src'); v.load()
    }
  }, [channel.playUrl, channel.direct, channel.hls, tries])

  useEffect(() => { if (video.current) { video.current.volume = volume; video.current.muted = muted } }, [volume, muted, channel.playUrl])
  useEffect(() => { poke(); return () => window.clearTimeout(hideTimer.current) }, [channel.playUrl, poke])
  useEffect(() => { setMenu(false) }, [channel.playUrl])

  // tela cheia real quando existe; senão (iPhone) o player ocupa a tela por CSS
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

  const toggleFs = useCallback(() => {
    const el = box.current
    if (!el) return
    if (document.fullscreenElement) { document.exitFullscreen(); return }
    if (fake) { setFake(false); return }
    if (el.requestFullscreen) el.requestFullscreen().catch(() => setFake(true))
    else setFake(true)
  }, [fake])

  const toggle = useCallback(() => {
    const v = video.current
    if (!v) return
    if (v.paused) v.play().catch(() => {}); else v.pause()
  }, [])

  const seekTo = useCallback((t: number) => {
    const v = video.current
    if (!v || !vod) return
    v.currentTime = Math.max(0, Math.min(t, (v.duration || t) - 1))
  }, [vod])

  const goLive = () => {
    const v = video.current
    if (!v) return
    const edge = hls.current?.liveSyncPosition ?? (v.seekable.length ? v.seekable.end(v.seekable.length - 1) : undefined)
    if (edge != null && isFinite(edge)) v.currentTime = edge
    v.play().catch(() => {})
  }

  const pip = () => {
    const v = video.current
    if (!v) return
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {})
    else v.requestPictureInPicture?.().catch(() => {})
  }

  const pickLevel = (i: number) => {
    setLevel(i)
    if (hls.current) hls.current.currentLevel = i
    setMenu(false)
  }

  // atalhos: espaço = pausar · f = tela cheia · m = mudo · ←/→ = canal anterior/próximo
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle() }
      else if (e.key === 'f') toggleFs()
      else if (e.key === 'm') setMuted((m) => !m)
      else if (e.key === 'ArrowRight') { if (vod) seekTo((video.current?.currentTime ?? 0) + 10); else onNext?.() }
      else if (e.key === 'ArrowLeft') { if (vod) seekTo((video.current?.currentTime ?? 0) - 10); else onPrev?.() }
      else if (e.key === 'Escape' && fake) setFake(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [toggle, toggleFs, onNext, onPrev, fake, vod, seekTo])

  // toque: mostra/esconde os controles; mouse: clique pausa, duplo clique abre tela cheia
  const tapTimer = useRef<number>()
  const onTap = (e: React.MouseEvent<HTMLVideoElement>) => {
    if (menu) { setMenu(false); return }
    if (!touch) { toggle(); return }
    if (tapTimer.current) {
      window.clearTimeout(tapTimer.current); tapTimer.current = undefined
      const r = e.currentTarget.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      if (vod && x < 0.35) seekTo((video.current?.currentTime ?? 0) - 10)
      else if (vod && x > 0.65) seekTo((video.current?.currentTime ?? 0) + 10)
      else toggleFs()
      return
    }
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = undefined
      if (showUi && playing) { window.clearTimeout(hideTimer.current); setShowUi(false) } else poke()
    }, 260)
  }

  const uiVisible = showUi || !playing || !!err
  const btn = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15 active:bg-white/25'
  const size = fake ? 'fixed inset-0 z-[100] h-[100dvh] w-screen'
    : fs ? 'h-full w-full'
    : 'relative mx-auto aspect-video w-full max-w-5xl rounded-none sm:rounded-2xl'

  return (
    <div ref={box} onPointerMove={(e) => { if (e.pointerType === 'mouse') poke() }}
      onMouseLeave={() => !touch && playing && !menu && setShowUi(false)}
      className={`${size} overflow-hidden bg-black shadow-2xl ${uiVisible ? '' : 'cursor-none'}`}>
      <video ref={video} autoPlay playsInline className="h-full w-full bg-black" onClick={onTap}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration
          setDur(isFinite(d) ? d : 0)
          if (!hls.current && isFinite(d) && d > 0) setVod(true) // HLS nativo (Safari): duração finita = vídeo gravado
        }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)} onPlaying={() => { setLoading(false); setErr(undefined); setPlaying(true) }} onCanPlay={() => setLoading(false)} />

      {loading && !err && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Loader2 size={44} className="animate-spin text-white/80" /></div>}

      {!playing && !loading && !err && (
        <button onClick={toggle} aria-label="Reproduzir" className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent-600/90 shadow-xl backdrop-blur transition active:scale-95">
          <Play size={30} fill="white" className="ml-1" />
        </button>
      )}

      {err && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
          <Tv size={34} className="text-zinc-500" />
          <p className="max-w-sm text-sm text-zinc-200">{err}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => setTries((n) => n + 1)} className="flex items-center gap-1.5 rounded-full bg-accent-600 px-4 py-2 text-sm font-semibold"><RefreshCw size={15} />Tentar de novo</button>
            {onNext && <button onClick={onNext} className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"><SkipForward size={15} />Próximo canal</button>}
          </div>
        </div>
      )}

      <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 pb-8 pt-3 transition-opacity sm:px-4 ${uiVisible ? 'opacity-100' : 'opacity-0'}`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        {!vod && <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-bold"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />AO VIVO</span>}
        <span className="truncate text-sm font-semibold text-white [text-shadow:0_1px_3px_#000] sm:text-base">{channel.name}</span>
      </div>

      <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pt-10 transition-opacity sm:px-3 ${uiVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {menu && (
          <div className="absolute bottom-full right-2 mb-1 max-h-[60%] min-w-40 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 text-sm shadow-2xl backdrop-blur" onClick={(e) => e.stopPropagation()}>
            <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Qualidade</div>
            {[{ index: -1, label: 'Automática' }, ...levels].map((l) => (
              <button key={l.index} onClick={() => pickLevel(l.index)}
                className={`block w-full rounded-lg px-3 py-2 text-left transition hover:bg-white/10 ${level === l.index ? 'font-semibold text-accent-500' : 'text-zinc-200'}`}>{l.label}</button>
            ))}
          </div>
        )}
        {vod && dur > 0 && (
          <input type="range" min={0} max={Math.floor(dur)} value={Math.floor(cur)} onChange={(e) => seekTo(Number(e.target.value))}
            className="seek mb-1 h-5 w-full cursor-pointer accent-accent-500" aria-label="Posição" />
        )}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {onPrev && <button className={btn} onClick={onPrev} title="Canal anterior (←)" aria-label="Canal anterior"><SkipBack size={20} /></button>}
          <button className={btn} onClick={toggle} title="Pausar/Reproduzir (espaço)" aria-label="Pausar ou reproduzir">{playing ? <Pause size={22} fill="white" /> : <Play size={22} fill="white" />}</button>
          {onNext && <button className={btn} onClick={onNext} title="Próximo canal (→)" aria-label="Próximo canal"><SkipForward size={20} /></button>}
          {!touch && (
            <span className="ml-1 flex items-center gap-1">
              <button className={btn} onClick={() => setMuted(!muted)} title="Mudo (m)" aria-label="Mudo">{muted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
              <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false) }} className="w-20 accent-accent-500" aria-label="Volume" />
            </span>
          )}
          {touch && <button className={btn} onClick={() => setMuted(!muted)} aria-label="Mudo">{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>}
          {vod && dur > 0 && (
            <>
              <button className={btn} onClick={() => seekTo(cur - 10)} title="Voltar 10s (←)" aria-label="Voltar 10 segundos"><RotateCcw size={19} /></button>
              <button className={btn} onClick={() => seekTo(cur + 10)} title="Avançar 10s (→)" aria-label="Avançar 10 segundos"><RotateCw size={19} /></button>
              {goto === null ? (
                <button onClick={() => setGoto('')} title="Ir para um tempo específico" className="whitespace-nowrap rounded-md px-1.5 text-xs tabular-nums text-zinc-200 hover:bg-white/15 sm:text-sm">{fmt(cur)} / {fmt(dur)}</button>
              ) : (
                <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const t = parseTime(goto); if (t != null) seekTo(t); setGoto(null) }}>
                  <input autoFocus value={goto} onChange={(e) => setGoto(e.target.value)} onBlur={() => setGoto(null)} placeholder="1:23:45" inputMode="numeric"
                    className="w-20 rounded-md bg-white/15 px-2 py-1 text-xs tabular-nums outline-none ring-1 ring-accent-500 sm:text-sm" aria-label="Ir para o tempo" />
                </form>
              )}
            </>
          )}
          <span className="ml-auto flex items-center gap-0.5 sm:gap-1">
            {!vod && <button onClick={goLive} className="mr-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20" title="Voltar para o ao vivo">Ao vivo</button>}
            <button className={btn} onClick={onFavorite} title="Favorito" aria-label="Favorito"><Heart size={20} className={favorite ? 'fill-accent-500 text-accent-500' : ''} /></button>
            {levels.length > 1 && <button className={btn} onClick={() => setMenu((m) => !m)} title="Qualidade" aria-label="Qualidade"><Settings size={20} /></button>}
            {typeof document !== 'undefined' && document.pictureInPictureEnabled && !touch && <button className={btn} onClick={pip} title="Picture-in-Picture" aria-label="Picture-in-Picture"><PictureInPicture2 size={20} /></button>}
            <button className={btn} onClick={toggleFs} title="Tela cheia (f)" aria-label="Tela cheia">{expanded ? <Minimize size={20} /> : <Maximize size={20} />}</button>
          </span>
        </div>
      </div>
    </div>
  )
}
