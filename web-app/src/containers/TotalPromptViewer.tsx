import { ThreadMessage } from '@janhq/core'
import { useAppState } from '@/hooks/useAppState'
import { cn } from '@/lib/utils'
import { IconCode, IconTool } from '@tabler/icons-react'
import { formatDate } from '@/utils/formatDate'
import { useState } from 'react'

interface TotalPromptViewerProps {
    messages: ThreadMessage[]
    threadId: string
}

interface ToolCall {
    id?: string
    function?: {
        name?: string
        arguments?: string | object
    }
    tool?: {
        id?: string
        function?: {
            name?: string
            arguments?: string | object
        }
    }
}

const TruncatedString = ({ value }: { value: string }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const limit = 100

    if (value.length <= limit) {
        return <span className="text-green-600 dark:text-green-400 break-all">"{value}"</span>
    }

    return (
        <span className="break-all">
            <span className="text-green-600 dark:text-green-400">
                "{isExpanded ? value : `${value.slice(0, limit)}...`}"
            </span>
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    setIsExpanded(!isExpanded)
                }}
                className="ml-2 px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-main-view-fg/10 hover:bg-main-view-fg/20 text-main-view-fg transition-colors"
            >
                {isExpanded ? 'Collapse' : 'View Full'}
            </button>
        </span>
    )
}

const RecursiveJsonViewer = ({ data, level = 0 }: { data: unknown; level?: number }) => {
    if (data === null) return <span className="text-main-view-fg/50">null</span>
    if (data === undefined) return <span className="text-main-view-fg/30">undefined</span>
    if (typeof data === 'boolean') return <span className="text-purple-500 font-bold">{String(data)}</span>
    if (typeof data === 'number') return <span className="text-orange-500">{data}</span>
    if (typeof data === 'string') return <TruncatedString value={data} />

    if (Array.isArray(data)) {
        if (data.length === 0) return <span>[]</span>
        return (
            <div className="inline-block align-top">
                <span>[</span>
                <div style={{ paddingLeft: '1.5em' }}>
                    {data.map((item, i) => (
                        <div key={i}>
                            <RecursiveJsonViewer data={item} level={level + 1} />
                            {i < data.length - 1 && ','}
                        </div>
                    ))}
                </div>
                <span style={{ paddingLeft: level > 0 ? 0 : 0 }}>]</span>
            </div>
        )
    }

    // Object
    const keys = Object.keys(data as object)
    if (keys.length === 0) return <span>{'{}'}</span>

    return (
        <div className="inline-block align-top">
            <span>{'{'}</span>
            <div style={{ paddingLeft: '1.5em' }}>
                {keys.map((key, i) => (
                    <div key={key}>
                        <span className="text-blue-500 dark:text-blue-400 font-bold">"{key}"</span>
                        <span className="mr-2">:</span>
                        <RecursiveJsonViewer data={(data as Record<string, unknown>)[key]} level={level + 1} />
                        {i < keys.length - 1 && ','}
                    </div>
                ))}
            </div>
            <span style={{ paddingLeft: level > 0 ? 0 : 0 }}>{'}'}</span>
        </div>
    )
}

const JsonViewer = ({ data, label }: { data: unknown; label?: string }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) return null

    return (
        <div className="mt-4 border-t border-main-view-fg/10 pt-4">
            <button
                className="flex items-center gap-2 text-xs font-bold text-main-view-fg/50 hover:text-main-view-fg uppercase tracking-wider mb-2"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span>{isExpanded ? '▼' : '▶'}</span>
                {label || 'Raw Data'}
            </button>

            {isExpanded && (
                <div className="font-mono text-xs overflow-auto p-4 bg-main-view-fg/5 rounded-md border border-main-view-fg/10">
                    <RecursiveJsonViewer data={data} />
                </div>
            )}
        </div>
    )
}

