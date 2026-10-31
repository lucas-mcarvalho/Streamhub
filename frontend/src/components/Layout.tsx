import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clapperboard, Compass, Download, Film, HardDrive, Home, Library, LogOut, type LucideIcon, Radio, Search, Settings, Swords, Tv } from 'lucide-react'
import { auth } from '../api'
import { useTheme } from '../theme'

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean }

const cinemaNav: Item[] = [
  { to: '/cinema', label: 'Início', icon: Home, end: true },
  { to: '/movies', label: 'Filmes', icon: Film },
  { to: '/series', label: 'Séries', icon: Tv },
  { to: '/cinema/library', label: 'Minha biblioteca', icon: Library },
]
const animeNav: Item[] = [
  { to: '/anime', label: 'Início', icon: Home, end: true },
  { to: '/anime/explore', label: 'Explorar', icon: Compass },
  { to: '/anime/library', label: 'Minha biblioteca', icon: Library },
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
      {toAnime ? 'Modo Anime' : 'Filmes & Séries'}
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
  const logout = () => { auth.clear(); onLogout() }
  const page = (
    <motion.div key={loc.pathname} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
      <Outlet />
    </motion.div>
  )

  if (theme === 'anime') {
    const nav = [...animeNav, ...common]
    return (
      <div className="min-h-screen md:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-line/60 bg-surface/50 p-5 backdrop-blur-xl md:flex">
          <Logo anime />
          <SearchBox className="[&_input]:md:w-full" />
          <nav className="flex flex-1 flex-col gap-1">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="relative rounded-xl px-3 py-2.5 text-sm font-medium">
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="side-pill" className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent-600/40 to-glow/20 ring-1 ring-accent-500/40" />}
                    <span className={`relative flex items-center gap-3 ${isActive ? 'text-white' : 'text-zinc-400 hover:text-white'}`}><n.icon size={18} />{n.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <ModeSwitch />
          <button onClick={logout} className="flex items-center gap-3 px-3 text-sm text-zinc-400 hover:text-white"><LogOut size={16} />Sair</button>
        </aside>
        <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/80 px-4 py-2 backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between gap-2"><Logo anime /><ModeSwitch /></div>
          <nav className="no-scrollbar mt-2 flex gap-4 overflow-x-auto text-sm">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `shrink-0 py-1 ${isActive ? 'text-accent-400' : 'text-zinc-400'}`}>{n.label}</NavLink>)}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">{page}</main>
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
