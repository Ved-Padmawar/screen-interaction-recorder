import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
type ButtonSize = 'sm' | 'md' | 'icon' | 'icon-sm'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong disabled:bg-ink-soft',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-muted hover:border-ink-soft/40 disabled:text-ink-soft',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink disabled:text-ink-soft',
  danger: 'bg-danger text-white hover:bg-danger-strong disabled:bg-ink-soft',
  'danger-ghost': 'text-ink-soft hover:bg-danger-soft hover:text-danger disabled:text-ink-soft',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-xs',
  md: 'h-9 gap-2 px-3.5 text-sm',
  icon: 'size-9 justify-center p-0',
  'icon-sm': 'size-8 justify-center p-0',
}

export function Button({ className, children, icon, size = 'md', variant = 'secondary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'focus-ring inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors',
        'disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      type="button"
      {...props}
    >
      {icon}
      {children}
    </button>
  )
}
