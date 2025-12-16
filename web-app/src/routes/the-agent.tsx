import { createFileRoute, Link } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import {
  IconRobot,
  IconSettings,
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react'
import { useDefaultAgent } from '@/hooks/useDefaultAgent'
import { useToolAvailable } from '@/hooks/useToolAvailable'
import { useAppState } from '@/hooks/useAppState'
import { useState, useMemo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { paramsSettings } from '@/lib/predefinedParams'
import { cn } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.the_agent as any)({
  component: TheAgentPage,
})

function TheAgentPage() {
  const { instructions, parameters, updateInstructions, updateParameters } =
    useDefaultAgent()
  const { defaultDisabledTools, setDefaultDisabledTools } = useToolAvailable()
  const { tools } = useAppState()

  // Group tools by server
  const toolsByServer = useMemo(() => {
    const grouped: Record<string, typeof tools> = {}
    tools.forEach((tool) => {
      if (!grouped[tool.server]) {
        grouped[tool.server] = []
      }
      grouped[tool.server].push(tool)
    })
    return grouped
  }, [tools])

  // Track expanded servers
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set(Object.keys(toolsByServer))
  )

  // Parameters state
  const [paramsKeys, setParamsKeys] = useState<string[]>(
    Object.keys(parameters).length > 0 ? Object.keys(parameters) : ['']
  )
  const [paramsValues, setParamsValues] = useState<unknown[]>(
    Object.values(parameters).length > 0 ? Object.values(parameters) : ['']
  )
  const [paramsTypes, setParamsTypes] = useState<string[]>(
    Object.values(parameters).map((value) => {
      if (typeof value === 'boolean') return 'boolean'
      if (typeof value === 'number') return 'number'
      if (typeof value === 'object') return 'json'
      return 'string'
    }).length > 0
      ? Object.values(parameters).map((value) => {
          if (typeof value === 'boolean') return 'boolean'
          if (typeof value === 'number') return 'number'
          if (typeof value === 'object') return 'json'
          return 'string'
        })
      : ['string']
  )

  const toggleServer = (serverName: string) => {
    const newExpanded = new Set(expandedServers)
    if (newExpanded.has(serverName)) {
      newExpanded.delete(serverName)
    } else {
      newExpanded.add(serverName)
    }
    setExpandedServers(newExpanded)
  }

  const isToolDisabled = (serverName: string, toolName: string) => {
    const toolKey = `${serverName}::${toolName}`
    return defaultDisabledTools.includes(toolKey)
  }

  const toggleTool = (serverName: string, toolName: string) => {
    const toolKey = `${serverName}::${toolName}`
    const newDisabledTools = isToolDisabled(serverName, toolName)
      ? defaultDisabledTools.filter((key) => key !== toolKey)
      : [...defaultDisabledTools, toolKey]
    setDefaultDisabledTools(newDisabledTools)
  }

  const toggleAllServerTools = (serverName: string) => {
    const serverTools = toolsByServer[serverName]
    const allDisabled = serverTools.every((tool) =>
      isToolDisabled(serverName, tool.name)
    )

    const serverToolKeys = serverTools.map(
      (tool) => `${serverName}::${tool.name}`
    )

    if (allDisabled) {
      // Enable all
      const newDisabledTools = defaultDisabledTools.filter(
        (key) => !serverToolKeys.includes(key)
      )
      setDefaultDisabledTools(newDisabledTools)
    } else {
      // Disable all
      const newDisabledTools = [
        ...new Set([...defaultDisabledTools, ...serverToolKeys]),
      ]
      setDefaultDisabledTools(newDisabledTools)
    }
  }

  const isServerFullyEnabled = (serverName: string) => {
    const serverTools = toolsByServer[serverName]
    return serverTools.every((tool) => !isToolDisabled(serverName, tool.name))
  }

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
    // Save instructions
    updateInstructions(instructions)

    // Convert parameters arrays to object
    const newParameters: Record<string, unknown> = {}
    paramsKeys.forEach((key, index) => {
      if (!key) return
      const value = paramsValues[index]
      if (paramsTypes[index] === 'number') {
        const parsed = Number(value as string)
        newParameters[key] = isNaN(parsed) ? 0 : parsed
      } else {
        newParameters[key] = value
      }
    })

    updateParameters(newParameters)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-main-view text-main-view-fg">
      {/* Header */}
      <div className="border-b border-main-view-fg/10 px-6 py-3 flex items-center justify-between gap-4 flex-wrap relative z-10 bg-main-view">
        <div className="flex items-center gap-3">
          <IconRobot size={20} className="text-main-view-fg/70" />
          <div className="text-base font-semibold">The Agent</div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Tools & MCPs Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tools & MCPs</h2>
            <Link to={route.settings.mcp_servers}>
              <Button variant="outline" size="sm" className="gap-2">
                <IconSettings size={16} />
                Configure MCP Servers
              </Button>
            </Link>
          </div>

          <div className="space-y-2">
            {Object.entries(toolsByServer).map(([serverName, serverTools]) => (
              <div
                key={serverName}
                className="border border-main-view-fg/10 rounded-lg overflow-hidden"
              >
                {/* Server header */}
                <div className="flex items-center justify-between p-3 bg-main-view-fg/5 hover:bg-main-view-fg/10 transition-colors">
                  <div className="flex items-center gap-2 flex-1">
                    <button
                      onClick={() => toggleServer(serverName)}
                      className="p-1 hover:bg-main-view-fg/10 rounded"
                    >
                      {expandedServers.has(serverName) ? (
                        <IconChevronDown size={16} />
                      ) : (
                        <IconChevronRight size={16} />
                      )}
                    </button>
                    <span className="font-medium">{serverName}</span>
                    <span className="text-sm text-main-view-fg/60">
                      ({serverTools.length}{' '}
                      {serverTools.length === 1 ? 'tool' : 'tools'})
                    </span>
                  </div>
                  <Switch
                    checked={isServerFullyEnabled(serverName)}
                    onCheckedChange={() => toggleAllServerTools(serverName)}
                  />
                </div>

                {/* Server tools */}
                {expandedServers.has(serverName) && (
                  <div className="divide-y divide-main-view-fg/10">
                    {serverTools.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex items-center justify-between p-3 pl-12"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">{tool.name}</div>
                          {tool.description && (
                            <div className="text-xs text-main-view-fg/60 mt-1">
                              {tool.description}
                            </div>
                          )}
                        </div>
                        <Switch
                          checked={!isToolDisabled(serverName, tool.name)}
                          onCheckedChange={() =>
                            toggleTool(serverName, tool.name)
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {Object.keys(toolsByServer).length === 0 && (
              <div className="text-center py-8 text-main-view-fg/60">
                No tools available. Configure MCP servers to add tools.
              </div>
            )}
          </div>
        </section>

        {/* Instructions Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Instructions</h2>
            <p className="text-sm text-main-view-fg/60 mt-1">
              Agent's system prompt, can use{' '}
              <code className="bg-main-view-fg/10 px-1 rounded">
                {'{'}
                {'{'}current_date{'}}'}
              </code>
              .
            </p>
          </div>
          <Textarea
            value={instructions}
            onChange={(e) => updateInstructions(e.target.value)}
            placeholder="Enter system instructions..."
            className="resize-none min-h-[200px] font-mono text-sm"
          />
        </section>

        {/* Parameters Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Parameters</h2>
          </div>

          {/* Predefined parameters */}
          <div className="space-y-2">
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
            <div className="flex items-center justify-end">
              <div
                className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                onClick={handleAddParameter}
              >
                <IconPlus size={18} className="text-main-view-fg/60" />
              </div>
            </div>

            {paramsKeys.map((key, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="flex items-center flex-col sm:flex-row w-full gap-2">
                  <Input
                    value={key}
                    onChange={(e) =>
                      handleParameterChange(index, e.target.value, 'key')
                    }
                    placeholder="Key"
                    className="w-full sm:w-24"
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <div className="relative w-full sm:w-30">
                        <Input
                          value={
                            paramsTypes[index].charAt(0).toUpperCase() +
                            paramsTypes[index].slice(1)
                          }
                          readOnly
                        />
                        <IconChevronDown
                          size={14}
                          className="text-main-view-fg/50 absolute right-2 top-1/2 -translate-y-1/2"
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
                        <div className="relative sm:flex-1 w-full">
                          <Input
                            value={paramsValues[index] ? 'True' : 'False'}
                            readOnly
                          />
                          <IconChevronDown
                            size={14}
                            className="text-main-view-fg/50 absolute right-2 top-1/2 -translate-y-1/2"
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
                      className="sm:flex-1 h-[36px] w-full"
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
                      className="sm:flex-1 h-[36px] w-full"
                    />
                  )}
                </div>
                <div
                  className="size-6 cursor-pointer flex items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out"
                  onClick={() => handleRemoveParameter(index)}
                >
                  <IconTrash size={18} className="text-destructive" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Save Button */}
        <div className="flex justify-end pb-4">
          <Button onClick={handleSave} size="lg">
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
