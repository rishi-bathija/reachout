let config = {}
let pendingConnection = null
let existingConnections = []
let selectedSource = null
let lastCompanyQuery = ''
let companyFetchTimer = null
let companyFetchController = null
let savingConnection = false

function loadState() {
  chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      config = { apiUrl: '', token: null, linkedAt: null }
    } else {
      config = response.config || { apiUrl: '', token: null, linkedAt: null }
    }

    chrome.storage.local.get(['pendingConnection'], (result) => {
      if (chrome.runtime.lastError) {
        pendingConnection = null
      } else {
        pendingConnection = result.pendingConnection || null
      }
      updateUI()
    })
  })
}

function updateUI() {
  const statusContainer = document.getElementById('status-container')
  const linkingCard = document.getElementById('linking-card')
  const pendingCard = document.getElementById('pending-card')
  const emptyCard = document.getElementById('empty-card')
  const acceptanceCard = document.getElementById('acceptance-card')
  const reuseCard = document.getElementById('reuse-card')
  const reuseList = document.getElementById('reuse-list')
  const clearReuseBtn = document.getElementById('clear-reuse-btn')
  const saveBtn = document.getElementById('save-connection-btn')
  const accountCard = document.getElementById('account-card')

  const isLinked = Boolean(config.token)

  if (!isLinked) {
    statusContainer.innerHTML = '<div class="status disconnected">Not connected</div>'
    linkingCard.style.display = 'block'
    pendingCard.style.display = 'none'
    emptyCard.style.display = 'none'
    acceptanceCard.style.display = 'none'
    accountCard.style.display = 'none'

    if (config.apiUrl) {
      document.getElementById('api-url').value = config.apiUrl
    }
    return
  }

  statusContainer.innerHTML = '<div class="status connected">Connected to ReachOutFlow</div>'
  linkingCard.style.display = 'none'
  acceptanceCard.style.display = 'block'
  accountCard.style.display = 'block'

  if (pendingConnection) {
    pendingCard.style.display = 'block'
    emptyCard.style.display = 'none'

    document.getElementById('pending-name').value = pendingConnection.name || ''
    document.getElementById('pending-role').value = pendingConnection.role || ''
    document.getElementById('pending-company').value = pendingConnection.company || ''
    document.getElementById('pending-profile').value = pendingConnection.profileUrl || ''
    document.getElementById('pending-job-title').value = pendingConnection.jobTitle || ''
    document.getElementById('pending-job-url').value = pendingConnection.jobUrl || ''
    document.getElementById('pending-notes').value = pendingConnection.notes || ''

    if (selectedSource) {
      document.getElementById('pending-job-title').value = selectedSource.jobTitle || ''
      document.getElementById('pending-job-url').value = selectedSource.jobUrl || ''
      document.getElementById('pending-notes').value = selectedSource.notes || ''
      clearReuseBtn.style.display = 'block'
    } else {
      clearReuseBtn.style.display = 'none'
    }

    const companyValue = document.getElementById('pending-company').value.trim()
    const normalizedCompany = companyValue.split('·')[0].trim()
    if (normalizedCompany.length >= 2) {
      scheduleFetchExistingConnections(normalizedCompany)
    } else {
      existingConnections = []
      reuseCard.style.display = 'none'
      reuseList.innerHTML = ''
    }

    if (existingConnections.length > 0) {
      reuseCard.style.display = 'block'
      reuseList.innerHTML = ''
      for (const conn of existingConnections) {
        const item = document.createElement('div')
        item.style.display = 'flex'
        item.style.justifyContent = 'space-between'
        item.style.alignItems = 'center'
        item.style.gap = '8px'

        const textContainer = document.createElement('div')
        textContainer.style.fontSize = '12px'

        const title = document.createElement('div')
        title.style.fontWeight = '600'
        title.textContent = conn.name + (conn.jobTitle ? ` (${conn.jobTitle})` : '')

        const company = document.createElement('div')
        company.style.color = '#6b7280'
        company.textContent = conn.company

        textContainer.appendChild(title)
        textContainer.appendChild(company)

        const button = document.createElement('button')
        button.className = 'reuse-btn'
        button.setAttribute('data-id', String(conn.id))
        button.style.width = 'auto'
        button.style.padding = '6px 10px'
        button.style.fontSize = '12px'
        button.textContent = 'Use'

        item.appendChild(textContainer)
        item.appendChild(button)
        reuseList.appendChild(item)
      }
    } else {
      reuseCard.style.display = 'none'
      reuseList.innerHTML = ''
    }

    if (saveBtn) {
      saveBtn.disabled = savingConnection
      saveBtn.textContent = savingConnection ? 'Adding...' : 'Save Connection'
    }
  } else {
    pendingCard.style.display = 'none'
    emptyCard.style.display = 'block'
    reuseCard.style.display = 'none'
    reuseList.innerHTML = ''
    if (saveBtn) {
      saveBtn.disabled = true
      saveBtn.textContent = 'Save Connection'
    }
  }
}

