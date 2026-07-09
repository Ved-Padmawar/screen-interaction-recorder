import { useEffect, useState } from 'react'
import { ThemeMode, type ThemeMode as ThemeModeValue } from '../domain/contracts'

const THEME_STORAGE_KEY = 'sir-theme'

function getInitialTheme(): ThemeModeValue {
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

  if (storedTheme === ThemeMode.Light || storedTheme === ThemeMode.Dark) {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? ThemeMode.Dark : ThemeMode.Light
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeModeValue>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  return {
    theme,
    isDark: theme === ThemeMode.Dark,
    toggleTheme: () => setTheme((value) => (value === ThemeMode.Dark ? ThemeMode.Light : ThemeMode.Dark)),
  }
}
