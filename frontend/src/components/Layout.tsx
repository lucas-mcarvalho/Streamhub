import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, HardDrive, ListChecks, LogOut, Search, Settings, X } from 'lucide-react'
import { auth, type Download as DownloadT } from '../api'
import Footer from './Footer'
import { useDownloads } from './DownloadsProvider'
import { EpisodePickerProvider, useEpisodePicker } from './EpisodePicker'
import { DownloadFlyLayer, LANDED } from './DownloadFly'

type Tab = { to: string; label: string; match: (path: string) => boolean }

/** Tela principal única (Filmes e Séries, com a aba Animes dentro dela). */
const TABS: Tab[] = [
  { to: '/', label: 'Início', match: (p) => p === '/' || p === '/movies' || p === '/series' || p.startsWith('/animes') },
]
const LINKS: Tab[] = [
  { to: '/library', label: 'Minha biblioteca', match: (p) => p.startsWith('/library') || p.startsWith('/episodes') },
]

function SearchBox() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  useEffect(() => { if (open) ref.current?.focus() }, [open])
  return (
    <form className="flex items-center" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav('/search?q=' + encodeURIComponent(q.trim())) }}>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div key="box" initial={{ width: 36, opacity: 0.6 }} animate={{ width: 'auto', opacity: 1 }} exit={{ width: 36, opacity: 0 }}
            className="flex items-center gap-2 border border-white/70 bg-black/80 px-2 py-1">
            <Search size={18} className="shrink-0" />
            <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { if (!q) setOpen(false) }}
              placeholder="Títulos, animes, séries…" className="w-36 bg-transparent text-sm outline-none placeholder:text-zinc-400 sm:w-56" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Limpar"><X size={16} /></button>}
          </motion.div>
        ) : (
          <button key="btn" type="button" onClick={() => setOpen(true)} title="Pesquisar" className="grid h-9 w-9 place-items-center text-zinc-100 transition hover:text-zinc-300"><Search size={20} /></button>
        )}
      </AnimatePresence>
    </form>
  )
}

const ACTIVE = new Set(['DOWNLOADING', 'QUEUED', 'SELECTING'])

