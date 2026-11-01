import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { api, genrePt, type CatalogItem, type Genre } from '../api'
import { btnGhost, Card, Notice, PageTitle, PosterSkeleton } from '../components/ui'
import { useForceTheme } from '../theme'

type Kind = 'MOVIE' | 'SERIES' | 'ANIME'

const SORTS: Record<Kind, [string, string][]> = {
  ANIME: [['POPULAR', 'Populares'], ['TRENDING', 'Em alta'], ['SCORE', 'Melhor nota'], ['AIRING', 'Em exibição']],
  MOVIE: [['POPULAR', 'Populares'], ['SCORE', 'Melhor nota'], ['NEW', 'Lançamentos']],
  SERIES: [['POPULAR', 'Populares'], ['SCORE', 'Melhor nota'], ['NEW', 'Lançamentos']],
}
const TITLES: Record<Kind, [string, string]> = {
  MOVIE: ['Filmes', 'Explore por gênero, nota e lançamentos'],
  SERIES: ['Séries', 'Explore por gênero, nota e lançamentos'],
  ANIME: ['Explorar animes', 'Filtre por gênero e veja a nota de cada título'],
}

export default function Explore({ kind }: { kind: Kind }) {
  useForceTheme(kind === 'ANIME' ? 'anime' : 'cinema')
  const [params] = useSearchParams()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [genre, setGenre] = useState(params.get('genre') ?? '')
  const [sort, setSort] = useState(params.get('sort') ?? 'POPULAR')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [genres, setGenres] = useState<Genre[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string>()
  const [more, setMore] = useState(true)
  const seq = useRef(0)

  useEffect(() => { setGenre(params.get('genre') ?? ''); setSort(params.get('sort') ?? 'POPULAR'); setQ(''); setTerm('') }, [kind, params.get('sort')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api<Genre[]>('/catalog/genres?kind=' + kind).then(setGenres).catch(() => setGenres([])) }, [kind])
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 450); return () => clearTimeout(t) }, [q])
  useEffect(() => { setPage(1) }, [kind, term, genre, sort])

  useEffect(() => {
    const my = ++seq.current
    setLoading(true)
    const qs = new URLSearchParams({ kind, page: String(page), sort })
    if (term) qs.set('q', term)
    if (genre && !term) qs.set('genre', genre)
    api<CatalogItem[]>('/catalog/discover?' + qs)
      .then((d) => { if (my !== seq.current) return; setItems((prev) => (page === 1 ? d : [...prev, ...d])); setMore(d.length >= 18); setErr(undefined) })
      .catch((e) => { if (my === seq.current) { setErr(e.message); if (page === 1) setItems([]) } })
      .finally(() => { if (my === seq.current) setLoading(false) })
  }, [kind, term, genre, sort, page])

  const [title, sub] = TITLES[kind]
  return (
    <div>
      <PageTitle sub={sub}>{title}</PageTitle>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input autoFocus={params.has('search')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar em ${title.toLowerCase()}…`}
            className="w-full rounded-full border border-line bg-surface/70 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20" />
        </div>
        {!term && (
          <div className="relative flex rounded-full border border-line bg-surface/70 p-1">
            {SORTS[kind].map(([k, label]) => (
              <button key={k} onClick={() => setSort(k)} className="relative rounded-full px-3.5 py-1.5 text-xs font-semibold">
                {sort === k && <motion.span layoutId="sort-pill" className="absolute inset-0 rounded-full bg-accent-600" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
                <span className={`relative ${sort === k ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!term && genres.length > 0 && (
        <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto pb-1">
          {[{ id: '', name: 'Todos' }, ...genres].map((g) => (
            <button key={g.id} onClick={() => setGenre(g.id)} className="relative shrink-0 rounded-full border border-line px-4 py-1.5 text-xs font-semibold transition hover:border-accent-500/60">
              {genre === g.id && <motion.span layoutId="genre-pill" className="absolute inset-0 rounded-full bg-accent-600" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
              <span className={`relative ${genre === g.id ? 'text-white' : 'text-zinc-300'}`}>{kind === 'ANIME' ? genrePt(g.name) : g.name}</span>
            </button>
          ))}
        </div>
      )}
      {err && <Notice text={err} />}
      <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((i, n) => <Card key={i.ref} item={i} index={n} fluid />)}
        {loading && Array.from({ length: 12 }).map((_, n) => <PosterSkeleton key={'s' + n} fluid />)}
      </div>
      {!loading && items.length === 0 && !err && <p className="py-10 text-center text-zinc-500">Nada encontrado.</p>}
      {!loading && more && items.length > 0 && (
        <div className="mt-8 text-center"><button className={btnGhost + ' px-6 py-2'} onClick={() => setPage(page + 1)}>Carregar mais</button></div>
      )}
    </div>
  )
}
