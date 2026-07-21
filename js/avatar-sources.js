(function () {
    const littleSkinTextures = Object.freeze({
        givewhyyyy: "45221b7b50d21bfa30b8483b642f01641590fc3da3fb8e9a076b5ce770ecacea",
        everynum: "fc55ad940e9c4a2d413baa2458e7c8cff2f2d72591870bf91f618897b8a6fb2c",
        ygday: "a650bd4924b26fd1018f91ad029f8394e80511e24ac15c1342c3633078fa145b",
        bro_yummy: "1d646dde5b8052fe9ac6156743894af79f10fb7ff98e8d393db812527a5c9c60",
        geopelia_39: "5b009b4e38e2f9f8db7cbda31110c0b9c404a20443150764a61d323d38ad70c7",
        daddytony: "b52a22492d5674c3b4194a1dbc297378d3585c1b96eb6d4f81085055631fffe5",
    });
    const littleSkinTextureBase = "https://littleskin.cn/textures/";
    const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    let requestSequence = 0;

    function normalizeName(name) {
        return String(name || "").trim().toLowerCase();
    }

    function getLittleSkinTextureUrl(name) {
        const texture = littleSkinTextures[normalizeName(name)];
        return texture ? littleSkinTextureBase + texture : "";
    }

    function getDefaultAvatarUrl(name) {
        const playerName = String(name || "").trim();
        return playerName
            ? "https://mc-heads.net/avatar/" + encodeURIComponent(playerName)
            : "./images/logo.png";
    }

    function isDefaultAvatarUrl(url) {
        try {
            return new URL(url, window.location.href).hostname.toLowerCase() === "mc-heads.net";
        } catch (error) {
            return false;
        }
    }

    function clearLittleSkinAvatar(image) {
        image.classList.remove("is-littleskin-avatar");
        image.style.removeProperty("--minecraft-avatar-texture");
        delete image.dataset.avatarSource;
    }

    function apply(image, minecraftName, customUrl) {
        if (!image) return;

        const requestId = String(++requestSequence);
        const explicitUrl = String(customUrl || "").trim();
        const fallbackUrl = explicitUrl || getDefaultAvatarUrl(minecraftName);
        const hasCustomAvatar = Boolean(explicitUrl) && !isDefaultAvatarUrl(explicitUrl);
        const textureUrl = hasCustomAvatar ? "" : getLittleSkinTextureUrl(minecraftName);

        image.dataset.avatarRequest = requestId;
        clearLittleSkinAvatar(image);
        if (!textureUrl) {
            image.src = fallbackUrl;
            image.dataset.avatarSource = hasCustomAvatar ? "custom" : "default";
            return;
        }

        if (!image.getAttribute("src")) image.src = "./images/logo.png";
        image.dataset.avatarSource = "loading";

        const texture = new Image();
        texture.decoding = "async";
        texture.onload = () => {
            if (image.dataset.avatarRequest !== requestId) return;
            image.style.setProperty("--minecraft-avatar-texture", 'url("' + textureUrl + '")');
            image.classList.add("is-littleskin-avatar");
            image.dataset.avatarSource = "littleskin";
            image.src = transparentPixel;
        };
        texture.onerror = () => {
            if (image.dataset.avatarRequest !== requestId) return;
            clearLittleSkinAvatar(image);
            image.src = fallbackUrl;
            image.dataset.avatarSource = "default";
        };
        texture.src = textureUrl;
    }

    function applyDeclared(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll("img[data-minecraft-avatar]").forEach((image) => {
            apply(image, image.dataset.minecraftAvatar);
        });
    }

    window.NekoinnAvatars = Object.freeze({
        apply,
        applyDeclared,
        getDefaultAvatarUrl,
        getLittleSkinTextureUrl,
    });

    applyDeclared(document);
})();