/** Ícone de downloads do cabeçalho: contador, anel com o progresso total e uma lista rápida ao passar o mouse. */
function DownloadsButton({ list, className }: { list: DownloadT[]; className: string }) {
  const active = list.filter((d) => ACTIVE.has(d.status))
  const count = active.length
  const total = active.reduce((a, d) => a + d.sizeBytes, 0)
  const progress = total > 0 ? active.reduce((a, d) => a + d.progress * d.sizeBytes, 0) / total
    : count ? active.reduce((a, d) => a + d.progress, 0) / count : 0
  const speed = active.reduce((a, d) => a + d.dlSpeed, 0)
  const pick = useEpisodePicker()
  // pulinho quando um download novo "chega" voando
  const [bump, setBump] = useState(0)
  useEffect(() => {
    const h = () => setBump((b) => b + 1)
    window.addEventListener(LANDED, h)
    return () => window.removeEventListener(LANDED, h)
  }, [])
  const label = count === 0 ? 'Downloads: nenhum em andamento' : `Downloads: ${count} em andamento`
  const r = 15, c = 2 * Math.PI * r
  return (
    <div className="group/dl relative">
      <Link to="/downloads" title={label} aria-label={label} className={className + ' relative'} data-download-target>
        <motion.span key={bump} className="relative grid h-9 w-9 place-items-center"
          animate={bump ? { scale: [1, 1.35, 0.9, 1.08, 1], rotate: [0, -12, 8, 0] } : undefined} transition={{ duration: 0.55 }}>
          {count > 0 && (
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="2.5" />
              <motion.circle cx="18" cy="18" r={r} fill="none" stroke="rgb(var(--accent))" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - Math.max(0.03, progress)) }} transition={{ duration: 0.6 }} />
            </svg>
          )}
          <motion.span animate={count > 0 ? { y: [0, 2.5, 0] } : { y: 0 }} transition={count > 0 ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : undefined}>
            <Download size={count > 0 ? 16 : 19} aria-hidden="true" />
          </motion.span>
          {bump > 0 && <motion.span key={'ring' + bump} aria-hidden="true" className="absolute inset-0 rounded-full border-2 border-accent-500"
            initial={{ scale: 0.6, opacity: 0.9 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ duration: 0.7 }} />}
        </motion.span>
        <AnimatePresence>
          {count > 0 && (
            <motion.span key={count} aria-hidden="true" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold leading-none text-white shadow-lg shadow-accent-600/40 ring-2 ring-canvas">
              {count > 99 ? '99+' : count}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
      {count > 0 && (
        <div className="tv-hidden pointer-events-none invisible absolute right-0 top-full z-50 w-72 pt-2 opacity-0 transition group-hover/dl:pointer-events-auto group-hover/dl:visible group-hover/dl:opacity-100 max-md:hidden">
          <div className="glass rounded-xl p-3 shadow-2xl">
            <div className="mb-2 flex items-baseline justify-between text-xs">
              <span className="font-bold">{count} {count === 1 ? 'download' : 'downloads'} em andamento</span>
              <span className="text-zinc-400">{(speed / 1048576).toFixed(1)} MB/s</span>
            </div>
            <ul className="space-y-2">
              {active.slice(0, 4).map((d) => (
                <li key={d.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-zinc-200" title={d.title}>{d.title}</span>
                    <span className="shrink-0 text-zinc-400">{d.status === 'DOWNLOADING' ? `${Math.floor(d.progress * 100)}%` : d.status === 'SELECTING' ? 'escolher' : 'na fila'}</span>
                    {d.kind !== 'MOVIE' && <button type="button" onClick={() => pick(d)} title="Escolher episódios" aria-label={`Escolher episódios de ${d.title}`}
                      className="shrink-0 rounded p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"><ListChecks size={14} /></button>}</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${d.progress * 100}%` }} /></div>
                </li>
              ))}
            </ul>
            {count > 4 && <p className="mt-2 text-[11px] text-zinc-400">e mais {count - 4}…</p>}
            <Link to="/downloads" className="mt-2 block text-center text-xs font-semibold text-accent-400 hover:underline">Ver todos</Link>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout({ onLogout }: { onLogout: () => void }) {
  const downloads = useDownloads()
  const loc = useLocation()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 40)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  const logout = () => { auth.clear(); onLogout() }
  // as telas iniciais das abas ocupam a tela toda, com o cabeçalho transparente sobre o destaque
  const fullBleed = loc.pathname === '/'
  const solid = scrolled || !fullBleed
  const tool = 'grid h-9 w-9 place-items-center text-zinc-100 transition hover:text-zinc-300'

  return (
    <EpisodePickerProvider>
    <div className="min-h-screen">
      <header className={`fixed inset-x-0 top-0 z-40 transition-colors duration-500 ${solid ? 'bg-canvas/95 shadow-lg shadow-black/40 backdrop-blur' : 'bg-gradient-to-b from-black/80 to-transparent'}`}>
        <div className="flex items-center gap-4 px-4 py-2.5 md:gap-8 md:px-12 md:py-3">
          <Link to="/" className="shrink-0 font-display text-3xl leading-none tracking-wider text-accent-500 md:text-4xl" title="Início">StreamHub</Link>
          <nav className="hidden items-center gap-5 text-sm lg:flex">
            {[...TABS, ...LINKS].map((t) => {
              const active = t.match(loc.pathname)
              const isTab = TABS.includes(t)
              return (
                <Link key={t.to} to={t.to} className={`relative py-1 transition ${active ? 'font-bold text-white' : 'text-zinc-300 hover:text-zinc-100'}`}>
                  {t.label}
                  {active && isTab && <motion.span layoutId="tab-underline" className="absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-accent-500" />}
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <SearchBox />
            <DownloadsButton list={downloads ?? []} className={tool} />
            <Link to="/storage" title="Armazenamento" className={tool}><HardDrive size={19} /></Link>
            <Link to="/settings" title="Configurações" className={tool}><Settings size={19} /></Link>
            <button onClick={logout} title="Sair" className={tool + ' max-sm:hidden'}><LogOut size={19} /></button>
          </div>
        </div>
        {/* celular e telas médias: abas em pílulas logo abaixo do logo */}
        <nav className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5 lg:hidden">
          {[...TABS, ...LINKS].map((t) => {
            const active = t.match(loc.pathname)
            return (
              <Link key={t.to} to={t.to}
                className={`shrink-0 rounded-full border px-3.5 py-1 text-xs font-semibold transition ${active ? 'border-white bg-white text-black' : 'border-white/40 bg-black/30 text-zinc-100 backdrop-blur'}`}>
                {t.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className={fullBleed ? '' : 'mx-auto max-w-[1500px] px-4 pb-12 pt-32 md:px-8 lg:pt-24'}>
        <motion.div key={loc.pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
          <Outlet />
        </motion.div>
      </main>
      <Footer />
      <DownloadFlyLayer />
    </div>
    </EpisodePickerProvider>
  )
}
