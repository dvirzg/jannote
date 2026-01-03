import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route as CommandsRoute } from '../commands'
import React from 'react'
import type { ComponentType, ReactNode } from 'react'

vi.mock('@/i18n/react-i18next-compat', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/constants/routes', () => ({
  route: {
    commands: '/commands',
  },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (config: any) => ({
    ...config,
    component: config.component,
  }),
}))

const addCommand = vi.fn()
const updateCommand = vi.fn()
const deleteCommand = vi.fn()

vi.mock('@/hooks/useCommands', () => ({
  useCommands: (selector: any) =>
    selector({
      commands: [],
      addCommand,
      updateCommand,
      deleteCommand,
    }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Commands Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the New command dialog when clicking New', async () => {
    const user = userEvent.setup()
    // Route typing doesn't expose `.component` in TS, but tests in this codebase rely on it.
    const Component = (CommandsRoute as any).component as ComponentType
    render(<Component />)

    await user.click(screen.getByRole('button', { name: /new command/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /new command/i })).toBeTruthy()
  })
})


