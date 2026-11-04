import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api, ApiError, auth } from './api'
import Layout from './components/Layout'
import { DownloadsProvider } from './components/DownloadsProvider'
import { ToastProvider } from './components/Toast'
import { btn, input } from './components/ui'
import Browse from './pages/Browse'
import Downloads from './pages/Downloads'
import Explore from './pages/Explore'
import Library from './pages/Library'
import SearchPage from './pages/SearchPage'
import Settings from './pages/Settings'
import Storage from './pages/Storage'
import TitlePage from './pages/TitlePage'
import Watch from './pages/Watch'
import Episodes from './pages/Episodes'

function Login({ onDone }: { onDone: () => void }) {
  const [user, setUser] = useState('admin')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    auth.set(user, pass)
    try { await api('/storage/roots'); onDone() } catch (e) {
      auth.clear()
      setErr(e instanceof ApiError && e.status === 401 ? 'Usuário ou senha inválidos'
        : 'Servidor indisponível. Se ele acabou de iniciar, aguarde alguns segundos e tente de novo.')
    }
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 font-display text-6xl tracking-wider text-accent-500">StreamHub</div>
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', damping: 20 }}
        className="w-full max-w-sm space-y-4 rounded-md bg-black/75 p-8 shadow-2xl ring-1 ring-white/10">
        <h1 className="mb-2 text-2xl font-bold">Entrar</h1>
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
  if (!logged) return <ToastProvider><Login onDone={() => setLogged(true)} /></ToastProvider>
  return (
    <ToastProvider>
      <DownloadsProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout onLogout={() => setLogged(false)} />}>
            {/* tela única: Filmes e Séries, com a aba Animes (?aba=animes) */}
            <Route index element={<Browse />} />
            <Route path="movies" element={<Explore kind="MOVIE" />} />
            <Route path="series" element={<Explore kind="SERIES" />} />
            <Route path="animes/explore" element={<Explore kind="ANIME" />} />
            <Route path="animes" element={<Navigate to="/?aba=animes" replace />} />
            <Route path="library" element={<Library />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="title/:source/:type/:id" element={<TitlePage />} />
            <Route path="downloads" element={<Downloads />} />
            <Route path="storage" element={<Storage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="watch/:id" element={<Watch />} />
            <Route path="episodes/:kind/:group" element={<Episodes />} />
            {/* endereços antigos (telas separadas de cada modo) */}
            <Route path="cinema" element={<Navigate to="/" replace />} />
            <Route path="cinema/library" element={<Navigate to="/library" replace />} />
            <Route path="anime" element={<Navigate to="/?aba=animes" replace />} />
            <Route path="tv" element={<Navigate to="/" replace />} />
            <Route path="iptv/*" element={<Navigate to="/" replace />} />
            <Route path="anime/explore" element={<Navigate to="/animes/explore" replace />} />
            <Route path="anime/library" element={<Navigate to="/library?tab=anime" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </DownloadsProvider>
    </ToastProvider>
  )
}
