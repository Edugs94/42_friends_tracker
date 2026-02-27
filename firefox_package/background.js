const CLIENT_ID_42 = "u-s4t2ud-fb5c8ab5f298bd248c77aad39dc055b6fee79807f8318f579cfc93148593f7d7";
const AUTH_WORKER_URL = "https://42-exam-tracker-pro.devbyedd.workers.dev";
const CACHE_DURATION = 50000;
const CURSUS_ID_42 = 21;

let globalQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("refreshData", { periodInMinutes: 1 });
  chrome.alarms.create("autoClearExam", { periodInMinutes: 480 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshData") {
    refreshAllData();
  } else if (alarm.name === "autoClearExam") {
    chrome.storage.sync.set({ exam_users: [] });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "login") {
    launchAuthFlow(sendResponse);
    return true;
  }
  if (request.action === "validateUser") {
    validateUserExists(request.login).then(sendResponse);
    return true;
  }
  if (request.action === "forceRefresh") {
    refreshAllData();
    sendResponse({ success: true });
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && (changes.friends || changes.exam_users)) {
    refreshAllData();
  }
});

async function launchAuthFlow(sendResponse) {
  try {
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID_42}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (redirectUrl) => {
      if (chrome.runtime.lastError || !redirectUrl) {
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
        refreshAllData();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Worker refused login" });
      }
    });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function validateUserExists(login) {
  const tokenRes = await chrome.storage.local.get(['access_token']);
  if (!tokenRes.access_token) return { valid: false, error: "No token" };

  try {
    const req = await fetch(`https://api.intra.42.fr/v2/users/${login}`, {
      headers: { "Authorization": `Bearer ${tokenRes.access_token}` }
    });
    if (req.status === 404) return { valid: false, error: "User does not exist" };
    if (req.status === 401) {
      await chrome.storage.local.remove('access_token');
      return { valid: false, error: "Token expired" };
    }
    return { valid: req.ok };
  } catch (e) {
    return { valid: false, error: "Connection Error" };
  }
}

function refreshAllData() {
  chrome.storage.local.get(['access_token'], (tokenRes) => {
    if (!tokenRes.access_token) return;
    chrome.storage.sync.get(['friends', 'exam_users'], (res) => {
      const friends = res.friends || [];
      const examUsers = res.exam_users || [];
      const allUsers = [...new Set([...friends, ...examUsers])];
      
      allUsers.forEach(login => {
        const isFull = friends.includes(login);
        queueFetch(login, isFull ? 'full' : 'exam_only', tokenRes.access_token);
      });
    });
  });
}

function queueFetch(login, type, token) {
  globalQueue = globalQueue.then(async () => {
    await fetchDataForUser(login, type, token);
    await new Promise(r => setTimeout(r, 600));
  });
}

async function fetchDataForUser(login, type, token) {
  const cacheKey = `data_${login}`;
  const cachedContainer = await chrome.storage.local.get([cacheKey]);
  const cached = cachedContainer[cacheKey] || {};

  if (cached.level === undefined) {
    type = 'full';
  }

  if (cached.timestamp && (Date.now() - cached.timestamp < CACHE_DURATION)) {
    if (type !== 'full' || cached.level !== undefined) {
      return;
    }
  }

  try {
    const result = { ...cached, timestamp: Date.now(), status: 'success' };

    if (type === 'full') {
      const profileReq = await fetch(`https://api.intra.42.fr/v2/users/${login}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (profileReq.ok) {
        const profile = await profileReq.json();
        result.image = profile.image?.versions?.small || profile.image?.link;
        result.location = profile.location;
        result.correction_point = profile.correction_point;
        result.level = profile.cursus_users.find(c => c.cursus_id === CURSUS_ID_42)?.level || 0;
      } else if (profileReq.status === 401) {
        await chrome.storage.local.remove('access_token');
        return;
      }
    }

    const projectsReq = await fetch(`https://api.intra.42.fr/v2/users/${login}/projects_users?page[size]=100`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (projectsReq.ok) {
      const projects = await projectsReq.json();
      const exam = projects.filter(p => p.project.name.includes("Exam Rank")).sort((a,b) => b.project.name.localeCompare(a.project.name))[0];
      
      if (exam && exam.status === "in_progress" && exam['validated?'] !== true) {
        result.exam_project = exam.project.name;
        result.exam_mark = null;
        if (exam.current_team_id && exam.teams) {
          const currentTeam = exam.teams.find(t => t.id === exam.current_team_id);
          if (currentTeam) result.exam_mark = currentTeam.final_mark;
        }
      } else {
        result.exam_project = null;
      }

      result.active_projects = projects.filter(p =>
        p.status !== 'finished' &&
        p.cursus_ids.includes(CURSUS_ID_42) &&
        !p.project.name.includes("Exam Rank")
      ).map(p => ({
        name: p.project.name,
        created_at: p.created_at
      }));
    }

    await chrome.storage.local.set({ [cacheKey]: result });
  } catch (e) {}
}