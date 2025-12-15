'use client'

import TextareaAutosize from 'react-textarea-autosize'
import { cn } from '@/lib/utils'
import { usePrompt } from '@/hooks/usePrompt'
import { useThreads } from '@/hooks/useThreads'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowRight, PlusIcon } from 'lucide-react'
import {
  IconPhoto,
  IconAtom,
  IconTool,
  IconCodeCircle2,
  IconPlayerStopFilled,
  IconX,
  IconPaperclip,
  IconLoader2,
  IconCheck,
  IconWorld,
} from '@tabler/icons-react'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useGeneralSetting } from '@/hooks/useGeneralSetting'
import { useModelProvider } from '@/hooks/useModelProvider'

import { useAppState } from '@/hooks/useAppState'
import { MovingBorder } from './MovingBorder'
import { useChat } from '@/hooks/useChat'
import DropdownModelProvider from '@/containers/DropdownModelProvider'
import { ModelLoader } from '@/containers/loaders/ModelLoader'
import DropdownToolsAvailable from '@/containers/DropdownToolsAvailable'
import { useServiceHub } from '@/hooks/useServiceHub'
import { useTools } from '@/hooks/useTools'
import { TokenCounter } from '@/components/TokenCounter'
import { useMessages } from '@/hooks/useMessages'
import { useShallow } from 'zustand/react/shallow'
import { McpExtensionToolLoader } from './McpExtensionToolLoader'
import {
  ContentType,
  ExtensionTypeEnum,
  MCPExtension,
  MessageStatus,
  ThreadMessage,
  fs,
  VectorDBExtension,
} from '@janhq/core'
import { ExtensionManager } from '@/lib/extension'
import { useAttachments } from '@/hooks/useAttachments'
import { toast } from 'sonner'
import { PlatformFeatures } from '@/lib/platform/const'
import { PlatformFeature } from '@/lib/platform/types'
import { isPlatformTauri } from '@/lib/platform/utils'
import { processAttachmentsForSend } from '@/lib/attachmentProcessing'
import { useAttachmentIngestionPrompt } from '@/hooks/useAttachmentIngestionPrompt'
import {
  NEW_THREAD_ATTACHMENT_KEY,
  useChatAttachments,
} from '@/hooks/useChatAttachments'
import { useDatabaseActions, useDatabaseData } from '@/hooks/useDatabase'

import {
  Attachment,
  createImageAttachment,
  createDocumentAttachment,
} from '@/types/attachment'
import JanBrowserExtensionDialog from '@/containers/dialogs/JanBrowserExtensionDialog'
import { useJanBrowserExtension } from '@/hooks/useJanBrowserExtension'
import { injectDbRefsIntoPrompt } from '@/lib/dbRefs'
import {
  parseUnifiedCommands,
  resolveUnifiedCommands,
} from '@/lib/unifiedCommands'
import { useCommands } from '@/hooks/useCommands'
import { expandCommandsInPrompt } from '@/lib/commands'

type ChatInputProps = {
  className?: string
  showSpeedToken?: boolean
  model?: ThreadModel
  initialMessage?: boolean
  projectId?: string
}

