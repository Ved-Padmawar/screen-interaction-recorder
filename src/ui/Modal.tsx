import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

type ModalProps = {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function Modal({ title, children, footer, onClose }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4" onMouseDown={onClose}>
      <section className="surface w-full max-w-md" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-section">{title}</h2>
          <Button aria-label="Close modal" icon={<X size={16} />} onClick={onClose} size="icon" variant="ghost" />
        </header>
        <div className="space-y-4 px-4 py-4">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer> : null}
      </section>
    </div>
  )
}
