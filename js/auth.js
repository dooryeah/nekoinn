(function () {
    const config = window.NEKOINN_SUPABASE || {};
    const url = String(config.url || "").trim();
    const anonKey = String(config.anonKey || "").trim();
    const hasLibrary = Boolean(window.supabase && window.supabase.createClient);
    const hasConfig = Boolean(
        hasLibrary &&
        url &&
        anonKey &&
        !url.includes("YOUR-PROJECT-REF") &&
        !anonKey.includes("YOUR_SUPABASE_ANON_KEY")
    );

    function pageUrl(fileName) {
        const basePath = window.location.pathname.replace(/[^/]*$/, "");
        return window.location.origin + basePath + fileName;
    }

    const client = hasConfig
        ? window.supabase.createClient(url, anonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
            },
        })
        : null;

    async function getSession() {
        if (!client) return { session: null, error: new Error("Supabase is not configured.") };
        const { data, error } = await client.auth.getSession();
        return { session: data && data.session ? data.session : null, error };
    }

    async function getWhitelistProfile(user) {
        if (!client || !user || !user.email) return { profile: null, error: null };

        const columns = "email,nickname,minecraft_name,role,avatar_url,signature,background_path";
        const { data, error } = await client
            .from("member_whitelist")
            .select(columns + ",experience_points")
            .eq("email_normalized", user.email.toLowerCase())
            .eq("is_active", true)
            .maybeSingle();

        if (error && String(error.message || "").includes("experience_points")) {
            const fallback = await client
                .from("member_whitelist")
                .select(columns)
                .eq("email_normalized", user.email.toLowerCase())
                .eq("is_active", true)
                .maybeSingle();
            if (fallback.data) fallback.data.experience_points = 0;
            return { profile: fallback.data || null, error: fallback.error };
        }

        return { profile: data || null, error };
    }

    async function signOut() {
        if (!client) return;
        await client.auth.signOut();
        window.location.href = "login.html";
    }

    window.NekoinnAuth = {
        client,
        config,
        isConfigured: hasConfig,
        loginRedirectTo: pageUrl("login.html"),
        membersUrl: pageUrl("members.html"),
        getSession,
        getWhitelistProfile,
        signOut,
    };
})();
