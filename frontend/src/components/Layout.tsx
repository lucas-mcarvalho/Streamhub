import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clapperboard, Download, Film, HardDrive, Home, Library, LogOut, type LucideIcon, Radio, Search, Settings, Sparkles, Swords, Tv } from 'lucide-react'
import { auth } from '../api'
import { useTheme } from '../theme'
import Footer from './Footer'

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean }

const cinemaNav: Item[] = [
  { to: '/cinema', label: 'Início', icon: Home, end: true },
  { to: '/movies', label: 'Filmes', icon: Film },
  { to: '/series', label: 'Séries', icon: Tv },
  { to: '/cinema/library', label: 'Minha biblioteca', icon: Library },
]
const common: Item[] = [
  { to: '/tv', label: 'TV ao vivo', icon: Radio },
  { to: '/downloads', label: 'Downloads', icon: Download },
  { to: '/storage', label: 'Armazenamento', icon: HardDrive },
  { to: '/settings', label: 'Configurações', icon: Settings },
]

function SearchBox({ className = '' }: { className?: string }) {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  return (
    <form className={`relative ${className}`} onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav('/search?q=' + encodeURIComponent(q.trim())) }}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar…"
        className="w-full rounded-full border border-line bg-surface/70 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 md:w-56 md:focus:w-72" />
    </form>
  )
}

function ModeSwitch() {
  const { theme } = useTheme()
  const nav = useNavigate()
  const toAnime = theme === 'cinema'
  return (
    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => nav(toAnime ? '/anime' : '/cinema')}
      className="flex items-center gap-2 rounded-full bg-gradient-to-r from-accent-600 to-glow px-3.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-accent-600/30">
      {toAnime ? <Swords size={14} /> : <Clapperboard size={14} />}
      <span className="hidden sm:inline">{toAnime ? 'Modo Anime' : 'Filmes & Séries'}</span>
    </motion.button>
  )
}

function Logo({ anime }: { anime?: boolean }) {
  const nav = useNavigate()
  return (
    <button onClick={() => nav('/')} className="flex items-center gap-2" title="Tela inicial">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent-500 to-glow text-white shadow-lg shadow-accent-600/40">
        {anime ? <Swords size={18} /> : <Clapperboard size={18} />}
      </span>
      <span className="font-display text-2xl font-bold tracking-wider">Stream<span className="text-accent-500">Hub</span></span>
    </button>
  )
}

export default function Layout({ onLogout }: { onLogout: () => void }) {
  const { theme } = useTheme()
  const loc = useLocation()
  const go = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 60)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  const logout = () => { auth.clear(); onLogout() }
  const page = (
    <motion.div key={loc.pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      <Outlet />
    </motion.div>
  )

  if (theme === 'anime') {
    const onExplore = loc.pathname === '/anime/explore'
    const sort = new URLSearchParams(loc.search).get('sort')
    const items: { to: string; label: string; icon: LucideIcon; active: boolean }[] = [
      { to: '/anime', label: 'Início', icon: Home, active: loc.pathname === '/anime' },
      { to: '/anime/library', label: 'Biblioteca', icon: Library, active: loc.pathname === '/anime/library' },
      { to: '/anime/explore?search=1', label: 'Pesquisar', icon: Search, active: onExplore && sort !== 'AIRING' },
      { to: '/anime/explore?sort=AIRING', label: 'Lançamentos', icon: Sparkles, active: onExplore && sort === 'AIRING' },
    ]
    const tools: { to: string; label: string; icon: LucideIcon; hideMobile?: boolean }[] = [
      { to: '/downloads', label: 'Downloads', icon: Download },
      { to: '/storage', label: 'Armazenamento', icon: HardDrive, hideMobile: true },
      { to: '/settings', label: 'Configurações', icon: Settings },
    ]
    const home = loc.pathname === '/anime'
    return (
      <div className="min-h-screen">
        <header className="fixed inset-x-0 top-0 z-40 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3 md:px-8">
          <div className="flex items-center">
            <button onClick={() => go('/')} title="Tela inicial" className="grid h-10 w-10 place-items-center rounded-full bg-accent-500 text-white shadow-lg shadow-accent-500/30 transition hover:scale-105"><Swords size={18} /></button>
          </div>
          <nav className="flex items-center gap-0.5 rounded-2xl border border-white/10 bg-black/50 px-1.5 py-1.5 shadow-xl backdrop-blur-xl">
            {items.map((n) => (
              <Link key={n.label} to={n.to} className="relative rounded-xl px-2.5 py-2 text-sm font-semibold md:px-3.5">
                <span className={`relative z-10 flex items-center gap-2 transition ${n.active ? 'text-white' : 'text-zinc-400 hover:text-white'}`}><n.icon size={16} /><span className="hidden md:inline">{n.label}</span></span>
                {n.active && <motion.span layoutId="anime-underline" className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-accent-500" />}
              </Link>
            ))}
          </nav>
          <div className="flex items-center justify-end gap-1.5">
            <ModeSwitch />
            {tools.map((t) => (
              <Link key={t.to} to={t.to} title={t.label} className={`grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/40 text-zinc-300 backdrop-blur transition hover:border-accent-500 hover:text-accent-400 ${t.hideMobile ? 'hidden md:grid' : 'hidden sm:grid'}`}><t.icon size={16} /></Link>
            ))}
            <button onClick={logout} title="Sair" className="hidden h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/40 text-zinc-300 backdrop-blur transition hover:border-accent-500 hover:text-accent-400 sm:grid"><LogOut size={16} /></button>
          </div>
          <div className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-canvas via-canvas/80 to-transparent transition-opacity duration-300 ${!home || scrolled ? 'opacity-100' : 'opacity-0'}`} />
        </header>
        <main className={home ? '' : 'mx-auto max-w-[1500px] px-4 pb-12 pt-24 md:px-8'}>{page}</main>
        <Footer />
      </div>
    )
  }

  const nav = [...cinemaNav, ...common]
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/50 bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Logo />
          <nav className="no-scrollbar flex gap-1 overflow-x-auto text-sm">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="relative whitespace-nowrap px-3 py-1.5 font-medium">
                {({ isActive }) => (
                  <>
                    <span className={`relative z-10 ${isActive ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>{n.label}</span>
                    {isActive && <motion.span layoutId="top-underline" className="absolute inset-x-2 -bottom-[13px] h-0.5 rounded-full bg-accent-500" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <SearchBox />
            <ModeSwitch />
            <button onClick={logout} className="text-zinc-400 transition hover:text-white" title="Sair"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{page}</main>
    </div>
  )
}
