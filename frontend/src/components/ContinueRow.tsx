import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import { progressOf, type LibraryFile } from '../api'
import { Bar, SectionTitle } from './ui'

/** "Continuar assistindo" com base no progresso salvo pelo player neste navegador. */
export default function ContinueRow({ files }: { files: LibraryFile[] }) {
  const items = files.map((f) => ({ f, p: progressOf(f.id) }))
    .filter((x) => x.p.pos > 5 && !x.p.done).sort((a, b) => b.p.last - a.p.last).slice(0, 8)
  if (items.length === 0) return null
  return (
    <section className="mb-10">
      <SectionTitle icon={<Play size={20} className="text-accent-400" />}>Continuar assistindo</SectionTitle>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
        {items.map(({ f, p }, n) => (
          <motion.div key={f.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: n * 0.06 }} whileHover={{ y: -4 }}>
            <Link to={`/watch/${f.id}`} className="glass group block w-72 shrink-0 overflow-hidden rounded-2xl">
              <div className="relative grid h-32 place-items-center bg-gradient-to-br from-accent-700/60 to-surface2">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur transition group-hover:scale-110 group-hover:bg-accent-600"><Play size={22} fill="white" /></span>
              </div>
              <div className="p-3">
                <div className="truncate text-sm font-semibold">{f.group}</div>
                <div className="mb-2 truncate text-xs text-zinc-400">{f.season != null ? `T${f.season} E${f.episode}` : f.name}</div>
                <Bar percent={p.ratio * 100} />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