function scheduleFetchExistingConnections(company) {
  if (!config.token || !config.apiUrl) return
  if (company === lastCompanyQuery) return
  lastCompanyQuery = company

  if (companyFetchTimer) {
    clearTimeout(companyFetchTimer)
  }

  companyFetchTimer = setTimeout(() => {
    fetchExistingConnections(company)
  }, 400)
}

function fetchExistingConnections(company) {
  if (companyFetchController) {
    companyFetchController.abort()
  }

  companyFetchController = new AbortController()
  fetch(`${config.apiUrl}/api/connections?company=${encodeURIComponent(company)}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
    signal: companyFetchController.signal,
  })
    .then((response) => response.json())
    .then((data) => {
      existingConnections = Array.isArray(data)
        ? data
        : Array.isArray(data.data)
          ? data.data
          : (data.items || [])
      updateUI()
    })
    .catch((error) => {
      if (error.name === 'AbortError') return
      existingConnections = []
      updateUI()
    })
}

document.addEventListener('DOMContentLoaded', () => {
  loadState()

  document.getElementById('open-link-btn').addEventListener('click', () => {
    const apiUrl = document.getElementById('api-url').value.trim()
    if (!apiUrl) {
      alert('Please set API URL')
      return
    }

    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { apiUrl },
    })

    const linkUrl = `${apiUrl}/dashboard/extension`
    chrome.tabs.create({ url: linkUrl })
  })

  document.getElementById('save-token-btn').addEventListener('click', () => {
    const apiUrl = document.getElementById('api-url').value.trim()
    const token = document.getElementById('token-input').value.trim()

    if (!apiUrl || !token) {
      alert('API URL and token are required')
      return
    }

    chrome.runtime.sendMessage({
      type: 'UPDATE_CONFIG',
      config: { apiUrl },
    })

    chrome.runtime.sendMessage({ type: 'SET_TOKEN', token }, () => {
      fetch(`${apiUrl}/api/extension/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).finally(() => {
        config.apiUrl = apiUrl
        config.token = token
        updateUI()
      })
    })
  })

  document.getElementById('clear-pending-btn').addEventListener('click', () => {
    chrome.storage.local.remove(['pendingConnection'], () => {
      pendingConnection = null
      selectedSource = null
      existingConnections = []
      updateUI()
    })
  })

  document.getElementById('save-connection-btn').addEventListener('click', () => {
    if (savingConnection) return
    if (!config.token) {
      alert('Extension is not connected yet.')
      return
    }

    const apiUrlInput = document.getElementById('api-url')
    const apiUrl = (apiUrlInput ? apiUrlInput.value.trim() : '') || config.apiUrl
    const name = document.getElementById('pending-name').value.trim()
    const role = document.getElementById('pending-role').value.trim()
    const company = document.getElementById('pending-company').value.trim()
    const profileUrl = document.getElementById('pending-profile').value.trim()
    const jobTitle = document.getElementById('pending-job-title').value.trim()
    const jobUrl = document.getElementById('pending-job-url').value.trim()
    const notes = document.getElementById('pending-notes').value.trim()

    if (!apiUrl) {
      alert('API URL is required.')
      return
    }

    if (!name || !role || !company) {
      alert('Name, role, and company are required.')
      return
    }

    const payload = selectedSource
      ? {
        name,
        role,
        profileUrl: profileUrl || undefined,
        sourceConnectionId: selectedSource.id,
        connectionSentAt: selectedSource.connectionSentAt || undefined,
      }
      : {
        name,
        role,
        company,
        profileUrl: profileUrl || undefined,
        jobTitle: jobTitle || undefined,
        jobUrl: jobUrl || undefined,
        notes: notes || undefined,
        connectionSentAt: pendingConnection?.connectionSentAt || undefined,
      }

    savingConnection = true
    updateUI()

    fetch(`${apiUrl}/api/connections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        let data = null
        try {
          data = await response.json()
        } catch {
          // Invalid JSON, data remains null
        }
        if (!response.ok) {
          throw new Error(data?.error || `Failed to save connection (${response.status})`)
        }
        return data
      })
      .then(() => {
        chrome.storage.local.remove(['pendingConnection'], () => {
          pendingConnection = null
          selectedSource = null
          savingConnection = false
          updateUI()
        })
      })
      .catch((error) => {
        savingConnection = false
        updateUI()
        alert(`Failed to save connection: ${error.message}`)
      })
  })

  document.getElementById('reuse-list').addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.classList.contains('reuse-btn')) return
    const id = target.getAttribute('data-id')
    if (!id) return
    const match = existingConnections.find((conn) => String(conn.id) === id)
    if (!match) return
    selectedSource = match
    updateUI()
  })

  document.getElementById('clear-reuse-btn').addEventListener('click', () => {
    selectedSource = null
    updateUI()
  })

  document.getElementById('check-acceptances-btn').addEventListener('click', () => {
    const statusEl = document.getElementById('acceptance-status')
    const listEl = document.getElementById('acceptance-list')
    statusEl.style.display = 'block'
    statusEl.className = 'status'
    statusEl.textContent = 'Checking LinkedIn notifications...'
    listEl.innerHTML = ''

    chrome.runtime.sendMessage({ type: 'CHECK_ACCEPTANCES' }, (response) => {
      if (!response || !response.success) {
        statusEl.className = 'status disconnected'
        statusEl.textContent = response?.error || 'Failed to check acceptances'
        return
      }

      const updated = response.updated || 0
      const matched = response.matched || 0
      const autoGenerated = response.autoGenerated || 0
      const autoDraftSkipped = response.autoDraftSkipped || 0
      statusEl.className = 'status connected'
      statusEl.textContent = `Matched ${matched} acceptance(s), updated ${updated}, drafts generated ${autoGenerated}${autoDraftSkipped ? ` (skipped ${autoDraftSkipped})` : ''}.`

      const matchedConnections = response.matchedConnections || []
      const draftByConnectionId = new Map()
      const autoGeneratedDrafts = Array.isArray(response.autoGeneratedDrafts)
        ? response.autoGeneratedDrafts
        : []
      for (const draft of autoGeneratedDrafts) {
        if (!draft || !draft.connectionId) continue
        draftByConnectionId.set(String(draft.connectionId), draft)
      }

      if (!matchedConnections.length) {
        listEl.innerHTML = ''
        return
      }

      listEl.innerHTML = ''
      for (const item of matchedConnections) {
        const li = document.createElement('li')
        li.style.marginBottom = '6px'
        li.style.fontSize = '12px'
        li.style.display = 'flex'
        li.style.justifyContent = 'space-between'
        li.style.alignItems = 'center'
        li.style.gap = '8px'

        const span = document.createElement('span')
        span.style.display = 'flex'
        span.style.flexDirection = 'column'
        span.style.gap = '4px'
        const name = item.name || 'Unknown'
        const url = item.profileUrl || ''
        const title = document.createElement('span')
        title.textContent = url ? `${name} - ${url}` : name
        span.appendChild(title)

        const draft = draftByConnectionId.get(String(item.id))
        if (draft && draft.preview) {
          const preview = document.createElement('span')
          preview.style.color = '#334155'
          preview.style.fontSize = '11px'
          preview.textContent = `Draft: ${draft.preview}`
          span.appendChild(preview)
        }

        const button = document.createElement('button')
        button.className = 'reply-btn'
        button.setAttribute('data-id', String(item.id))
        button.style.width = 'auto'
        button.style.padding = '4px 8px'
        button.style.fontSize = '12px'
        button.textContent = draft ? 'Open Draft' : 'Reply'

        li.appendChild(span)
        li.appendChild(button)
        listEl.appendChild(li)
      }
    })
  })

  document.getElementById('acceptance-list').addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.classList.contains('reply-btn')) return
    const id = target.getAttribute('data-id')
    if (!id) return
    const apiUrl = config.apiUrl || document.getElementById('api-url')?.value?.trim()
    if (!apiUrl) {
      alert('API URL is required.')
      return
    }
    chrome.tabs.create({ url: `${apiUrl}/dashboard/connections/${id}` })
  })

  document.getElementById('relink-btn').addEventListener('click', () => {
    const apiUrl = config.apiUrl || document.getElementById('api-url')?.value?.trim()
    if (!apiUrl) {
      alert('API URL is required.')
      return
    }
    chrome.tabs.create({ url: `${apiUrl}/dashboard/extension` })
  })

  document.getElementById('unlink-btn').addEventListener('click', () => {
    chrome.storage.local.set({ config: { ...config, token: null, linkedAt: null } }, () => {
      config.token = null
      config.linkedAt = null
      updateUI()
    })
  })

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    if (changes.pendingConnection) {
      pendingConnection = changes.pendingConnection.newValue || null
      updateUI()
    }
    if (changes.config) {
      config = changes.config.newValue || config
      updateUI()
    }
  })
})
