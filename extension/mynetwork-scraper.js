(function () {
  function normalizeProfileUrl(raw) {
    try {
      const url = new URL(raw)
      const path = url.pathname.replace(/\/$/, '')
      return `${url.origin}${path}`
    } catch {
      return ''
    }
  }

  function isAcceptedInviteText(text) {
    return /accepted your invitation/i.test(text || '')
  }

  function parseAcceptanceCount(text) {
    if (!text) return 0
    const match = text.match(/and\s+(\d+)\s+other/i)
    if (match) {
      const others = Number.parseInt(match[1], 10)
      if (Number.isFinite(others)) {
        return 1 + others
      }
    }
    if (isAcceptedInviteText(text)) return 1
    return 0
  }

  function findViewAllLink(banner) {
    const links = Array.from(
      banner.querySelectorAll('a[href*="mynetwork/invite-connect/connections"], a[href*="mynetwork/invitation-manager/"], a[href*="/mynetwork/grow"]')
    )
    const viewAll = links.find((link) => /view all/i.test(link.textContent || ''))
    return viewAll || links[0] || null
  }

  function findBannerRoot(el) {
    let node = el
    for (let i = 0; i < 6 && node; i += 1) {
      if (
        node.querySelector?.('a[href*="/mynetwork/grow"]') ||
        node.querySelector?.('a[href*="mynetwork/invite-connect/connections"]') ||
        node.querySelector?.('a[href*="mynetwork/invitation-manager/"]')
      ) {
        return node
      }
      node = node.parentElement
    }
    return el
  }

  function findViewAllLinkNear(banner) {
    const root = findBannerRoot(banner)
    const direct = findViewAllLink(root)
    if (direct) return direct

    // Fallback: sometimes the "View all" link is in a sibling container.
    const parent = root.parentElement
    if (parent) {
      const candidates = Array.from(parent.querySelectorAll('a[href*="/mynetwork/grow"]'))
      const viewAll = candidates.find((link) => /view all/i.test(link.textContent || ''))
      if (viewAll) return viewAll
    }
    return null
  }

  function looksLikeInvitationModal(el) {
    const text = (el.textContent || '').trim()
    if (/accepted invitation|accepted invitations|invitation accepted/i.test(text)) {
      return true
    }

    const ariaLabel = ((el.getAttribute && el.getAttribute('aria-label')) || '') + ' ' + ((el.getAttribute && el.getAttribute('role')) || '')
    if (/accepted invitation|invitation accepted|invitations/i.test(ariaLabel)) {
      return true
    }

    const actionButton = el.querySelector('button, a')
    if (actionButton) {
      const buttonText = (actionButton.textContent || '') + ' ' + ((actionButton.getAttribute && actionButton.getAttribute('aria-label')) || '')
      if (/view all|see all|acceptance|invitation/i.test(buttonText)) {
        return true
      }
    }

    return false
  }

  function getModalRoot() {
    const candidates = Array.from(document.querySelectorAll('[role="dialog"], dialog, .artdeco-modal, .artdeco-modal__content'))
    if (!candidates.length) return null

    return candidates.find(looksLikeInvitationModal) || null
  }

  function collectFromModal() {
    const modal = getModalRoot()
    if (!modal) {
      return []
    }

    const items = []
    const seen = new Set()
    const links = Array.from(modal.querySelectorAll('a[href*="/in/"]'))
    for (const link of links) {
      const row = link.closest('div, p') || link.parentElement
      const text = row?.textContent || ''
      if (!isAcceptedInviteText(text)) continue
      const profileUrl = normalizeProfileUrl(link.href)
      const name = (link.textContent || link.getAttribute('aria-label') || '').trim()
      const key = profileUrl || name
      if (!key || seen.has(key)) continue
      seen.add(key)
      items.push({ name, profileUrl })
    }

    return items
  }

  function extractFromBanner(banner) {
    const text = banner.textContent || ''
    if (!isAcceptedInviteText(text)) return []

    const viewAllLink = findViewAllLinkNear(banner)
    const hasMultiple = /and\s+\d+\s+other/i.test(text)
    const inlineLinks = Array.from(banner.querySelectorAll('a[href*="/in/"]'))

    if (viewAllLink) {
      const items = []
      if (hasMultiple) {
        items.push({ name: '', profileUrl: '', viewAll: viewAllLink.href })
      }
      for (const link of inlineLinks) {
        const profileUrl = normalizeProfileUrl(link.href)
        const name = link.textContent?.trim() || ''
        if (name || profileUrl) items.push({ name, profileUrl })
      }
      return items
    }

    return inlineLinks
      .map((link) => ({
        name: link.textContent?.trim() || '',
        profileUrl: normalizeProfileUrl(link.href),
      }))
      .filter((item) => item.name || item.profileUrl)
  }

  function collectFromMyNetwork() {
    const found = []
    const seen = new Set()

    let banners = Array.from(document.querySelectorAll('[aria-live]')).filter((el) =>
      isAcceptedInviteText(el.textContent || '')
    )
    if (!banners.length) {
      banners = Array.from(document.querySelectorAll('section, div, p')).filter((el) =>
        isAcceptedInviteText(el.textContent || '')
      )
    }

    let desiredCount = 0
    for (const banner of banners) {
      desiredCount = Math.max(desiredCount, parseAcceptanceCount(banner.textContent || ''))
    }

    for (const banner of banners) {
      const items = extractFromBanner(banner)
      for (const item of items) {
        const key = item.viewAll || item.profileUrl || item.name
        if (!key || seen.has(key)) continue
        seen.add(key)
        found.push(item)
      }
    }

    return { acceptances: found, desiredCount }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'SCRAPE_MYNETWORK_ACCEPTANCES') return
    const { acceptances, desiredCount } = collectFromMyNetwork()
    sendResponse({ acceptances, desiredCount })
    return true
  })

  function collectConnectionsList(limit) {
    const root =
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body
    const links = Array.from(root.querySelectorAll('a[href*="/in/"]'))
    const items = []
    const seen = new Set()

    for (const link of links) {
      const profileUrl = normalizeProfileUrl(link.href || '')
      if (!profileUrl) continue
      let name = (link.textContent || '').trim()
      if (!name) {
        name = (link.getAttribute('aria-label') || '').trim()
      }
      if (!name) {
        const img = link.querySelector('img[alt]')
        name = (img && img.getAttribute('alt')) || ''
        name = name.trim()
      }
      if (!name || name.length < 2) continue
      if (/^message$/i.test(name)) continue

      if (seen.has(profileUrl)) continue
      seen.add(profileUrl)
      items.push({ name, profileUrl })
      if (limit && items.length >= limit) break
    }

    return items
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'SCRAPE_CONNECTIONS_LIST') return
    const limit = Number(message.limit || 0)
    const acceptances = collectConnectionsList(limit)
    sendResponse({ acceptances })
    return true
  })
})()

