// CONFIGURATION
const CLIENT_ID_42 = "u-s4t2ud-fb5c8ab5f298bd248c77aad39dc055b6fee79807f8318f579cfc93148593f7d7";
const AUTH_WORKER_URL = "https://42-exam-tracker-pro.devbyedd.workers.dev";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "login") {
    launchAuthFlow(sendResponse);
    return true;
  }
});

async function launchAuthFlow(sendResponse) {
  try {
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID_42}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, async (redirectUrl) => {

      if (chrome.runtime.lastError || !redirectUrl) {
        console.error(chrome.runtime.lastError);
        sendResponse({ success: false, error: "User cancelled or error" });
        return;
      }

      const url = new URL(redirectUrl);
      const code = url.searchParams.get("code");

      const res = await fetch(AUTH_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirect_uri: redirectUri })
      });

      const data = await res.json();

      if (data.access_token) {
        await chrome.storage.local.set({ access_token: data.access_token });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Worker refused login" });
      }
    });

  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}