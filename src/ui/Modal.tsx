import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'

type ModalProps = {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function Modal({ title, children, footer, onClose }: ModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <section
        aria-labelledby="modal-title"
        aria-modal
        className="surface my-auto w-full max-w-md shadow-raised"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-section" id="modal-title">
            {title}
          </h2>
          <Button aria-label="Close" icon={<X size={16} />} onClick={onClose} size="icon-sm" variant="ghost" />
        </header>

        <div className="flex flex-col gap-4 px-4 py-4">{children}</div>

        {footer ? <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer> : null}
      </section>
    </div>
  )
}
