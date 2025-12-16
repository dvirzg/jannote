/* eslint-disable @typescript-eslint/no-explicit-any */
import { ThreadMessage } from '@janhq/core'
import { RenderMarkdown } from './RenderMarkdown'
import React, { Fragment, memo, useCallback, useMemo, useState } from 'react'
import {
  IconCopy,
  IconCopyCheck,
  IconDatabase,
  IconFileText,
  IconRefresh,
} from '@tabler/icons-react'
import { useAppState } from '@/hooks/useAppState'
import { cn } from '@/lib/utils'
import { useMessages } from '@/hooks/useMessages'
import ThinkingBlock from '@/containers/ThinkingBlock'
import ToolCallBlock from '@/containers/ToolCallBlock'
import { useChat } from '@/hooks/useChat'
import {
  EditMessageDialog,
  MessageMetadataDialog,
  DeleteMessageDialog,
} from '@/containers/dialogs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDate } from '@/utils/formatDate'

import TokenSpeedIndicator from '@/containers/TokenSpeedIndicator'

import { useTranslation } from '@/i18n/react-i18next-compat'
import { useModelProvider } from '@/hooks/useModelProvider'
import { extractFilesFromPrompt } from '@/lib/fileMetadata'
import { useDatabaseData } from '@/hooks/useDatabase'
import { extractDbRefsFromPrompt } from '@/lib/dbRefs'
import { createImageAttachment } from '@/types/attachment'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      className="flex items-center gap-1 hover:text-accent transition-colors group relative cursor-pointer"
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <IconCopyCheck size={16} className="text-accent" />
          <span className="opacity-100">{t('copied')}</span>
        </>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <IconCopy size={16} />
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('copy')}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </button>
  )
}

