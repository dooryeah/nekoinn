(function () {
    const auth = window.NekoinnAuth;
    const loadingState = document.getElementById("memberLoading");
    const setupState = document.getElementById("memberSetup");
    const guestState = document.getElementById("memberGuest");
    const deniedState = document.getElementById("memberDenied");
    const contentState = document.getElementById("memberContent");
    const deniedEmail = document.getElementById("deniedEmail");
    const profileName = document.getElementById("profileName");
    const profileEmail = document.getElementById("profileEmail");
    const profileEmailFact = document.getElementById("profileEmailFact");
    const profileMinecraft = document.getElementById("profileMinecraft");
    const profileRole = document.getElementById("profileRole");
    const profileAvatar = document.getElementById("profileAvatar");
    const checkinButton = document.getElementById("checkinButton");
    const checkinStatus = document.getElementById("checkinStatus");
    const checkinTotal = document.getElementById("checkinTotal");
    const rankingList = document.getElementById("rankingList");
    const rankingEmpty = document.getElementById("rankingEmpty");

    function showOnly(target) {
        [loadingState, setupState, guestState, deniedState, contentState].forEach((el) => {
            if (el) el.hidden = el !== target;
        });
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getAvatar(profile) {
        if (profile.avatar_url) return profile.avatar_url;
        if (profile.minecraft_name) return "https://mc-heads.net/avatar/" + encodeURIComponent(profile.minecraft_name);
        return "./images/logo.png";
    }

    function renderProfile(profile, user) {
        const displayName = profile.nickname || profile.minecraft_name || user.email;
        if (profileName) profileName.textContent = displayName;
        if (profileEmail) profileEmail.textContent = user.email || "";
        if (profileEmailFact) profileEmailFact.textContent = user.email || "-";
        if (profileMinecraft) profileMinecraft.textContent = profile.minecraft_name || "未填写";
        if (profileRole) profileRole.textContent = profile.role || "member";

        if (profileAvatar) {
            profileAvatar.src = getAvatar(profile);
            profileAvatar.alt = displayName;
        }
    }

    function firstRow(data) {
        if (Array.isArray(data)) return data[0] || null;
        return data || null;
    }

    function renderCheckinStatus(status) {
        const total = Number(status && status.total_count ? status.total_count : 0);
        const checkedInToday = Boolean(status && status.checked_in_today);

        if (checkinButton) {
            checkinButton.disabled = checkedInToday;
            checkinButton.textContent = checkedInToday ? "今日已签到" : "今日签到";
        }
        if (checkinStatus) {
            checkinStatus.textContent = checkedInToday ? "今天已经签到啦。" : "今天还没有签到。";
        }
        if (checkinTotal) {
            checkinTotal.textContent = "累计签到 " + total + " 天";
        }
    }

    function formatDate(value) {
        if (!value) return "暂无";
        return String(value).replace(/-/g, ".");
    }

    function renderRanking(rows) {
        if (!rankingList) return;
        rankingList.innerHTML = "";

        if (!rows || rows.length === 0) {
            if (rankingEmpty) rankingEmpty.hidden = false;
            return;
        }

        if (rankingEmpty) rankingEmpty.hidden = true;
        rows.forEach((row) => {
            const item = document.createElement("div");
            item.className = "ranking-item";
            const avatar = row.avatar_url ||
                (row.minecraft_name ? "https://mc-heads.net/avatar/" + encodeURIComponent(row.minecraft_name) : "./images/logo.png");
            const todayText = row.checked_in_today ? '<span class="ranking-chip">今日已签</span>' : "";

            item.innerHTML = `
                <div class="ranking-position">#${escapeHtml(row.position)}</div>
                <img class="ranking-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(row.display_name)}">
                <div class="ranking-main">
                    <div class="ranking-name">${escapeHtml(row.display_name)}</div>
                    <div class="ranking-meta">累计 ${escapeHtml(row.total_count)} 天 · 最近 ${escapeHtml(formatDate(row.last_checkin_date))}</div>
                </div>
                ${todayText}
            `;
            rankingList.appendChild(item);
        });
    }

    async function loadCheckinStatus() {
        const { data, error } = await auth.client.rpc("get_my_checkin_status");
        if (error) {
            if (checkinStatus) checkinStatus.textContent = "签到状态读取失败：" + error.message;
            if (checkinButton) checkinButton.disabled = true;
            return;
        }
        renderCheckinStatus(firstRow(data));
    }

    async function loadRanking() {
        const { data, error } = await auth.client.rpc("get_checkin_leaderboard", { limit_count: 30 });
        if (error) {
            if (rankingEmpty) {
                rankingEmpty.hidden = false;
                rankingEmpty.textContent = "排行榜读取失败：" + error.message;
            }
            return;
        }
        renderRanking(data || []);
    }

    async function checkIn() {
        if (!checkinButton) return;
        checkinButton.disabled = true;
        checkinButton.textContent = "签到中...";
        if (checkinStatus) checkinStatus.textContent = "正在记录今日签到...";

        const { data, error } = await auth.client.rpc("check_in_member");
        if (error) {
            checkinButton.disabled = false;
            checkinButton.textContent = "今日签到";
            if (checkinStatus) checkinStatus.textContent = "签到失败：" + error.message;
            return;
        }

        renderCheckinStatus(firstRow(data));
        await loadRanking();
    }

    async function init() {
        showOnly(loadingState);

        if (!auth || !auth.isConfigured) {
            showOnly(setupState);
            return;
        }

        const { session, error } = await auth.getSession();
        if (error || !session || !session.user) {
            showOnly(guestState);
            return;
        }

        const { profile, error: profileError } = await auth.getWhitelistProfile(session.user);
        if (profileError || !profile) {
            if (deniedEmail) deniedEmail.textContent = session.user.email || "";
            showOnly(deniedState);
            return;
        }

        renderProfile(profile, session.user);
        showOnly(contentState);
        await Promise.all([loadCheckinStatus(), loadRanking()]);
    }

    if (checkinButton) {
        checkinButton.addEventListener("click", checkIn);
    }

    document.querySelectorAll("[data-sign-out]").forEach((button) => {
        button.addEventListener("click", () => auth.signOut());
    });

    init();
})();
