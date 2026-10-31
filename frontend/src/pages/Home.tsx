import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clapperboard, Swords } from 'lucide-react'
import { api, type LibraryFile, type Section } from '../api'
import ContinueRow from '../components/ContinueRow'
import { useAsync } from '../hooks'
import { useForceTheme } from '../theme'

/** Tela inicial: escolha entre o universo de Animes e o de Filmes & Séries. */
export default function Home() {
  useForceTheme('cinema')
  const { data } = useAsync(() => api<Section[]>('/catalog/home'), [])
  const lib = useAsync(() => api<LibraryFile[]>('/library'), [])
  const [hover, setHover] = useState<number | null>(null)
  const movie = data?.find((s) => s.key === 'movies')?.items.find((i) => i.backdropUrl)
  const anime = data?.find((s) => s.key === 'anime')?.items.find((i) => i.backdropUrl)
  const panels = [
    { to: '/cinema', title: 'Filmes & Séries', sub: 'Blockbusters, clássicos e as séries do momento', img: movie?.backdropUrl, icon: Clapperboard, tone: 'from-red-700/80', theme: 'cinema' },
    { to: '/anime', title: 'Animes', sub: 'Notas, gêneros e temporadas direto do AniList', img: anime?.backdropUrl, icon: Swords, tone: 'from-blue-800/80', theme: 'anime' },
  ]
  return (
    <div>
      <motion.div className="mb-8 text-center" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-5xl font-bold tracking-wider md:text-6xl">O que vamos assistir hoje?</h1>
        <p className="mt-2 text-zinc-400">Escolha o seu universo</p>
      </motion.div>
      <div className="flex min-h-[420px] flex-col gap-4 md:h-[56vh] md:flex-row">
        {panels.map((p, i) => (
          <motion.div key={p.to} className="relative min-h-[220px] overflow-hidden rounded-3xl"
            animate={{ flexGrow: hover === i ? 1.5 : 1 }} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 160 }} style={{ flexBasis: 0, flexGrow: 1 }}
            onHoverStart={() => setHover(i)} onHoverEnd={() => setHover(null)}>
            <Link to={p.to} className="group block h-full" data-theme={p.theme}>
              <motion.div className="absolute inset-0 bg-surface2 bg-cover bg-center" style={{ backgroundImage: p.img ? `url(${p.img})` : undefined }}
                animate={{ scale: hover === i ? 1.08 : 1 }} transition={{ duration: 0.8 }} />
              <div className={`absolute inset-0 bg-gradient-to-t ${p.tone} via-black/50 to-black/30 transition group-hover:via-black/30`} />
              <div className="absolute bottom-8 left-8 right-8">
                <p.icon size={36} className="mb-3 drop-shadow" />
                <h2 className="font-display text-5xl font-bold tracking-wide">{p.title}</h2>
                <p className="mt-2 max-w-md text-sm text-zinc-200">{p.sub}</p>
                <span className="mt-5 inline-block rounded-full bg-white px-6 py-2 text-sm font-bold text-black transition group-hover:scale-105">Entrar →</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
      <div className="mt-10">{lib.data && <ContinueRow files={lib.data} />}</div>
    </div>
  )
}
