import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, fmtBytes, type CatalogItem, type LibraryFile } from '../api'
import { Card, input, Notice, Spinner } from '../components/ui'
import { useAsync } from '../hooks'

export function LibraryGroups({ files, open }: { files: LibraryFile[]; open?: boolean }) {
  const groups = new Map<string, LibraryFile[]>()
  files.forEach((f) => groups.set(f.group, [...(groups.get(f.group) ?? []), f]))
  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([g, fs]) => (
        <details key={g} className="rounded-lg bg-zinc-900 p-3" open={open || groups.size === 1}>
          <summary className="cursor-pointer font-medium">{g} <span className="text-xs text-zinc-500">({fs.length} arquivo{fs.length > 1 ? 's' : ''})</span></summary>
          <ul className="mt-2 divide-y divide-zinc-800 text-sm">
            {fs.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate">{f.season != null ? `T${f.season} E${f.episode} · ` : ''}{f.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-zinc-400">{fmtBytes(f.sizeBytes)}
                  <Link to={`/watch/${f.id}`} className="rounded bg-red-600 px-3 py-1 text-white">▶ Assistir</Link></span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

export default function Browse({ kind, title }: { kind: 'MOVIE' | 'SERIES' | 'ANIME'; title: string }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(1)
  const lib = useAsync(() => api<LibraryFile[]>('/library?kind=' + kind), [kind])
  const cat = useAsync(() => api<CatalogItem[]>(`/catalog/discover?kind=${kind}&page=${page}&q=${encodeURIComponent(term)}`), [kind, page, term])
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <h2 className="mb-2 text-lg font-semibold">Na biblioteca</h2>
      <div className="mb-8">
        {lib.loading ? <Spinner /> : lib.data && lib.data.length > 0 ? <LibraryGroups files={lib.data} />
          : <p className="text-sm text-zinc-500">Nada baixado ainda. Cadastre uma pasta do tipo "{title}" em Armazenamento e baixe algo pelo catálogo.</p>}
      </div>
      <h2 className="mb-2 text-lg font-semibold">Explorar</h2>
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(1); setTerm(q) }}>
        <input className={input + ' max-w-sm'} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar em ${title.toLowerCase()}…`} />
      </form>
      {cat.error && <Notice text={cat.error} />}
      {cat.loading ? <Spinner /> : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {cat.data?.map((i) => <Card key={i.ref} item={i} />)}
        </div>
      )}
      <div className="mt-6 flex items-center gap-3 text-sm">
        <button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded border border-zinc-700 px-3 py-1 disabled:opacity-40">Anterior</button>
        <span>Página {page}</span>
        <button onClick={() => setPage(page + 1)} className="rounded border border-zinc-700 px-3 py-1">Próxima</button>
      </div>
    </div>
  )
}
