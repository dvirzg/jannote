import { Link } from '@tanstack/react-router'
import { route } from '@/constants/routes'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { useState } from 'react'
import {
  IconMenu2,
  IconX,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

import { PlatformFeatures } from '@/lib/platform/const'
import { PlatformFeature } from '@/lib/platform/types'

const SettingsMenu = () => {
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const menuSettings = [
    {
      title: 'common:general',
      route: route.settings.general,
      hasSubMenu: false,
      isEnabled: true,
    },
    {
      title: 'common:attachments',
      route: route.settings.attachments,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.FILE_ATTACHMENTS],
    },
    {
      title: 'common:interface',
      route: route.settings.interface,
      hasSubMenu: false,
      isEnabled: true,
    },
    {
      title: 'common:modelProviders',
      route: route.settings.model_providers,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.MODEL_PROVIDER_SETTINGS],
    },
    {
      title: 'common:assistants',
      route: route.settings.assistant,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.ASSISTANTS],
    },
    {
      title: 'common:keyboardShortcuts',
      route: route.settings.shortcuts,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.SHORTCUT],
    },
    {
      title: 'common:hardware',
      route: route.settings.hardware,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.HARDWARE_MONITORING],
    },
    {
      title: 'common:mcp-servers',
      route: route.settings.mcp_servers,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.MCP_SERVERS_SETTINGS],
    },
    {
      title: 'common:local_api_server',
      route: route.settings.local_api_server,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.LOCAL_API_SERVER],
    },
    {
      title: 'common:https_proxy',
      route: route.settings.https_proxy,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.HTTPS_PROXY],
    },
    {
      title: 'common:extensions',
      route: route.settings.extensions,
      hasSubMenu: false,
      isEnabled: PlatformFeatures[PlatformFeature.EXTENSIONS_SETTINGS],
    },
  ]

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  return (
    <>
      <button
        className="fixed top-[calc(10px+env(safe-area-inset-top))] right-4 sm:hidden size-5 cursor-pointer items-center justify-center rounded hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out data-[state=open]:bg-main-view-fg/10 z-20"
        onClick={toggleMenu}
        aria-label="Toggle settings menu"
      >
        {isMenuOpen ? (
          <IconX size={18} className="text-main-view-fg relative z-20" />
        ) : (
          <IconMenu2 size={18} className="text-main-view-fg relative z-20" />
        )}
      </button>
      <div
        className={cn(
          'h-full w-44 shrink-0 px-1.5 pt-3 border-r border-main-view-fg/5 bg-main-view',
          'sm:flex',
          isMenuOpen
            ? 'flex fixed sm:hidden top-[calc(10px+env(safe-area-inset-top))] z-10 m-1 h-[calc(100%-8px)] border-r-0 border-l bg-main-view right-0 py-8 rounded-tr-lg rounded-br-lg'
            : 'hidden'
        )}
      >
        <div className="flex flex-col gap-1 w-full text-main-view-fg/90 font-medium">
          {menuSettings.map((menu) => {
            if (!menu.isEnabled) {
              return null
            }
            return (
              <div key={menu.title}>
                <Link
                  to={menu.route}
                  className="block px-2 gap-1.5 cursor-pointer hover:bg-main-view-fg/5 py-1 w-full rounded [&.active]:bg-main-view-fg/5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-main-view-fg/80">
                      {t(menu.title)}
                    </span>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

export default SettingsMenu
