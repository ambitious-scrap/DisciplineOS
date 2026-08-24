// Background service worker for DisciplineOS Focus Shield Extension (Manifest V3)

const SERVER_URL = 'http://localhost:3000';
let activeLeases = new Map();

async function updateDynamicRules(blockedDomains) {
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = currentRules.map(r => r.id);

  const addRules = blockedDomains.map((domain, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: {
        extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}`
      }
    },
    condition: {
      urlFilter: `||${domain}`,
      resourceTypes: ['main_frame']
    }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
  console.log(`[DisciplineOS] Active declarativeNetRequest rules updated: ${addRules.length} domains`);
}

// Periodic policy sync from local server / storage
async function syncPolicy() {
  try {
    const data = await chrome.storage.local.get(['blockedDomains', 'authToken']);
    const domains = data.blockedDomains || ['reddit.com', 'youtube.com', 'x.com', 'twitter.com', 'instagram.com'];
    await updateDynamicRules(domains);
  } catch (err) {
    console.error('[DisciplineOS] Sync error:', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[DisciplineOS Extension] Installed');
  syncPolicy();
});

chrome.runtime.onStartup.addListener(() => {
  syncPolicy();
});
