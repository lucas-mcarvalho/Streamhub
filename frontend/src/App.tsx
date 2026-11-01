import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clapperboard } from 'lucide-react'
import { api, auth } from './api'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import { btn, input } from './components/ui'
import Downloads from './pages/Downloads'
import Explore from './pages/Explore'
import Home from './pages/Home'
import Library from './pages/Library'
import AnimeHome from './pages/AnimeHome'
import ModeHome from './pages/ModeHome'
import SearchPage from './pages/SearchPage'
import Settings from './pages/Settings'
import Channels from './pages/Channels'
import Storage from './pages/Storage'
import TitlePage from './pages/TitlePage'
import Watch from './pages/Watch'
import { ThemeProvider } from './theme'

function Login({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState('admin')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    auth.set(user, pass)
    try { await api('/storage/roots'); onDone() } catch { auth.clear(); setErr('Usuário ou senha inválidos') }
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 20 }}
        className="glass w-full max-w-sm space-y-4 rounded-3xl p-8 shadow-2xl">
        <div className="mb-2 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent-500 to-glow shadow-lg shadow-accent-600/40"><Clapperboard size={22} /></span>
          <h1 className="font-display text-3xl font-bold tracking-wider">Stream<span className="text-accent-500">Hub</span></h1>
        </div>
        <input className={input} value={user} onChange={(e) => setUser(e.target.value)} placeholder="Usuário" />
        <input className={input} type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Senha" autoFocus />
        {err && <motion.p initial={{ x: -8 }} animate={{ x: [-8, 8, -4, 0] }} className="text-sm text-red-400">{err}</motion.p>}
        <button className={btn + ' w-full py-2.5'}>Entrar</button>
      </motion.form>
    </div>
  )
}

export default function App() {
  const [logged, setLogged] = useState(!!auth.get())
  useEffect(() => {
    const h = () => setLogged(false)
    window.addEventListener('streamhub:logout', h)
    return () => window.removeEventListener('streamhub:logout', h)
  }, [])
  if (!logged) return <ThemeProvider><ToastProvider><Login onDone={() => setLogged(true)} /></ToastProvider></ThemeProvider>
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout onLogout={() => setLogged(false)} />}>
              <Route index element={<Home />} />
              <Route path="cinema" element={<ModeHome mode="cinema" />} />
              <Route path="movies" element={<Explore kind="MOVIE" />} />
              <Route path="series" element={<Explore kind="SERIES" />} />
              <Route path="cinema/library" element={<Library scope="cinema" />} />
              <Route path="anime" element={<AnimeHome />} />
              <Route path="anime/explore" element={<Explore kind="ANIME" />} />
              <Route path="anime/library" element={<Library scope="anime" />} />
              <Route path="library" element={<Navigate to="/cinema/library" replace />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="title/:source/:type/:id" element={<TitlePage />} />
              <Route path="tv" element={<Channels />} />
              <Route path="downloads" element={<Downloads />} />
              <Route path="storage" element={<Storage />} />
              <Route path="settings" element={<Settings />} />
              <Route path="watch/:id" element={<Watch />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}
