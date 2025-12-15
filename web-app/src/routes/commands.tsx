import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState, useEffect } from 'react'
import {
  IconPlus,
  IconTrash,
  IconPencil,
  IconCopy,
  IconCommand,
} from '@tabler/icons-react'

import { route } from '@/constants/routes'
import { useCommands, type CommandArg, type CommandDefinition } from '@/hooks/useCommands'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isValidCommandName, renderCommandTemplate } from '@/lib/commands'
import { toast } from 'sonner'
import { useTranslation } from '@/i18n/react-i18next-compat'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.commands as any)({
  component: CommandsPage,
})

type CommandDraft = {
  name: string
  template: string
  args: CommandArg[]
}

const normalizeArgName = (name: string) => name.trim().toLowerCase()
const isValidArgName = (name: string) => /^[a-z][a-z0-9_-]*$/.test(normalizeArgName(name))

// Extract argument names from template (e.g., "Tell me about {place} in {unit}" -> ["place", "unit"])
const extractArgsFromTemplate = (template: string): string[] => {
  const matches = template.match(/\{([^}]+)\}/g)
  if (!matches) return []

  const argNames = matches.map((match) => {
    const name = match.slice(1, -1).trim()
    return normalizeArgName(name)
  })

  // Remove duplicates while preserving order
  return Array.from(new Set(argNames)).filter((name) => isValidArgName(name))
}

