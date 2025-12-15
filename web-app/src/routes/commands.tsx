import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import {
  IconPlus,
  IconTrash,
  IconPencil,
  IconCopy,
  IconCommand,
} from '@tabler/icons-react'

import HeaderPage from '@/containers/HeaderPage'
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
import { cn } from '@/lib/utils'
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
    const args = draft.args
      .map((a) => ({ name: normalizeArgName(a.name), defaultValue: a.defaultValue }))
      .filter((a) => a.name.length > 0)

    if (args.some((a) => !isValidArgName(a.name))) {
      toast.error('Argument names must be like "place" or "unit"')
      return
    }
    const duplicates = new Set<string>()
    const seen = new Set<string>()
    args.forEach((a) => {
      if (seen.has(a.name)) duplicates.add(a.name)
      seen.add(a.name)
    })
    if (duplicates.size > 0) {
      toast.error(`Duplicate argument(s): ${Array.from(duplicates).join(', ')}`)
      return
    }
    if (!draft.template.trim()) {
      toast.error('Template is required')
      return
    }

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
    <div className="flex flex-col h-full">
      <HeaderPage>
        <div className="w-full flex items-center justify-between relative z-20">
          <div className="min-w-0 flex items-center gap-3">
            <IconCommand size={20} className="text-main-view-fg/70 shrink-0" />
            <div className="min-w-0">
              <div className="text-base font-semibold truncate">
                {t('common:commands')}
              </div>
              <div className="text-xs text-main-view-fg/60 truncate">
                Create reusable prompt templates you can invoke as{' '}
                <span className="font-mono">{previewInvocation}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 relative z-20 shrink-0">
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
      </HeaderPage>

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
                            navigator.clipboard.writeText(invocation)
                            toast.success('Copied invocation')
                          }}
                          title="Copy invocation"
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
                        <div className="font-medium mb-1">Defaults preview</div>
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
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-main-view-fg/70">Arguments</div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      args: [...d.args, { name: '', defaultValue: '' }],
                    }))
                  }
                >
                  <IconPlus size={14} className="mr-2" />
                  Add argument
                </Button>
              </div>

              {draft.args.length === 0 ? (
                <div className="text-xs text-main-view-fg/50">
                  No arguments. This command can be invoked as <span className="font-mono">/{draft.name.trim().toLowerCase() || 'command'}</span>.
                </div>
              ) : (
                <div className="grid gap-2">
                  {draft.args.map((arg, idx) => {
                    const argName = normalizeArgName(arg.name)
                    const invalid = arg.name.trim().length > 0 && !isValidArgName(arg.name)
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'grid grid-cols-1 sm:grid-cols-5 gap-2 items-center',
                          invalid && 'opacity-90'
                        )}
                      >
                        <div className="sm:col-span-2">
                          <Input
                            value={arg.name}
                            onChange={(e) =>
                              setDraft((d) => {
                                const next = [...d.args]
                                next[idx] = { ...next[idx], name: e.target.value }
                                return { ...d, args: next }
                              })
                            }
                            placeholder="place"
                            className={cn(invalid && 'border-destructive')}
                          />
                          <div className="text-[11px] text-main-view-fg/50 mt-1 font-mono">
                            {argName ? `{${argName}}` : '{arg}'}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            value={arg.defaultValue || ''}
                            onChange={(e) =>
                              setDraft((d) => {
                                const next = [...d.args]
                                next[idx] = { ...next[idx], defaultValue: e.target.value }
                                return { ...d, args: next }
                              })
                            }
                            placeholder="Default (optional)"
                          />
                        </div>
                        <div className="sm:col-span-1 flex sm:justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                args: d.args.filter((_, i) => i !== idx),
                              }))
                            }
                            title="Remove argument"
                          >
                            <IconTrash size={16} />
                          </Button>
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