// Use memo to prevent unnecessary re-renders, but allow re-renders when props change
export const ThreadContent = memo(
  (
    item: ThreadMessage & {
      isLastMessage?: boolean
      index?: number
      showAssistant?: boolean
      streamingThread?: string

      streamTools?: any
      contextOverflowModal?: React.ReactNode | null
      updateMessage?: (
        item: ThreadMessage,
        message: string,
        imageUrls?: string[]
      ) => void
    }
  ) => {
    const { t } = useTranslation()
    const selectedModel = useModelProvider((state) => state.selectedModel)
    const [inlinePreview, setInlinePreview] = useState<
      { name: string; content: string } | null
    >(null)
    const { entries: dbEntries } = useDatabaseData()
    const text = useMemo(
      () => item.content.find((e) => e.type === 'text')?.text?.value ?? '',
      [item.content]
    )

    const dbIndex = useMemo(() => {
      const map = new Map<string, { name: string; displayName?: string; path: string }>()
      const walk = (nodes?: typeof dbEntries) => {
        if (!nodes) return
        for (const n of nodes) {
          map.set(n.id, { name: n.name, displayName: n.displayName, path: n.relativePath })
          if (n.children?.length) walk(n.children)
        }
      }
      walk(dbEntries)
      return map
    }, [dbEntries])

    const inlineFileContents = useMemo(() => {
      const contents = (item.metadata as any)?.inline_file_contents
      if (!Array.isArray(contents)) return new Map<string, string>()

      return contents.reduce((map, entry) => {
        const name = entry?.name
        const content = entry?.content
        if (typeof name === 'string' && typeof content === 'string') {
          map.set(name, content)
        }
        return map
      }, new Map<string, string>())
    }, [item.metadata])

    const extractedUserText = useMemo(() => {
      if (item.role !== 'user') {
        return {
          attachedFiles: [],
          cleanPrompt: text,
          dbRefMap: new Map<string, { name: string; path?: string }>(),
        }
      }
      const { refs, cleanPrompt: withoutDbRefs } = extractDbRefsFromPrompt(text)
      const { files, cleanPrompt: withoutFiles } = extractFilesFromPrompt(withoutDbRefs)
      const map = new Map<string, { name: string; path?: string }>()
      refs.forEach((r) => map.set(r.key, { name: r.name, path: r.path }))
      return { attachedFiles: files, cleanPrompt: withoutFiles, dbRefMap: map }
    }, [item.role, text])

    const attachedFiles = extractedUserText.attachedFiles
    const cleanPrompt = extractedUserText.cleanPrompt
    const dbRefMap = extractedUserText.dbRefMap

    // Check if any attached files are images (mentioned inline)
    const inlineImageFileNames = useMemo(() => {
      const imageExtensions = [
        'png',
        'jpg',
        'jpeg',
        'gif',
        'webp',
        'bmp',
        'svg',
      ]

      const isImage = (name: string, type?: string) => {
        const typeLowerCase = type?.toLowerCase()
        // Check standard MIME type or generic 'image' or 'img' type
        if (
          typeLowerCase === 'image' ||
          typeLowerCase === 'img' ||
          typeLowerCase?.startsWith('image/')
        ) {
          return true
        }

        const parts = name.toLowerCase().split('.')
        const extFromName = parts.length > 1 ? parts.pop() : undefined

        // Check if type matches an image extension
        if (typeLowerCase && imageExtensions.includes(typeLowerCase)) {
          return true
        }

        // Check if filename extension matches
        if (extFromName && imageExtensions.includes(extFromName)) {
          return true
        }

        return false
      }

      const names = new Set<string>()

      // Check dbRefMap (explicit mentions in text)
      // This catches files that have a chip in the text
      dbRefMap.forEach((meta) => {
        if (isImage(meta.name)) {
          names.add(meta.name.toLowerCase())
        }
      })

      // Also check attachedFiles that are explicitly marked inline (fallback)
      attachedFiles.forEach(file => {
        if (file.injectionMode === 'inline' && isImage(file.name, file.type)) {
          names.add(file.name.toLowerCase())
        }
      })

      return names
    }, [attachedFiles, dbRefMap])

    const renderPromptWithDbTokens = useCallback(
      (text: string) => {
        const nodes: React.ReactNode[] = []
        const regex = /@(db:([A-Za-z0-9_-]+)|ref:([A-Za-z0-9_-]+))/g
        let lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = regex.exec(text)) !== null) {
          if (match.index > lastIndex) {
            nodes.push(text.slice(lastIndex, match.index))
          }
          const dbId = match[2]
          const refKey = match[3]
          const refMeta = refKey ? dbRefMap.get(refKey) : undefined
          const meta = dbId ? dbIndex.get(dbId) : undefined
          const labelName = refMeta?.name || meta?.displayName || meta?.name || match[0]

          // Determine preview data
          const isInlineImage = inlineImageFileNames.has(labelName.toLowerCase())
          let previewContent: React.ReactNode | null = null;

          if (isInlineImage) {
            // Try to find image URL
            const file = attachedFiles.find(f => f.name.toLowerCase() === labelName.toLowerCase())
            const imageUrl = item.content?.find(
              (c) => c.type === 'image_url' && c.image_url?.url && c.image_url?.url.length > 100 // crude check to differentiate from local path if needed, usually just finding any matching image is OK if we had id mapping
            )?.image_url?.url

            // If we can't map by ID, we might just grab the first image if there's only 1 attached? 
            // Or try to match base64? 
            // Actually, `attachedFiles` usually corresponds to `item.content` images in order for images.
            // But simpler: checking attachedFiles for dataUrl for local preview?

            // Best effort: if attachedFiles has a dataUrl/base64, use it (typically for new messages)
            // If not, use item.content image_urls.

            // Let's refine: 
            let src = imageUrl
            if (!src && file && 'dataUrl' in file && typeof file.dataUrl === 'string') src = file.dataUrl

            if (src) {
              previewContent = (
                <img
                  src={src}
                  alt={labelName}
                  className="max-w-xs max-h-64 rounded-md object-contain border border-main-view-fg/20 shadow-lg"
                />
              )
            }
          } else {
            // Text/Doc preview
            const content = inlineFileContents.get(labelName)
            if (content) {
              previewContent = (
                <div className="max-w-md max-h-64 overflow-auto">
                  <div className="whitespace-pre-wrap text-sm font-mono p-2 bg-muted rounded-md">
                    {content.slice(0, 500)}
                    {content.length > 500 && '...'}
                  </div>
                </div>
              )
            }
          }

          nodes.push(
            <Tooltip key={`${match.index}-${dbId || refKey || match[0]}`}>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-main-view-fg/10 border border-main-view-fg/20 text-xs font-mono cursor-default hover:bg-main-view-fg/20 transition-colors"
                >
                  {labelName}
                </span>
              </TooltipTrigger>
              {previewContent && (
                <TooltipContent className="p-0 border-0 bg-transparent">
                  {previewContent}
                </TooltipContent>
              )}
            </Tooltip>
          )
          lastIndex = match.index + match[0].length
        }
        if (lastIndex < text.length) {
          nodes.push(text.slice(lastIndex))
        }
        return nodes
      },
      [dbIndex, dbRefMap, inlineImageFileNames, attachedFiles, item.content, inlineFileContents]
    )

    // Use useMemo to stabilize the components prop
    const linkComponents = useMemo(
      () => ({
        a: ({ ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
      }),
      []
    )
    const image = useMemo(() => item.content?.[0]?.image_url, [item])
    // Only check if streaming is happening for this thread, not the content itself
    const isStreamingThisThread = useAppState(
      (state) => state.streamingContent?.thread_id === item.thread_id
    )

    // extractedUserText provides: attachedFiles, cleanPrompt, dbRefMap



    const { reasoningSegment, textSegment } = useMemo(() => {
      // Check for thinking formats
      const hasThinkTag = text.includes('<think>') && !text.includes('</think>')
      const hasAnalysisChannel =
        text.includes('<|channel|>analysis<|message|>') &&
        !text.includes('<|start|>assistant<|channel|>final<|message|>')

      if (hasThinkTag || hasAnalysisChannel)
        return { reasoningSegment: text, textSegment: '' }

      // Check for completed think tag format
      const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/)
      if (thinkMatch?.index !== undefined) {
        const splitIndex = thinkMatch.index + thinkMatch[0].length
        return {
          reasoningSegment: text.slice(0, splitIndex),
          textSegment: text.slice(splitIndex),
        }
      }

      // Check for completed analysis channel format
      const analysisMatch = text.match(
        /<\|channel\|>analysis<\|message\|>([\s\S]*?)<\|start\|>assistant<\|channel\|>final<\|message\|>/
      )
      if (analysisMatch?.index !== undefined) {
        const splitIndex = analysisMatch.index + analysisMatch[0].length
        return {
          reasoningSegment: text.slice(0, splitIndex),
          textSegment: text.slice(splitIndex),
        }
      }

      return { reasoningSegment: undefined, textSegment: text }
    }, [text])

    const getMessages = useMessages((state) => state.getMessages)
    const deleteMessage = useMessages((state) => state.deleteMessage)
    const sendMessage = useChat()

    const regenerate = useCallback(() => {
      // Only regenerate assistant message is allowed
      deleteMessage(item.thread_id, item.id)
      const threadMessages = getMessages(item.thread_id)
      let toSendMessage = threadMessages.pop()
      while (toSendMessage && toSendMessage?.role !== 'user') {
        deleteMessage(toSendMessage.thread_id, toSendMessage.id ?? '')
        toSendMessage = threadMessages.pop()
      }
      if (toSendMessage) {
        deleteMessage(toSendMessage.thread_id, toSendMessage.id ?? '')
        // Extract text content and any attachments
        const rawText =
          toSendMessage.content?.find((c) => c.type === 'text')?.text?.value || ''
        const { cleanPrompt: textContent } = extractFilesFromPrompt(rawText)
        const attachments = toSendMessage.content
          ?.filter((c) => (c.type === 'image_url' && c.image_url?.url) || false)
          .map((c) => {
            if (c.type === 'image_url' && c.image_url?.url) {
              const url = c.image_url.url
              const [mimeType, base64] = url
                .replace('data:', '')
                .split(';base64,')
              return createImageAttachment({
                name: 'image', // Original filename unavailable
                mimeType,
                size: 0,
                base64: base64,
                dataUrl: url,
              })
            }
            return null
          })
          .filter((v) => v !== null)
        // Keep embedded document metadata in the message for regenerate
        sendMessage(textContent, true, attachments)
      }
    }, [deleteMessage, getMessages, item, sendMessage])

    const removeMessage = useCallback(() => {
      if (
        item.index !== undefined &&
        (item.role === 'assistant' || item.role === 'tool')
      ) {
        const threadMessages = getMessages(item.thread_id).slice(
          0,
          item.index + 1
        )
        let toSendMessage = threadMessages.pop()
        while (toSendMessage && toSendMessage?.role !== 'user') {
          deleteMessage(toSendMessage.thread_id, toSendMessage.id ?? '')
          toSendMessage = threadMessages.pop()
          // Stop deletion when encountering an assistant message that isn’t a tool call
          if (
            toSendMessage &&
            toSendMessage.role === 'assistant' &&
            !('tool_calls' in (toSendMessage.metadata ?? {}))
          )
            break
        }
      } else {
        deleteMessage(item.thread_id, item.id)
      }
    }, [deleteMessage, getMessages, item])

    const isToolCalls =
      item.metadata &&
      'tool_calls' in item.metadata &&
      Array.isArray(item.metadata.tool_calls) &&
      item.metadata.tool_calls.length

    return (
      <Fragment>
        {item.role === 'user' && (
          <div className="w-full">
            {/* Render text content in the message bubble */}
            {cleanPrompt && (
              <div className="flex justify-end w-full h-full text-start break-words whitespace-normal">
                <div className="bg-main-view-fg/4 relative text-main-view-fg p-2 rounded-md inline-block max-w-[80%] ">
                  <div className="select-text text-sm leading-relaxed break-words whitespace-pre-wrap">
                    {renderPromptWithDbTokens(cleanPrompt)}
                  </div>
                </div>
              </div>
            )}

            {/* Render document file attachments (extracted from message text) - below text */}
            {(() => {
              // Only show files that are NOT injected inline
              const visibleFiles = attachedFiles.filter(f => f.injectionMode !== 'inline')
              if (visibleFiles.length === 0) return null
              return (
                <div className="flex justify-end w-full mt-2 mb-2">
                  <div className="flex flex-wrap gap-2 max-w-[80%] justify-end">
                    {visibleFiles.map((file, index) => {
                      const inlineContent =
                        file.injectionMode === 'inline'
                          ? inlineFileContents.get(file.name) || undefined
                          : undefined
                      const indicator =
                        file.injectionMode ||
                        (inlineContent ? 'inline' : undefined)
                      const canPreview = Boolean(
                        indicator === 'inline' && inlineContent
                      )
                      const isImageFile = inlineImageFileNames.has(file.name.toLowerCase())
                      const isPdfFile = file.type?.toLowerCase() === 'pdf'
                      const isInlineDocument = !isImageFile && inlineContent && !isPdfFile

                      // Find corresponding image URL from item.content for hover preview
                      const imageUrl = isImageFile
                        ? item.content?.find(
                          (c) =>
                            c.type === 'image_url' &&
                            c.image_url?.url
                        )?.image_url?.url
                        : undefined

                      return (
                        <div
                          key={file.id || index}
                          className="flex items-center gap-2 px-3 py-2 bg-main-view-fg/5 rounded-md border border-main-view-fg/10 text-xs"
                        >
                          {indicator && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex items-center justify-center size-6 rounded-full bg-main-view/70 text-main-view-fg/80"
                                  aria-label={
                                    indicator === 'inline'
                                      ? t('common:attachmentInjectedIndicator')
                                      : t('common:attachmentEmbeddedIndicator')
                                  }
                                >
                                  {indicator === 'inline' ? (
                                    <IconFileText size={14} />
                                  ) : (
                                    <IconDatabase size={14} />
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {indicator === 'inline'
                                  ? t('common:attachmentInjectedIndicator')
                                  : t('common:attachmentEmbeddedIndicator')}
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {isImageFile && imageUrl ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={!canPreview}
                                  onClick={() =>
                                    canPreview &&
                                    setInlinePreview({
                                      name: file.name,
                                      content: inlineContent!,
                                    })
                                  }
                                  className={cn(
                                    'text-main-view-fg text-left truncate max-w-48',
                                    (canPreview || isImageFile) && 'hover:underline'
                                  )}
                                  title={file.name}
                                >
                                  {file.name}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="p-0 border-0 bg-transparent">
                                <img
                                  src={imageUrl}
                                  alt={file.name}
                                  className="max-w-xs max-h-64 rounded-md object-contain border border-main-view-fg/20 shadow-lg"
                                />
                              </TooltipContent>
                            </Tooltip>
                          ) : isInlineDocument ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  disabled={!canPreview}
                                  onClick={() =>
                                    canPreview &&
                                    setInlinePreview({
                                      name: file.name,
                                      content: inlineContent!,
                                    })
                                  }
                                  className={cn(
                                    'text-main-view-fg text-left truncate max-w-48',
                                    canPreview && 'hover:underline'
                                  )}
                                  title={file.name}
                                >
                                  {file.name}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md max-h-64 overflow-auto">
                                <div className="whitespace-pre-wrap text-sm font-mono p-2 bg-muted rounded-md">
                                  {inlineContent?.slice(0, 500)}
                                  {inlineContent && inlineContent.length > 500 && '...'}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <button
                              type="button"
                              disabled={!canPreview}
                              onClick={() =>
                                canPreview &&
                                setInlinePreview({
                                  name: file.name,
                                  content: inlineContent!,
                                })
                              }
                              className={cn(
                                'text-main-view-fg text-left truncate max-w-48',
                                canPreview && 'hover:underline'
                              )}
                              title={
                                canPreview
                                  ? t('common:viewInjectedContent')
                                  : file.name
                              }
                            >
                              {file.name}
                            </button>
                          )}

                          {file.type && (
                            <span className="text-main-view-fg/40 text-[10px]">
                              .{file.type}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Render image attachments - below files (only explicit attachments, not inline mentions) */}
            {/* If there are any inline image mentions, skip rendering images here (hover-only on chips) */}
            {(() => {
              const imageContentParts = item.content?.filter(
                (c) => c.type === 'image_url' && c.image_url?.url
              ) || []
              const inlineImageCount = inlineImageFileNames.size
              // Only render images when there are no inline image mentions
              const shouldRenderImages = inlineImageCount === 0 && imageContentParts.length > 0

              return shouldRenderImages ? (
                <div className="flex justify-end w-full mb-2">
                  <div className="flex flex-wrap gap-2 max-w-[80%] justify-end">
                    {imageContentParts.map((contentPart, index) => {
                      if (
                        contentPart.type === 'image_url' &&
                        contentPart.image_url?.url
                      ) {
                        return (
                          <div key={index} className="relative">
                            <img
                              src={contentPart.image_url.url}
                              alt="Uploaded attachment"
                              className="size-40 rounded-md object-cover border border-main-view-fg/10"
                            />
                          </div>
                        )
                      }
                      return null
                    })}
                  </div>
                </div>
              ) : null
            })()}

            <div className="flex items-center justify-end gap-2 text-main-view-fg/60 text-xs mt-2">
              <EditMessageDialog
                message={cleanPrompt || ''}
                imageUrls={
                  item.content
                    ?.filter((c) => c.type === 'image_url' && c.image_url?.url)
                    .map((c) => c.image_url!.url)
                    .filter((url): url is string => url !== undefined) || []
                }
                onSave={(message, imageUrls) => {
                  if (item.updateMessage) {
                    item.updateMessage(item, message, imageUrls)
                  }
                }}
              />
              <DeleteMessageDialog
                onDelete={() => deleteMessage(item.thread_id, item.id)}
              />
            </div>
          </div>
        )
        }
        {item.content?.[0]?.text && item.role !== 'user' && (
          <>
            {item.showAssistant && item?.created_at && item?.created_at !== 0 && (
              <div className="flex items-center gap-2 mb-3 text-main-view-fg/60">
                <span className="text-xs">
                  {formatDate(item?.created_at)}
                </span>
              </div>
            )}

            {reasoningSegment && (
              <ThinkingBlock
                id={
                  item.isLastMessage
                    ? `${item.thread_id}-last-${reasoningSegment.slice(0, 50).replace(/\s/g, '').slice(-10)}`
                    : `${item.thread_id}-${item.index ?? item.id}`
                }
                text={reasoningSegment}
              />
            )}

            <RenderMarkdown
              content={textSegment.replace('</think>', '')}
              components={linkComponents}
            />

            {isToolCalls && item.metadata?.tool_calls ? (
              <>
                {(item.metadata.tool_calls as ToolCall[]).map((toolCall) => (
                  <ToolCallBlock
                    id={toolCall.tool?.id ?? 0}
                    key={toolCall.tool?.id}
                    name={
                      (item.streamTools?.tool_calls?.function?.name ||
                        toolCall.tool?.function?.name) ??
                      ''
                    }
                    args={
                      item.streamTools?.tool_calls?.function?.arguments ||
                      toolCall.tool?.function?.arguments ||
                      undefined
                    }
                    result={JSON.stringify(toolCall.response)}
                    loading={toolCall.state === 'pending'}
                  />
                ))}
              </>
            ) : null}

            {!isToolCalls && (
              <div className="flex items-center gap-2 text-main-view-fg/60 text-xs">
                <div className={cn('flex items-center gap-2')}>
                  <div
                    className={cn(
                      'flex items-center gap-2',
                      item.isLastMessage && isStreamingThisThread && 'hidden'
                    )}
                  >
                    <CopyButton text={item.content?.[0]?.text.value || ''} />
                    <DeleteMessageDialog onDelete={removeMessage} />
                    <MessageMetadataDialog metadata={item.metadata} />

                    {item.isLastMessage && selectedModel && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="flex items-center gap-1 hover:text-accent transition-colors cursor-pointer group relative"
                            onClick={regenerate}
                          >
                            <IconRefresh size={16} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('regenerate')}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  <TokenSpeedIndicator
                    streaming={Boolean(
                      item.isLastMessage && isStreamingThisThread
                    )}
                    metadata={item.metadata}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {item.type === 'image_url' && image && (
          <div>
            <img
              src={image.url}
              alt={image.detail || 'Thread image'}
              className="max-w-full rounded-md"
            />
            {image.detail && <p className="text-sm mt-1">{image.detail}</p>}
          </div>
        )}
        {item.contextOverflowModal && item.contextOverflowModal}

        <Dialog
          open={Boolean(inlinePreview)}
          onOpenChange={(open) => {
            if (!open) setInlinePreview(null)
          }}
        >
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t('common:injectedContentTitle')}</DialogTitle>
              <DialogDescription>{inlinePreview?.name}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-sm font-mono bg-muted px-3 py-2 rounded-md">
              {inlinePreview?.content}
            </div>
          </DialogContent>
        </Dialog>
      </Fragment>
    )
  }
)
