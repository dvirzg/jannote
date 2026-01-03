import { createFileRoute } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import SettingsMenu from '@/containers/SettingsMenu'
import HeaderPage from '@/containers/HeaderPage'
import { Card, CardItem } from '@/containers/Card'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { ThemeSwitcher } from '@/containers/ThemeSwitcher'
import { FontSizeSwitcher } from '@/containers/FontSizeSwitcher'
import { LineNumbersSwitcher } from '@/containers/LineNumbersSwitcher'
import { TokenCounterCompactSwitcher } from '@/containers/TokenCounterCompactSwitcher'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Route = createFileRoute(route.settings.interface as any)({
  component: InterfaceSettings,
})

function InterfaceSettings() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col h-full pb-[calc(env(safe-area-inset-bottom)+env(safe-area-inset-top))]">
      <HeaderPage>
        <h1 className="font-medium">{t('common:settings')}</h1>
      </HeaderPage>
      <div className="flex h-full w-full flex-col sm:flex-row">
        <SettingsMenu />
        <div className="p-4 w-full h-[calc(100%-32px)] overflow-y-auto">
          <div className="flex flex-col justify-between gap-4 gap-y-3 w-full">
            {/* Interface */}
            <Card title={t('settings:interface.title')}>
              <CardItem
                title={t('settings:interface.theme')}
                description={t('settings:interface.themeDesc')}
                actions={<ThemeSwitcher />}
              />
              <CardItem
                title={t('settings:interface.fontSize')}
                description={t('settings:interface.fontSizeDesc')}
                actions={<FontSizeSwitcher />}
              />
            </Card>

            {/* Chat Message */}
            <Card>
              <CardItem
                title={t('settings:interface.tokenCounterCompact')}
                description={t('settings:interface.tokenCounterCompactDesc')}
                actions={<TokenCounterCompactSwitcher />}
              />
            </Card>

            {/* Codeblock */}
            <Card>
              <CardItem
                title={t('settings:interface.showLineNumbers')}
                description={t('settings:interface.showLineNumbersDesc')}
                actions={<LineNumbersSwitcher />}
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