function CommandsPage() {
  const { t } = useTranslation()
  const commands = useCommands((s) => s.commands)
  const addCommand = useCommands((s) => s.addCommand)
  const updateCommand = useCommands((s) => s.updateCommand)
  const deleteCommand = useCommands((s) => s.deleteCommand)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CommandDefinition | null>(null)
  const [draft, setDraft] = useState<CommandDraft>({
    name: '',
    template: '',
    args: [],
  })

  // Auto-detect arguments from template
  useEffect(() => {
    if (!draft.template) {
      setDraft((d) => ({ ...d, args: [] }))
      return
    }

    const detectedArgNames = extractArgsFromTemplate(draft.template)

    // Create args array, preserving existing default values
    const newArgs = detectedArgNames.map((argName) => {
      const existing = draft.args.find((a) => normalizeArgName(a.name) === argName)
      return {
        name: argName,
        defaultValue: existing?.defaultValue || '',
      }
    })

    // Only update if args changed
    const argsChanged =
      newArgs.length !== draft.args.length ||
      newArgs.some((arg, idx) => normalizeArgName(draft.args[idx]?.name) !== arg.name)

    if (argsChanged) {
      setDraft((d) => ({ ...d, args: newArgs }))
    }
  }, [draft.template])

  const previewInvocation = useMemo(() => {
    const name = draft.name.trim() ? draft.name.trim().toLowerCase() : 'command'
    const args = draft.args.map((a) => a.name || 'arg')
    return args.length ? `/${name}(${args.join(', ')})` : `/${name}`
  }, [draft.name, draft.args])

  const previewRendered = useMemo(() => {
    if (!draft.template.trim()) return ''
    const fake: CommandDefinition = {
      id: 'preview',
      name: draft.name.trim().toLowerCase() || 'command',
      template: draft.template,
      args: draft.args.map((a) => ({
        name: normalizeArgName(a.name || 'arg'),
        defaultValue: a.defaultValue,
      })),
      createdAt: 0,
      updatedAt: 0,
    }
    return renderCommandTemplate(
      fake,
      fake.args.map((a) => a.defaultValue || '')
    )
  }, [draft.name, draft.template, draft.args])

  const openCreate = () => {
    setEditing(null)
    setDraft({ name: '', template: '', args: [] })
    setDialogOpen(true)
  }

  const openEdit = (cmd: CommandDefinition) => {
    setEditing(cmd)
    setDraft({
      name: cmd.name,
      template: cmd.template,
      args: cmd.args.map((a) => ({ name: a.name, defaultValue: a.defaultValue })),
    })
    setDialogOpen(true)
  }

  const onSave = () => {
    const name = draft.name.trim().toLowerCase()
    if (!isValidCommandName(name)) {
      toast.error('Command name must be like "weather" or "my_command"')
      return
    }
    if (!draft.template.trim()) {
      toast.error('Template is required')
      return
    }

    // Args are auto-detected and validated, just normalize them
    const args = draft.args.map((a) => ({
      name: normalizeArgName(a.name),
      defaultValue: a.defaultValue
    }))

    if (editing) {
      updateCommand(editing.id, {
        name,
        template: draft.template,
        args,
      })
      toast.success('Command updated')
    } else {
      addCommand({ name, template: draft.template, args })
      toast.success('Command created')
    }
    setDialogOpen(false)
  }

  return (
    <div className="flex flex-col h-full bg-main-view text-main-view-fg">
      <div className="border-b border-main-view-fg/10 px-6 py-3 flex items-center justify-between relative z-10 bg-main-view">
        <div className="flex items-center gap-3">
          <IconCommand size={20} className="text-main-view-fg/70" />
          <div className="text-base font-semibold">{t('common:commands')}</div>
        </div>
        <div className="flex items-center gap-2 relative z-20">
          <Button
            size="sm"
            variant="outline"
            className="flex items-center gap-1.5 h-8 relative z-20 pointer-events-auto"
            onClick={openCreate}
            type="button"
          >
            <IconPlus size={14} />
            New command
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {commands.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="rounded-full bg-main-view-fg/5 p-6">
              <IconCommand size={48} className="text-main-view-fg/30" />
            </div>
            <div className="text-sm text-main-view-fg/60 text-center max-w-md">
              No commands yet. Create one to reuse prompt templates across chats.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            {commands.map((cmd) => {
              const invocation = cmd.args.length
                ? `/${cmd.name}(${cmd.args.map((a) => a.name).join(', ')})`
                : `/${cmd.name}`
              const rendered = renderCommandTemplate(
                cmd,
                cmd.args.map((a) => a.defaultValue || '')
              )
              return (
                <Card
                  key={cmd.id}
                  className="border-main-view-fg/10 bg-main-view-fg/2 hover:bg-main-view-fg/3 transition-colors"
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold truncate">
                          <span className="font-mono">{`/${cmd.name}`}</span>
                        </CardTitle>
                        <div className="text-xs text-main-view-fg/60 font-mono truncate">
                          {invocation}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            const copyText = cmd.args.length ? `/${cmd.name}(` : `/${cmd.name}`
                            navigator.clipboard.writeText(copyText)
                            toast.success('Copied command name')
                          }}
                          title="Copy command name"
                          type="button"
                        >
                          <IconCopy size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(cmd)}
                          title="Edit"
                          type="button"
                        >
                          <IconPencil size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            deleteCommand(cmd.id)
                            toast.success('Command deleted')
                          }}
                          title="Delete"
                          type="button"
                        >
                          <IconTrash size={16} />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <div className="text-xs text-main-view-fg/70">
                      <div className="font-medium mb-1">Template</div>
                      <div className="font-mono whitespace-pre-wrap break-words bg-main-view-fg/5 rounded-md p-2">
                        {cmd.template}
                      </div>
                    </div>
                    {cmd.args.length > 0 && (
                      <div className="text-xs text-main-view-fg/70 mt-3">
                        <div className="font-medium mb-1">Default</div>
                        <div className="font-mono whitespace-pre-wrap break-words bg-main-view-fg/5 rounded-md p-2">
                          {rendered}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit command' : 'New command'}</DialogTitle>
            <DialogDescription>
              Use placeholders like <span className="font-mono">{'{place}'}</span> in your template.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <div className="text-xs text-main-view-fg/70 mb-1">Name</div>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="weather"
                />
                <div className="text-[11px] text-main-view-fg/50 mt-1 font-mono">
                  /{draft.name.trim().toLowerCase() || 'weather'}(...)
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-main-view-fg/70 mb-1">Template</div>
                <Textarea
                  value={draft.template}
                  onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
                  placeholder="Tell me the weather in {place}, in {unit}"
                  className="min-h-24"
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-main-view-fg/70 mb-2">
                Arguments
              </div>

              {draft.args.length === 0 ? (
                <div className="text-xs text-main-view-fg/50">
                  No arguments detected. Use placeholders like <span className="font-mono">{'{place}'}</span> in your template.
                </div>
              ) : (
                <div className="grid gap-2">
                  {draft.args.map((arg, idx) => {
                    const argName = normalizeArgName(arg.name)
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center"
                      >
                        <div>
                          <div className="text-xs font-medium text-main-view-fg/90 mb-1">
                            <span className="font-mono">{`{${argName}}`}</span>
                          </div>
                        </div>
                        <div>
                          <Input
                            value={arg.defaultValue || ''}
                            onChange={(e) =>
                              setDraft((d) => {
                                const next = [...d.args]
                                next[idx] = { ...next[idx], defaultValue: e.target.value }
                                return { ...d, args: next }
                              })
                            }
                            placeholder="Default value (optional)"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <div className="text-xs text-main-view-fg/70">Preview</div>
              <div className="font-mono text-xs bg-main-view-fg/5 rounded-md p-2">
                <div className="text-main-view-fg/70">{previewInvocation}</div>
                {previewRendered ? (
                  <div className="mt-2 whitespace-pre-wrap break-words">{previewRendered}</div>
                ) : (
                  <div className="mt-2 text-main-view-fg/50">
                    Add a template to see the expanded prompt.
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t('common:cancel')}
            </Button>
            <Button onClick={onSave}>{t('common:save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


