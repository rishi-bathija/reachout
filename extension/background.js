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
      const config = await new Promise((resolve) => {
        chrome.storage.local.get(['config'], (result) => resolve(result.config || DEFAULT_CONFIG))
      })

      if (!config.token || !config.apiUrl) {
        sendResponse({ success: false, error: 'Extension not linked' })
        return
      }

      const acceptances = await openNotificationsAndScrape()
      if (!acceptances.length) {
        const fallback = await openMyNetworkAndScrape(true)
        if (!fallback.length) {
          sendResponse({ success: true, matched: 0, updated: 0, acceptances: [] })
          return
        }
        acceptances.push(...fallback)
      }

      const viewAllLink = acceptances.find((item) => item.viewAll)?.viewAll

      let filteredAcceptances = acceptances.filter((item) => item.profileUrl || item.name)

      if (viewAllLink && filteredAcceptances.length <= 1) {
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

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          const errorDetail =
            data && typeof data === 'object' && 'error' in data
              ? String(data.error)
              : `Failed to process acceptances (${response.status})`
          throw new Error(errorDetail)
        }

        sendResponse({
          success: true,
          matched: data.matched || 0,
          updated: data.updated || 0,
          acceptances: filteredAcceptances,
          matchedConnections: data.matchedConnections || [],
        })
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to process acceptances',
        })
      }
    })()

    return true
  }
})

function scrapeLinkedInPage(url, messageType, messagePayload) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (!tab || !tab.id) {
        resolve([])
        return
      }

      const tabId = tab.id
      let resolved = false

      const cleanup = () => {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(onUpdated)
      }

      const finish = (acceptances) => {
        if (resolved) return
        resolved = true
        cleanup()
        chrome.tabs.remove(tabId, () => resolve(acceptances || []))
      }

      const timeout = setTimeout(() => {
        finish([])
      }, 30000)

      const onUpdated = (updatedTabId, info) => {
        if (updatedTabId !== tabId || info.status !== 'complete') return

        chrome.tabs.sendMessage(tabId, { type: messageType, ...(messagePayload || {}) }, (response) => {
          if (chrome.runtime.lastError) {
            finish([])
            return
          }
          const acceptances = response?.acceptances || []
          finish(acceptances)
        })
      }

      chrome.tabs.onUpdated.addListener(onUpdated)
    })
  })
}

function openNotificationsAndScrape() {
  return scrapeLinkedInPage(
    'https://www.linkedin.com/notifications/',
    'SCRAPE_ACCEPTANCES',
    {}
  )
}

function openMyNetworkAndScrape(expand, urlOverride) {
  const url = urlOverride || 'https://www.linkedin.com/mynetwork/grow/'
  return scrapeLinkedInPage(url, 'SCRAPE_MYNETWORK_ACCEPTANCES', { expand })
}
