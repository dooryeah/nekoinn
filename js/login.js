(function () {
    const auth = window.NekoinnAuth;
    const emailForm = document.getElementById("emailForm");
    const codeForm = document.getElementById("codeForm");
    const emailInput = document.getElementById("loginEmail");
    const codeInput = document.getElementById("loginCode");
    const sendCodeButton = document.getElementById("sendCodeSubmit");
    const verifyCodeButton = document.getElementById("verifyCodeSubmit");
    const resendCodeButton = document.getElementById("resendCode");
    const changeEmailButton = document.getElementById("changeEmail");
    const codeTarget = document.getElementById("codeTarget");
    const status = document.getElementById("loginStatus");
    const sessionBox = document.getElementById("sessionBox");
    const sessionText = document.getElementById("sessionText");
    const signOutButton = document.getElementById("loginSignOut");
    const loginEmailKey = "nekoinnLoginEmail";
    const params = new URLSearchParams(window.location.search);
    const redirectTarget = sanitizeRedirect(params.get("redirect") || "");
    let pendingEmail = sessionStorage.getItem(loginEmailKey) || "";
    let cooldownTimer = null;
    let cooldownSeconds = 0;

    function sanitizeRedirect(value) {
        const target = String(value || "").trim();
        if (
            !target ||
            target.startsWith("//") ||
            target.includes(":") ||
            target.includes("\\")
        ) {
            return "members.html";
        }
        return target.replace(/^\/+/, "") || "members.html";
    }

    function setStatus(message, type) {
        if (!status) return;
        status.textContent = message;
        status.className = "auth-status" + (type ? " " + type : "");
    }

    function setEmailBusy(isBusy) {
        if (sendCodeButton) sendCodeButton.disabled = isBusy || cooldownSeconds > 0;
        if (emailInput) emailInput.disabled = isBusy;
    }

    function setCodeBusy(isBusy) {
        if (verifyCodeButton) verifyCodeButton.disabled = isBusy;
        if (codeInput) codeInput.disabled = isBusy;
        if (resendCodeButton) resendCodeButton.disabled = isBusy || cooldownSeconds > 0;
        if (changeEmailButton) changeEmailButton.disabled = isBusy;
    }

    function showEmailStep() {
        if (emailForm) emailForm.hidden = false;
        if (codeForm) codeForm.hidden = true;
        if (codeInput) codeInput.value = "";
        if (emailInput && pendingEmail) emailInput.value = pendingEmail;
    }

    function showCodeStep(email) {
        pendingEmail = email;
        sessionStorage.setItem(loginEmailKey, email);
        if (emailForm) emailForm.hidden = true;
        if (codeForm) codeForm.hidden = false;
        if (codeTarget) codeTarget.textContent = "验证码已发送至 " + email;
        if (codeInput) {
            codeInput.value = "";
            codeInput.focus();
        }
    }

    function updateCooldownButtons() {
        const resendText = cooldownSeconds > 0 ? "重新发送 (" + cooldownSeconds + "s)" : "重新发送";
        const sendText = cooldownSeconds > 0 ? "发送验证码 (" + cooldownSeconds + "s)" : "发送验证码";
        if (resendCodeButton) resendCodeButton.textContent = resendText;
        if (sendCodeButton) sendCodeButton.textContent = sendText;
        if (resendCodeButton) resendCodeButton.disabled = cooldownSeconds > 0;
        if (sendCodeButton) sendCodeButton.disabled = cooldownSeconds > 0;
    }

    function startCooldown(seconds) {
        cooldownSeconds = seconds;
        updateCooldownButtons();
        clearInterval(cooldownTimer);
        cooldownTimer = setInterval(() => {
            cooldownSeconds -= 1;
            if (cooldownSeconds <= 0) {
                cooldownSeconds = 0;
                clearInterval(cooldownTimer);
            }
            updateCooldownButtons();
        }, 1000);
    }

    async function sendCode(email) {
        if (!auth || !auth.isConfigured) {
            setStatus("Supabase 还没配置好，暂时不能发送验证码。", "error");
            return false;
        }

        if (!email) {
            setStatus("先填邮箱喵～", "error");
            return false;
        }

        setEmailBusy(true);
        setCodeBusy(true);
        setStatus("正在发送验证码...", "");

        const { error } = await auth.client.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: auth.config.allowNewAuthUsers !== false,
            },
        });

        setEmailBusy(false);
        setCodeBusy(false);
        if (error) {
            setStatus(error.message || "验证码发送失败。", "error");
            return false;
        }

        showCodeStep(email);
        startCooldown(60);
        setStatus("验证码已经发出，请查看邮箱。", "success");
        return true;
    }

    async function verifyCode(email, token) {
        if (!auth || !auth.isConfigured) {
            setStatus("Supabase 还没配置好，暂时不能验证验证码。", "error");
            return;
        }

        if (!email) {
            setStatus("请先发送验证码。", "error");
            showEmailStep();
            return;
        }

        const normalizedToken = token.replace(/\D/g, "");
        if (!/^\d{8}$/.test(normalizedToken)) {
            setStatus("请输入 8 位数字验证码。", "error");
            return;
        }

        setCodeBusy(true);
        setStatus("正在验证...", "");

        const { error } = await auth.client.auth.verifyOtp({
            email,
            token: normalizedToken,
            type: "email",
        });

        setCodeBusy(false);
        if (error) {
            setStatus(error.message || "验证码不正确或已过期。", "error");
            return;
        }

        sessionStorage.removeItem(loginEmailKey);
        setStatus("登录成功，正在跳转...", "success");
        window.location.href = redirectTarget;
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
                ? "已登录：" + session.user.email + "，可以继续浏览成员页面。"
                : "已登录：" + session.user.email + "，但这个邮箱不在成员白名单里。";
        }
    }

    if (emailForm) {
        emailForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = emailInput.value.trim();
            await sendCode(email);
        });
    }

    if (codeForm) {
        codeForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            await verifyCode(pendingEmail, codeInput.value.trim());
        });
    }

    if (codeInput) {
        codeInput.addEventListener("input", () => {
            codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 8);
        });
    }

    if (resendCodeButton) {
        resendCodeButton.addEventListener("click", async () => {
            if (cooldownSeconds > 0) return;
            await sendCode(pendingEmail);
        });
    }

    if (changeEmailButton) {
        changeEmailButton.addEventListener("click", () => {
            pendingEmail = "";
            sessionStorage.removeItem(loginEmailKey);
            showEmailStep();
            setStatus("", "");
            if (emailInput) emailInput.focus();
        });
    }

    if (signOutButton) {
        signOutButton.addEventListener("click", () => auth.signOut());
    }

    if (pendingEmail) {
        showCodeStep(pendingEmail);
        setStatus("如果验证码已过期，请重新发送。", "warn");
    } else {
        showEmailStep();
    }

    showCurrentSession();
})();
