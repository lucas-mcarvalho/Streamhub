import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { api, auth } from './api'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import { btn, input } from './components/ui'
import Browse from './pages/Browse'
import Downloads from './pages/Downloads'
import Home from './pages/Home'
import Library from './pages/Library'
import SearchPage from './pages/SearchPage'
import Settings from './pages/Settings'
import Storage from './pages/Storage'
import TitlePage from './pages/TitlePage'
import Watch from './pages/Watch'

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
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={submit} className="w-80 space-y-4 rounded-xl bg-zinc-900 p-6">
        <h1 className="text-2xl font-bold text-red-500">StreamHub</h1>
        <input className={input} value={user} onChange={(e) => setUser(e.target.value)} placeholder="Usuário" />
        <input className={input} type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Senha" autoFocus />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className={btn + ' w-full'}>Entrar</button>
      </form>
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
      <BrowserRouter>
        <Routes>
          <Route element={<Layout onLogout={() => setLogged(false)} />}>
            <Route index element={<Home />} />
            <Route path="library" element={<Library />} />
            <Route path="movies" element={<Browse kind="MOVIE" title="Filmes" />} />
            <Route path="series" element={<Browse kind="SERIES" title="Séries" />} />
            <Route path="anime" element={<Browse kind="ANIME" title="Animes" />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="title/:source/:type/:id" element={<TitlePage />} />
            <Route path="downloads" element={<Downloads />} />
            <Route path="storage" element={<Storage />} />
            <Route path="settings" element={<Settings />} />
            <Route path="watch/:id" element={<Watch />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