const ChatInput = ({
  model,
  className,
  initialMessage,
  projectId,
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [rows, setRows] = useState(1)
  const serviceHub = useServiceHub()
  const streamingContent = useAppState((state) => state.streamingContent)
  const abortControllers = useAppState((state) => state.abortControllers)
  const loadingModel = useAppState((state) => state.loadingModel)
  const updateLoadingModel = useAppState((state) => state.updateLoadingModel)
  const tools = useAppState((state) => state.tools)
  const cancelToolCall = useAppState((state) => state.cancelToolCall)
  const setActiveModels = useAppState((state) => state.setActiveModels)
  const prompt = usePrompt((state) => state.prompt)
  const setPrompt = usePrompt((state) => state.setPrompt)
  const currentThreadId = useThreads((state) => state.currentThreadId)
  const { t } = useTranslation()
  const spellCheckChatInput = useGeneralSetting(
    (state) => state.spellCheckChatInput
  )
  const tokenCounterCompact = useGeneralSetting(
    (state) => state.tokenCounterCompact
  )
  useTools()

  // Get current thread messages for token counting
  const threadMessages = useMessages(
    useShallow((state) =>
      currentThreadId ? state.messages[currentThreadId] : []
    )
  )

  const maxRows = 10
  const ATTACHMENT_AUTO_INLINE_FALLBACK_BYTES = 512 * 1024

  const selectedModel = useModelProvider((state) => state.selectedModel)
  const selectedProvider = useModelProvider((state) => state.selectedProvider)
  const sendMessage = useChat()
  const commands = useCommands((state) => state.commands)
  const [message, setMessage] = useState('')
  const [mentionStart, setMentionStart] = useState<number | null>(null)
  const [mentionQuery, setMentionQuery] = useState('')
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [commandStart, setCommandStart] = useState<number | null>(null)
  const [commandQuery, setCommandQuery] = useState('')
  const [commandInArgs, setCommandInArgs] = useState(false)
  const [commandArgIndex, setCommandArgIndex] = useState(0)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const commandArgIndexRef = useRef(0)
  const [mentionMap, setMentionMap] = useState<Record<
    string,
    { id: string; displayName: string; path?: string }
  >>({})
  const [dropdownToolsAvailable, setDropdownToolsAvailable] = useState(false)
  const [tooltipToolsAvailable, setTooltipToolsAvailable] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [hasMmproj, setHasMmproj] = useState(false)
  const activeModels = useAppState(useShallow((state) => state.activeModels))
  const hasActiveModels = useMemo(
    () =>
      activeModels.length > 0 &&
      activeModels.some((e) => e === selectedModel?.id),
    [activeModels, selectedModel?.id]
  )

  // Jan Browser Extension hook
  const {
    hasConfig: hasJanBrowserMCPConfig,
    isActive: janBrowserMCPActive,
    isLoading: isJanBrowserMCPLoading,
    dialogOpen: extensionDialogOpen,
    dialogState: extensionDialogState,
    toggleBrowser: handleBrowseClick,
    handleCancel: handleExtensionDialogCancel,
    setDialogOpen: setExtensionDialogOpen,
  } = useJanBrowserExtension()

  const attachmentsEnabled = useAttachments((s) => s.enabled)
  const parsePreference = useAttachments((s) => s.parseMode)
  const maxFileSizeMB = useAttachments((s) => s.maxFileSizeMB)
  const autoInlineContextRatio = useAttachments((s) => s.autoInlineContextRatio)
  // Determine whether to show the Attach documents button (simple gating)
  const showAttachmentButton =
    attachmentsEnabled && PlatformFeatures[PlatformFeature.FILE_ATTACHMENTS]
  // Derived: any document currently processing (ingestion in progress)
  const attachmentsKey = currentThreadId ?? NEW_THREAD_ATTACHMENT_KEY
  const attachments = useChatAttachments(
    useCallback((state) => state.getAttachments(attachmentsKey), [attachmentsKey])
  )
  const attachmentsKeyRef = useRef(attachmentsKey)
  const setAttachmentsForThread = useChatAttachments(
    (state) => state.setAttachments
  )
  const clearAttachmentsForThread = useChatAttachments(
    (state) => state.clearAttachments
  )
  const transferAttachments = useChatAttachments(
    (state) => state.transferAttachments
  )
  const getProviderByName = useModelProvider((state) => state.getProviderByName)

  useEffect(() => {
    attachmentsKeyRef.current = attachmentsKey
  }, [attachmentsKey])

  const { entries: databaseEntries } = useDatabaseData()
  const { refresh: refreshDatabase } = useDatabaseActions()

  useEffect(() => {
    // Load database entries once to power mentions/autocomplete
    void refreshDatabase()
  }, [refreshDatabase])

  const flattenedDatabaseEntries = useMemo(() => {
    const out: Array<{
      id: string
      name: string
      displayName: string
      path: string
      type: 'file' | 'folder'
    }> = []
    const walk = (nodes?: typeof databaseEntries) => {
      if (!nodes) return
      for (const node of nodes) {
        out.push({
          id: node.id,
          name: node.name,
          displayName: node.displayName ?? node.name,
          path: node.relativePath,
          type: node.type,
        })
        if (node.children?.length) {
          walk(node.children)
        }
      }
    }
    walk(databaseEntries)
    return out
  }, [databaseEntries])

  const dbIndex = useMemo(() => {
    const map = new Map<string, { name: string; displayName: string; path: string }>()
    flattenedDatabaseEntries.forEach((e) =>
      map.set(e.id, { name: e.name, displayName: e.displayName, path: e.path })
    )
    return map
  }, [flattenedDatabaseEntries])

  const mentionSuggestions = useMemo(() => {
    if (mentionStart === null || mentionQuery === undefined) return []
    const q = mentionQuery.trim().toLowerCase()
    const filtered = flattenedDatabaseEntries.filter((e) => {
      if (!q) return true
      return (
        e.displayName.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.path.toLowerCase().includes(q)
      )
    })
    return filtered.slice(0, 8)
  }, [flattenedDatabaseEntries, mentionQuery, mentionStart])

  const mentionVisible = mentionStart !== null

  const commandVisible = commandStart !== null

  const commandSuggestions = useMemo(() => {
    if (!commandVisible || commandInArgs) return []
    const q = commandQuery.trim().toLowerCase()
    const filtered = q
      ? commands.filter((c) => c.name.toLowerCase().startsWith(q))
      : commands
    // Keep this list intentionally small so the UI stays lightweight.
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 10)
  }, [commandVisible, commandInArgs, commandQuery, commands])

  const formatCommandSignature = useCallback(
    (c: { name: string; args: Array<{ name: string }> }) => {
      const args = c.args?.length ? `(${c.args.map((a) => a.name).join(', ')})` : ''
      return `/${c.name}${args}`
    },
    []
  )

  const selectedCommand = useMemo(() => {
    if (commandInArgs) {
      const q = commandQuery.trim().toLowerCase()
      return commands.find((c) => c.name.toLowerCase() === q)
    }
    return commandSuggestions[selectedCommandIndex] ?? null
  }, [commandInArgs, commandQuery, commands, commandSuggestions, selectedCommandIndex])

  const closeCommandAutocomplete = useCallback(() => {
    setCommandStart(null)
    setCommandQuery('')
    setCommandInArgs(false)
    setCommandArgIndex(0)
    commandArgIndexRef.current = 0
    setSelectedCommandIndex(0)
  }, [])

  useEffect(() => {
    commandArgIndexRef.current = commandArgIndex
  }, [commandArgIndex])

  const detectCommandContext = useCallback((val: string, caret: number) => {
    const from = Math.min(val.length - 1, Math.max(0, caret - 1))
    const trigger = val.lastIndexOf('/', from)
    if (trigger < 0) return null

    const prev = trigger > 0 ? val[trigger - 1] : ''
    const next = trigger + 1 < val.length ? val[trigger + 1] : ''
    // Guard against URLs (e.g. http://...) and comment-like patterns (//)
    if (prev === ':' || prev === '/' || next === '/') return null
    // Ensure slash starts a token
    if (trigger > 0 && !/\s/.test(prev)) return null

    // Parse name (allow whitespace only AFTER the name, before '(')
    const safeCaret = Math.max(caret, trigger + 1)
    let i = trigger + 1
    // Allow "/" alone to open command autocomplete (empty query).
    if (i >= val.length) {
      return { trigger, namePart: '', inArgs: false, argIndex: 0 }
    }
    // If the user just typed "/" and caret isn't reliable, treat as empty query.
    if (!/[A-Za-z]/.test(val[i])) {
      if (safeCaret <= i) return { trigger, namePart: '', inArgs: false, argIndex: 0 }
      return null
    }
    const nameStart = i
    while (i < val.length && /[A-Za-z0-9_-]/.test(val[i])) i++
    const name = val.slice(nameStart, i)

    // If caret is still in the name typing region, behave like name autocomplete.
    if (safeCaret <= nameStart) {
      // "/"" typed but caret isn't reliable; treat as empty query (show all commands)
      return { trigger, namePart: '', inArgs: false, argIndex: 0 }
    }
    if (safeCaret <= i) {
      const typed = val.slice(nameStart, safeCaret)
      if (typed.length > 0 && !/^[A-Za-z0-9_-]+$/.test(typed)) return null
      return { trigger, namePart: typed, inArgs: false, argIndex: 0 }
    }

    // Skip whitespace between name and '(' (spaces shouldn't affect args mode)
    let j = i
    while (j < val.length && /\s/.test(val[j])) j++
    const openParenPos = j < val.length && val[j] === '(' ? j : -1

    if (openParenPos === -1 || openParenPos >= safeCaret) {
      // Not inside args yet; allow name autocomplete only if there's no whitespace in the typed token.
      const typed = val.slice(trigger + 1, safeCaret)
      if (/\s/.test(typed)) return null
      if (typed.length > 0 && !/^[A-Za-z0-9_-]+$/.test(typed)) return null
      return { trigger, namePart: typed.trim(), inArgs: false, argIndex: 0 }
    }

    // We're past "name(" so we may be inside args. Determine comma positions and whether args are closed.
    let inSingle = false
    let inDouble = false
    let escaping = false
    let depth = 1
    const commaPositions: number[] = []
    let closeParenPos: number | null = null

    for (let k = openParenPos + 1; k < val.length; k++) {
      const ch = val[k]
      if (escaping) {
        escaping = false
        continue
      }
      if (ch === '\\') {
        escaping = true
        continue
      }

      if (!inDouble && ch === "'") {
        inSingle = !inSingle
        continue
      }
      if (!inSingle && ch === '"') {
        inDouble = !inDouble
        continue
      }
      if (inSingle || inDouble) continue

      if (ch === '(') {
        depth++
        continue
      }
      if (ch === ')') {
        depth--
        if (depth === 0) {
          closeParenPos = k
          break
        }
        continue
      }
      if (ch === ',' && depth === 1) {
        commaPositions.push(k)
      }
    }

    // Only exit args mode when a real (unquoted) ')' has been completed.
    if (closeParenPos !== null && closeParenPos < safeCaret) return null

    // Arg index is number of top-level commas before the caret (ignoring commas in quotes).
    let argIndex = 0
    for (const pos of commaPositions) {
      if (pos < safeCaret) argIndex++
      else break
    }

    return { trigger, namePart: name, inArgs: true, argIndex }
  }, [])

  const insertCommandName = useCallback(
    (name: string) => {
      const textarea =
        textareaRef.current ??
        (document.activeElement instanceof HTMLTextAreaElement
          ? document.activeElement
          : null)
      if (!textarea) return
      const value = textarea.value
      const start = commandStart
      if (start === null) return

      const caret = textarea.selectionStart ?? value.length

      // Replace the currently typed prefix (e.g. "/wea") with the selected command name.
      const before = value.slice(0, start + 1)
      const after = value.slice(caret)
      const nextValue = `${before}${name}${after}`
      setPrompt(nextValue)

      // Place caret at the end of the inserted command name
      requestAnimationFrame(() => {
        const nextCaret = start + 1 + name.length
        textarea.setSelectionRange(nextCaret, nextCaret)
      })

      closeCommandAutocomplete()
    },
    [closeCommandAutocomplete, commandStart, setPrompt]
  )

  const insertCommandInvocationStart = useCallback(
    (c: { name: string; args: Array<{ name: string }> }) => {
      const textarea =
        textareaRef.current ??
        (document.activeElement instanceof HTMLTextAreaElement
          ? document.activeElement
          : null)
      if (!textarea) return
      const value = textarea.value
      const start = commandStart
      if (start === null) return

      const caret = textarea.selectionStart ?? value.length

      const hasArgs = Boolean(c.args?.length)
      const insertion = hasArgs ? `${c.name}(` : c.name

      // Replace the currently typed prefix (e.g. "/wea") with the selected command invocation start.
      const before = value.slice(0, start + 1)
      const after = value.slice(caret)
      const nextValue = `${before}${insertion}${after}`
      setPrompt(nextValue)

      // Set caret immediately so successive Tab presses work reliably.
      const immediateCaret = start + 1 + insertion.length
      try {
        textarea.setSelectionRange(immediateCaret, immediateCaret)
      } catch {
        // ignore
      }
      requestAnimationFrame(() => {
        const nextCaret = start + 1 + insertion.length
        // Make caret movement immediate (RAF is kept as a fallback)
        try {
          textarea.setSelectionRange(nextCaret, nextCaret)
        } catch {
          // ignore
        }
        textarea.setSelectionRange(nextCaret, nextCaret)
      })

      if (hasArgs) {
        // Keep the helper open and switch to "args mode"
        setCommandStart(start)
        setCommandQuery(c.name)
        setCommandInArgs(true)
        setCommandArgIndex(0)
        commandArgIndexRef.current = 0
        setSelectedCommandIndex(0)
      } else {
        closeCommandAutocomplete()
      }
    },
    [closeCommandAutocomplete, commandStart, setPrompt]
  )

  const tabFillDefaultArg = useCallback(
    (c: { name: string; args: Array<{ name: string; defaultValue?: string }> }) => {
      const textarea =
        textareaRef.current ??
        (document.activeElement instanceof HTMLTextAreaElement
          ? document.activeElement
          : null)
      if (!textarea) return

      const value = textarea.value
      const trigger = commandStart
      if (trigger === null) return

      // After the last arg is filled, Tab should close with ')'
      if (commandArgIndexRef.current >= c.args.length && c.args.length > 0) {
        const caret = textarea.selectionStart ?? value.length
        // If there's already a real closing paren, just jump past it.
        const open = value.indexOf('(', trigger + 1)
        if (open >= 0) {
          let inS = false
          let inD = false
          let esc = false
          let d = 1
          for (let k = open + 1; k < value.length; k++) {
            const ch = value[k]
            if (esc) {
              esc = false
              continue
            }
            if (ch === '\\') {
              esc = true
              continue
            }
            if (!inD && ch === "'") {
              inS = !inS
              continue
            }
            if (!inS && ch === '"') {
              inD = !inD
              continue
            }
            if (inS || inD) continue
            if (ch === '(') d++
            if (ch === ')') {
              d--
              if (d === 0) {
                const pos = k + 1
                try {
                  textarea.setSelectionRange(pos, pos)
                } catch {
                  // ignore
                }
                closeCommandAutocomplete()
                return
              }
            }
          }
        }

        // Insert ')' at the caret (end of last arg)
        const insertPos = caret
        const nextValue = value.slice(0, insertPos) + ')' + value.slice(insertPos)
        setPrompt(nextValue)
        const nextCaret = insertPos + 1
        try {
          textarea.setSelectionRange(nextCaret, nextCaret)
        } catch {
          // ignore
        }
        closeCommandAutocomplete()
        return
      }

      const caret = textarea.selectionStart ?? value.length
      const ctx = detectCommandContext(value, caret)
      if (!ctx || !ctx.inArgs) return

      const argIndex = Math.max(
        0,
        Math.min(commandArgIndexRef.current, c.args.length - 1)
      )

      // Find the matching "(" for this command (allow whitespace after name)
      const idxFromTrigger = value.indexOf('(', trigger + 1)
      if (idxFromTrigger < 0) return
      const openParenPos = idxFromTrigger

      // Quote-aware scan for commas and a real closing paren.
      let inSingle = false
      let inDouble = false
      let escaping = false
      let depth = 1
      const commaPositions: number[] = []
      let closeParenPos: number | null = null

      for (let k = openParenPos + 1; k < value.length; k++) {
        const ch = value[k]
        if (escaping) {
          escaping = false
          continue
        }
        if (ch === '\\') {
          escaping = true
          continue
        }

        if (!inDouble && ch === "'") {
          inSingle = !inSingle
          continue
        }
        if (!inSingle && ch === '"') {
          inDouble = !inDouble
          continue
        }
        if (inSingle || inDouble) continue

        if (ch === '(') {
          depth++
          continue
        }
        if (ch === ')') {
          depth--
          if (depth === 0) {
            closeParenPos = k
            break
          }
          continue
        }
        if (ch === ',' && depth === 1) commaPositions.push(k)
      }

      const leftBoundary =
        argIndex === 0 ? openParenPos + 1 : (commaPositions[argIndex - 1] ?? openParenPos) + 1
      const rightBoundary =
        commaPositions[argIndex] ??
        closeParenPos ??
        value.length

      // Replace the entire segment (spaces don't matter)
      let segStart = leftBoundary
      let segEnd = rightBoundary
      while (segStart < segEnd && /\s/.test(value[segStart])) segStart++
      while (segEnd > segStart && /\s/.test(value[segEnd - 1])) segEnd--

      const currentText = value.slice(segStart, segEnd)
      const currentTrim = currentText.trim()
      const def = (c.args[argIndex]?.defaultValue ?? '').trim()

      let replacement: string | null = null
      if (def) {
        if (currentTrim.length === 0) replacement = def
        else if (def.toLowerCase().startsWith(currentTrim.toLowerCase()))
          replacement = def
      }

      // Apply replacement (or just advance) and ensure ", " between args
      let nextValue = value
      let nextCaret = segEnd

      if (replacement !== null) {
        nextValue = value.slice(0, segStart) + replacement + value.slice(segEnd)
        nextCaret = segStart + replacement.length
      }

      const isLast = argIndex >= c.args.length - 1
      if (!isLast) {
        // Insert ", " if needed at the end of this arg segment (before any ')' or existing comma)
        const afterChar = nextValue[nextCaret] ?? ''
        // If we're currently before a ')' (or end), add comma-space. If before comma, normalize to comma-space.
        if (afterChar === ',') {
          // ensure exactly ", "
          if (nextValue[nextCaret + 1] !== ' ') {
            nextValue = nextValue.slice(0, nextCaret + 1) + ' ' + nextValue.slice(nextCaret + 1)
          }
          nextCaret = nextCaret + 2
        } else if (afterChar === ')' || afterChar === '' || afterChar === '\n') {
          nextValue = nextValue.slice(0, nextCaret) + ', ' + nextValue.slice(nextCaret)
          nextCaret = nextCaret + 2
        } else {
          // If user is mid-text, move caret to next comma boundary if present; otherwise insert ", "
          const nextComma = nextValue.indexOf(',', nextCaret)
          const nextParen = nextValue.indexOf(')', nextCaret)
          if (nextComma !== -1 && (nextParen === -1 || nextComma < nextParen)) {
            nextCaret = nextComma + (nextValue[nextComma + 1] === ' ' ? 2 : 1)
          } else {
            nextValue = nextValue.slice(0, nextCaret) + ', ' + nextValue.slice(nextCaret)
            nextCaret = nextCaret + 2
          }
        }
      }

      setPrompt(nextValue)

      // Make caret movement immediate (RAF is kept as a fallback)
      try {
        textarea.setSelectionRange(nextCaret, nextCaret)
      } catch {
        // ignore
      }
      requestAnimationFrame(() => {
        textarea.setSelectionRange(nextCaret, nextCaret)
      })

      if (isLast) {
        // Don't auto-close on the same Tab that fills the last arg.
        // The *next* Tab closes with ')'.
        setCommandArgIndex(c.args.length)
        commandArgIndexRef.current = c.args.length
        setSelectedCommandIndex(0)
        return
      }

      // Update helper highlight to the next arg after we advance
      const nextArgIndex = argIndex + 1
      setCommandArgIndex(nextArgIndex)
      commandArgIndexRef.current = nextArgIndex
      setSelectedCommandIndex(0)
    },
    [closeCommandAutocomplete, commandStart, detectCommandContext, setPrompt]
  )

  const findTokenRangeAt = useCallback((text: string, pos: number) => {
    const regex = /@(db:[A-Za-z0-9_-]+|ref:[A-Za-z0-9_-]+)/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      // Treat `end` as exclusive. If caret is exactly at `end`,
      // it's already "after" the token and should not be considered inside it.
      if (pos >= start && pos < end) {
        return { start, end, value: match[0] }
      }
    }
    return null
  }, [])

  const insertMentionToken = useCallback(
    (id: string, label: string, path?: string) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const value = textarea.value
      const selectionStart = textarea.selectionStart ?? value.length
      const selectionEnd = textarea.selectionEnd ?? value.length
      const start = mentionStart ?? selectionStart

      // Keep @ref tokens short so chips don't add huge whitespace.
      // Token length affects caret alignment, so we bias toward label length.
      const desiredKeyLen = Math.max(3, Math.min(18, Math.max(3, label.length - 2)))
      const key = Math.random().toString(36).slice(2, 2 + desiredKeyLen)
      const token = `@ref:${key}`

      setMentionMap((prev) => ({
        ...prev,
        [key]: { id, displayName: label, path },
      }))

      const nextValue = `${value.slice(0, start)}${token} ${value.slice(selectionEnd)}`
      setPrompt(nextValue)
      requestAnimationFrame(() => {
        const pos = start + token.length + 1
        textarea.setSelectionRange(pos, pos)
        textarea.focus()
      })
      setMentionStart(null)
      setMentionQuery('')
      setSelectedMentionIndex(0)
      toast.success(`Added ${label} to prompt`)
    },
    [mentionStart, setPrompt]
  )

  const handleTokenAwareBackspace = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current
      if (!textarea) return
      const value = textarea.value
      const caret = textarea.selectionStart ?? value.length
      if (textarea.selectionStart !== textarea.selectionEnd) return
      const checkPos = e.key === 'Backspace' ? caret - 1 : caret
      if (checkPos < 0) return
      const token = findTokenRangeAt(value, checkPos)
      if (token) {
        e.preventDefault()
        const nextValue = value.slice(0, token.start) + value.slice(token.end)
        setPrompt(nextValue)
        requestAnimationFrame(() => {
          const pos = token.start
          textarea.setSelectionRange(pos, pos)
          textarea.focus()
        })
      }
    },
    [findTokenRangeAt, setPrompt]
  )

  const snapCaretOutOfToken = useCallback(
    (bias: 'left' | 'right' | 'nearest') => {
      const textarea = textareaRef.current
      if (!textarea) return
      const value = textarea.value
      const caret = textarea.selectionStart ?? value.length
      if (textarea.selectionStart !== textarea.selectionEnd) return

      // Check both caret and caret-1 to handle boundary cases
      const token =
        findTokenRangeAt(value, caret) ?? findTokenRangeAt(value, caret - 1)
      if (!token) return

      const mid = token.start + Math.floor((token.end - token.start) / 2)
      const next =
        bias === 'left'
          ? token.start
          : bias === 'right'
            ? token.end
            : caret <= mid
              ? token.start
              : token.end

      textarea.setSelectionRange(next, next)
    },
    [findTokenRangeAt]
  )

  const ingestingDocs = attachments.some(
    (a) => a.type === 'document' && a.processing
  )
  const ingestingAny = attachments.some((a) => a.processing)

  const lastTransferredThreadId = useRef<string | null>(null)

  useEffect(() => {
    if (currentThreadId && lastTransferredThreadId.current !== currentThreadId) {
      transferAttachments(NEW_THREAD_ATTACHMENT_KEY, currentThreadId)
      lastTransferredThreadId.current = currentThreadId
    }
  }, [currentThreadId, transferAttachments])

  const updateAttachmentProcessing = useCallback(
    (
      fileName: string,
      status: 'processing' | 'done' | 'error' | 'clear_all',
      updatedAttachment?: Partial<Attachment>
    ) => {
      const targetKey = attachmentsKeyRef.current
      const storeState = useChatAttachments.getState()

      // Find all keys that have this attachment (including NEW_THREAD_ATTACHMENT_KEY)
      const allMatchingKeys = Object.entries(storeState.attachmentsByThread)
        .filter(([, list]) => list?.some((att) => att.name === fileName))
        .map(([key]) => key)

      // Always include targetKey and all matching keys
      const keysToUpdate = new Set([targetKey, ...allMatchingKeys])

      const applyUpdate = (key: string) => {
        if (status === 'clear_all') {
          clearAttachmentsForThread(key)
          return
        }

        setAttachmentsForThread(key, (prev) =>
          prev.map((att) =>
            att.name === fileName
              ? {
                  ...att,
                  ...updatedAttachment,
                  processing: status === 'processing',
                  processed: status === 'done'
                    ? true
                    : updatedAttachment?.processed ?? att.processed,
                }
              : att
          )
        )
      }

      keysToUpdate.forEach((key) => applyUpdate(key as string))
    },
    [clearAttachmentsForThread, setAttachmentsForThread]
  )

  // Check for mmproj existence or vision capability when model changes
  useEffect(() => {
    const checkMmprojSupport = async () => {
      if (selectedModel && selectedModel?.id) {
        try {
          // Only check mmproj for llamacpp provider
          if (selectedModel?.capabilities?.includes('vision')) {
            setHasMmproj(true)
          } else {
            setHasMmproj(false)
          }
        } catch (error) {
          console.error('Error checking mmproj:', error)
          setHasMmproj(false)
        }
      }
    }

    checkMmprojSupport()
  }, [selectedModel, selectedModel?.capabilities, selectedProvider, serviceHub])

  // Check if there are active MCP servers
  const hasActiveMCPServers = tools.filter((tool) => tool.server !== 'Jan Browser MCP').length > 0

  // Get MCP extension and its custom component
  const extensionManager = ExtensionManager.getInstance()
  const mcpExtension = extensionManager.get<MCPExtension>(ExtensionTypeEnum.MCP)
  const MCPToolComponent = mcpExtension?.getToolComponent?.()

  const handleSendMessage = async (prompt: string) => {
    if (!selectedModel) {
      setMessage('Please select a model to start chatting.')
      return
    }
    const { expanded: promptWithCommands } = expandCommandsInPrompt(prompt, commands)

    const parsedUnified = parseUnifiedCommands(promptWithCommands)
    const resolvedUnified = await resolveUnifiedCommands(
      parsedUnified,
      flattenedDatabaseEntries
    )
    if (resolvedUnified.errors.length) {
      toast.error(resolvedUnified.errors[0])
      return
    }
    if (resolvedUnified.warnings.length) {
      resolvedUnified.warnings.forEach((w) => toast.warning(w))
    }
    const promptAfterScopes =
      parsedUnified.cleanedPrompt.length > 0
        ? parsedUnified.cleanedPrompt
        : promptWithCommands

    const mentionedRefKeys = Array.from(
      new Set(
        Array.from(promptAfterScopes.matchAll(/@ref:([A-Za-z0-9_-]+)/g))
          .map((m) => m[1])
          .filter(Boolean)
      )
    )
    const dbRefs = mentionedRefKeys
      .map((key) => {
        const meta = mentionMap[key]
        if (!meta?.id) return null
        return {
          key,
          dbId: meta.id,
          name: meta.displayName,
          path: meta.path,
        }
      })
      .filter((v): v is NonNullable<typeof v> => Boolean(v))

    const contextBlock = {
      scopes: parsedUnified.scopes.map((s) => s.raw),
      filters: parsedUnified.filters.map((f) => f.raw),
      limitDocs: resolvedUnified.limitDocs,
      resolvedDocs: resolvedUnified.docIds.map((id) => {
        const meta = dbIndex.get(id)
        return {
          id,
          name: meta?.displayName ?? meta?.name,
          path: meta?.path,
        }
      }),
      warnings: resolvedUnified.warnings,
      errors: resolvedUnified.errors,
    }

    const promptWithDbRefs = injectDbRefsIntoPrompt(
      promptAfterScopes,
      dbRefs,
      contextBlock
    )

    const expandedPrompt = promptWithDbRefs.replace(/@ref:([A-Za-z0-9_-]+)/g, (full, key) => {
      const meta = mentionMap[key]
      return meta ? `@db:${meta.id}` : full
    })

    const { attachments: dbAttachments } = await (async () => {
      const regex = /@db:([A-Za-z0-9_-]+)/g
      const ids = new Set<string>(resolvedUnified.docIds)
      let match: RegExpExecArray | null
      while ((match = regex.exec(expandedPrompt)) !== null) {
        if (match[1]) ids.add(match[1])
      }
      if (ids.size === 0) return { attachments: [] as Attachment[] }
      try {
        const fromDb = await serviceHub.database().toAttachments(Array.from(ids))
        return { attachments: fromDb }
      } catch (e) {
        console.error('Failed to resolve database mentions', e)
        toast.error('Failed to load database references')
        return { attachments: [] as Attachment[] }
      }
    })()

    const combinedAttachments = (() => {
      const existingKeys = new Set(
        attachments.map((a) => (a.path ? `${a.type}-${a.path}` : `${a.type}-${a.name}`))
      )
      const merged = [...attachments]
      dbAttachments.forEach((att) => {
        const key = att.path ? `${att.type}-${att.path}` : `${att.type}-${att.name}`
        if (!existingKeys.has(key)) {
          merged.push(att)
          existingKeys.add(key)
        }
      })
      return merged
    })()

    if (!promptWithDbRefs.trim() && combinedAttachments.length === 0) {
      return
    }
    // Persist refs (human-readable chips) + hidden DB_REFS block; avoid leaking @db ids to the model.
    const outboundMessage = promptWithDbRefs.trim()

    if (ingestingAny) {
      toast.info('Please wait for attachments to finish processing')
      return
    }

    setMessage('')

    sendMessage(
      outboundMessage,
      true,
      combinedAttachments.length > 0 ? combinedAttachments : undefined,
      projectId,
      updateAttachmentProcessing
    )
  }

  useEffect(() => {
    const handleFocusIn = () => {
      if (document.activeElement === textareaRef.current) {
        setIsFocused(true)
      }
    }

    const handleFocusOut = () => {
      if (document.activeElement !== textareaRef.current) {
        setIsFocused(false)
      }
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  // Focus when component mounts
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  useEffect(() => {
    if (tooltipToolsAvailable && dropdownToolsAvailable) {
      setTooltipToolsAvailable(false)
    }
  }, [dropdownToolsAvailable, tooltipToolsAvailable])

  // Focus when thread changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [currentThreadId])

  // Focus when streaming content finishes
  useEffect(() => {
    if (!streamingContent && textareaRef.current) {
      // Small delay to ensure UI has updated
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 10)
    }
  }, [streamingContent])

  const stopStreaming = useCallback(
    (threadId: string) => {
      abortControllers[threadId]?.abort()
      cancelToolCall?.()
    },
    [abortControllers, cancelToolCall]
  )

  const fileInputRef = useRef<HTMLInputElement>(null)

  const processNewDocumentAttachments = useCallback(
    async (docs: Attachment[]) => {
      if (!docs.length || !currentThreadId) return

      const modelReady = await (async () => {
        if (!selectedModel?.id) return false
        if (activeModels.includes(selectedModel.id)) return true
        const provider = getProviderByName(selectedProvider)
        if (!provider) return false
        try {
          updateLoadingModel(true)
          await serviceHub.models().startModel(provider, selectedModel.id)
          const active = await serviceHub.models().getActiveModels()
          setActiveModels(active || [])
          return active?.includes(selectedModel.id) ?? false
        } catch (err) {
          console.warn('Failed to start model before attachment validation', err)
          return false
        } finally {
          updateLoadingModel(false)
        }
      })()

      const modelContextLength = (() => {
        const ctx = selectedModel?.settings?.ctx_len?.controller_props?.value
        if (typeof ctx === 'number') return ctx
        if (typeof ctx === 'string') {
          const parsed = parseInt(ctx, 10)
          return Number.isFinite(parsed) ? parsed : undefined
        }
        return undefined
      })()

      const rawContextThreshold =
        typeof modelContextLength === 'number' && modelContextLength > 0
          ? Math.floor(
              modelContextLength *
                (typeof autoInlineContextRatio === 'number'
                  ? autoInlineContextRatio
                  : 0.75)
            )
          : undefined

      const contextThreshold =
        typeof rawContextThreshold === 'number' &&
        Number.isFinite(rawContextThreshold) &&
        rawContextThreshold > 0
          ? rawContextThreshold
          : undefined

      const hasContextEstimate =
        modelReady &&
        typeof contextThreshold === 'number' &&
        Number.isFinite(contextThreshold) &&
        contextThreshold > 0
      const docsNeedingPrompt = docs.filter((doc) => {
        if (doc.processed || doc.injectionMode) return false
        const preference = doc.parseMode ?? parsePreference
        return preference === 'prompt' || (preference === 'auto' && !hasContextEstimate)
      })

      // Map to store individual choices for each document
      const docChoices = new Map<string, 'inline' | 'embeddings'>()

      if (docsNeedingPrompt.length > 0) {
        // Ask for each file individually
        for (let i = 0; i < docsNeedingPrompt.length; i++) {
          const doc = docsNeedingPrompt[i]
          const choice = await useAttachmentIngestionPrompt
            .getState()
            .showPrompt(doc, ATTACHMENT_AUTO_INLINE_FALLBACK_BYTES, i, docsNeedingPrompt.length)

          if (!choice) {
            // User cancelled - remove all pending docs
            setAttachmentsForThread(attachmentsKey, (prev) =>
              prev.filter(
                (att) =>
                  !docsNeedingPrompt.some(
                    (doc) => doc.path && att.path && doc.path === att.path
                  )
              )
            )
            return
          }

          // Store the choice for this specific document
          if (doc.path) {
            docChoices.set(doc.path, choice)
          }
        }
      }

      const estimateTokens = async (text: string): Promise<number | undefined> => {
        try {
          if (!selectedModel?.id || !modelReady) return undefined
          const tokenCount = await serviceHub
            .models()
            .getTokensCount(selectedModel.id, [
              {
                id: 'inline-attachment',
                object: 'thread.message',
                thread_id: currentThreadId,
                role: 'user',
                content: [
                  {
                    type: ContentType.Text,
                    text: { value: text, annotations: [] },
                  },
                ],
                status: MessageStatus.Ready,
                created_at: Date.now(),
                completed_at: Date.now(),
              } as ThreadMessage,
            ])
          if (
            typeof tokenCount !== 'number' ||
            !Number.isFinite(tokenCount) ||
            tokenCount <= 0
          ) {
            return undefined
          }
          return tokenCount
        } catch (e) {
          console.debug('Failed to estimate tokens for attachment content', e)
          return undefined
        }
      }

      try {
        const { processedAttachments, hasEmbeddedDocuments } =
          await processAttachmentsForSend({
            attachments: docs,
            threadId: currentThreadId,
            serviceHub,
            selectedProvider,
            contextThreshold,
            estimateTokens,
            parsePreference,
            perFileChoices: docChoices.size > 0 ? docChoices : undefined,
            updateAttachmentProcessing,
          })

        if (processedAttachments.length > 0) {
          setAttachmentsForThread(attachmentsKey, (prev) =>
            prev.map((att) => {
              const match = processedAttachments.find(
                (p) => p.path && att.path && p.path === att.path
              )
              return match ? { ...att, ...match } : att
            })
          )
        }

        if (hasEmbeddedDocuments) {
          useThreads.getState().updateThread(currentThreadId, {
            metadata: { hasDocuments: true },
          })
        }
      } catch (e) {
        console.error('Failed to process attachments:', e)
      }
    },
    [
      ATTACHMENT_AUTO_INLINE_FALLBACK_BYTES,
      attachmentsKey,
      autoInlineContextRatio,
      activeModels,
      currentThreadId,
      getProviderByName,
      parsePreference,
      selectedModel?.id,
      selectedModel?.settings?.ctx_len?.controller_props?.value,
      selectedProvider,
      serviceHub,
      setActiveModels,
      setAttachmentsForThread,
      updateAttachmentProcessing,
      updateLoadingModel,
    ]
  )

  const handleAttachDocsIngest = async () => {
    try {
      if (!attachmentsEnabled) {
        toast.info('Attachments are disabled in Settings')
        return
      }
      if (!PlatformFeatures[PlatformFeature.FILE_ATTACHMENTS]) {
        toast.info('File attachments are unavailable on this platform')
        return
      }
      const selection = await serviceHub.dialog().open({
        multiple: true,
        filters: [
          {
            name: 'Documents',
            extensions: [
              'pdf',
              'docx',
              'txt',
              'md',
              'csv',
              'xlsx',
              'xls',
              'ods',
              'pptx',
              'html',
              'htm',
            ],
          },
        ],
      })
      if (!selection) return
      const paths = Array.isArray(selection) ? selection : [selection]
      if (!paths.length) return

      // Prepare attachments with file sizes
      const preparedAttachments: Attachment[] = []
      for (const p of paths) {
        const name = p.split(/[\\/]/).pop() || p
        const fileType = name.split('.').pop()?.toLowerCase()
        let size: number | undefined = undefined
        try {
          const stat = await fs.fileStat(p)
          size = stat?.size ? Number(stat.size) : undefined
        } catch (e) {
          console.warn('Failed to read file size for', p, e)
        }
        preparedAttachments.push(
          createDocumentAttachment({
            name,
            path: p,
            fileType,
            size,
            parseMode: parsePreference,
          })
        )
      }

      const maxFileSizeBytes =
        typeof maxFileSizeMB === 'number' && maxFileSizeMB > 0
          ? maxFileSizeMB * 1024 * 1024
          : undefined

      if (maxFileSizeBytes !== undefined) {
        const hasOversized = preparedAttachments.some(
          (att) => typeof att.size === 'number' && att.size > maxFileSizeBytes
        )
        if (hasOversized) {
          toast.error('File too large', {
            description: `One or more files exceed the ${maxFileSizeMB}MB limit`,
          })
          return
        }
      }

      let duplicates: string[] = []
      let newDocAttachments: Attachment[] = []

      setAttachmentsForThread(attachmentsKey, (currentAttachments) => {
        const existingPaths = new Set(
          currentAttachments
            .filter((a) => a.type === 'document' && a.path)
            .map((a) => a.path)
        )

        duplicates = []
        newDocAttachments = []

        for (const att of preparedAttachments) {
          if (existingPaths.has(att.path)) {
            duplicates.push(att.name)
            continue
          }
          newDocAttachments.push(att)
        }

        return newDocAttachments.length > 0
          ? [...currentAttachments, ...newDocAttachments]
          : currentAttachments
      })

      if (duplicates.length > 0) {
        toast.warning('Files already attached', {
          description: `${duplicates.join(', ')} ${duplicates.length === 1 ? 'is' : 'are'} already in the list`,
        })
      }

      if (newDocAttachments.length > 0) {
        await processNewDocumentAttachments(newDocAttachments)
      }
    } catch (e) {
      console.error('Failed to attach documents:', e)
      const desc = e instanceof Error ? e.message : String(e)
      toast.error('Failed to attach documents', { description: desc })
    }
  }

  const handleRemoveAttachment = async (indexToRemove: number) => {
    const attachmentToRemove = attachments[indexToRemove]

    // If attachment was ingested (has an ID), delete it from the backend
    if (attachmentToRemove?.id && currentThreadId) {
      try {
        if (attachmentToRemove.type === 'document') {
          const vectorDBExtension = ExtensionManager.getInstance().get(
            ExtensionTypeEnum.VectorDB
          ) as VectorDBExtension | undefined

          if (vectorDBExtension?.deleteFile) {
            await vectorDBExtension.deleteFile(currentThreadId, attachmentToRemove.id)
          }
        }
      } catch (error) {
        console.error('Failed to delete attachment from backend:', error)
        toast.error('Failed to remove attachment', {
          description: error instanceof Error ? error.message : String(error)
        })
        return
      }
    }

    setAttachmentsForThread(attachmentsKey, (prev) =>
      prev.filter((_, index) => index !== indexToRemove)
    )
  }

  const getFileTypeFromExtension = (fileName: string): string => {
    const extension = fileName.toLowerCase().split('.').pop()
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg'
      case 'png':
        return 'image/png'
      default:
        return ''
    }
  }

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let val = bytes
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024
      i++
    }
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
  }

  const processImageFiles = async (files: File[]) => {
    const maxSize = 10 * 1024 * 1024 // 10MB in bytes
    const oversizedFiles: string[] = []
    const invalidTypeFiles: string[] = []

    const allowedTypes = ['image/jpg', 'image/jpeg', 'image/png']
    const validFiles: File[] = []

    // First pass: validate file size and type (no duplicate check yet)
    Array.from(files).forEach((file) => {
      // Check file size
      if (file.size > maxSize) {
        oversizedFiles.push(file.name)
        return
      }

      // Get file type - use extension as fallback if MIME type is incorrect
      const detectedType = file.type || getFileTypeFromExtension(file.name)
      const actualType = getFileTypeFromExtension(file.name) || detectedType

      // Check file type - images only
      if (!allowedTypes.includes(actualType)) {
        invalidTypeFiles.push(file.name)
        return
      }

      validFiles.push(file)
    })

    // Process valid files into attachments
    const preparedFiles: Attachment[] = []
    for (const file of validFiles) {
      const detectedType = file.type || getFileTypeFromExtension(file.name)
      const actualType = getFileTypeFromExtension(file.name) || detectedType

      const reader = new FileReader()
      await new Promise<void>((resolve) => {
        reader.onload = () => {
          const result = reader.result
          if (typeof result === 'string') {
            const base64String = result.split(',')[1]
            const att = createImageAttachment({
              name: file.name,
              size: file.size,
              mimeType: actualType,
              base64: base64String,
              dataUrl: result,
            })
            preparedFiles.push(att)
          }
          resolve()
        }
        reader.readAsDataURL(file)
      })
    }

    let duplicates: string[] = []
    let newFiles: Attachment[] = []

    setAttachmentsForThread(attachmentsKey, (currentAttachments) => {
      const existingImageNames = new Set(
        currentAttachments.filter((a) => a.type === 'image').map((a) => a.name)
      )

      duplicates = []
      newFiles = []

      for (const att of preparedFiles) {
        if (existingImageNames.has(att.name)) {
          duplicates.push(att.name)
          continue
        }
        newFiles.push(att)
      }

      if (newFiles.length > 0) {
        return [...currentAttachments, ...newFiles]
      }
      return currentAttachments
    })

    if (currentThreadId && newFiles.length > 0) {
      void (async () => {
        for (const img of newFiles) {
          try {
            // Mark as processing
            setAttachmentsForThread(attachmentsKey, (prev) =>
              prev.map((a) =>
                a.name === img.name && a.type === 'image'
                  ? { ...a, processing: true }
                  : a
              )
            )

            const result = await serviceHub
              .uploads()
              .ingestImage(currentThreadId, img)

            if (result?.id) {
              // Mark as processed with ID
              setAttachmentsForThread(attachmentsKey, (prev) =>
                prev.map((a) =>
                  a.name === img.name && a.type === 'image'
                    ? {
                      ...a,
                      processing: false,
                      processed: true,
                      id: result.id,
                    }
                    : a
                )
              )
            } else {
              throw new Error('No ID returned from image ingestion')
            }
          } catch (error) {
            console.error('Failed to ingest image:', error)
            // Remove failed image
            setAttachmentsForThread(attachmentsKey, (prev) =>
              prev.filter((a) => !(a.name === img.name && a.type === 'image'))
            )
            toast.error(`Failed to ingest ${img.name}`, {
              description:
                error instanceof Error ? error.message : String(error),
            })
          }
        }
      })()
    }

    // Display validation errors
    if (duplicates.length > 0) {
      toast.warning('Some images already attached', {
        description: `${duplicates.join(', ')} ${duplicates.length === 1 ? 'is' : 'are'} already in the list`,
      })
    }

    const errors: string[] = []
    if (oversizedFiles.length > 0) {
      errors.push(
        `File${oversizedFiles.length > 1 ? 's' : ''} too large (max 10MB): ${oversizedFiles.join(', ')}`
      )
    }

    if (invalidTypeFiles.length > 0) {
      errors.push(
        `Invalid file type${invalidTypeFiles.length > 1 ? 's' : ''} (only JPEG, JPG, PNG allowed): ${invalidTypeFiles.join(', ')}`
      )
    }

    if (errors.length > 0) {
      setMessage(errors.join(' | '))
      // Reset file input to allow re-uploading
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } else {
      setMessage('')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files

    if (files && files.length > 0) {
      void processImageFiles(Array.from(files))

      // Reset the file input value to allow re-uploading the same file
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }

    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  const handleImagePickerClick = async () => {
    if (isPlatformTauri()) {
      try {
        const selected = await serviceHub.dialog().open({
          multiple: true,
          filters: [
            {
              name: 'Images',
              extensions: ['jpg', 'jpeg', 'png'],
            },
          ],
        })

        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected]
          const files: File[] = []

          for (const path of paths) {
            try {
              // Use Tauri's convertFileSrc to create a valid URL for the file
              const { convertFileSrc } = await import('@tauri-apps/api/core')
              const fileUrl = convertFileSrc(path)

              // Fetch the file as blob
              const response = await fetch(fileUrl)
              if (!response.ok) {
                throw new Error(`Failed to fetch file: ${response.statusText}`)
              }

              const blob = await response.blob()
              const fileName =
                path.split(/[\\/]/).filter(Boolean).pop() || 'image'
              const ext = fileName.toLowerCase().split('.').pop()
              const mimeType =
                ext === 'png'
                  ? 'image/png'
                  : ext === 'jpg' || ext === 'jpeg'
                    ? 'image/jpeg'
                    : 'image/jpeg'

              const file = new File([blob], fileName, { type: mimeType })
              files.push(file)
            } catch (error) {
              console.error('Failed to read file:', error)
              toast.error('Failed to read file', {
                description:
                  error instanceof Error ? error.message : String(error),
              })
            }
          }

          if (files.length > 0) {
            await processImageFiles(files)
          }
        }
      } catch (error) {
        console.error('Failed to open file dialog:', error)
      }

      if (textareaRef.current) {
        textareaRef.current.focus()
      }
    } else {
      // Fallback to input click for web
      fileInputRef.current?.click()
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only allow drag if model supports mmproj
    if (hasMmproj) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set dragOver to false if we're leaving the drop zone entirely
    // In Tauri, relatedTarget can be null, so we need to handle that case
    const relatedTarget = e.relatedTarget as Node | null
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setIsDragOver(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Ensure drag state is maintained during drag over
    if (hasMmproj) {
      setIsDragOver(true)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    // Only allow drop if model supports mmproj
    if (!hasMmproj) {
      return
    }

    // Check if dataTransfer exists (it might not in some Tauri scenarios)
    if (!e.dataTransfer) {
      console.warn('No dataTransfer available in drop event')
      return
    }

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      // Create a synthetic event to reuse existing file handling logic
      const syntheticEvent = {
        target: {
          files: files,
        },
      } as React.ChangeEvent<HTMLInputElement>

      handleFileChange(syntheticEvent)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    // Only process images if model supports mmproj
    if (hasMmproj) {
      const clipboardItems = e.clipboardData?.items
      let hasProcessedImage = false

      // Try clipboardData.items first (traditional method)
      if (clipboardItems && clipboardItems.length > 0) {
        const imageItems = Array.from(clipboardItems).filter((item) =>
          item.type.startsWith('image/')
        )

        if (imageItems.length > 0) {
          e.preventDefault()

          const files: File[] = []
          let processedCount = 0

          imageItems.forEach((item) => {
            const file = item.getAsFile()
            if (file) {
              files.push(file)
            }
            processedCount++

            // When all items are processed, handle the valid files
            if (processedCount === imageItems.length) {
              if (files.length > 0) {
                const syntheticEvent = {
                  target: {
                    files: files,
                  },
                } as unknown as React.ChangeEvent<HTMLInputElement>

                handleFileChange(syntheticEvent)
                hasProcessedImage = true
              }
            }
          })

          // If we found image items but couldn't get files, fall through to modern API
          if (processedCount === imageItems.length && !hasProcessedImage) {
            // Continue to modern clipboard API fallback below
          } else {
            return // Successfully processed with traditional method
          }
        }
      }

      // Modern Clipboard API fallback (for Linux, images copied from web, etc.)
      if (
        navigator.clipboard &&
        'read' in navigator.clipboard &&
        !hasProcessedImage
      ) {
        try {
          const clipboardContents = await navigator.clipboard.read()
          const files: File[] = []

          for (const item of clipboardContents) {
            const imageTypes = item.types.filter((type) =>
              type.startsWith('image/')
            )

            for (const type of imageTypes) {
              try {
                const blob = await item.getType(type)
                // Convert blob to File with better naming
                const extension = type.split('/')[1] || 'png'
                const file = new File(
                  [blob],
                  `pasted-image-${Date.now()}.${extension}`,
                  { type }
                )
                files.push(file)
              } catch (error) {
                console.error('Error reading clipboard item:', error)
              }
            }
          }

          if (files.length > 0) {
            e.preventDefault()
            const syntheticEvent = {
              target: {
                files: files,
              },
            } as unknown as React.ChangeEvent<HTMLInputElement>

            handleFileChange(syntheticEvent)
            return
          }
        } catch (error) {
          console.error('Clipboard API access failed:', error)
        }
      }

      // If we reach here, no image was found - allow normal text pasting to continue
      console.log(
        'No image data found in clipboard, allowing normal text paste'
      )
    }
    // If hasMmproj is false or no images found, allow normal text pasting to continue
  }

  return (
    <div className="relative">
      <div className="relative">
        <div
          className={cn(
            'relative overflow-hidden p-[2px] rounded-lg',
            Boolean(streamingContent) && 'opacity-70'
          )}
        >
          {streamingContent && (
            <div className="absolute inset-0">
              <MovingBorder rx="10%" ry="10%">
                <div
                  className={cn(
                    'h-100 w-100 bg-[radial-gradient(var(--app-primary),transparent_60%)]'
                  )}
                />
              </MovingBorder>
            </div>
          )}

          {mentionVisible && (
            <div className="mt-2 px-4">
              <div className="rounded-lg border border-main-view-fg/10 bg-main-view shadow-lg overflow-hidden">
                {mentionSuggestions.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-main-view-fg/60">
                    No database items found
                  </div>
                ) : (
                  mentionSuggestions.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      className={cn(
                        'w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-main-view-fg/5',
                        idx === selectedMentionIndex && 'bg-main-view-fg/5'
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        insertMentionToken(s.id, s.displayName || s.name)
                      }}
                    >
                      <div className="flex flex-col items-start">
                        <span className="text-sm text-main-view-fg">
                          {s.displayName || s.name}
                        </span>
                        <span className="text-xs text-main-view-fg/60 truncate">/ {s.path}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {!mentionVisible && commandVisible && (
            <div className="mt-2 px-4" data-testid="command-autocomplete">
              <div className="rounded-lg border border-main-view-fg/10 bg-main-view shadow-lg overflow-hidden">
                {commands.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-main-view-fg/60">
                    No commands defined yet
                  </div>
                ) : commandInArgs ? (
                  selectedCommand ? (
                    <div className="p-3">
                      {selectedCommand.args.length > 0 ? (
                        <div
                          className="text-[11px] font-mono text-main-view-fg/60"
                          data-testid="command-args-summary"
                        >
                          {selectedCommand.args.map((a, idx) => {
                            const isActive = idx === commandArgIndex
                            const suffix =
                              a.defaultValue !== undefined && a.defaultValue !== ''
                                ? a.defaultValue
                                : ''
                            return (
                              <span key={a.name}>
                                <span
                                  className={cn(
                                    isActive && 'text-main-view-fg underline'
                                  )}
                                >
                                  {a.name}:{suffix}
                                </span>
                                {idx < selectedCommand.args.length - 1 ? ', ' : ''}
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-main-view-fg/60">
                          No arguments
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-xs text-main-view-fg/60">
                      Unknown command: <span className="font-mono">/{commandQuery}</span>
                    </div>
                  )
                ) : (
                  <div className="max-h-56 overflow-auto">
                    {commandSuggestions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-main-view-fg/60">
                        No matching commands
                      </div>
                    ) : (
                      commandSuggestions.map((c, idx) => {
                        const signature = formatCommandSignature(c)
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={cn(
                              'w-full text-left px-3 py-2 hover:bg-main-view-fg/5',
                              idx === selectedCommandIndex && 'bg-main-view-fg/5'
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              insertCommandName(c.name)
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-main-view-fg font-mono truncate">
                                  {signature}
                                </div>
                                <div className="text-xs text-main-view-fg/60 line-clamp-1">
                                  {c.template}
                                </div>
                              </div>
                              <div className="shrink-0 text-[11px] text-main-view-fg/50">
                                Tab
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            className={cn(
              'relative z-20 px-0 pb-10 border border-main-view-fg/5 rounded-lg text-main-view-fg bg-main-view',
              isFocused && 'ring-1 ring-main-view-fg/10',
              isDragOver && 'ring-2 ring-accent border-accent'
            )}
            data-drop-zone={hasMmproj ? 'true' : undefined}
            onDragEnter={hasMmproj ? handleDragEnter : undefined}
            onDragLeave={hasMmproj ? handleDragLeave : undefined}
            onDragOver={hasMmproj ? handleDragOver : undefined}
            onDrop={hasMmproj ? handleDrop : undefined}
          >
            {attachments.length > 0 && (
              <div className="flex flex-col gap-2 p-2 pb-0">
                <div className="flex gap-3 items-center">
                  {attachments
                    .map((att, idx) => ({ att, idx }))
                    .map(({ att, idx }) => {
                      const isImage = att.type === 'image'
                      const ext = att.fileType || att.mimeType?.split('/')[1]
                      return (
                        <div
                          key={`${att.type}-${idx}-${att.name}`}
                          className="relative"
                        >
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className={cn(
                                    'relative border border-main-view-fg/5 rounded-lg size-14 overflow-hidden bg-main-view/40',
                                    'flex items-center justify-center'
                                  )}
                                >
                                  {/* Inner content by state */}
                                  {isImage && att.dataUrl ? (
                                    <img
                                      className="object-cover w-full h-full"
                                      src={att.dataUrl}
                                      alt={`${att.name}`}
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center justify-center text-main-view-fg/70">
                                      <IconPaperclip size={18} />
                                      {ext && (
                                        <span className="text-[10px] leading-none mt-0.5 uppercase opacity-70">
                                          .{ext}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Overlay spinner when processing */}
                                  {att.processing && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                      <IconLoader2
                                        size={18}
                                        className="text-main-view-fg/80 animate-spin"
                                      />
                                    </div>
                                  )}

                                  {/* Overlay success check when processed */}
                                  {att.processed && !att.processing && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/5">
                                      <div className="bg-green-600/90 rounded-full p-1">
                                        <IconCheck
                                          size={14}
                                          className="text-white"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs">
                                  <div
                                    className="font-medium truncate max-w-52"
                                    title={att.name}
                                  >
                                    {att.name}
                                  </div>
                                  <div className="opacity-70">
                                    {isImage
                                      ? att.mimeType || 'image'
                                      : ext
                                        ? `.${ext}`
                                        : 'document'}
                                    {att.size
                                      ? ` · ${formatBytes(att.size)}`
                                      : ''}
                                  </div>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          {/* Remove button disabled while processing - outside overflow-hidden container */}
                          {!att.processing && (
                            <div
                              className="absolute -top-1 -right-2.5 bg-destructive size-5 flex rounded-full items-center justify-center cursor-pointer"
                              onClick={() => handleRemoveAttachment(idx)}
                            >
                              <IconX className="text-destructive-fg" size={16} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>

              </div>
            )}
            <div className="relative w-full">
              <div
                className={cn(
                  'pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-4 pt-4 pb-2 text-sm leading-[1.4] text-main-view-fg',
                  prompt.length === 0 && 'text-main-view-fg/60'
                )}
              >
                {prompt.length === 0 ? (
                  t('common:placeholder.chatInput')
                ) : (
                  (() => {
                    const nodes: (string | JSX.Element)[] = []
                    const regex = /@(db:[A-Za-z0-9_-]+|ref:[A-Za-z0-9_-]+)/g
                    let lastIndex = 0
                    let match: RegExpExecArray | null
                    while ((match = regex.exec(prompt)) !== null) {
                      if (match.index > lastIndex) {
                        nodes.push(prompt.slice(lastIndex, match.index))
                      }
                      const full = match[1]
                      const isRef = full.startsWith('ref:')
                      const refKey = isRef ? full.replace(/^ref:/, '') : null
                      const id = isRef ? mentionMap[refKey ?? '']?.id : full.replace(/^db:/, '')

                      const metaRef = refKey ? mentionMap[refKey] : undefined
                      const metaDb = id ? dbIndex.get(id) : undefined
                      const label = metaRef?.displayName || metaDb?.displayName || metaDb?.name || match[0]
                      nodes.push(
                        <span
                          key={`${match[0]}-${match.index}`}
                          className="relative inline-flex align-middle"
                        >
                          {/* Invisible width anchor based on actual token text so caret aligns to real string */}
                          <span className="invisible inline-flex items-center px-2 py-0.5 rounded-full border text-xs whitespace-pre">
                            {match[0]}
                          </span>
                          {/* Visible chip constrained to the anchor width with ellipsis */}
                          <span className="absolute inset-0 inline-flex items-center px-2 py-0.5 rounded-full bg-main-view-fg/10 border border-main-view-fg/20 text-xs text-main-view-fg leading-none overflow-hidden whitespace-nowrap">
                            <span className="truncate">
                              {label}
                            </span>
                          </span>
                        </span>
                      )
                      lastIndex = match.index + match[0].length
                    }
                    if (lastIndex < prompt.length) {
                      nodes.push(prompt.slice(lastIndex))
                    }
                    return nodes
                  })()
                )}
              </div>
              <TextareaAutosize
                ref={textareaRef}
                minRows={2}
                rows={1}
                maxRows={10}
                value={prompt}
                data-testid={'chat-input'}
                onChange={(e) => {
                  const val = e.target.value
                  setPrompt(val)
                  const caret = e.target.selectionStart ?? val.length
                  const trigger = val.lastIndexOf('@', caret - 1)
                  if (trigger >= 0) {
                    const nextSpace = val.indexOf(' ', trigger + 1)
                    if (nextSpace === -1 || nextSpace >= caret) {
                      setMentionStart(trigger)
                      setMentionQuery(val.slice(trigger + 1, caret))
                      setSelectedMentionIndex(0)
                    } else {
                      setMentionStart(null)
                      setMentionQuery('')
                    }
                  } else {
                    setMentionStart(null)
                    setMentionQuery('')
                  }

                  // Slash-command autocomplete
                  if (trigger < 0) {
                    const ctx = detectCommandContext(val, caret)
                    if (ctx) {
                      setCommandStart(ctx.trigger)
                      setCommandQuery(ctx.namePart)
                      setCommandInArgs(ctx.inArgs)
                      setCommandArgIndex(ctx.argIndex)
                      setSelectedCommandIndex(0)
                    } else {
                      closeCommandAutocomplete()
                    }
                  } else {
                    // Don't show command autocomplete while user is typing a mention
                    closeCommandAutocomplete()
                  }

                  // Count the number of newlines to estimate rows
                  const newRows = (val.match(/\n/g) || []).length + 1
                  setRows(Math.min(newRows, maxRows))
                }}
                onClick={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  const caret = target.selectionStart ?? 0
                  const val = target.value
                  const trigger = val.lastIndexOf('@', caret - 1)
                  if (trigger >= 0) {
                    const nextSpace = val.indexOf(' ', trigger + 1)
                    if (nextSpace === -1 || nextSpace >= caret) {
                      setMentionStart(trigger)
                      setMentionQuery(val.slice(trigger + 1, caret))
                    } else {
                      setMentionStart(null)
                      setMentionQuery('')
                    }
                  } else {
                    setMentionStart(null)
                    setMentionQuery('')
                  }

                  // Slash-command autocomplete on click as well (caret moved)
                  if (trigger < 0) {
                    const ctx = detectCommandContext(val, caret)
                    if (ctx) {
                      setCommandStart(ctx.trigger)
                      setCommandQuery(ctx.namePart)
                      setCommandInArgs(ctx.inArgs)
                      setCommandArgIndex(ctx.argIndex)
                      setSelectedCommandIndex(0)
                    } else {
                      closeCommandAutocomplete()
                    }
                  } else {
                    closeCommandAutocomplete()
                  }

                  // If user clicked inside a mention token, snap to edge
                  requestAnimationFrame(() => {
                    snapCaretOutOfToken('nearest')
                  })
                }}
                onSelect={() => {
                  // Prevent caret from sitting "inside" a token
                  snapCaretOutOfToken('nearest')
                }}
                onKeyDown={(e) => {
                  // Keep mentions atomic: jumping over tokens with arrows
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    const textarea = textareaRef.current
                    if (textarea && textarea.selectionStart === textarea.selectionEnd) {
                      const value = textarea.value
                      const caret = textarea.selectionStart ?? value.length
                      const checkPos = e.key === 'ArrowLeft' ? caret - 1 : caret
                      const token = findTokenRangeAt(value, checkPos)
                      if (token) {
                        e.preventDefault()
                        const next = e.key === 'ArrowLeft' ? token.start : token.end
                        textarea.setSelectionRange(next, next)
                        return
                      }
                    }
                  }

                  // If caret ever ends up inside token, typing should happen after it
                  if (
                    e.key.length === 1 &&
                    !e.metaKey &&
                    !e.ctrlKey &&
                    !e.altKey
                  ) {
                    snapCaretOutOfToken('right')
                  }

                  // Mention navigation
                  if (mentionStart !== null && mentionSuggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSelectedMentionIndex((prev) =>
                        (prev + 1) % mentionSuggestions.length
                      )
                      return
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSelectedMentionIndex((prev) =>
                        (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length
                      )
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const choice = mentionSuggestions[selectedMentionIndex]
                      if (choice) {
                        insertMentionToken(
                          choice.id,
                          choice.displayName || choice.name,
                          choice.path
                        )
                      }
                      return
                    }
                    if (e.key === 'Escape') {
                      setMentionStart(null)
                      setMentionQuery('')
                      return
                    }
                  }

                  // Command autocomplete navigation (only when not typing a mention)
                  if (!mentionVisible && commandVisible && !commandInArgs) {
                    if (commandSuggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setSelectedCommandIndex((prev) =>
                          (prev + 1) % commandSuggestions.length
                        )
                        return
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setSelectedCommandIndex((prev) =>
                          (prev - 1 + commandSuggestions.length) %
                          commandSuggestions.length
                        )
                        return
                      }
                      if (e.key === 'Tab') {
                        e.preventDefault()
                        const choice = commandSuggestions[selectedCommandIndex]
                        if (choice) insertCommandInvocationStart(choice)
                        return
                      }
                      // Only hijack Enter for command selection when not composing and not sending
                      const isComposing =
                        e.nativeEvent.isComposing || e.keyCode === 229
                      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                        e.preventDefault()
                        const choice = commandSuggestions[selectedCommandIndex]
                        if (choice) insertCommandName(choice.name)
                        return
                      }
                    }
                    if (e.key === 'Escape') {
                      closeCommandAutocomplete()
                      return
                    }
                  }

                  // Command args-mode Tab: fill defaults arg-by-arg
                  if (!mentionVisible && commandVisible && commandInArgs) {
                    if (e.key === 'Tab') {
                      e.preventDefault()
                      if (selectedCommand) tabFillDefaultArg(selectedCommand)
                      return
                    }
                    if (e.key === 'Escape') {
                      closeCommandAutocomplete()
                      return
                    }
                  }

                  if (e.key === 'Backspace' || e.key === 'Delete') {
                    handleTokenAwareBackspace(e)
                  }

                  // e.keyCode 229 is for IME input with Safari
                  const isComposing =
                    e.nativeEvent.isComposing || e.keyCode === 229
                  if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
                    e.preventDefault()
                    if (mentionStart !== null && mentionSuggestions.length > 0) {
                      const choice = mentionSuggestions[selectedMentionIndex]
                      if (choice) {
                        insertMentionToken(
                          choice.id,
                          choice.displayName || choice.name,
                          choice.path
                        )
                      }
                      return
                    }
                    // Submit prompt when the following conditions are met:
                    // - Enter is pressed without Shift
                    // - The streaming content has finished
                    // - Prompt is not empty
                    if (!streamingContent && prompt.trim() && !ingestingAny) {
                      handleSendMessage(prompt)
                    }
                    // When Shift+Enter is pressed, a new line is added (default behavior)
                  }
                }}
                onPaste={handlePaste}
                placeholder={t('common:placeholder.chatInput')}
                autoFocus
                spellCheck={spellCheckChatInput}
                data-gramm={spellCheckChatInput}
                data-gramm_editor={spellCheckChatInput}
                data-gramm_grammarly={spellCheckChatInput}
                className={cn(
                  'bg-transparent pt-4 w-full flex-shrink-0 border-none resize-none outline-0 px-4 text-transparent caret-main-view-fg',
                  rows < maxRows && 'scrollbar-hide',
                  className
                )}
              />
            </div>
          </div>
        </div>

        <div className="absolute z-20 bg-transparent bottom-0 w-full p-2 ">
          <div className="flex justify-between items-center w-full">
            <div className="px-1 flex items-center gap-1 flex-1 min-w-0">
              <div
                className={cn(
                  'px-1 flex items-center w-full gap-1',
                  streamingContent && 'opacity-50 pointer-events-none'
                )}
              >
                {/* Dropdown for attachments */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="size-7 flex items-center justify-center rounded-full bg-main-view-fg/4 hover:bg-main-view-fg/4 transition-all duration-200 ease-in-out gap-1 mr-2 cursor-pointer">
                      <PlusIcon size={18} className="text-main-view-fg/50" />
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {/* Vision image attachment - show only for models with mmproj */}
                    <DropdownMenuItem
                      onClick={handleImagePickerClick}
                      disabled={!hasMmproj}
                    >
                      <IconPhoto size={18} className="text-main-view-fg/50" />
                      <span>Add Images</span>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        onChange={handleFileChange}
                      />
                    </DropdownMenuItem>
                    {/* RAG document attachments - desktop-only via dialog; shown when feature enabled */}
                    <DropdownMenuItem
                      onClick={handleAttachDocsIngest}
                      disabled={
                        !selectedModel?.capabilities?.includes('tools') &&
                        !showAttachmentButton
                      }
                    >
                      {ingestingDocs ? (
                        <IconLoader2
                          size={18}
                          className="text-main-view-fg/50 animate-spin"
                        />
                      ) : (
                        <IconPaperclip
                          size={18}
                          className="text-main-view-fg/50"
                        />
                      )}
                      <span>
                        {ingestingDocs
                          ? 'Indexing documents…'
                          : 'Add documents or files'}
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {model?.provider === 'llamacpp' && loadingModel ? (
                  <ModelLoader />
                ) : (
                  <DropdownModelProvider
                    model={model}
                    useLastUsedModel={initialMessage}
                  />
                )}
                {/* Microphone - always available - Temp Hide */}
                {/* <div className="h-7 p-1 flex items-center justify-center rounded-sm hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out gap-1">
                <IconMicrophone size={18} className="text-main-view-fg/50" />
              </div> */}
                {selectedModel?.capabilities?.includes('embeddings') && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-7 p-1 flex items-center justify-center rounded-sm hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out gap-1">
                          <IconCodeCircle2
                            size={18}
                            className="text-main-view-fg/50"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('embeddings')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {selectedModel?.capabilities?.includes('tools') && hasJanBrowserMCPConfig && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "h-7 p-1 flex items-center justify-center rounded-sm hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out gap-1 cursor-pointer",
                            janBrowserMCPActive && "bg-accent/10",
                            isJanBrowserMCPLoading && "opacity-70 cursor-not-allowed"
                          )}
                          onClick={isJanBrowserMCPLoading ? undefined : handleBrowseClick}
                        >
                          {isJanBrowserMCPLoading ? (
                            <IconLoader2
                              size={18}
                              className="text-accent animate-spin"
                            />
                          ) : (
                            <IconWorld
                              size={18}
                              className={cn(
                                "text-main-view-fg/50",
                                janBrowserMCPActive && "text-accent"
                              )}
                            />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {isJanBrowserMCPLoading
                            ? 'Starting...'
                            : janBrowserMCPActive
                            ? 'Browse (Active)'
                            : 'Browse'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {selectedModel?.capabilities?.includes('tools') &&
                  hasActiveMCPServers &&
                  (MCPToolComponent ? (
                    // Use custom MCP component
                    <McpExtensionToolLoader
                      tools={tools}
                      hasActiveMCPServers={hasActiveMCPServers}
                      selectedModelHasTools={
                        selectedModel?.capabilities?.includes('tools') ?? false
                      }
                      initialMessage={initialMessage}
                      MCPToolComponent={MCPToolComponent}
                    />
                  ) : (
                    // Use default tools dropdown
                    <TooltipProvider>
                      <Tooltip
                        open={tooltipToolsAvailable}
                        onOpenChange={setTooltipToolsAvailable}
                      >
                        <TooltipTrigger
                          asChild
                          disabled={dropdownToolsAvailable}
                        >
                          <div
                            onClick={(e) => {
                              setDropdownToolsAvailable(false)
                              e.stopPropagation()
                            }}
                          >
                            <DropdownToolsAvailable
                              initialMessage={initialMessage}
                              onOpenChange={(isOpen) => {
                                setDropdownToolsAvailable(isOpen)
                                if (isOpen) {
                                  setTooltipToolsAvailable(false)
                                }
                              }}
                            >
                              {(isOpen, toolsCount) => {
                                return (
                                  <div
                                    className={cn(
                                      'h-7 p-1 flex items-center justify-center rounded-sm hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out gap-1 cursor-pointer',
                                      isOpen && 'bg-main-view-fg/10',
                                      toolsCount > 0 && 'bg-accent/10'
                                    )}
                                  >
                                    <IconTool
                                      size={18}
                                      className={cn(
                                        "text-main-view-fg/50",
                                        toolsCount > 0 && "text-accent"
                                      )}
                                    />
                                  </div>
                                )
                              }}
                            </DropdownToolsAvailable>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('tools')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                {selectedModel?.capabilities?.includes('web_search') && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-7 p-1 flex items-center justify-center rounded-sm hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out gap-1">
                          <IconWorld
                            size={18}
                            className="text-main-view-fg/50"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Web Search</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {selectedModel?.capabilities?.includes('reasoning') && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="h-7 p-1 flex items-center justify-center rounded-sm hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out gap-1">
                          <IconAtom
                            size={18}
                            className="text-main-view-fg/50"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('reasoning')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedProvider === 'llamacpp' &&
                hasActiveModels &&
                tokenCounterCompact &&
                !initialMessage &&
                (threadMessages?.length > 0 || prompt.trim().length > 0) && (
                  <div className="flex-1 flex justify-center">
                    <TokenCounter
                      messages={threadMessages || []}
                      compact={true}
                      uploadedFiles={attachments
                        .filter((a) => a.type === 'image' && a.dataUrl)
                        .map((a) => ({
                          name: a.name,
                          type: a.mimeType || getFileTypeFromExtension(a.name),
                          size: a.size || 0,
                          base64: a.base64 || '',
                          dataUrl: a.dataUrl!,
                        }))}
                    />
                  </div>
                )}

              {streamingContent ? (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() =>
                    stopStreaming(currentThreadId ?? streamingContent.thread_id)
                  }
                >
                  <IconPlayerStopFilled />
                </Button>
              ) : (
                <Button
                  variant={!prompt.trim() ? null : 'default'}
                  size="icon"
                  disabled={!prompt.trim() || ingestingAny}
                  data-test-id="send-message-button"
                  onClick={() => handleSendMessage(prompt)}
                >
                  {streamingContent || ingestingAny ? (
                    <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <ArrowRight className="text-primary-fg" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div className="bg-main-view-fg/2 -mt-0.5 mx-2 pb-2 px-3 pt-1.5 rounded-b-lg text-xs text-destructive transition-all duration-200 ease-in-out">
          <div className="flex items-center gap-1 justify-between">
            {message}
            <IconX
              className="size-3 text-main-view-fg/30 cursor-pointer"
              onClick={() => {
                setMessage('')
                // Reset file input to allow re-uploading the same file
                if (fileInputRef.current) {
                  fileInputRef.current.value = ''
                }
              }}
            />
          </div>
        </div>
      )}

      {selectedProvider === 'llamacpp' &&
        hasActiveModels &&
        !tokenCounterCompact &&
        !initialMessage &&
        (threadMessages?.length > 0 || prompt.trim().length > 0) && (
          <div className="flex-1 w-full flex justify-start px-2">
            <TokenCounter
              messages={threadMessages || []}
              compact={false}
              uploadedFiles={attachments
                .filter((a) => a.type === 'image' && a.dataUrl)
                .map((a) => ({
                  name: a.name,
                  type: a.mimeType || getFileTypeFromExtension(a.name),
                  size: a.size || 0,
                  base64: a.base64 || '',
                  dataUrl: a.dataUrl!,
                }))}
            />
          </div>
        )}

      <JanBrowserExtensionDialog
        open={extensionDialogOpen}
        onOpenChange={setExtensionDialogOpen}
        state={extensionDialogState}
        onCancel={handleExtensionDialogCancel}
      />
    </div>
  )
}

export default ChatInput
