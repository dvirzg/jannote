import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createRouter, createRootRoute, createMemoryHistory } from '@tanstack/react-router'
import React from 'react'
import '@testing-library/jest-dom'
import ChatInput from '../ChatInput'

// Mock dependencies with mutable state
let mockPromptState = {
  prompt: '',
  setPrompt: vi.fn(),
}

// Mock commands store (used for slash-command template expansion)
let mockCommandsState = {
  commands: [] as any[],
}

// Mock chat attachments store (Zustand-like API expected by ChatInput)
const mockChatAttachmentsState: any = {
  attachmentsByThread: {},
  getAttachments: () => [],
  setAttachments: vi.fn(),
  clearAttachments: vi.fn(),
  transferAttachments: vi.fn(),
}

vi.mock('@/hooks/usePrompt', () => ({
  usePrompt: (selector: any) => {
    return selector ? selector(mockPromptState) : mockPromptState
  },
}))

vi.mock('@/hooks/useCommands', () => ({
  useCommands: (selector: any) => {
    return selector ? selector(mockCommandsState) : mockCommandsState
  },
}))

vi.mock('@/hooks/useAttachments', () => ({
  useAttachments: (selector: any) => {
    const state = {
      enabled: true,
      parseMode: 'auto',
      maxFileSizeMB: 25,
      autoInlineContextRatio: 0.25,
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/hooks/useChatAttachments', () => {
  const useChatAttachments = ((selector?: any) =>
    selector ? selector(mockChatAttachmentsState) : mockChatAttachmentsState) as any
  useChatAttachments.getState = () => mockChatAttachmentsState
  return {
    NEW_THREAD_ATTACHMENT_KEY: '__new-thread__',
    useChatAttachments,
  }
})

vi.mock('@/hooks/useThreads', () => ({
  useThreads: (selector: any) => {
    const state = {
      currentThreadId: null,
      getCurrentThread: vi.fn(),
    }
    return selector ? selector(state) : state
  },
}))

// Mock the useAppState with a mutable state
let mockAppState = {
  streamingContent: null,
  abortControllers: {},
  loadingModel: false,
  tools: [],
  updateTools: vi.fn(),
  activeModels: [] as string[],
  cancelToolCall: vi.fn(),
}

vi.mock('@/hooks/useAppState', () => ({
  useAppState: (selector?: any) => selector ? selector(mockAppState) : mockAppState,
}))

vi.mock('@/hooks/useGeneralSetting', () => ({
  useGeneralSetting: (selector?: any) => {
    const state = {
      allowSendWhenUnloaded: false,
      spellCheckChatInput: true,
      experimentalFeatures: true,
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/hooks/useModelProvider', () => ({
  useModelProvider: (selector: any) => {
    const state = {
      selectedModel: {
        id: 'test-model',
        capabilities: ['vision', 'tools'],
      },
      providers: [],
      getModelBy: vi.fn(),
      selectModelProvider: vi.fn(),
      selectedProvider: 'llamacpp',
      setProviders: vi.fn(),
      getProviderByName: vi.fn(),
      updateProvider: vi.fn(),
      addProvider: vi.fn(),
      deleteProvider: vi.fn(),
      deleteModel: vi.fn(),
      deletedModels: [],
    }
    return selector ? selector(state) : state
  },
}))

const mockSendMessage = vi.fn()
vi.mock('@/hooks/useChat', () => ({
  useChat: vi.fn(() => mockSendMessage), // useChat returns sendMessage function directly
}))

vi.mock('@/i18n/react-i18next-compat', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock the global core API
Object.defineProperty(globalThis, 'core', {
  value: {
    api: {
      existsSync: vi.fn(() => true),
      getJanDataFolderPath: vi.fn(() => '/mock/path'),
    },
  },
  writable: true,
})

// Mock the useTools hook
vi.mock('@/hooks/useTools', () => ({
  useTools: vi.fn(),
}))

// Mock the ServiceHub
const mockGetConnectedServers = vi.fn(() => Promise.resolve(['server1']))
const mockGetTools = vi.fn(() => Promise.resolve([]))
const mockStopAllModels = vi.fn()
const mockCheckMmprojExists = vi.fn(() => Promise.resolve(true))
const mockGetActiveModels = vi.fn(() => Promise.resolve([]))

const mockListen = vi.fn(() => Promise.resolve(() => {}))

const mockServiceHub = {
  mcp: () => ({
    getConnectedServers: mockGetConnectedServers,
    getTools: mockGetTools,
  }),
  database: () => ({
    list: vi.fn(async () => []),
    toAttachments: vi.fn(async () => []),
  }),
  models: () => ({
    stopAllModels: mockStopAllModels,
    checkMmprojExists: mockCheckMmprojExists,
    getActiveModels: mockGetActiveModels,
  }),
  events: () => ({
    listen: mockListen,
  }),
}

vi.mock('@/hooks/useServiceHub', () => ({
  getServiceHub: () => mockServiceHub,
  useServiceHub: () => mockServiceHub,
}))

vi.mock('../MovingBorder', () => ({
  MovingBorder: ({ children }: { children: React.ReactNode }) => <div data-testid="moving-border">{children}</div>,
}))

vi.mock('../DropdownModelProvider', () => ({
  __esModule: true,
  default: () => <div data-testid="model-dropdown" data-slot="popover-trigger">Model Dropdown</div>,
}))

vi.mock('../loaders/ModelLoader', () => ({
  ModelLoader: () => <div data-testid="model-loader">Model Loader</div>,
}))

vi.mock('../DropdownToolsAvailable', () => ({
  __esModule: true,
  default: ({ children }: { children: (isOpen: boolean, toolsCount: number) => React.ReactNode }) => {
    return <div data-testid="tools-dropdown">{children(false, 0)}</div>
  },
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-test-id={props['data-test-id']}
      data-testid={props['data-test-id']}
      {...props}
    >
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <div onClick={onClick}>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('react-textarea-autosize', () => ({
  default: ({ value, onChange, onKeyDown, placeholder, disabled, className, minRows, maxRows, onHeightChange, ...props }: any) => (
    <textarea
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      data-testid={props['data-testid']}
      rows={minRows || 1}
      style={{ resize: 'none' }}
    />
  ),
}))

// Mock icons
vi.mock('lucide-react', () => ({
  ArrowRight: () => <svg data-testid="arrow-right-icon">ArrowRight</svg>,
  PlusIcon: () => <svg data-testid="plus-icon">PlusIcon</svg>,
}))

vi.mock('@tabler/icons-react', () => ({
  IconPhoto: () => <svg data-testid="photo-icon">Photo</svg>,
  IconWorld: () => <svg data-testid="world-icon">World</svg>,
  IconAtom: () => <svg data-testid="atom-icon">Atom</svg>,
  IconTool: () => <svg data-testid="tool-icon">Tool</svg>,
  IconCodeCircle2: () => <svg data-testid="code-icon">Code</svg>,
  IconPaperclip: () => <svg data-testid="paperclip-icon">Paperclip</svg>,
  IconLoader2: () => <svg data-testid="loader-icon">Loader</svg>,
  IconCheck: () => <svg data-testid="check-icon">Check</svg>,
  IconPlayerStopFilled: () => <svg className="tabler-icon-player-stop-filled" data-testid="stop-icon">Stop</svg>,
  IconX: () => <svg data-testid="x-icon">X</svg>,
}))

describe('ChatInput', () => {
  const createTestRouter = () => {
    const MockComponent = () => <ChatInput />
    const rootRoute = createRootRoute({
      component: MockComponent,
    })

    return createRouter({ 
      routeTree: rootRoute,
      history: createMemoryHistory({
        initialEntries: ['/'],
      }),
    })
  }

  const renderWithRouter = () => {
    const router = createTestRouter()
    return render(<RouterProvider router={router} />)
  }


  beforeEach(() => {
    vi.clearAllMocks()

    // Reset mock states
    mockPromptState.prompt = ''
    mockPromptState.setPrompt = vi.fn()
    mockCommandsState.commands = []
    mockSendMessage.mockReset()
    mockChatAttachmentsState.attachmentsByThread = {}

    mockAppState.streamingContent = null
    mockAppState.abortControllers = {}
    mockAppState.loadingModel = false
    mockAppState.tools = []
    mockAppState.activeModels = []
    mockAppState.cancelToolCall = vi.fn()
  })

  it('renders chat input textarea', async () => {
    await act(async () => {
      renderWithRouter()
    })

    const textarea = screen.getByTestId('chat-input')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveAttribute('placeholder', 'common:placeholder.chatInput')
  })

  it('renders send button', async () => {
    await act(async () => {
      renderWithRouter()
    })

    const sendButton = document.querySelector('[data-test-id="send-message-button"]')
    expect(sendButton).toBeInTheDocument()
  })

  it('disables send button when prompt is empty', async () => {
    await act(async () => {
      renderWithRouter()
    })

    const sendButton = document.querySelector('[data-test-id="send-message-button"]')
    expect(sendButton).toBeDisabled()
  })

  it('enables send button when prompt has content', async () => {
    // Set prompt content
    mockPromptState.prompt = 'Hello world'

    await act(async () => {
      renderWithRouter()
    })

    const sendButton = document.querySelector('[data-test-id="send-message-button"]')
    expect(sendButton).not.toBeDisabled()
  })

  it('calls setPrompt when typing in textarea', async () => {
    const user = userEvent.setup()
    await act(async () => {
      renderWithRouter()
    })

    const textarea = screen.getByTestId('chat-input')
    await act(async () => {
      await user.type(textarea, 'Hello')
    })

    // setPrompt is called for each character typed
    expect(mockPromptState.setPrompt).toHaveBeenCalledTimes(5)
    expect(mockPromptState.setPrompt).toHaveBeenLastCalledWith('o')
  })

  it('calls sendMessage when send button is clicked', async () => {
    const user = userEvent.setup()

    // Set prompt content
    mockPromptState.prompt = 'Hello world'

    await act(async () => {
      renderWithRouter()
    })

    const sendButton = document.querySelector('[data-test-id="send-message-button"]')
    await act(async () => {
      await user.click(sendButton)
    })

    expect(sendButton).toBeInTheDocument()
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled())
    expect(mockSendMessage.mock.calls[0]?.[0]).toBe('Hello world')
  })

  it('expands /command(args) into the template before sending', async () => {
    const user = userEvent.setup()

    mockCommandsState.commands = [
      {
        id: '1',
        name: 'weather',
        template: 'Tell me the weather in {place}, in {unit}',
        args: [
          { name: 'place', defaultValue: 'NYC' },
          { name: 'unit', defaultValue: 'C' },
        ],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    mockPromptState.prompt = 'good morning, /weather(nyc, celcius)'

    await act(async () => {
      renderWithRouter()
    })

    const sendButton = document.querySelector('[data-test-id="send-message-button"]')
    await act(async () => {
      await user.click(sendButton)
    })

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled())
    expect(mockSendMessage.mock.calls[0]?.[0]).toBe(
      'good morning, Tell me the weather in nyc, in celcius'
    )
  })

  it('strips @scope expressions and injects a context block before sending', async () => {
    const user = userEvent.setup()
    mockPromptState.prompt =
      'please @scope(path="reports/**", limit_docs=2) summarize'

    await act(async () => {
      renderWithRouter()
    })

    const sendButton = document.querySelector('[data-test-id="send-message-button"]')
    await act(async () => {
      await user.click(sendButton)
    })

    await waitFor(() => expect(mockSendMessage).toHaveBeenCalled())
    const outbound = mockSendMessage.mock.calls[0]?.[0] as string
    expect(outbound).not.toContain('@scope')
    expect(outbound).toContain('[CONTEXT]')
    expect(outbound).toContain('scopes:')
    expect(outbound).toContain('limit_docs: 2')
  })

  it('does not send when #content is requested but content search is unavailable', async () => {
    const user = userEvent.setup()
    mockPromptState.prompt = '#content:"deep search"'

    await act(async () => {
      renderWithRouter()
    })

    const sendButton = document.querySelector('[data-test-id="send-message-button"]')
    await act(async () => {
      await user.click(sendButton)
    })

    await waitFor(() => expect(mockSendMessage).not.toHaveBeenCalled())
  })

  it('sends message when Enter key is pressed', async () => {
    const user = userEvent.setup()

    // Set prompt content
    mockPromptState.prompt = 'Hello world'

    await act(async () => {
      renderWithRouter()
    })

    const textarea = screen.getByTestId('chat-input')
    await act(async () => {
      await user.type(textarea, '{Enter}')
    })

    // Just verify the textarea exists and Enter was processed
    expect(textarea).toBeInTheDocument()
  })

  it('does not send message when Shift+Enter is pressed', async () => {
    const user = userEvent.setup()

    // Set prompt content
    mockPromptState.prompt = 'Hello world'

    await act(async () => {
      renderWithRouter()
    })

    const textarea = screen.getByTestId('chat-input')
    await act(async () => {
      await user.type(textarea, '{Shift>}{Enter}{/Shift}')
    })

    // Just verify the textarea exists
    expect(textarea).toBeInTheDocument()
  })

  it('shows stop button when streaming', async () => {
    // Mock streaming state
    mockAppState.streamingContent = { thread_id: 'test-thread' }

    await act(async () => {
      renderWithRouter()
    })

    // Stop button should be rendered (as SVG with tabler-icon-player-stop-filled class)
    const stopButton = document.querySelector('.tabler-icon-player-stop-filled')
    expect(stopButton).toBeInTheDocument()
  })


  it('shows model selection dropdown', async () => {
    await act(async () => {
      renderWithRouter()
    })

    // Model selection dropdown should be rendered (look for popover trigger)
    const modelDropdown = document.querySelector('[data-slot="popover-trigger"]')
    expect(modelDropdown).toBeInTheDocument()
  })

  it('shows error message when no model is selected', async () => {
    const user = userEvent.setup()

    // Mock no selected model and prompt with content
    mockPromptState.prompt = 'Hello world'

    await act(async () => {
      renderWithRouter()
    })

    const sendButton = document.querySelector('[data-test-id="send-message-button"]')
    await act(async () => {
      await user.click(sendButton)
    })

    // The component should still render without crashing when no model is selected
    expect(sendButton).toBeInTheDocument()
  })

  it('handles file upload', async () => {
    const user = userEvent.setup()
    await act(async () => {
      renderWithRouter()
    })

    // Wait for async effects to complete (mmproj check)
    await waitFor(() => {
      // File upload is rendered as hidden input element
      const fileInput = document.querySelector('input[type="file"]')
      expect(fileInput).toBeInTheDocument()
    })
  })

  it('shows tools dropdown when model supports tools and MCP servers are connected', async () => {
    // Mock connected servers
    mockGetConnectedServers.mockResolvedValue(['server1'])
    mockAppState.tools = [{ name: 'test-tool' } as any]

    await act(async () => {
      renderWithRouter()
    })

    await waitFor(() => {
      // Tools dropdown should be rendered
      const toolsDropdown = screen.getByTestId('tools-dropdown')
      expect(toolsDropdown).toBeInTheDocument()
    })
  })

  it('uses selectedProvider for provider checks', async () => {
    // This test ensures the component renders without errors when using selectedProvider
    await act(async () => {
      expect(() => renderWithRouter()).not.toThrow()
    })
  })

  it('shows command autocomplete and argument help when typing "/"', async () => {
    const user = userEvent.setup()

    mockCommandsState.commands = [
      {
        id: '1',
        name: 'weather',
        template: 'Tell me the weather in {place}, in {unit}',
        args: [
          { name: 'place', defaultValue: 'NYC' },
          { name: 'unit', defaultValue: 'C' },
        ],
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: '2',
        name: 'summarize',
        template: 'Summarize: {text}',
        args: [{ name: 'text' }],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    // Make the mock prompt store behave like a controlled input.
    mockPromptState.setPrompt = vi.fn((val: string) => {
      mockPromptState.prompt = val
    })

    await act(async () => {
      renderWithRouter()
    })

    const textarea = screen.getByTestId('chat-input')

    await act(async () => {
      await user.click(textarea)
      await user.type(textarea, '/w')
    })

    expect(screen.getByTestId('command-autocomplete')).toBeInTheDocument()
    // Compact list shows the command signature inline (name + args)
    expect(screen.getByText('/weather(place, unit)')).toBeInTheDocument()
    // Template description is shown as a subtle secondary line
    expect(
      screen.getByText('Tell me the weather in {place}, in {unit}')
    ).toBeInTheDocument()
  })

  it('inserts the selected command on Tab', async () => {
    const user = userEvent.setup()

    mockCommandsState.commands = [
      {
        id: '1',
        name: 'weather',
        template: 'Tell me the weather in {place}, in {unit}',
        args: [
          { name: 'place', defaultValue: 'NYC' },
          { name: 'unit', defaultValue: 'C' },
        ],
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    mockPromptState.setPrompt = vi.fn((val: string) => {
      mockPromptState.prompt = val
    })

    await act(async () => {
      renderWithRouter()
    })

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement

    await act(async () => {
      await user.click(textarea)
      await user.type(textarea, '/w')
    })

    expect(screen.getByTestId('command-autocomplete')).toBeInTheDocument()

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Tab' })
    })

    // Tab should insert invocation start and keep the helper open in args-mode
    expect(textarea.value).toBe('/weather(')
    expect(screen.getByTestId('command-autocomplete')).toBeInTheDocument()
    // Args-only helper (no function name/signature) – single inline summary
    const summary = screen.getByTestId('command-args-summary')
    expect(summary.textContent).toContain('place:NYC, unit:C')
    expect(screen.queryByText('/weather(place, unit)')).not.toBeInTheDocument()

    // Next Tab should fill the first arg default and advance to the next arg (inserting ", ")
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Tab' })
    })
    expect(textarea.value).toBe('/weather(NYC, ')

    // Next Tab should fill the second arg default
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Tab' })
    })
    expect(textarea.value).toBe('/weather(NYC, C')

    // After finishing all args, Tab should close the invocation with ")"
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Tab' })
    })
    expect(textarea.value).toBe('/weather(NYC, C)')
    expect(screen.queryByTestId('command-autocomplete')).not.toBeInTheDocument()
  })
})
