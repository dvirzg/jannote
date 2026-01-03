
import React, { useEffect, useRef } from 'react'
import { Command } from '@/lib/commands/registry'
import { cn } from '@/lib/utils'

interface SlashCommandMenuProps {
  isOpen: boolean
  commands: Command[]
  selectedIndex: number
  onSelect: (command: Command) => void
  onClose: () => void
  position?: { top: number; left: number }
}

export const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  isOpen,
  commands,
  selectedIndex,
  onSelect,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen || commands.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full mb-2 left-0 w-64 bg-main-view border border-main-view-fg/10 rounded-lg shadow-lg overflow-hidden z-50"
    >
      <div className="p-1">
        {commands.map((cmd, index) => (
          <div
            key={cmd.trigger}
            className={cn(
              'px-3 py-2 rounded-md cursor-pointer flex items-center justify-between text-sm',
              index === selectedIndex
                ? 'bg-accent/10 text-accent'
                : 'text-main-view-fg hover:bg-main-view-fg/5'
            )}
            onClick={() => onSelect(cmd)}
          >
            <span className="font-medium">{cmd.trigger}</span>
            <span className="text-xs opacity-70">{cmd.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

