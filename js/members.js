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
    const profileLevelBadge = document.getElementById("profileLevelBadge");
    const profileLevelText = document.getElementById("profileLevelText");
    const profileLevelBar = document.getElementById("profileLevelBar");
    const profileSignatureText = document.getElementById("profileSignatureText");
    const profileBackgroundPreview = document.getElementById("profileBackgroundPreview");
    const profileBackgroundEmpty = document.getElementById("profileBackgroundEmpty");
    const profileEditForm = document.getElementById("profileEditForm");
    const profileSignatureInput = document.getElementById("profileSignatureInput");
    const profileBackgroundInput = document.getElementById("profileBackgroundInput");
    const profileFileName = document.getElementById("profileFileName");
    const profileSaveButton = document.getElementById("profileSaveButton");
    const profileClearBackgroundButton = document.getElementById("profileClearBackgroundButton");
    const profileEditStatus = document.getElementById("profileEditStatus");
    const checkinButton = document.getElementById("checkinButton");
    const checkinStatus = document.getElementById("checkinStatus");
    const checkinTotal = document.getElementById("checkinTotal");
    const rankingList = document.getElementById("rankingList");
    const rankingEmpty = document.getElementById("rankingEmpty");
    const backgroundBucket = "member-backgrounds";
    const maxBackgroundSize = 4 * 1024 * 1024;
    let currentUser = null;
    let currentProfile = null;
    let selectedBackgroundFile = null;
    let selectedPreviewUrl = "";
    let removeBackground = false;

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

    function applyAvatar(image, profile) {
        if (!image) return;
        if (window.NekoinnAvatars) {
            window.NekoinnAvatars.apply(image, profile.minecraft_name, profile.avatar_url);
            return;
        }
        image.src = getAvatar(profile);
    }

    function levelInfo(experience) {
        const totalExp = Math.max(0, Math.floor(Number(experience) || 0));
        let level = 1;
        let spent = 0;
        let nextNeed = 50;

        while (level < 16 && totalExp >= spent + nextNeed) {
            spent += nextNeed;
            level += 1;
            nextNeed = Math.ceil(nextNeed * 1.2);
        }

        if (level >= 16) {
            return {
                level: 16,
                totalExp,
                currentExp: totalExp - spent,
                nextNeed: 0,
                progress: 100,
                capped: true,
            };
        }

        return {
            level,
            totalExp,
            currentExp: totalExp - spent,
            nextNeed,
            progress: nextNeed > 0 ? Math.max(0, Math.min(100, ((totalExp - spent) / nextNeed) * 100)) : 100,
            capped: false,
        };
    }

    function levelColor(level) {
        const start = { r: 143, g: 216, b: 255 };
        const end = { r: 244, g: 163, b: 199 };
        const ratio = Math.max(0, Math.min(1, (Number(level) - 1) / 15));
        const channel = (key) => Math.round(start[key] + (end[key] - start[key]) * ratio);
        return "rgb(" + channel("r") + ", " + channel("g") + ", " + channel("b") + ")";
    }

    function renderLevel(experience) {
        const info = levelInfo(experience);
        const color = levelColor(info.level);
        if (profileLevelBadge) {
            profileLevelBadge.textContent = "Lv" + info.level;
            profileLevelBadge.style.setProperty("--level-color", color);
        }
        if (profileLevelText) {
            profileLevelText.textContent = info.capped
                ? info.totalExp + " EXP"
                : info.currentExp + " / " + info.nextNeed + " EXP";
        }
        if (profileLevelBar) {
            profileLevelBar.style.width = info.progress + "%";
            profileLevelBar.style.setProperty("--level-color", color);
        }
    }

    function getBackgroundUrl(backgroundPath) {
        if (!backgroundPath || !auth || !auth.client) return "";
        const { data } = auth.client.storage.from(backgroundBucket).getPublicUrl(backgroundPath);
        return data && data.publicUrl ? data.publicUrl : "";
    }

    function setProfileEditStatus(message, tone) {
        if (!profileEditStatus) return;
        profileEditStatus.textContent = message || "";
        profileEditStatus.className = "member-muted profile-edit-status";
        if (tone) profileEditStatus.classList.add(tone);
    }

    function renderBackground(backgroundPath) {
        const backgroundUrl = getBackgroundUrl(backgroundPath);
        if (!profileBackgroundPreview) return;
        revokeSelectedPreview();

        if (backgroundUrl) {
            profileBackgroundPreview.style.backgroundImage = "url('" + backgroundUrl.replace(/'/g, "\\'") + "')";
            profileBackgroundPreview.classList.add("has-background");
            if (profileBackgroundEmpty) profileBackgroundEmpty.hidden = true;
            return;
        }

        profileBackgroundPreview.style.backgroundImage = "";
        profileBackgroundPreview.classList.remove("has-background");
        if (profileBackgroundEmpty) profileBackgroundEmpty.hidden = false;
    }

    function revokeSelectedPreview() {
        if (!selectedPreviewUrl) return;
        URL.revokeObjectURL(selectedPreviewUrl);
        selectedPreviewUrl = "";
    }

    function renderProfile(profile, user) {
        const displayName = profile.nickname || profile.minecraft_name || user.email;
        if (profileName) profileName.textContent = displayName;
        if (profileEmail) profileEmail.textContent = user.email || "";
        if (profileEmailFact) profileEmailFact.textContent = user.email || "-";
        if (profileMinecraft) profileMinecraft.textContent = profile.minecraft_name || "未填写";
        if (profileRole) profileRole.textContent = profile.role || "member";
        renderLevel(profile.experience_points);

        if (profileAvatar) {
            applyAvatar(profileAvatar, profile);
            profileAvatar.alt = displayName;
        }

        if (profileSignatureText) {
            profileSignatureText.textContent = profile.signature || "还没有签名。";
            profileSignatureText.classList.toggle("is-empty", !profile.signature);
        }
        if (profileSignatureInput) {
            profileSignatureInput.value = profile.signature || "";
        }
        renderBackground(profile.background_path);
    }

    function firstRow(data) {
        if (Array.isArray(data)) return data[0] || null;
        return data || null;
    }

    function renderCheckinStatus(status) {
        const total = Number(status && status.total_count ? status.total_count : 0);
        const checkedInToday = Boolean(status && status.checked_in_today);
        if (status && Object.prototype.hasOwnProperty.call(status, "experience_points")) {
            const nextExperience = Number(status.experience_points || 0);
            if (currentProfile) currentProfile.experience_points = nextExperience;
            renderLevel(nextExperience);
        }

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
            const avatar = "./images/logo.png";
            const todayText = row.checked_in_today ? '<span class="ranking-chip">今日已签</span>' : "";

            item.innerHTML = `
                <div class="ranking-position">#${escapeHtml(row.rank_position)}</div>
                <img class="ranking-avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(row.display_name)}">
                <div class="ranking-main">
                    <div class="ranking-name">${escapeHtml(row.display_name)}</div>
                    <div class="ranking-meta">累计 ${escapeHtml(row.total_count)} 天 · 最近 ${escapeHtml(formatDate(row.last_checkin_date))}</div>
                </div>
                ${todayText}
            `;
            applyAvatar(item.querySelector(".ranking-avatar"), row);
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

    function getBackgroundExtension(file) {
        const extension = String(file.name || "").split(".").pop().toLowerCase();
        if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
            return extension === "jpeg" ? "jpg" : extension;
        }

        const typeMap = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
        };
        return typeMap[file.type] || "";
    }

    function validateBackgroundFile(file) {
        if (!file) return "";
        if (!file.type || !file.type.startsWith("image/")) {
            return "请选择图片文件。";
        }
        if (file.size > maxBackgroundSize) {
            return "图片不能超过 4MB。";
        }
        if (!getBackgroundExtension(file)) {
            return "仅支持 PNG、JPG、WebP 或 GIF。";
        }
        return "";
    }

    function userStorageFolder() {
        return String(currentUser && currentUser.email ? currentUser.email : "").trim().toLowerCase();
    }

    async function uploadBackground(file) {
        const folder = userStorageFolder();
        if (!folder) throw new Error("无法确认当前登录邮箱。");

        const extension = getBackgroundExtension(file);
        const path = folder + "/background-" + Date.now() + "." + extension;
        const { error } = await auth.client.storage
            .from(backgroundBucket)
            .upload(path, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type || "image/" + extension,
            });

        if (error) throw error;
        return path;
    }

    async function removeOldBackground(path) {
        const folder = userStorageFolder();
        if (!path || !folder || !path.startsWith(folder + "/")) return;
        const { error } = await auth.client.storage.from(backgroundBucket).remove([path]);
        if (error) {
            console.warn("Old background cleanup failed:", error.message);
        }
    }

    function setProfileSaving(isSaving) {
        if (profileSaveButton) {
            profileSaveButton.disabled = isSaving;
            profileSaveButton.textContent = isSaving ? "保存中..." : "保存资料";
        }
        if (profileClearBackgroundButton) {
            profileClearBackgroundButton.disabled = isSaving;
        }
    }

    async function saveProfile(event) {
        event.preventDefault();
        if (!currentProfile || !currentUser) return;

        const signature = String(profileSignatureInput && profileSignatureInput.value ? profileSignatureInput.value : "").trim();
        const validationMessage = validateBackgroundFile(selectedBackgroundFile);
        if (validationMessage) {
            setProfileEditStatus(validationMessage, "error");
            return;
        }

        setProfileSaving(true);
        setProfileEditStatus("正在保存资料...");

        let uploadedBackgroundPath = "";
        try {
            const previousBackgroundPath = currentProfile.background_path || null;
            let nextBackgroundPath = removeBackground ? null : (currentProfile.background_path || null);
            if (selectedBackgroundFile) {
                setProfileEditStatus("正在上传背景图...");
                nextBackgroundPath = await uploadBackground(selectedBackgroundFile);
                uploadedBackgroundPath = nextBackgroundPath;
            }

            const { data, error } = await auth.client.rpc("update_my_profile", {
                new_signature: signature || null,
                new_background_path: nextBackgroundPath,
            });

            if (error) throw error;

            currentProfile = Object.assign({}, currentProfile, firstRow(data) || {
                signature: signature || null,
                background_path: nextBackgroundPath,
            });

            selectedBackgroundFile = null;
            removeBackground = false;
            if (profileBackgroundInput) profileBackgroundInput.value = "";
            if (profileFileName) profileFileName.textContent = "支持 PNG/JPG/WebP/GIF，最大 4MB";
            renderProfile(currentProfile, currentUser);
            if (previousBackgroundPath && previousBackgroundPath !== nextBackgroundPath) {
                await removeOldBackground(previousBackgroundPath);
            }
            setProfileEditStatus("资料已保存。", "success");
        } catch (error) {
            if (uploadedBackgroundPath) {
                await removeOldBackground(uploadedBackgroundPath);
            }
            setProfileEditStatus("保存失败：" + error.message, "error");
        } finally {
            setProfileSaving(false);
        }
    }

    function handleBackgroundSelection(event) {
        const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
        selectedBackgroundFile = file;
        removeBackground = false;

        if (!file) {
            if (profileFileName) profileFileName.textContent = "支持 PNG/JPG/WebP/GIF，最大 4MB";
            renderBackground(currentProfile && currentProfile.background_path);
            return;
        }

        const validationMessage = validateBackgroundFile(file);
        if (profileFileName) profileFileName.textContent = file.name;
        if (validationMessage) {
            selectedBackgroundFile = null;
            if (profileBackgroundInput) profileBackgroundInput.value = "";
            renderBackground(currentProfile && currentProfile.background_path);
            setProfileEditStatus(validationMessage, "error");
            return;
        }

        if (profileBackgroundPreview) {
            revokeSelectedPreview();
            selectedPreviewUrl = URL.createObjectURL(file);
            profileBackgroundPreview.style.backgroundImage = "url('" + selectedPreviewUrl.replace(/'/g, "\\'") + "')";
            profileBackgroundPreview.classList.add("has-background");
            if (profileBackgroundEmpty) profileBackgroundEmpty.hidden = true;
        }
        setProfileEditStatus("已选择新背景图，点击保存后生效。");
    }

    function clearBackground() {
        selectedBackgroundFile = null;
        removeBackground = true;
        if (profileBackgroundInput) profileBackgroundInput.value = "";
        if (profileFileName) profileFileName.textContent = "已准备清除背景图";
        renderBackground("");
        setProfileEditStatus("点击保存资料后会清除背景图。");
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

        currentUser = session.user;
        currentProfile = profile;
        renderProfile(profile, session.user);
        showOnly(contentState);
        await Promise.all([loadCheckinStatus(), loadRanking()]);
    }

    if (checkinButton) {
        checkinButton.addEventListener("click", checkIn);
    }

    if (profileEditForm) {
        profileEditForm.addEventListener("submit", saveProfile);
    }

    if (profileBackgroundInput) {
        profileBackgroundInput.addEventListener("change", handleBackgroundSelection);
    }

    if (profileClearBackgroundButton) {
        profileClearBackgroundButton.addEventListener("click", clearBackground);
    }

    document.querySelectorAll("[data-sign-out]").forEach((button) => {
        button.addEventListener("click", () => auth.signOut());
    });

    init();
})();
