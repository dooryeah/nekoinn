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
    const profileRole = document.getElementById("profileRole");
    const profileAvatar = document.getElementById("profileAvatar");
    const resourceGrid = document.getElementById("memberResources");
    const resourceEmpty = document.getElementById("resourceEmpty");

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

    function renderProfile(profile, user) {
        const displayName = profile.nickname || profile.minecraft_name || user.email;
        if (profileName) profileName.textContent = displayName;
        if (profileEmail) profileEmail.textContent = user.email || "";
        if (profileRole) profileRole.textContent = profile.role || "member";

        if (profileAvatar) {
            const avatarSrc = profile.avatar_url ||
                (profile.minecraft_name ? "https://mc-heads.net/avatar/" + encodeURIComponent(profile.minecraft_name) : "./images/logo.png");
            profileAvatar.src = avatarSrc;
            profileAvatar.alt = displayName;
        }
    }

    function renderResources(resources) {
        if (!resourceGrid) return;
        resourceGrid.innerHTML = "";

        if (!resources || resources.length === 0) {
            if (resourceEmpty) resourceEmpty.hidden = false;
            return;
        }

        if (resourceEmpty) resourceEmpty.hidden = true;
        resources.forEach((resource) => {
            const card = document.createElement("article");
            card.className = "member-resource-card";
            const category = resource.category ? `<p class="member-resource-meta">${escapeHtml(resource.category)}</p>` : "";
            const body = resource.body ? `<p>${escapeHtml(resource.body)}</p>` : "";
            const link = resource.url
                ? `<a class="ghost-btn" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener noreferrer">打开</a>`
                : "";

            card.innerHTML = `
                ${category}
                <h3>${escapeHtml(resource.title)}</h3>
                ${body}
                ${link}
            `;
            resourceGrid.appendChild(card);
        });
    }

    async function loadResources() {
        const { data, error } = await auth.client
            .from("member_resources")
            .select("title,body,url,category,sort_order")
            .eq("is_active", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false });

        if (error) {
            renderResources([]);
            if (resourceEmpty) resourceEmpty.textContent = "内部资料读取失败：" + error.message;
            return;
        }

        renderResources(data || []);
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
        loadResources();
    }

    document.querySelectorAll("[data-sign-out]").forEach((button) => {
        button.addEventListener("click", () => auth.signOut());
    });

    init();
})();
