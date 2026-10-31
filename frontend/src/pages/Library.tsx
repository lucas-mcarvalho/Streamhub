import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, kindLabel, type LibraryFile } from '../api'
import { input, Spinner } from '../components/ui'
import { useAsync } from '../hooks'
import { LibraryGroups } from './Browse'

const tabs: [string, string][] = [['', 'Tudo'], ['MOVIE', 'Filmes'], ['SERIES', 'Séries'], ['ANIME', 'Animes'], ['GENERAL', 'Outros']]

export default function Library() {
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [tab, setTab] = useState('')
  const { data, loading } = useAsync(() => api<LibraryFile[]>('/library'), [])
  const shown = data?.filter((f) => (!tab || f.kind === tab) && (!q || (f.group + ' ' + f.name).toLowerCase().includes(q.toLowerCase()))) ?? []
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Minha biblioteca</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 text-sm ${tab === k ? 'bg-red-600' : 'bg-zinc-800 hover:bg-zinc-700'}`}>{label}</button>
        ))}
        <input className={input + ' ml-auto max-w-xs'} placeholder="Filtrar por nome…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading ? <Spinner /> : shown.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum vídeo encontrado. Os arquivos aparecem aqui depois de baixados, em qualquer pasta registrada em Armazenamento.</p>
      ) : <LibraryGroups files={shown} open />}
      <p className="mt-4 text-xs text-zinc-500">Tipos: {Object.values(kindLabel).join(', ')}.</p>
    </div>
  )
}
