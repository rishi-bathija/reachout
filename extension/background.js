const DEFAULT_CONFIG = {
  apiUrl: 'http://localhost:3000',
  token: null,
  linkedAt: null,
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['config'], (result) => {
    if (!result.config) {
      chrome.storage.local.set({ config: DEFAULT_CONFIG })
    }
  })

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
      // Ignore if not supported.
    })
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_CONFIG') {
    chrome.storage.local.get(['config'], (result) => {
      sendResponse({ success: true, config: result.config || DEFAULT_CONFIG })
    })
    return true
  }

  if (message.type === 'SET_TOKEN') {
    const { token } = message
    if (!token) {
      sendResponse({ success: false, error: 'Missing token' })
      return true
    }

    chrome.storage.local.get(['config'], (result) => {
      const nextConfig = {
        ...(result.config || DEFAULT_CONFIG),
        token,
        linkedAt: new Date().toISOString(),
      }
      chrome.storage.local.set({ config: nextConfig }, () => {
        sendResponse({ success: true, config: nextConfig })
      })
    })

    return true
  }

  if (message.type === 'UPDATE_CONFIG') {
    chrome.storage.local.get(['config'], (result) => {
      const nextConfig = { ...(result.config || DEFAULT_CONFIG), ...message.config }
      chrome.storage.local.set({ config: nextConfig }, () => {
        sendResponse({ success: true, config: nextConfig })
      })
    })
    return true
  }

  if (message.type === 'SET_PENDING_CONNECTION') {
    chrome.storage.local.set({
      pendingConnection: {
        ...message.payload,
        capturedAt: new Date().toISOString(),
      },
    }, () => {
      if (message.openPopup) {
        const tabId = sender?.tab?.id
        if (tabId && chrome.sidePanel?.open) {
          chrome.sidePanel.open({ tabId }).catch(() => {
            // Ignore if side panel cannot be opened automatically.
          })
        } else if (chrome.action?.openPopup) {
          chrome.action.openPopup().catch(() => {
            // Ignore if popup cannot be opened automatically.
          })
        }
      }
      sendResponse({ success: true })
    })
    return true
  }

  if (message.type === 'CHECK_ACCEPTANCES') {
    ;(async () => {
      console.log('[ReachOutFlow] CHECK_ACCEPTANCES received')
      const config = await new Promise((resolve) => {
        chrome.storage.local.get(['config'], (result) => resolve(result.config || DEFAULT_CONFIG))
      })
      console.log('[ReachOutFlow] Config loaded', { apiUrl: config.apiUrl, hasToken: Boolean(config.token) })

      if (!config.token || !config.apiUrl) {
        sendResponse({ success: false, error: 'Extension not linked' })
        return
      }

      const acceptances = await openNotificationsAndScrape()
      console.log('[ReachOutFlow] Notifications acceptances', acceptances)
      if (!acceptances.length) {
      const fallback = await openMyNetworkAndScrape(true)
        console.log('[ReachOutFlow] MyNetwork acceptances', fallback)
        if (!fallback.length) {
          sendResponse({ success: true, matched: 0, updated: 0, acceptances: [] })
          return
        }
        acceptances.push(...fallback)
      }

      const viewAllLink = acceptances.find((item) => item.viewAll)?.viewAll
      if (viewAllLink) {
        console.log('[ReachOutFlow] View all detected', viewAllLink)
      }

      let filteredAcceptances = acceptances.filter((item) => item.profileUrl || item.name)

      if (viewAllLink && filteredAcceptances.length <= 1) {
        console.log('[ReachOutFlow] View all fallback scrape', viewAllLink)
        const expanded = await openMyNetworkAndScrape(false, viewAllLink)
        if (expanded.length) {
          filteredAcceptances = expanded.filter((item) => item.profileUrl || item.name)
        }
      }

      try {
        const response = await fetch(`${config.apiUrl}/api/extension/acceptances`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.token}`,
          },
          body: JSON.stringify({ acceptances: filteredAcceptances }),
        })

        const data = await response.json()
        console.log('[ReachOutFlow] Acceptances API response', { status: response.status, data })
        if (!response.ok) {
          throw new Error(data.error || 'Failed to process acceptances')
        }

        sendResponse({
          success: true,
          matched: data.matched || 0,
          updated: data.updated || 0,
          acceptances: filteredAcceptances,
          matchedConnections: data.matchedConnections || [],
        })
      } catch (error) {
        console.log('[ReachOutFlow] Acceptances API error', error)
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process acceptances',
        })
      }
    })()

    return true
  }
})

function openNotificationsAndScrape() {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: 'https://www.linkedin.com/notifications/', active: false }, (tab) => {
      if (!tab || !tab.id) {
        resolve([])
        return
      }

      const tabId = tab.id

      const onUpdated = (updatedTabId, info) => {
        if (updatedTabId !== tabId || info.status !== 'complete') return
        chrome.tabs.onUpdated.removeListener(onUpdated)

        chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_ACCEPTANCES' }, (response) => {
          const acceptances = response?.acceptances || []
          chrome.tabs.remove(tabId, () => resolve(acceptances))
        })
      }

      chrome.tabs.onUpdated.addListener(onUpdated)
    })
  })
}

function openMyNetworkAndScrape(expand, urlOverride) {
  return new Promise((resolve) => {
    const url = urlOverride || 'https://www.linkedin.com/mynetwork/grow/'
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (!tab || !tab.id) {
        resolve([])
        return
      }

      const tabId = tab.id

      const onUpdated = (updatedTabId, info) => {
        if (updatedTabId !== tabId || info.status !== 'complete') return
        chrome.tabs.onUpdated.removeListener(onUpdated)

        chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_MYNETWORK_ACCEPTANCES', expand }, (response) => {
          const acceptances = response?.acceptances || []
          chrome.tabs.remove(tabId, () => resolve(acceptances))
        })
      }

      chrome.tabs.onUpdated.addListener(onUpdated)
    })
  })
}
