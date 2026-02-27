const CLIENT_ID_42 = "u-s4t2ud-fb5c8ab5f298bd248c77aad39dc055b6fee79807f8318f579cfc93148593f7d7";
const AUTH_WORKER_URL = "https://42-exam-tracker-pro.devbyedd.workers.dev";
const CACHE_DURATION = 300000;
const CURSUS_ID_42 = 21;
const API_DELAY_MS = 600;

let globalQueue = Promise.resolve();
let pendingNewUsers = new Set();

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("refreshData", { periodInMinutes: 5 });
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
  if (request.action === "validateAndAddUser") {
    validateAndAddUser(request.login, request.storageKey).then(sendResponse);
    return true;
  }
  if (request.action === "forceRefresh") {
    refreshAllData(true);
    sendResponse({ success: true });
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync") {
    if (changes.friends) {
      const oldList = changes.friends.oldValue || [];
      const newList = changes.friends.newValue || [];
      const addedUsers = newList.filter(u => !oldList.includes(u));
      const usersToFetch = addedUsers.filter(u => !pendingNewUsers.has(u));
      fetchNewUsers(usersToFetch, 'full');
    }
    if (changes.exam_users) {
      const oldList = changes.exam_users.oldValue || [];
      const newList = changes.exam_users.newValue || [];
      const addedUsers = newList.filter(u => !oldList.includes(u));
      chrome.storage.sync.get(['friends'], (res) => {
        const friends = res.friends || [];
        const examOnlyUsers = addedUsers.filter(u => !friends.includes(u) && !pendingNewUsers.has(u));
        fetchNewUsers(examOnlyUsers, 'exam_only');
      });
    }
  }
});

async function validateAndAddUser(login, storageKey) {
  const tokenRes = await chrome.storage.local.get(['access_token']);
  if (!tokenRes.access_token) return { success: false, error: "No token" };

  try {
    const req = await fetch(`https://api.intra.42.fr/v2/users/${login}`, {
      headers: { "Authorization": `Bearer ${tokenRes.access_token}` }
    });

    if (req.status === 404) return { success: false, error: "User does not exist" };
    if (req.status === 401) {
      await chrome.storage.local.remove('access_token');
      return { success: false, error: "Token expired" };
    }
    if (!req.ok) return { success: false, error: "API error" };

    const profile = await req.json();

    const cacheKey = `data_${login}`;
    const result = {
      timestamp: Date.now(),
      status: 'success',
      image: profile.image?.versions?.small || profile.image?.link,
      location: profile.location,
      correction_point: profile.correction_point,
      level: profile.cursus_users?.find(c => c.cursus_id === CURSUS_ID_42)?.level || 0,
      active_projects: [],
      exam_project: null
    };

    const projectsReq = await fetch(`https://api.intra.42.fr/v2/users/${login}/projects_users?page[size]=100`, {
      headers: { "Authorization": `Bearer ${tokenRes.access_token}` }
    });

    if (projectsReq.ok) {
      const projects = await projectsReq.json();
      processProjects(projects, result);
    }

    await chrome.storage.local.set({ [cacheKey]: result });

    pendingNewUsers.add(login);
    setTimeout(() => pendingNewUsers.delete(login), CACHE_DURATION);

    return { success: true };
  } catch (e) {
    return { success: false, error: "Connection Error" };
  }
}

function processProjects(projects, result) {
  const exam = projects
    .filter(p => p.project.name.includes("Exam Rank"))
    .sort((a, b) => b.project.name.localeCompare(a.project.name))[0];

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
    p.cursus_ids?.includes(CURSUS_ID_42) &&
    !p.project.name.includes("Exam Rank")
  ).map(p => ({
    name: p.project.name,
    created_at: p.created_at
  }));
}

function fetchNewUsers(logins, type) {
  if (!logins || logins.length === 0) return;

  chrome.storage.local.get(['access_token'], (tokenRes) => {
    if (!tokenRes.access_token) return;
    logins.forEach(login => {
      queueFetch(login, type, tokenRes.access_token, true);
    });
  });
}

function refreshAllData(forceRefresh = false) {
  chrome.storage.local.get(['access_token'], (tokenRes) => {
    if (!tokenRes.access_token) return;
    chrome.storage.sync.get(['friends', 'exam_users'], (res) => {
      const friends = res.friends || [];
      const examUsers = res.exam_users || [];

      const allUsers = [...new Set([...friends, ...examUsers])];

      allUsers.forEach(login => {
        if (!forceRefresh && pendingNewUsers.has(login)) return;

        const isFriend = friends.includes(login);
        queueFetch(login, isFriend ? 'full' : 'exam_only', tokenRes.access_token, forceRefresh);
      });
    });
  });
}

function queueFetch(login, type, token, forceRefresh = false) {
  globalQueue = globalQueue.then(async () => {
    await fetchDataForUser(login, type, token, forceRefresh);
    await new Promise(r => setTimeout(r, API_DELAY_MS));
  });
}

async function fetchDataForUser(login, type, token, forceRefresh = false) {
  const cacheKey = `data_${login}`;
  const cachedContainer = await chrome.storage.local.get([cacheKey]);
  const cached = cachedContainer[cacheKey] || {};

  if (cached.level === undefined) {
    type = 'full';
  }

  if (!forceRefresh && cached.timestamp && (Date.now() - cached.timestamp < CACHE_DURATION)) {
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
        result.level = profile.cursus_users?.find(c => c.cursus_id === CURSUS_ID_42)?.level || 0;
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
      processProjects(projects, result);
    }

    await chrome.storage.local.set({ [cacheKey]: result });
  } catch (e) {
    console.error(`Failed to fetch data for ${login}:`, e);
  }
}

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