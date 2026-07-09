import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'icon'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong disabled:bg-ink-soft',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-muted disabled:text-ink-soft',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink disabled:text-ink-soft',
  danger: 'bg-danger text-white hover:bg-red-700 disabled:bg-ink-soft',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-xs',
  md: 'h-10 gap-2 px-3.5 text-sm',
  icon: 'size-9 justify-center p-0',
}

export function Button({ className, children, icon, size = 'md', variant = 'secondary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'focus-ring inline-flex shrink-0 items-center justify-center rounded-md font-semibold transition-colors disabled:opacity-70',
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
