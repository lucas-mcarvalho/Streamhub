import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'cinema' | 'anime'

const KEY = 'streamhub.theme'
const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: 'cinema', setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem(KEY) as Theme) === 'anime' ? 'anime' : 'cinema' } catch { return 'cinema' }
  })
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const setTheme = (t: Theme) => {
    setThemeState(t)
    try { localStorage.setItem(KEY, t) } catch { /* sem armazenamento */ }
  }
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)

/** Força o tema da página enquanto ela está aberta. */
export function useForceTheme(t: Theme | undefined) {
  const { setTheme } = useTheme()
  useEffect(() => { if (t) setTheme(t) }, [t]) // eslint-disable-line react-hooks/exhaustive-deps
}
