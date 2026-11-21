import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { autofocus, candidates, dispatchBack, focusEl, isTV } from '../lib/tv'

/**
 * Modo TV: liga a tecla voltar do controle ao histórico, coloca o foco no primeiro item de cada tela e, ao voltar,
 * devolve o foco ao cartão em que o usuário estava.
 */
export default function TvNavigator() {
  const loc = useLocation()
  const nav = useNavigate()
  const saved = useRef(new Map<string, { idx: number; y: number }>())

  // tecla voltar: chamada pelo app Android; true = tratada aqui, false = o app pode sair
  useEffect(() => {
    if (!isTV) return
    const w = window as unknown as { streamhubBack?: () => boolean }
    w.streamhubBack = () => {
      if (dispatchBack()) return true
      const a = document.activeElement as HTMLElement | null
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) { a.blur(); return true }
      const idx = (history.state as { idx?: number } | null)?.idx ?? 0
      if (idx > 0) { nav(-1); return true }
      if (location.pathname !== '/' || location.search) { nav('/', { replace: true }); return true }
      return false
    }
    return () => { delete w.streamhubBack }
  }, [nav])

  // guarda onde o foco estava ao sair da tela
  useEffect(() => {
    if (!isTV) return
    const key = loc.key
    const store = saved.current
    return () => {
      const list = candidates(document.querySelector('main') ?? document)
      const idx = list.indexOf(document.activeElement as HTMLElement)
      store.set(key, { idx, y: window.scrollY })
    }
  }, [loc.key])

  // ao chegar: restaura a posição (voltar) ou foca o primeiro item; o conteúdo chega aos poucos, então tenta por um tempo
  useEffect(() => {
    if (!isTV || loc.pathname.startsWith('/watch')) return
    const back = saved.current.get(loc.key)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    let tries = 0
    const t = window.setInterval(() => {
      tries++
      if (back && back.idx >= 0) {
        const list = candidates(document.querySelector('main') ?? document)
        if (list.length > back.idx) { window.scrollTo({ top: back.y }); focusEl(list[back.idx]); window.clearInterval(t); return }
        if (tries < 30) return
      }
      // dá um tempo para o destaque da tela (data-tv-autofocus) aparecer antes de ficar com o primeiro item
      if (tries < 8 && !document.querySelector('[data-tv-autofocus]')) return
      if (autofocus() || tries > 30) window.clearInterval(t)
    }, 120)
    return () => window.clearInterval(t)
  }, [loc.key]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
