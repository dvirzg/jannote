import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route as CommandsRoute } from '../commands'

vi.mock('@/containers/HeaderPage', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="header-page">{children}</div>
  ),
}))

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
    const Component = CommandsRoute.component as React.ComponentType
    render(<Component />)

    await user.click(screen.getByRole('button', { name: /new command/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /new command/i })
    ).toBeInTheDocument()
  })
})


