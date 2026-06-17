(function () {
    const auth = window.NekoinnAuth;
    const backgroundBucket = "member-backgrounds";
    const params = new URLSearchParams(window.location.search);
    const playerName = String(params.get("player") || "").trim();

    const loadingState = document.getElementById("publicProfileLoading");
    const setupState = document.getElementById("publicProfileSetup");
    const guestState = document.getElementById("publicProfileGuest");
    const deniedState = document.getElementById("publicProfileDenied");
    const missingState = document.getElementById("publicProfileMissing");
    const contentState = document.getElementById("publicProfileContent");
    const loginLink = document.getElementById("publicProfileLoginLink");
    const missingText = document.getElementById("publicProfileMissingText");
    const background = document.getElementById("publicProfileBackground");
    const backgroundEmpty = document.getElementById("publicProfileBackgroundEmpty");
    const avatar = document.getElementById("publicProfileAvatar");
    const profileName = document.getElementById("publicProfileName");
    const minecraftLine = document.getElementById("publicProfileMinecraftLine");
    const levelBadge = document.getElementById("publicProfileLevelBadge");
    const levelText = document.getElementById("publicProfileLevelText");
    const levelBar = document.getElementById("publicProfileLevelBar");
    const signature = document.getElementById("publicProfileSignature");
    const minecraft = document.getElementById("publicProfileMinecraft");
    const role = document.getElementById("publicProfileRole");
    const checkins = document.getElementById("publicProfileCheckins");
    const lastCheckin = document.getElementById("publicProfileLastCheckin");

    function showOnly(target) {
        [loadingState, setupState, guestState, deniedState, missingState, contentState].forEach((el) => {
            if (!el) return;
            el.hidden = el !== target;
        });
    }

    function getReturnTarget() {
        const fileName = window.location.pathname.split("/").pop() || "profile.html";
        return fileName + window.location.search + window.location.hash;
    }

    function getAvatar(profile) {
        if (profile.avatar_url) return profile.avatar_url;
        if (profile.minecraft_name) return "https://mc-heads.net/avatar/" + encodeURIComponent(profile.minecraft_name);
        return "./images/logo.png";
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
        if (levelBadge) {
            levelBadge.textContent = "Lv" + info.level;
            levelBadge.style.setProperty("--level-color", color);
        }
        if (levelText) {
            levelText.textContent = info.capped
                ? info.totalExp + " EXP"
                : info.currentExp + " / " + info.nextNeed + " EXP";
        }
        if (levelBar) {
            levelBar.style.width = info.progress + "%";
            levelBar.style.setProperty("--level-color", color);
        }
    }

    function getBackgroundUrl(backgroundPath) {
        if (!backgroundPath || !auth || !auth.client) return "";
        const { data } = auth.client.storage.from(backgroundBucket).getPublicUrl(backgroundPath);
        return data && data.publicUrl ? data.publicUrl : "";
    }

    function formatDate(value) {
        if (!value) return "-";
        const date = new Date(value + "T00:00:00+08:00");
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    }

    function firstRow(data) {
        if (Array.isArray(data)) return data[0] || null;
        return data || null;
    }

    function renderBackground(backgroundPath) {
        const backgroundUrl = getBackgroundUrl(backgroundPath);
        if (!background) return;

        if (backgroundUrl) {
            background.style.backgroundImage = "url('" + backgroundUrl.replace(/'/g, "\\'") + "')";
            background.classList.add("has-background");
            if (backgroundEmpty) backgroundEmpty.hidden = true;
            return;
        }

        background.style.backgroundImage = "";
        background.classList.remove("has-background");
        if (backgroundEmpty) backgroundEmpty.hidden = false;
    }

    function renderProfile(profile) {
        const displayName = profile.display_name || profile.minecraft_name || "成员";
        const minecraftName = profile.minecraft_name || "未填写";
        const totalCount = Number(profile.total_count || 0);

        document.title = displayName + " - 成员资料 - 喵宿咖啡厅";
        if (profileName) profileName.textContent = displayName;
        if (minecraftLine) minecraftLine.textContent = profile.minecraft_name ? "@" + profile.minecraft_name : "";
        if (minecraft) minecraft.textContent = minecraftName;
        if (role) role.textContent = profile.role || "member";
        if (checkins) checkins.textContent = totalCount + " 天";
        if (lastCheckin) lastCheckin.textContent = formatDate(profile.last_checkin_date);
        renderLevel(profile.experience_points);

        if (avatar) {
            avatar.src = getAvatar(profile);
            avatar.alt = displayName;
        }

        if (signature) {
            signature.textContent = profile.signature || "还没有签名。";
            signature.classList.toggle("is-empty", !profile.signature);
        }

        renderBackground(profile.background_path);
        showOnly(contentState);
    }

    async function init() {
        if (loginLink) {
            loginLink.href = "login.html?redirect=" + encodeURIComponent(getReturnTarget());
        }

        if (!playerName) {
            if (missingText) missingText.textContent = "链接里没有指定成员。";
            showOnly(missingState);
            return;
        }

        if (!auth || !auth.isConfigured) {
            showOnly(setupState);
            return;
        }

        const { session } = await auth.getSession();
        if (!session || !session.user) {
            showOnly(guestState);
            return;
        }

        const { profile } = await auth.getWhitelistProfile(session.user);
        if (!profile) {
            showOnly(deniedState);
            return;
        }

        const { data, error } = await auth.client.rpc("get_member_public_profile", {
            player_name: playerName,
        });

        if (error) {
            if (error.message && error.message.includes("not_whitelisted")) {
                showOnly(deniedState);
                return;
            }
            if (missingText) missingText.textContent = "资料读取失败：" + error.message;
            showOnly(missingState);
            return;
        }

        const targetProfile = firstRow(data);
        if (!targetProfile) {
            if (missingText) missingText.textContent = playerName + " 还没有公开资料。";
            showOnly(missingState);
            return;
        }

        renderProfile(targetProfile);
    }

    document.querySelectorAll("[data-sign-out]").forEach((button) => {
        button.addEventListener("click", () => {
            if (auth && auth.signOut) auth.signOut();
        });
    });

    init();
})();
