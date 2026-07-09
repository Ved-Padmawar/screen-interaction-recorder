import { Moon, Sun } from 'lucide-react'
import { Button } from './Button'
import { useTheme } from './useTheme'

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <Button
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      icon={isDark ? <Sun size={16} /> : <Moon size={16} />}
      onClick={toggleTheme}
      size="icon"
      title={isDark ? 'Light mode' : 'Dark mode'}
      variant="ghost"
    />
  )
}
