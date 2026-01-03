import { ChevronDown, Loader } from 'lucide-react'
import { cn } from '@/lib/utils'
import { create } from 'zustand'
import { RenderMarkdown } from '@/containers/RenderMarkdown'
import { useMemo, useState } from 'react'

import { useToolApproval } from '@/hooks/useToolApproval'
import { Button } from '@/components/ui/button'
import ImageModal from '@/containers/dialogs/ImageModal'

interface Props {
  result: string
  name: string
  args: object
  id: number
  loading: boolean
}

type ToolCallBlockState = {
  collapseState: { [id: number]: boolean }
  setCollapseState: (id: number, expanded: boolean) => void
}

const useToolCallBlockStore = create<ToolCallBlockState>((set) => ({
  collapseState: {},
  setCollapseState: (id, expanded) =>
    set((state) => ({
      collapseState: {
        ...state.collapseState,
        [id]: expanded,
      },
    })),
}))

// Types for MCP response content
interface MCPContentItem {
  type: string
  data?: string
  text?: string
  mimeType?: string
}

interface MCPResponse {
  content?: MCPContentItem[]
}

// Utility function to create data URL from base64 and mimeType
const createDataUrl = (base64Data: string, mimeType: string): string => {
  // Handle case where base64 data might already include data URL prefix
  if (base64Data.startsWith('data:')) {
    return base64Data
  }
  return `data:${mimeType};base64,${base64Data}`
}

// Parse MCP response and extract content items
const parseMCPResponse = (result: string) => {
  try {
    const parsed: MCPResponse = JSON.parse(result)
    const content = parsed.content || []

    return {
      parsedResult: parsed,
      contentItems: content,
      hasStructuredContent: content.length > 0,
      parseError: false,
    }
  } catch {
    // Fallback: JSON parsing failed, treat as plain text
    return {
      parsedResult: result,
      contentItems: [],
      hasStructuredContent: false,
      parseError: true,
    }
  }
}

// Component to render individual content items based on type
const ContentItemRenderer = ({
  item,
  index,
  onImageClick,
}: {
  item: MCPContentItem
  index: number
  onImageClick?: (imageUrl: string, alt: string) => void
}) => {
  if (item.type === 'image' && item.data && item.mimeType) {
    const imageUrl = createDataUrl(item.data, item.mimeType)
    return (
      <div key={index} className="my-3">
        <img
          src={imageUrl}
          alt={`Result image ${index + 1}`}
          className="max-w-full max-h-64 object-contain rounded-md border border-main-view-fg/10 cursor-pointer hover:opacity-80 transition-opacity"
          onError={(e) => {
            // Hide broken images
            e.currentTarget.style.display = 'none'
          }}
          onClick={() => onImageClick?.(imageUrl, `Result image ${index + 1}`)}
        />
      </div>
    )
  }

  // For any other types, render as JSON
  return (
    <div key={index} className="mt-3">
      <RenderMarkdown
        content={'```json\n' + JSON.stringify(item, null, 2) + '\n```'}
      />
    </div>
  )
}

