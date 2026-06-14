(function () {
    const auth = window.NekoinnAuth;
    const form = document.getElementById("loginForm");
    const emailInput = document.getElementById("loginEmail");
    const submitButton = document.getElementById("loginSubmit");
    const status = document.getElementById("loginStatus");
    const sessionBox = document.getElementById("sessionBox");
    const sessionText = document.getElementById("sessionText");
    const signOutButton = document.getElementById("loginSignOut");

    function setStatus(message, type) {
        if (!status) return;
        status.textContent = message;
        status.className = "auth-status" + (type ? " " + type : "");
    }

    function setBusy(isBusy) {
        if (submitButton) submitButton.disabled = isBusy;
        if (emailInput) emailInput.disabled = isBusy;
    }

    async function showCurrentSession() {
        if (!auth || !auth.isConfigured) {
            setStatus("还没有填写 Supabase 项目地址和 anon key，先配置 js/supabase-config.js 喵～", "warn");
            return;
        }

        const { session } = await auth.getSession();
        if (!session || !session.user) return;

        const { profile } = await auth.getWhitelistProfile(session.user);
        if (sessionBox) sessionBox.hidden = false;
        if (sessionText) {
            sessionText.textContent = profile
                ? "已登录：" + session.user.email + "，可以进入成员区。"
                : "已登录：" + session.user.email + "，但这个邮箱不在成员白名单里。";
        }
    }

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!auth || !auth.isConfigured) {
                setStatus("Supabase 还没配置好，暂时不能发送登录邮件。", "error");
                return;
            }

            const email = emailInput.value.trim();
            if (!email) {
                setStatus("先填邮箱喵～", "error");
                return;
            }

            setBusy(true);
            setStatus("正在发送登录邮件...", "");

            const { error } = await auth.client.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: auth.loginRedirectTo,
                    shouldCreateUser: auth.config.allowNewAuthUsers !== false,
                },
            });

            setBusy(false);
            if (error) {
                setStatus(error.message || "登录邮件发送失败。", "error");
                return;
            }

            setStatus("登录邮件已经发出，请去邮箱点链接。", "success");
        });
    }

    if (signOutButton) {
        signOutButton.addEventListener("click", () => auth.signOut());
    }

    showCurrentSession();
})();
