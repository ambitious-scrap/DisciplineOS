const params = new URLSearchParams(window.location.search);
const domain = params.get('domain') || 'Website';
document.getElementById('targetDomain').textContent = domain;

document.getElementById('goHomeBtn').addEventListener('click', () => {
  window.location.href = 'about:blank';
});

document.getElementById('unlock5mBtn').addEventListener('click', async () => {
  try {
    const res = await fetch('https://server-production-d646.up.railway.app/api/sessions/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seconds: 300,
        targetType: 'site',
        targetIdentifier: domain,
        deviceId: 'macos-macbook-air',
        idempotencyKey: `mac-unlock-${Date.now()}`
      })
    });
    if (res.ok) {
      window.location.href = `https://${domain}`;
    } else {
      alert('Unable to unlock: Insufficient balance or active session lock.');
    }
  } catch (e) {
    alert('Failed to connect to DisciplineOS server.');
  }
});

document.getElementById('emergencyBtn').addEventListener('click', async () => {
  if (!confirm('Emergency unlock will deduct 3x points (15 minutes). Proceed?')) return;
  try {
    const res = await fetch('https://server-production-d646.up.railway.app/api/sessions/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seconds: 300,
        targetType: 'site',
        targetIdentifier: domain,
        deviceId: 'macos-macbook-air',
        multiplier: 3.0,
        idempotencyKey: `mac-emergency-${Date.now()}`
      })
    });
    if (res.ok) {
      window.location.href = `https://${domain}`;
    }
  } catch (e) {
    alert('Failed to connect to DisciplineOS server.');
  }
});