const ToolCallBlock = ({ id, name, result, loading, args }: Props) => {
  const { collapseState, setCollapseState } = useToolCallBlockStore()
  const isExpanded = collapseState[id] ?? false // Default collapsed unless actively loading (logic below handles loading)
  // Force expand if loading, otherwise respect user toggle or default
  const expanded = loading ? true : isExpanded
  const [modalImage, setModalImage] = useState<{
    url: string
    alt: string
  } | null>(null)

  const handleClick = () => {
    const newExpandedState = !expanded
    setCollapseState(id, newExpandedState)
  }

  const handleImageClick = (imageUrl: string, alt: string) => {
    setModalImage({ url: imageUrl, alt })
  }

  const closeModal = () => {
    setModalImage(null)
  }

  // Parse the MCP response and extract content items
  const { parsedResult, contentItems, hasStructuredContent } = useMemo(() => {
    return parseMCPResponse(result)
  }, [result])

  const { isModalOpen, modalProps } = useToolApproval()
  const isPendingApproval = isModalOpen && modalProps?.toolName === name && loading

  if (isPendingApproval && modalProps) {
    return (
      <div className="w-full my-2 border border-main-view-fg/10 bg-main-view-fg/2 rounded-md transition-all">
        <div className="p-3">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                <Loader className="size-3 animate-spin" />
              </div>
              <span className="text-sm font-medium text-main-view-fg/90">
                Run <code className="px-1.5 py-0.5 rounded bg-main-view-fg/5 font-mono text-xs">{name}</code>?
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => modalProps.onDeny()} className="h-7 text-xs text-main-view-fg/60 hover:text-red-500 hover:bg-red-500/10">
                Deny
              </Button>
              <Button variant="outline" size="sm" onClick={() => modalProps.onApprove(true)} className="h-7 text-xs border-main-view-fg/10 hover:bg-main-view-fg/5">
                Allow Once
              </Button>
              <Button variant="default" size="sm" onClick={() => modalProps.onApprove(false)} className="h-7 text-xs">
                Allow Always
              </Button>
            </div>
          </div>

          {args && (
            <div className="rounded border border-main-view-fg/5 bg-main-view-fg/5 px-3 py-2">
              <div className="max-h-40 overflow-auto text-xs font-mono text-main-view-fg/80">
                <RenderMarkdown content={'```json\n' + JSON.stringify(args, null, 2) + '\n```'} />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="w-full cursor-pointer break-words my-2"
        data-tool-call-block={id}
      >
        <div className="rounded-md border border-main-view-fg/10 bg-transparent hover:bg-main-view-fg/5 transition-colors">
          <div className="flex items-center gap-2 px-3 py-2 text-xs select-none" onClick={handleClick}>
            {loading ? (
              <Loader className="size-3 animate-spin text-accent" />
            ) : (
              <div className={cn("text-main-view-fg/40 transition-transform duration-200", expanded && "rotate-180")}>
                <ChevronDown className="size-3" />
              </div>
            )}

            <span className="font-medium text-main-view-fg/70 flex-1 flex items-center gap-2">
              Using tool <code className="bg-main-view-fg/10 px-1.5 py-0.5 rounded text-main-view-fg font-mono">{name}</code>
            </span>

            {loading ? (
              <span className="text-accent/80 italic">Running...</span>
            ) : (
              <span className="text-main-view-fg/40">Completed</span>
            )}
          </div>

          <div
            className={cn(
              'overflow-hidden transition-all duration-300',
              expanded ? 'max-h-[500px] border-t border-main-view-fg/5' : 'max-h-0 border-none'
            )}
          >
            <div className="p-3 text-xs font-mono bg-main-view-fg/5 overflow-x-auto">
              {args && Object.keys(args).length > 3 && (
                <>
                  <p className="mb-3">Arguments:</p>
                  <RenderMarkdown
                    isWrapping={true}
                    content={'```json\n' + JSON.stringify(args, null, 2) + '\n```'}
                  />
                </>
              )}

              {result && (
                <>
                  <p>Output:</p>
                  {hasStructuredContent ? (
                    /* Render each content item individually based on its type */
                    <div className="space-y-2">
                      {contentItems.map((item, index) => (
                        <ContentItemRenderer
                          key={index}
                          item={item}
                          index={index}
                          onImageClick={handleImageClick}
                        />
                      ))}
                    </div>
                  ) : (
                    /* Fallback: render as JSON for valid JSON but unstructured responses */
                    <RenderMarkdown
                      content={
                        '```json\n' +
                        JSON.stringify(parsedResult, null, 2) +
                        '\n```'
                      }
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <ImageModal image={modalImage} onClose={closeModal} />
    </>
  )
}

export default ToolCallBlock
