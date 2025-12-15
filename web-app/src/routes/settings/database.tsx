import { createFileRoute } from '@tanstack/react-router'
import SettingsMenu from '@/containers/SettingsMenu'
import HeaderPage from '@/containers/HeaderPage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardItem } from '@/containers/Card'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useServiceHub } from '@/hooks/useServiceHub'
import { PlatformGuard } from '@/lib/platform/PlatformGuard'
import { PlatformFeature } from '@/lib/platform/types'
import { IconCopy, IconCopyCheck, IconFolder } from '@tabler/icons-react'
import { toast } from 'sonner'
import ChangeDataFolderLocation from '@/containers/dialogs/ChangeDataFolderLocation'
import { SystemEvent } from '@/types/events'
import { useEffect, useState, useCallback } from 'react'
import { isRootDir } from '@/utils/path'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/settings/database')({
  component: DatabaseSettings,
})

function DatabaseSettings() {
  const { t } = useTranslation()
  const serviceHub = useServiceHub()
  const [databasePath, setDatabasePath] = useState<string | undefined>()
  const [selectedNewPath, setSelectedNewPath] = useState<string | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isRelocating, setIsRelocating] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const root = await serviceHub.database().root()
        setDatabasePath(root)
      } catch (error) {
        console.error('Failed to load database path', error)
      }
    }
    load()
  }, [serviceHub])

  const copyToClipboard = useCallback(async () => {
    if (!databasePath) return
    try {
      await navigator.clipboard.writeText(databasePath)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }, [databasePath])

  const handleChangeLocation = useCallback(async () => {
    const janDataFolder = await serviceHub.app().getJanDataFolder()
    const selection = await serviceHub.dialog().open({
      multiple: false,
      directory: true,
      defaultPath: janDataFolder,
    })
    if (!selection || selection === janDataFolder) return
    setSelectedNewPath(selection as string)
    setIsDialogOpen(true)
  }, [serviceHub])

  const confirmChange = useCallback(async () => {
    if (!selectedNewPath) return
    
    // Prevent relocating to root directory
    if (isRootDir(selectedNewPath)) {
      toast.error(t('settings:general.couldNotRelocateToRoot'))
      setIsDialogOpen(false)
      setSelectedNewPath(null)
      return
    }

    setIsRelocating(true)
    try {
      await serviceHub.models().stopAllModels()
      serviceHub.events().emit(SystemEvent.KILL_SIDECAR)
      
      setTimeout(async () => {
        try {
          await serviceHub.app().relocateJanDataFolder(selectedNewPath)
          
          // Reload the database path after relocation
          const newRoot = await serviceHub.database().root()
          setDatabasePath(newRoot)
          setSelectedNewPath(null)
          setIsDialogOpen(false)
          
          // Relaunch the app
          window.core?.api?.relaunch()
        } catch (error) {
          console.error('Failed to relocate database folder:', error)
          const message =
            error instanceof Error
              ? error.message
              : t('settings:database.changeLocationError')
          toast.error(message)
          setIsRelocating(false)
        }
      }, 1000)
    } catch (error) {
      console.error('Failed to relocate database folder:', error)
      toast.error(t('settings:database.changeLocationError'))
      setIsRelocating(false)
    }
  }, [selectedNewPath, serviceHub, t])

  return (
    <PlatformGuard feature={PlatformFeature.SYSTEM_INTEGRATIONS}>
      <div className="flex flex-col h-full pb-[calc(env(safe-area-inset-bottom)+env(safe-area-inset-top))]">
        <HeaderPage>
          <h1 className="font-medium">{t('common:settings')}</h1>
        </HeaderPage>
        <div className="flex h-full w-full flex-col sm:flex-row">
          <SettingsMenu />
          <div className="p-4 w-full h-[calc(100%-32px)] overflow-y-auto">
            <div className="flex flex-col justify-between gap-4 gap-y-3 w-full">
              <Card title={t('common:database.title')}>
                <CardItem
                  title={t('settings:database.location')}
                  className="block"
                  description={
                    <div className="space-y-2">
                      <p>{t('settings:database.locationDesc')}</p>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            className="w-full pr-10 font-mono text-sm"
                            value={databasePath || ''}
                            readOnly
                            placeholder={t('common:loading')}
                          />
                          <button
                            onClick={copyToClipboard}
                            className={cn(
                              "absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer flex items-center justify-center rounded p-1.5 hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out",
                              isCopied && "bg-accent/10"
                            )}
                            title={isCopied ? t('settings:copied') : t('settings:copyPath')}
                          >
                            {isCopied ? (
                              <IconCopyCheck size={16} className="text-accent" />
                            ) : (
                              <IconCopy size={16} className="text-main-view-fg/50" />
                            )}
                          </button>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleChangeLocation}
                          disabled={isRelocating}
                          className="shrink-0 whitespace-nowrap"
                        >
                          <IconFolder size={14} className="mr-1.5" />
                          {t('common:edit')}
                        </Button>
                      </div>
                    </div>
                  }
                />
              </Card>
            </div>
          </div>
        </div>
      </div>
      {selectedNewPath && (
        <ChangeDataFolderLocation
          currentPath={databasePath || ''}
          newPath={selectedNewPath}
          open={isDialogOpen}
          onConfirm={confirmChange}
          onOpenChange={(open) => {
            setIsDialogOpen(open)
            if (!open) {
              setSelectedNewPath(null)
            }
          }}
        >
          <div />
        </ChangeDataFolderLocation>
      )}
    </PlatformGuard>
  )
}
