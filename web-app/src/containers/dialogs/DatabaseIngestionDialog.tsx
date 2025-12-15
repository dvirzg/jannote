import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useDatabaseIngestionPrompt } from '@/hooks/useDatabaseIngestionPrompt'
import { useTranslation } from '@/i18n'

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export default function DatabaseIngestionDialog() {
  const { t } = useTranslation()
  const { isModalOpen, currentFile, currentIndex, totalCount, choose, cancel } =
    useDatabaseIngestionPrompt()

  if (!isModalOpen || !currentFile) return null

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && cancel()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {t('common:databaseIngestion.title')}
            {totalCount > 1 && (
              <span className="text-sm font-normal text-main-view-fg/70 ml-2">
                ({currentIndex + 1} of {totalCount})
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {t('common:databaseIngestion.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="border border-main-view-fg/10 rounded-md p-3 bg-main-view/40">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium" title={currentFile.name}>
              {currentFile.name}
            </span>
            <span className="text-xs text-main-view-fg/70 flex-shrink-0">
              {formatBytes(currentFile.size)}
            </span>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end relative z-10">
          <Button variant="ghost" onClick={cancel} type="button">
            {t('common:cancel')}
          </Button>
          <Button
            variant="outline"
            className="border-main-view-fg/20"
            onClick={() => choose('embeddings')}
            type="button"
          >
            {t('common:databaseIngestion.embeddings')}
          </Button>
          <Button onClick={() => choose('inline')} type="button">
            {t('common:databaseIngestion.inline')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

