import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, HardDrive, LogOut, Search, Settings, X } from 'lucide-react'
import { auth } from '../api'
import Footer from './Footer'
import { useDownloads } from './DownloadsProvider'

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

function DownloadIcon({ count }: { count: number }) {
  return <span className="relative inline-flex shrink-0" role="img" aria-label={`Downloads: ${count} em andamento`}>
    <Download size={19} aria-hidden="true" />
    {count > 0 && <span aria-hidden="true" className="absolute -right-2.5 -top-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-[10px] font-bold leading-none text-white">{count > 99 ? '99+' : count}</span>}
  </span>
}

export default function Layout({ onLogout }: { onLogout: () => void }) {
  const downloads = useDownloads()
  const activeDownloads = downloads?.filter((d) => d.status === 'DOWNLOADING' || d.status === 'QUEUED').length ?? 0
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
            <Link to="/downloads" title="Downloads" className={tool}><DownloadIcon count={activeDownloads} /></Link>
            <Link to="/storage" title="Armazenamento" className={tool + ' max-sm:hidden'}><HardDrive size={19} /></Link>
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
    </div>
  )
}
