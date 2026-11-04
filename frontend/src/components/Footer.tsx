import { Link } from 'react-router-dom'

const COLS: [string, [string, string][]][] = [
  ['Navegar', [['Filmes e Séries', '/'], ['Animes', '/?aba=animes'], ['Filmes', '/movies'], ['Séries', '/series']]],
  ['Seus títulos', [['Minha biblioteca', '/library'], ['Downloads', '/downloads']]],
  ['Sistema', [['Armazenamento', '/storage'], ['Configurações', '/settings']]],
]

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-line/50">
      <div className="mx-auto grid max-w-[1500px] gap-8 px-4 py-10 md:grid-cols-[2fr_1fr_1fr_1fr] md:px-12">
        <div>
          <div className="mb-3 font-display text-3xl tracking-wider text-accent-500">StreamHub</div>
          <p className="max-w-xs text-sm text-zinc-400">Filmes, séries e animes num só lugar: catálogo com notas e gêneros, downloads, biblioteca e player próprio, no seu computador.</p>
        </div>
        {COLS.map(([title, links]) => (
          <div key={title} className="text-sm">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">{title}</div>
            <ul className="space-y-2 text-zinc-400">{links.map(([label, to]) => <li key={to}><Link className="hover:text-white hover:underline" to={to}>{label}</Link></li>)}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line/50 px-4 py-4 text-xs text-zinc-500 md:px-12">Metadados: AniList e TMDB. Use apenas conteúdo que você tem autorização para obter.</div>
    </footer>
  )
}
