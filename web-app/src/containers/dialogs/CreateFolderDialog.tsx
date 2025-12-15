import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateFolderPrompt } from '@/hooks/useCreateFolderPrompt'
import { useTranslation } from '@/i18n'
import { useState, useEffect } from 'react'

export default function CreateFolderDialog() {
  const { t } = useTranslation()
  const { isModalOpen, confirm, cancel } = useCreateFolderPrompt()
  const [folderName, setFolderName] = useState('')

  useEffect(() => {
    if (isModalOpen) {
      setFolderName('')
    }
  }, [isModalOpen])

  const handleConfirm = () => {
    if (folderName.trim()) {
      confirm(folderName.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && folderName.trim()) {
      handleConfirm()
    }
  }

  if (!isModalOpen) return null

  return (
    <Dialog open={isModalOpen} onOpenChange={(open) => !open && cancel()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('common:createFolder.title')}</DialogTitle>
          <DialogDescription>
            {t('common:createFolder.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Input
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('common:createFolder.placeholder')}
            autoFocus
          />
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end relative z-10">
          <Button variant="ghost" onClick={cancel} type="button">
            {t('common:cancel')}
          </Button>
          <Button onClick={handleConfirm} type="button" disabled={!folderName.trim()}>
            {t('common:create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