export const TotalPromptViewer = ({ messages, threadId }: TotalPromptViewerProps) => {
    const streamingContent = useAppState((state) => state.streamingContent)
    const isStreamingThisThread = streamingContent?.thread_id === threadId

    const allMessages = isStreamingThisThread
        ? [...messages, streamingContent]
        : messages

    return (
        <div className="flex flex-col gap-8 pb-20 w-full">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-main-view-fg/10">
                <IconCode className="text-main-view-fg" size={24} />
                <h1 className="text-xl font-bold">Total Prompt View</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-main-view-fg/10 text-main-view-fg/70">
                    {allMessages.length} Messages
                </span>
            </div>

            {allMessages.map((msg, idx) => {
                const isUser = msg.role === 'user'
                const isAssistant = msg.role === 'assistant'

                return (
                    <div
                        key={msg.id || idx}
                        className="relative group transition-all"
                    >
                        {/* Header */}
                        <div className="flex items-center gap-4 mb-2">
                            <div className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wider",
                                isUser ? "bg-main-view-fg/10 text-main-view-fg" :
                                    isAssistant ? "bg-accent/10 text-accent" :
                                        "bg-amber-500/10 text-amber-500"
                            )}>
                                {msg.role}
                            </div>
                            <span className="text-[10px] font-mono opacity-30 select-all">{msg.id}</span>
                            <div className="opacity-30 text-[10px] ml-auto font-mono">
                                {formatDate(msg.created_at || Date.now())}
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="pl-0 space-y-4">

                            {/* Text Content */}
                            {msg.content?.map((c, i) => {
                                if (c.type === 'text') {
                                    const val = c.text?.value || ''
                                    return (
                                        <div key={i} className="space-y-1">
                                            <div className="text-sm whitespace-pre-wrap font-mono text-main-view-fg/90 leading-relaxed font-ligatures-none">
                                                {String(val)}
                                            </div>
                                        </div>
                                    )
                                }
                                if (c.type === 'image_url') {
                                    return (
                                        <div key={i} className="space-y-1">
                                            <img
                                                src={c.image_url?.url}
                                                alt="Content"
                                                className="max-h-96 rounded-md border border-main-view-fg/10"
                                            />
                                        </div>
                                    )
                                }
                                return null
                            })}

                            {/* Tool Calls (if assistant) */}
                            {msg.metadata?.tool_calls && Array.isArray(msg.metadata.tool_calls) && (
                                <div className="my-2 pl-4 border-l-2 border-amber-500/20">
                                    <div className="flex items-center gap-2 text-xs font-bold text-amber-500 uppercase tracking-wider font-mono mb-2">
                                        <IconTool size={12} />
                                        Tool Calls
                                    </div>
                                    {(msg.metadata.tool_calls as ToolCall[]).map((call: ToolCall, i: number) => {
                                        let parsedArgs = null
                                        try {
                                            // Try to parse arguments if they are stringified JSON
                                            parsedArgs = typeof call.function?.arguments === 'string'
                                                ? JSON.parse(call.function.arguments)
                                                : (call.function?.arguments || call.tool?.function?.arguments)
                                        } catch {
                                            parsedArgs = call.function?.arguments || call.tool?.function?.arguments
                                        }

                                        return (
                                            <div key={i} className="mb-4 last:mb-0">
                                                <div className="flex items-center gap-2 font-mono text-xs mb-2">
                                                    <span className="font-bold text-amber-500">{call.function?.name || call.tool?.function?.name}</span>
                                                    <span className="opacity-30">{call.id || call.tool?.id}</span>
                                                </div>
                                                <div className="font-mono text-xs bg-main-view-fg/5 p-3 rounded-md border border-main-view-fg/10 overflow-auto">
                                                    <RecursiveJsonViewer data={parsedArgs} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Tool Output (if tool role) */}
                            {msg.role === 'tool' && (
                                <div className="pl-4 border-l-2 border-amber-500/20">
                                    {/* Usually content is the output */}
                                    {/* We can rely on standard content rendering above for the tool output text */}
                                </div>
                            )}

                            {/* Full Metadata/Raw Object */}
                            <JsonViewer data={msg} label="Raw Message Object" />

                        </div>

                        {/* Divider */}
                        {idx < allMessages.length - 1 && (
                            <div className="h-px bg-main-view-fg/5 w-full mt-8" />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
