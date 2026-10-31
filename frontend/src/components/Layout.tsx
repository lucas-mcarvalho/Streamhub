import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { auth } from '../api'

const links = [
  ['/', 'Início'], ['/library', 'Minha biblioteca'], ['/movies', 'Filmes'], ['/series', 'Séries'], ['/anime', 'Animes'],
  ['/downloads', 'Downloads'], ['/storage', 'Armazenamento'], ['/settings', 'Configurações'],
]

export default function Layout({ onLogout }: { onLogout: () => void }) {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-xl font-bold text-red-500">StreamHub</span>
          <nav className="flex flex-wrap gap-4 text-sm">
            {links.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'text-white' : 'text-zinc-400 hover:text-white')}>{label}</NavLink>
            ))}
          </nav>
          <form className="ml-auto flex" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav('/search?q=' + encodeURIComponent(q.trim())) }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar filmes, séries e animes…"
              className="w-64 rounded-l-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-red-500" />
            <button className="rounded-r-md bg-red-600 px-3 text-sm">Buscar</button>
          </form>
          <button className="text-sm text-zinc-400 hover:text-white" onClick={() => { auth.clear(); onLogout() }}>Sair</button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6"><Outlet /></main>
    </div>
  )
}
