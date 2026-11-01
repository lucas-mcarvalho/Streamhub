import { Link } from 'react-router-dom'
import { Swords } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-line/70 bg-surface/40">
      <div className="mx-auto grid max-w-[1500px] gap-8 px-5 py-10 md:grid-cols-[2fr_1fr_1fr_1fr] md:px-10">
        <div>
          <div className="mb-3 flex items-center gap-2 text-lg font-extrabold"><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-500 text-white"><Swords size={18} /></span>StreamHub</div>
          <p className="max-w-xs text-sm text-zinc-400">Catálogo de animes com notas e gêneros, downloads, biblioteca e player próprio, no seu computador.</p>
        </div>
        <div className="text-sm">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Explorar</div>
          <ul className="space-y-2 text-zinc-300"><li><Link className="hover:text-accent-400" to="/anime">Início</Link></li><li><Link className="hover:text-accent-400" to="/anime/library">Biblioteca</Link></li><li><Link className="hover:text-accent-400" to="/anime/explore?sort=AIRING">Lançamentos</Link></li><li><Link className="hover:text-accent-400" to="/anime/explore?search=1">Busca</Link></li></ul>
        </div>
        <div className="text-sm">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Sua conta</div>
          <ul className="space-y-2 text-zinc-300"><li><Link className="hover:text-accent-400" to="/downloads">Downloads</Link></li><li><Link className="hover:text-accent-400" to="/storage">Armazenamento</Link></li><li><Link className="hover:text-accent-400" to="/settings">Configurações</Link></li></ul>
        </div>
        <div className="text-sm">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Projeto</div>
          <ul className="space-y-2 text-zinc-300"><li><Link className="hover:text-accent-400" to="/">Tela inicial</Link></li><li><Link className="hover:text-accent-400" to="/cinema">Filmes &amp; Séries</Link></li></ul>
        </div>
      </div>
      <div className="border-t border-line/70 px-5 py-4 text-xs text-zinc-500 md:px-10">Metadados: AniList e TMDB. Use apenas conteúdo que você tem autorização para obter.</div>
    </footer>
  )
}
