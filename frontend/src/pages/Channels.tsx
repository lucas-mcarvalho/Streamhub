import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, Plus, Radio, Search, Trash2, Tv } from 'lucide-react'
import { api, type Channel, type ChannelSource } from '../api'
import { useToast } from '../components/Toast'
import { btn, btnGhost, input, Modal, Notice, PageTitle, Spinner } from '../components/ui'
import { useAsync } from '../hooks'
import { useForceTheme } from '../theme'

const FAV_KEY = 'streamhub.tv.favs'
const PAGE = 90

function loadFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]')) } catch { return new Set() }
}

function Logo({ c }: { c: Channel }) {
  const [bad, setBad] = useState(false)
  return c.logo && !bad
    ? <img src={c.logo} alt="" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 h-full w-full object-contain p-3" />
    : <Tv size={28} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-600" />
}

function AddSource({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const save = async () => {
    try { await api('/channels/sources', { method: 'POST', json: { name, url } }); toast('Lista adicionada'); onDone() }
    catch (e) { toast((e as Error).message, 'err') }
  }
  return (
    <Modal title="Adicionar lista de canais" onClose={onClose}>
      <p className="mb-3 text-xs text-zinc-400">Informe o endereço de uma lista M3U/M3U8. Use apenas listas de canais que você tem direito de assistir.</p>
      <input className={input + ' mb-3'} placeholder="Nome (ex.: Minha lista)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={input + ' mb-4'} placeholder="https://exemplo.com/lista.m3u" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button className={btn} disabled={!name.trim() || !url.trim()} onClick={save}>Adicionar</button>
    </Modal>
  )
}

export default function Channels() {
  useForceTheme('cinema')
  const toast = useToast()
  const sources = useAsync(() => api<ChannelSource[]>('/channels/sources'), [])
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const [onlyHls, setOnlyHls] = useState(true)
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [favs, setFavs] = useState<Set<string>>(loadFavs)
  const [limit, setLimit] = useState(PAGE)
  const [current, setCurrent] = useState<Channel | null>(null)
  const [playErr, setPlayErr] = useState<string>()
  const [adding, setAdding] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const playerBox = useRef<HTMLDivElement>(null)

  useEffect(() => { if (sourceId == null && sources.data?.length) setSourceId(sources.data[0].id) }, [sources.data, sourceId])
  const list = useAsync(() => (sourceId == null ? Promise.resolve([] as Channel[]) : api<Channel[]>('/channels?source=' + sourceId)), [sourceId])
  useEffect(() => { setGroup(''); setLimit(PAGE); setCurrent(null) }, [sourceId])
  useEffect(() => { setLimit(PAGE) }, [q, group, onlyHls, onlyFavs])

  const key = (c: Channel) => `${sourceId}|${c.name}|${c.group}`
  const toggleFav = (c: Channel) => setFavs((prev) => {
    const n = new Set(prev)
    n.has(key(c)) ? n.delete(key(c)) : n.add(key(c))
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...n])) } catch { /* sem armazenamento */ }
    return n
  })

  // reprodução HLS
  useEffect(() => {
    const v = video.current
    if (!v || !current) return
    setPlayErr(undefined)
    let hls: Hls | undefined
    if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 20, enableWorker: true })
      hls.loadSource(current.playUrl)
      hls.attachMedia(v)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}) })
      let netRetries = 0, mediaRetries = 0
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return
        // tenta se recuperar antes de avisar (trocas de anúncio e quedas de rede são comuns em TV ao vivo)
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 3) { netRetries++; hls?.startLoad(); return }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) { mediaRetries++; hls?.recoverMediaError(); return }
        if (v.currentTime > 0 && !v.paused && !v.ended && v.readyState > 2) return // continua tocando
        setPlayErr('Este canal está indisponível no momento. Listas públicas mudam e falham com frequência; tente outro.')
      })
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = current.playUrl
      v.play().catch(() => {})
    } else {
      setPlayErr('Este navegador não suporta reprodução de TV ao vivo (HLS).')
    }
    return () => { hls?.destroy(); v.removeAttribute('src'); v.load() }
  }, [current])

  const channels = list.data ?? []
  const groups = useMemo(() => [...new Set(channels.map((c) => c.group))].sort((a, b) => a.localeCompare(b)), [channels])
  const filtered = channels.filter((c) =>
    (!onlyHls || c.hls) && (!group || c.group === group) && (!onlyFavs || favs.has(key(c)))
    && (!q || c.name.toLowerCase().includes(q.toLowerCase())))
  const shown = filtered.slice(0, limit)

  const play = (c: Channel) => {
    setCurrent(c)
    playerBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const removeSource = async (s: ChannelSource) => {
    if (!confirm(`Remover a lista "${s.name}"?`)) return
    try { await api(`/channels/sources/${s.id}`, { method: 'DELETE' }); if (sourceId === s.id) setSourceId(null); sources.reload() }
    catch (e) { toast((e as Error).message, 'err') }
  }

  return (
    <div>
      <PageTitle sub="Canais abertos de listas públicas (iptv-org). Recurso de teste: a disponibilidade dos canais varia.">TV ao vivo</PageTitle>

      <div ref={playerBox} className="mb-8 scroll-mt-24">
        <AnimatePresence>
          {current && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="relative mx-auto aspect-video w-full max-w-5xl overflow-hidden rounded-2xl bg-black shadow-2xl">
                <video ref={video} controls autoPlay playsInline className="h-full w-full" onPlaying={() => setPlayErr(undefined)} />
                <span className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />AO VIVO</span>
              </div>
              <div className="mx-auto mt-3 flex max-w-5xl items-center justify-between gap-3">
                <div className="min-w-0"><div className="truncate font-display text-2xl font-semibold">{current.name}</div><div className="text-xs text-zinc-400">{current.group}</div></div>
                <button className={btnGhost} onClick={() => toggleFav(current)}><Heart size={16} className={favs.has(key(current)) ? 'fill-accent-500 text-accent-500' : ''} />Favorito</button>
              </div>
              {playErr && <div className="mx-auto mt-3 max-w-5xl"><Notice text={playErr} /></div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {sources.data?.map((s) => (
          <span key={s.id} className="relative inline-flex">
            <button onClick={() => setSourceId(s.id)} className="relative rounded-full border border-line px-4 py-1.5 text-sm font-semibold transition hover:border-accent-500/60">
              {sourceId === s.id && <motion.span layoutId="src-pill" className="absolute inset-0 rounded-full bg-accent-600" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
              <span className={`relative ${sourceId === s.id ? 'text-white' : 'text-zinc-300'}`}>{s.name}</span>
            </button>
            {!s.builtin && <button onClick={() => removeSource(s)} title="Remover lista" className="ml-1 text-zinc-500 hover:text-red-400"><Trash2 size={14} /></button>}
          </span>
        ))}
        <button className={btnGhost} onClick={() => setAdding(true)}><Plus size={14} />Adicionar lista</button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar canal…"
            className="w-full rounded-full border border-line bg-surface/70 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
        </div>
        <select className={input + ' !w-auto'} value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Todos os grupos</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="accent-accent-500" checked={onlyHls} onChange={(e) => setOnlyHls(e.target.checked)} />Só compatíveis (HLS)</label>
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="accent-accent-500" checked={onlyFavs} onChange={(e) => setOnlyFavs(e.target.checked)} />Só favoritos</label>
        <span className="ml-auto text-xs text-zinc-500">{filtered.length} canal(is)</span>
      </div>

      {list.error && <Notice text={list.error} />}
      {list.loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {shown.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 14) * 0.02 }} whileHover={{ y: -4 }}
                className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-surface/70 transition ${current?.id === c.id ? 'border-accent-500 shadow-lg shadow-accent-500/20' : 'border-line hover:border-accent-500/50'}`}
                onClick={() => play(c)}>
                <div className="relative aspect-video overflow-hidden bg-surface2/60"><Logo c={c} /></div>
                <div className="p-2.5">
                  <div className="truncate text-sm font-semibold" title={c.name}>{c.name}</div>
                  <div className="flex items-center gap-1 truncate text-[11px] text-zinc-400"><Radio size={10} />{c.group}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleFav(c) }} title="Favorito"
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 opacity-0 backdrop-blur transition group-hover:opacity-100">
                  <Heart size={14} className={favs.has(key(c)) ? 'fill-accent-500 text-accent-500' : ''} />
                </button>
              </motion.div>
            ))}
          </div>
          {filtered.length === 0 && <p className="py-10 text-center text-zinc-500">Nenhum canal encontrado.</p>}
          {filtered.length > limit && <div className="mt-6 text-center"><button className={btnGhost + ' px-6 py-2'} onClick={() => setLimit(limit + PAGE)}>Mostrar mais ({filtered.length - limit})</button></div>}
        </>
      )}
      {adding && <AddSource onClose={() => setAdding(false)} onDone={() => { setAdding(false); sources.reload() }} />}
    </div>
  )
}
