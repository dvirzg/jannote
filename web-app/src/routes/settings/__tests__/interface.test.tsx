import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Route as InterfaceRoute } from '../interface'

// Mock all the dependencies
vi.mock('@/containers/SettingsMenu', () => ({
  default: () => <div data-testid="settings-menu">Settings Menu</div>,
}))

vi.mock('@/containers/HeaderPage', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="header-page">{children}</div>
  ),
}))

vi.mock('@/containers/ColorPickerAppBgColor', () => ({
  ColorPickerAppBgColor: () => <div data-testid="color-picker-bg">Color Picker BG</div>,
}))

vi.mock('@/containers/ColorPickerAppMainView', () => ({
  ColorPickerAppMainView: () => <div data-testid="color-picker-main-view">Color Picker Main View</div>,
}))

vi.mock('@/containers/Card', () => ({
  Card: ({ title, children }: { title?: string; children: React.ReactNode }) => (
    <div data-testid="card" data-title={title}>
      {title && <div data-testid="card-title">{title}</div>}
      {children}
    </div>
  ),
  CardItem: ({ title, description, actions, className }: { title?: string; description?: string; actions?: React.ReactNode; className?: string }) => (
    <div data-testid="card-item" data-title={title} className={className}>
      {title && <div data-testid="card-item-title">{title}</div>}
      {description && <div data-testid="card-item-description">{description}</div>}
      {actions && <div data-testid="card-item-actions">{actions}</div>}
    </div>
  ),
}))

vi.mock('@/containers/ThemeSwitcher', () => ({
  ThemeSwitcher: () => <div data-testid="theme-switcher">Theme Switcher</div>,
}))

vi.mock('@/containers/FontSizeSwitcher', () => ({
  FontSizeSwitcher: () => <div data-testid="font-size-switcher">Font Size Switcher</div>,
}))

vi.mock('@/containers/ColorPickerAppPrimaryColor', () => ({
  ColorPickerAppPrimaryColor: () => <div data-testid="color-picker-primary">Color Picker Primary</div>,
}))

vi.mock('@/containers/ColorPickerAppAccentColor', () => ({
  ColorPickerAppAccentColor: () => <div data-testid="color-picker-accent">Color Picker Accent</div>,
}))

vi.mock('@/containers/ColorPickerAppDestructiveColor', () => ({
  ColorPickerAppDestructiveColor: () => <div data-testid="color-picker-destructive">Color Picker Destructive</div>,
}))

vi.mock('@/containers/ChatWidthSwitcher', () => ({
  ChatWidthSwitcher: () => <div data-testid="chat-width-switcher">Chat Width Switcher</div>,
}))

vi.mock('@/containers/ThreadScrollBehaviorSwitcher', () => ({
  ThreadScrollBehaviorSwitcher: () => (
    <div data-testid="thread-scroll-switcher">Thread Scroll Switcher</div>
  ),
}))

vi.mock('@/containers/CodeBlockStyleSwitcher', () => ({
  default: () => <div data-testid="code-block-style-switcher">Code Block Style Switcher</div>,
}))

vi.mock('@/containers/LineNumbersSwitcher', () => ({
  LineNumbersSwitcher: () => <div data-testid="line-numbers-switcher">Line Numbers Switcher</div>,
}))

vi.mock('@/containers/TokenCounterCompactSwitcher', () => ({
  TokenCounterCompactSwitcher: () => (
    <div data-testid="token-counter-compact-switcher">Token Counter Compact Switcher</div>
  ),
}))

vi.mock('@/i18n/react-i18next-compat', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/constants/routes', () => ({
  route: {
    settings: {
      interface: '/settings/interface',
    },
  },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (config: any) => ({
    ...config,
    component: config.component,
  }),
}))

describe('Interface Settings Route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the interface settings page', () => {
    const Component = InterfaceRoute.component as React.ComponentType
    render(<Component />)

    expect(screen.getByTestId('header-page')).toBeInTheDocument()
    expect(screen.getByTestId('settings-menu')).toBeInTheDocument()
    expect(screen.getByText('common:settings')).toBeInTheDocument()
  })

  it('should render interface controls', () => {
    const Component = InterfaceRoute.component as React.ComponentType
    render(<Component />)

    expect(screen.getByTestId('theme-switcher')).toBeInTheDocument()
    expect(screen.getByTestId('font-size-switcher')).toBeInTheDocument()
  })

  it('should render chat/message controls', () => {
    const Component = InterfaceRoute.component as React.ComponentType
    render(<Component />)

    expect(screen.getByTestId('token-counter-compact-switcher')).toBeInTheDocument()
  })

  it('should render code-related controls', () => {
    const Component = InterfaceRoute.component as React.ComponentType
    render(<Component />)

    expect(screen.getByTestId('line-numbers-switcher')).toBeInTheDocument()
  })

  it('should render main layout structure', () => {
    const Component = InterfaceRoute.component as React.ComponentType
    render(<Component />)

    const headerPage = screen.getByTestId('header-page')
    expect(headerPage).toBeInTheDocument()
    
    const settingsMenu = screen.getByTestId('settings-menu')
    expect(settingsMenu).toBeInTheDocument()
  })
})
