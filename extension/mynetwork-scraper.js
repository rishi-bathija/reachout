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

  function triggerViewAll(link) {
    if (!link) return
    try {
      link.scrollIntoView({ block: 'center', behavior: 'instant' })
    } catch {}
    console.log('[ReachOutFlow] View all link found', link.href)

    const events = [
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }),
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window }),
    ]
    for (const event of events) {
      try {
        link.dispatchEvent(event)
      } catch {}
    }
    console.log('[ReachOutFlow] View all click dispatched')
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

  function getModalRoot() {
    const candidates = Array.from(document.querySelectorAll('[role="dialog"], dialog, .artdeco-modal, .artdeco-modal__content'))
    if (!candidates.length) return null

    const match = candidates.find((el) => /accepted invitation|accepted invitations/i.test(el.textContent || ''))
    return match || candidates[0]
  }

  function collectFromModal() {
    const modal = getModalRoot()
    if (!modal) {
      console.log('[ReachOutFlow] Modal not found')
      return []
    }

    const items = []
    const seen = new Set()
    const links = Array.from(modal.querySelectorAll('a[href*="/in/"]'))
    console.log('[ReachOutFlow] Modal links', links.length)
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
    console.log('[ReachOutFlow] Banner multiple?', hasMultiple, 'viewAll?', Boolean(viewAllLink), 'inline', inlineLinks.length)

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

  function collectFromMyNetwork(tryExpand) {
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
    console.log('[ReachOutFlow] MyNetwork banners', banners.length)

    for (const banner of banners) {
      const viewAllLink = findViewAllLinkNear(banner)
      if (tryExpand && viewAllLink) {
        triggerViewAll(viewAllLink)
      } else if (tryExpand) {
        const hasMultiple = /and\s+\d+\s+other/i.test(banner.textContent || '')
        if (hasMultiple) {
          console.log('[ReachOutFlow] View all link not found, clicking banner fallback')
          try {
            banner.scrollIntoView({ block: 'center', behavior: 'instant' })
            banner.click()
          } catch {}
        }
      }

      const items = extractFromBanner(banner)
      for (const item of items) {
        const key = item.viewAll || item.profileUrl || item.name
        if (!key || seen.has(key)) continue
        seen.add(key)
        found.push(item)
      }
    }

    return found
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'SCRAPE_MYNETWORK_ACCEPTANCES') return
    const tryExpand = Boolean(message.expand)
    const acceptances = collectFromMyNetwork(tryExpand)
    if (tryExpand) {
      const startedAt = Date.now()
      const poll = () => {
        const modalAcceptances = collectFromModal()
        if (modalAcceptances.length || Date.now() - startedAt > 3000) {
          const finalAcceptances = modalAcceptances.length ? modalAcceptances : acceptances
          console.log('[ReachOutFlow] MyNetwork scraper found', finalAcceptances)
          sendResponse({ acceptances: finalAcceptances })
          return
        }
        setTimeout(poll, 400)
      }
      setTimeout(poll, 400)
      return true
    }

    console.log('[ReachOutFlow] MyNetwork scraper found', acceptances)
    sendResponse({ acceptances })
    return true
  })
})()
