
export interface Command {
  trigger: string
  label: string
  description?: string
  execute: (context: CommandContext) => void | Promise<void>
}

export interface CommandContext {
  prompt: string
  setPrompt: (prompt: string) => void
  openFilePicker: () => void
  executeRAGSearch: (query: string) => Promise<void>
  openAgentSettings: () => void
}

export class CommandRegistry {
  private static instance: CommandRegistry
  private commands: Command[] = []

  private constructor() {
    this.registerDefaultCommands()
  }

  public static getInstance(): CommandRegistry {
    if (!CommandRegistry.instance) {
      CommandRegistry.instance = new CommandRegistry()
    }
    return CommandRegistry.instance
  }

  private registerDefaultCommands() {
    this.register({
      trigger: '/search',
      label: 'Search Context',
      description: 'Search through indexed documents via RAG',
      execute: async (ctx) => {
        // The actual logic will be handled by the UI component invoking the context method
        // But here we can parse the query if needed
        const query = ctx.prompt.replace('/search ', '')
        if (query.trim()) {
          await ctx.executeRAGSearch(query)
        }
      },
    })

    this.register({
      trigger: '/agent',
      label: 'New Agent',
      description: 'Configure a new Assistant',
      execute: (ctx) => {
        ctx.openAgentSettings()
      },
    })
  }

  public register(command: Command) {
    this.commands.push(command)
  }

  public getCommands(): Command[] {
    return this.commands
  }

  public match(input: string): Command[] {
    if (!input.startsWith('/')) return []
    const query = input.toLowerCase()
    return this.commands.filter(cmd => 
      cmd.trigger.startsWith(query) || 
      cmd.trigger.includes(query.replace('/', ''))
    )
  }
}

