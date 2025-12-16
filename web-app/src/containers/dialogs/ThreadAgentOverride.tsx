import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconAlertCircle,
} from '@tabler/icons-react'
import { Textarea } from '@/components/ui/textarea'
import { paramsSettings } from '@/lib/predefinedParams'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useDefaultAgent } from '@/hooks/useDefaultAgent'
import { useThreads } from '@/hooks/useThreads'

interface ThreadAgentOverrideProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  threadId: string
}

export default function ThreadAgentOverride({
  open,
  onOpenChange,
  threadId,
}: ThreadAgentOverrideProps) {
  const defaultAgent = useDefaultAgent()
  const { threads, updateThread } = useThreads()

  const thread = threads.find((t) => t.id === threadId)
  const threadAssistant = thread?.assistants?.[0]

  // State for instructions and parameters
  const [instructions, setInstructions] = useState<string>('')
  const [paramsKeys, setParamsKeys] = useState<string[]>([''])
  const [paramsValues, setParamsValues] = useState<unknown[]>([''])
  const [paramsTypes, setParamsTypes] = useState<string[]>(['string'])

  // Initialize state when dialog opens
  useEffect(() => {
    if (open && thread) {
      // Load thread-specific overrides or defaults
      const effectiveParameters = {
        ...defaultAgent.parameters,
        ...(threadAssistant?.parameters || {}),
      }

      setInstructions(threadAssistant?.instructions || '')

      // Convert parameters to arrays
      const keys = Object.keys(effectiveParameters)
      const values = Object.values(effectiveParameters)
      const types = values.map((value) => {
        if (typeof value === 'boolean') return 'boolean'
        if (typeof value === 'number') return 'number'
        if (typeof value === 'object') return 'json'
        return 'string'
      })

      setParamsKeys(keys.length > 0 ? keys : [''])
      setParamsValues(values.length > 0 ? values : [''])
      setParamsTypes(types.length > 0 ? types : ['string'])
    }
  }, [open, thread, threadAssistant, defaultAgent])

  const handleParameterChange = (
    index: number,
    value: unknown,
    field: 'key' | 'value' | 'type'
  ) => {
    if (field === 'key') {
      const newKeys = [...paramsKeys]
      newKeys[index] = value as string
      setParamsKeys(newKeys)
    } else if (field === 'value') {
      const newValues = [...paramsValues]

      if (paramsTypes[index] === 'number' && typeof value === 'string') {
        newValues[index] = value
      } else if (
        paramsTypes[index] === 'boolean' &&
        typeof value === 'boolean'
      ) {
        newValues[index] = value
      } else if (paramsTypes[index] === 'json' && typeof value === 'string') {
        try {
          newValues[index] = value === '' ? {} : JSON.parse(value)
        } catch {
          newValues[index] = value
        }
      } else {
        newValues[index] = value
      }

      setParamsValues(newValues)
    } else {
      const newTypes = [...paramsTypes]
      newTypes[index] = value as string

      const newValues = [...paramsValues]

      if (value === 'string') {
        newValues[index] = ''
      } else if (value === 'number') {
        newValues[index] = ''
      } else if (value === 'boolean') {
        newValues[index] = false
      } else if (value === 'json') {
        newValues[index] = {}
      }

      setParamsValues(newValues)
      setParamsTypes(newTypes)
    }
  }

  const handleAddParameter = () => {
    setParamsKeys([...paramsKeys, ''])
    setParamsValues([...paramsValues, ''])
    setParamsTypes([...paramsTypes, 'string'])
  }

  const handleRemoveParameter = (index: number) => {
    const newKeys = [...paramsKeys]
    const newValues = [...paramsValues]
    const newTypes = [...paramsTypes]
    newKeys.splice(index, 1)
    newValues.splice(index, 1)
    newTypes.splice(index, 1)
    setParamsKeys(newKeys.length > 0 ? newKeys : [''])
    setParamsValues(newValues.length > 0 ? newValues : [''])
    setParamsTypes(newTypes.length > 0 ? newTypes : ['string'])
  }

  const handleSave = () => {
    if (!thread) return

    // Convert parameters arrays to object
    const parameters: Record<string, unknown> = {}
    paramsKeys.forEach((key, index) => {
      if (!key) return
      const value = paramsValues[index]
      if (paramsTypes[index] === 'number') {
        const parsed = Number(value as string)
        parameters[key] = isNaN(parsed) ? 0 : parsed
      } else {
        parameters[key] = value
      }
    })

    // Update thread with overrides
    // Only set fields if they have values (empty = use defaults)
    const updatedThread = {
      ...thread,
      assistants: [
        {
          id: threadAssistant?.id || 'default',
          name: threadAssistant?.name || 'The Agent',
          model: threadAssistant?.model || thread.model || { id: '' },
          instructions: instructions || undefined,
          parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
        },
      ],
    }

    updateThread(updatedThread)
    onOpenChange(false)
  }

  const handleReset = () => {
    if (!thread) return

    // Clear thread-specific overrides
    const updatedThread = {
      ...thread,
      assistants: thread.assistants?.length
        ? [
            {
              ...thread.assistants[0],
              instructions: undefined,
              parameters: undefined,
            },
          ]
        : [],
    }

    updateThread(updatedThread)

    // Reset form to defaults
    setInstructions('')
    const defaultParams = defaultAgent.parameters || {}
    const keys = Object.keys(defaultParams)
    const values = Object.values(defaultParams)
    const types = values.map((value) => {
      if (typeof value === 'boolean') return 'boolean'
      if (typeof value === 'number') return 'number'
      if (typeof value === 'object') return 'json'
      return 'string'
    })
    setParamsKeys(keys.length > 0 ? keys : [''])
    setParamsValues(values.length > 0 ? values : [''])
    setParamsTypes(types.length > 0 ? types : ['string'])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Agent for This Chat</DialogTitle>
        </DialogHeader>

        {/* Warning banner */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <IconAlertCircle size={20} className="text-yellow-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Changes here only affect this chat. To change global defaults, visit{' '}
            <span className="font-medium">The Agent</span> page.
          </p>
        </div>

        <div className="space-y-4">
          {/* Instructions Section */}
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium">Instructions</label>
              <p className="text-xs text-main-view-fg/60 mt-1">
                Leave empty to use default agent instructions
              </p>
            </div>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Enter custom instructions for this chat..."
              className="resize-none min-h-[120px] font-mono text-sm"
            />
          </div>

          {/* Parameters Section */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">Parameters</h3>
              <p className="text-xs text-main-view-fg/60 mt-1">
                Override LLM parameters for this chat
              </p>
            </div>

            {/* Predefined parameters */}
            <div className="space-y-2">
              <label className="text-xs font-medium">Quick Add</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(paramsSettings).map(([key, setting]) => (
                  <div
                    key={key}
                    onClick={() => {
                      const existingIndex = paramsKeys.findIndex(
                        (k) => k === setting.key
                      )
                      if (existingIndex === -1) {
                        const newKeys = [...paramsKeys]
                        const newValues = [...paramsValues]
                        const newTypes = [...paramsTypes]

                        if (paramsKeys[paramsKeys.length - 1] === '') {
                          newKeys[newKeys.length - 1] = setting.key
                          newValues[newValues.length - 1] = setting.value
                          newTypes[newTypes.length - 1] =
                            typeof setting.value === 'boolean'
                              ? 'boolean'
                              : typeof setting.value === 'number'
                                ? 'number'
                                : 'string'
                        } else {
                          newKeys.push(setting.key)
                          newValues.push(setting.value)
                          newTypes.push(
                            typeof setting.value === 'boolean'
                              ? 'boolean'
                              : typeof setting.value === 'number'
                                ? 'number'
                                : 'string'
                          )
                        }

                        setParamsKeys(newKeys)
                        setParamsValues(newValues)
                        setParamsTypes(newTypes)
                      }
                    }}
                    className={cn(
                      'text-xs bg-main-view-fg/10 py-1 px-2 rounded-sm cursor-pointer hover:bg-main-view-fg/20 transition-colors',
                      paramsKeys.includes(setting.key) && 'opacity-50'
                    )}
                  >
                    {setting.title}
                  </div>
                ))}
              </div>
            </div>

            {/* Parameter list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Custom Parameters</label>
                <div
                  className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all"
                  onClick={handleAddParameter}
                >
                  <IconPlus size={16} className="text-main-view-fg/60" />
                </div>
              </div>

              {paramsKeys.map((key, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex items-center w-full gap-2">
                    <Input
                      value={key}
                      onChange={(e) =>
                        handleParameterChange(index, e.target.value, 'key')
                      }
                      placeholder="Key"
                      className="w-24"
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="relative w-28">
                          <Input
                            value={
                              paramsTypes[index].charAt(0).toUpperCase() +
                              paramsTypes[index].slice(1)
                            }
                            readOnly
                            className="cursor-pointer"
                          />
                          <IconChevronDown
                            size={14}
                            className="text-main-view-fg/50 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                          />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-32" align="start">
                        <DropdownMenuItem
                          onClick={() =>
                            handleParameterChange(index, 'string', 'type')
                          }
                        >
                          String
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleParameterChange(index, 'number', 'type')
                          }
                        >
                          Number
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleParameterChange(index, 'boolean', 'type')
                          }
                        >
                          Boolean
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleParameterChange(index, 'json', 'type')
                          }
                        >
                          JSON
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {paramsTypes[index] === 'boolean' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <div className="relative flex-1">
                            <Input
                              value={paramsValues[index] ? 'True' : 'False'}
                              readOnly
                              className="cursor-pointer"
                            />
                            <IconChevronDown
                              size={14}
                              className="text-main-view-fg/50 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                            />
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-24" align="start">
                          <DropdownMenuItem
                            onClick={() =>
                              handleParameterChange(index, true, 'value')
                            }
                          >
                            True
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              handleParameterChange(index, false, 'value')
                            }
                          >
                            False
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : paramsTypes[index] === 'json' ? (
                      <Input
                        value={
                          typeof paramsValues[index] === 'object'
                            ? JSON.stringify(paramsValues[index], null, 2)
                            : paramsValues[index]?.toString() || ''
                        }
                        onChange={(e) =>
                          handleParameterChange(index, e.target.value, 'value')
                        }
                        placeholder='{"key": "value"}'
                        className="flex-1 h-[36px]"
                      />
                    ) : (
                      <Input
                        value={paramsValues[index]?.toString() || ''}
                        onChange={(e) =>
                          handleParameterChange(index, e.target.value, 'value')
                        }
                        type={paramsTypes[index] === 'number' ? 'number' : 'text'}
                        step={paramsTypes[index] === 'number' ? 'any' : undefined}
                        placeholder="Value"
                        className="flex-1 h-[36px]"
                      />
                    )}
                  </div>
                  <div
                    className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all flex-shrink-0"
                    onClick={() => handleRemoveParameter(index)}
                  >
                    <IconTrash size={16} className="text-destructive" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
