(function () {
    const SUPABASE = window.NEKOINN_SUPABASE || {};
    const ADMIN_EMAIL = "admin@nekoinn.top";
    const MEDIA_BUCKET = "site-media";

    const hasLib = Boolean(window.supabase && window.supabase.createClient);
    const configured = hasLib && Boolean(SUPABASE.url) && Boolean(SUPABASE.anonKey);

    const supabase = configured
        ? window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: false,
            },
        })
        : null;

    const loginView = document.getElementById("adminLogin");
    const panelView = document.getElementById("adminPanel");
    const loginForm = document.getElementById("adminLoginForm");
    const loginPassword = document.getElementById("adminPassword");
    const loginButton = document.getElementById("adminLoginButton");
    const loginStatus = document.getElementById("adminLoginStatus");
    const logoutButton = document.getElementById("adminLogout");
    const addButton = document.getElementById("adminAdd");
    const listEl = document.getElementById("adminList");
    const countEl = document.getElementById("adminCount");
    const modalEl = document.getElementById("adminModal");
    const toastEl = document.getElementById("adminToast");

    const ENTITIES = {
        projects: {
            table: "projects",
            label: "工程项目",
            titleKey: "name",
            titleFallback: "未命名项目",
            folder: "projects",
            pkColumn: "id",
            thumbKey: "image",
            orderBy: [{ column: "sort_order" }, { column: "created_at" }],
            metaKeys: ["dimension", "type", "author"],
            reorderable: true,
            hasSortOrder: true,
            fields: [
                { key: "name", label: "项目名称", type: "text", required: true },
                { key: "image", label: "图片", type: "image" },
                { key: "dimension", label: "维度", type: "select", options: ["主世界", "地狱", "末地"], default: "主世界" },
                { key: "type", label: "类型", type: "select", options: ["机器", "建筑"], default: "机器" },
                { key: "author", label: "建造者", type: "text" },
                { key: "description", label: "描述", type: "textarea", hint: "可用 <br> 换行" },
                { key: "is_active", label: "在网站上显示", type: "checkbox", default: true },
            ],
        },
        exhibition: {
            table: "exhibition_items",
            label: "服务器展览",
            titleKey: "title",
            titleFallback: "服务器展览",
            folder: "exhibition",
            pkColumn: "id",
            thumbKey: "image",
            orderBy: [{ column: "sort_order" }, { column: "created_at" }],
            metaKeys: [],
            reorderable: true,
            hasSortOrder: true,
            fields: [
                { key: "image", label: "图片", type: "image", required: true },
                { key: "title", label: "标题", type: "text" },
                { key: "description", label: "描述", type: "textarea" },
                { key: "is_active", label: "在网站上显示", type: "checkbox", default: true },
            ],
        },
        projection: {
            table: "projection_files",
            label: "投影文件",
            titleKey: "name",
            titleFallback: "未命名文件",
            folder: "projections",
            pkColumn: "id",
            thumbKey: "image",
            orderBy: [{ column: "sort_order" }, { column: "created_at" }],
            metaKeys: ["note"],
            reorderable: true,
            hasSortOrder: true,
            fields: [
                { key: "name", label: "文件名", type: "text", required: true },
                { key: "url", label: "文件", type: "file", required: true },
                { key: "note", label: "备注", type: "text" },
                { key: "is_active", label: "在网站上显示", type: "checkbox", default: true },
            ],
        },
        members: {
            table: "member_whitelist",
            label: "成员",
            titleKey: "minecraft_name",
            titleFallback: "未命名成员",
            pkColumn: "email",
            thumbKey: "avatar_url",
            orderBy: [{ column: "minecraft_name" }],
            metaKeys: ["nickname", "email", "role"],
            reorderable: false,
            hasSortOrder: false,
            softDelete: true,
            offLabel: "已停用",
            fields: [
                { key: "email", label: "邮箱", type: "text", required: true, immutable: true },
                { key: "minecraft_name", label: "Minecraft 名", type: "text", required: true },
                { key: "nickname", label: "昵称", type: "text" },
                { key: "role", label: "身份", type: "text", default: "member" },
                { key: "avatar_url", label: "头像 URL（可选）", type: "text" },
                { key: "is_active", label: "启用（登录 + 主页显示）", type: "checkbox", default: true },
            ],
        },
    };

    const cache = { projects: [], exhibition: [], projection: [], members: [] };
    let currentEntity = "projects";
    let currentItems = [];

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function setStatus(message, tone) {
        loginStatus.textContent = message || "";
        loginStatus.className = "auth-status" + (tone ? " " + tone : "");
    }

    function showToast(message) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add("show");
        clearTimeout(window.adminToastTimer);
        window.adminToastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
    }

    function showLogin(message) {
        loginView.hidden = false;
        panelView.hidden = true;
        if (message) setStatus(message, "error");
        if (loginPassword) loginPassword.value = "";
    }

    function showPanel() {
        loginView.hidden = true;
        panelView.hidden = false;
    }

    function entity() {
        return ENTITIES[currentEntity];
    }

    function itemTitle(item) {
        const conf = entity();
        return item[conf.titleKey] || conf.titleFallback;
    }

    async function uploadFile(file, folder) {
        if (!file) return "";
        const ext = String(file.name || "").split(".").pop().toLowerCase() || "bin";
        const base = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        const path = folder + "/" + base + "." + ext;
        const { data, error } = await supabase.storage
            .from(MEDIA_BUCKET)
            .upload(path, file, {
                cacheControl: "3600",
                upsert: false,
                contentType: file.type || "application/octet-stream",
            });
        if (error) throw error;
        const { data: pub } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
        return pub && pub.publicUrl ? pub.publicUrl : "";
    }

    async function loadCurrent() {
        const conf = entity();
        let query = supabase.from(conf.table).select("*");
        (conf.orderBy || [{ column: "sort_order" }]).forEach((order) => {
            query = query.order(order.column, { ascending: order.ascending !== false });
        });

        const { data, error } = await query;

        if (error) {
            renderList([]);
            if (countEl) countEl.textContent = "读取失败：" + error.message;
            return;
        }

        cache[currentEntity] = data || [];
        currentItems = cache[currentEntity];
        renderList(currentItems);
    }

    function renderList(items) {
        const conf = entity();
        listEl.innerHTML = "";
        if (countEl) countEl.textContent = "共 " + items.length + " 条";

        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "admin-empty";
            empty.textContent = "还没有内容，点「新增条目」添加喵～";
            listEl.appendChild(empty);
            return;
        }

        items.forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "admin-item";

            const thumbKey = conf.thumbKey || "image";
            let thumb = null;
            if (item[thumbKey]) {
                thumb = document.createElement("img");
                thumb.className = "admin-item-thumb";
                thumb.alt = "";
                thumb.loading = "lazy";
                thumb.decoding = "async";
                thumb.src = item[thumbKey];
            }

            const main = document.createElement("div");
            main.className = "admin-item-main";

            const title = document.createElement("div");
            title.className = "admin-item-title";
            title.textContent = itemTitle(item);

            const meta = document.createElement("div");
            meta.className = "admin-item-meta";
            const metaParts = [];
            (conf.metaKeys || []).forEach((key) => {
                if (item[key]) metaParts.push(item[key]);
            });
            meta.textContent = metaParts.join(" · ") || "—";
            if (item.is_active === false) {
                const off = document.createElement("span");
                off.className = "admin-item-off";
                off.textContent = conf.offLabel || "已隐藏";
                meta.appendChild(off);
            }

            main.appendChild(title);
            main.appendChild(meta);

            const actions = document.createElement("div");
            actions.className = "admin-item-actions";

            if (conf.reorderable !== false) {
                const up = document.createElement("button");
                up.className = "admin-icon-btn";
                up.type = "button";
                up.textContent = "↑";
                up.title = "上移";
                up.disabled = index === 0;
                up.addEventListener("click", () => moveItem(index, -1));

                const down = document.createElement("button");
                down.className = "admin-icon-btn";
                down.type = "button";
                down.textContent = "↓";
                down.title = "下移";
                down.disabled = index === items.length - 1;
                down.addEventListener("click", () => moveItem(index, 1));

                actions.appendChild(up);
                actions.appendChild(down);
            }

            const edit = document.createElement("button");
            edit.className = "admin-icon-btn";
            edit.type = "button";
            edit.textContent = "✎";
            edit.title = "编辑";
            edit.addEventListener("click", () => openForm(item));
            actions.appendChild(edit);

            if (conf.softDelete) {
                const isActive = item.is_active !== false;
                const toggle = document.createElement("button");
                toggle.className = "admin-toggle-btn" + (isActive ? " admin-danger" : "");
                toggle.type = "button";
                toggle.textContent = isActive ? "停用" : "启用";
                toggle.title = isActive ? "停用" : "重新启用";
                toggle.addEventListener("click", () => toggleActive(item));
                actions.appendChild(toggle);
            } else {
                const del = document.createElement("button");
                del.className = "admin-icon-btn admin-danger";
                del.type = "button";
                del.textContent = "✕";
                del.title = "删除";
                del.addEventListener("click", () => deleteItem(item));
                actions.appendChild(del);
            }

            if (thumb) row.appendChild(thumb);
            row.appendChild(main);
            row.appendChild(actions);
            listEl.appendChild(row);
        });
    }

    async function moveItem(index, dir) {
        const conf = entity();
        const targetIndex = index + dir;
        if (targetIndex < 0 || targetIndex >= currentItems.length) return;

        const a = currentItems[index];
        const b = currentItems[targetIndex];
        const ao = Number(a.sort_order) || 0;
        const bo = Number(b.sort_order) || 0;

        const { error: e1 } = await supabase.from(conf.table).update({ sort_order: bo }).eq(conf.pkColumn, a[conf.pkColumn]);
        const { error: e2 } = await supabase.from(conf.table).update({ sort_order: ao }).eq(conf.pkColumn, b[conf.pkColumn]);
        if (e1 || e2) {
            showToast("排序失败：" + ((e1 || e2).message || "未知错误"));
            return;
        }
        await loadCurrent();
    }

    async function deleteItem(item) {
        const conf = entity();
        if (!confirm("确定删除「" + itemTitle(item) + "」吗？")) return;
        const { error } = await supabase.from(conf.table).delete().eq(conf.pkColumn, item[conf.pkColumn]);
        if (error) {
            showToast("删除失败：" + error.message);
            return;
        }
        showToast("已删除");
        await loadCurrent();
    }

    async function toggleActive(item) {
        const conf = entity();
        const next = item.is_active === false;
        const label = next ? "启用" : "停用";
        if (!confirm("确定" + label + "「" + itemTitle(item) + "」吗？")) return;
        const { error } = await supabase.from(conf.table).update({ is_active: next }).eq(conf.pkColumn, item[conf.pkColumn]);
        if (error) {
            showToast(label + "失败：" + error.message);
            return;
        }
        showToast("已" + label);
        await loadCurrent();
    }

    function openForm(item) {
        const conf = entity();
        const isEdit = Boolean(item && item[conf.pkColumn]);

        modalEl.innerHTML = "";
        const backdrop = document.createElement("div");
        backdrop.className = "admin-modal-backdrop";

        const box = document.createElement("div");
        box.className = "admin-modal-box";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");

        const header = document.createElement("div");
        header.className = "admin-modal-header";
        const heading = document.createElement("h2");
        heading.textContent = (isEdit ? "编辑" : "新增") + conf.label;
        const close = document.createElement("button");
        close.className = "admin-icon-btn";
        close.type = "button";
        close.textContent = "✕";
        close.title = "关闭";
        close.addEventListener("click", closeModal);
        header.appendChild(heading);
        header.appendChild(close);

        const form = document.createElement("form");
        form.className = "admin-form";

        const values = {};
        conf.fields.forEach((field) => {
            const wrap = document.createElement("div");
            wrap.className = "admin-field";

            const label = document.createElement("label");
            label.textContent = field.label + (field.required ? " *" : "");
            wrap.appendChild(label);

            if (field.type === "select") {
                const select = document.createElement("select");
                select.name = field.key;
                field.options.forEach((opt) => {
                    const option = document.createElement("option");
                    option.value = opt;
                    option.textContent = opt;
                    select.appendChild(option);
                });
                select.value = item ? (item[field.key] || field.default || "") : (field.default || "");
                select.addEventListener("change", () => { values[field.key] = select.value; });
                values[field.key] = select.value;
                wrap.appendChild(select);
            } else if (field.type === "textarea") {
                const textarea = document.createElement("textarea");
                textarea.name = field.key;
                textarea.rows = 4;
                if (field.hint) textarea.placeholder = field.hint;
                textarea.value = item ? (item[field.key] || "") : "";
                textarea.addEventListener("input", () => { values[field.key] = textarea.value; });
                values[field.key] = textarea.value;
                wrap.appendChild(textarea);
            } else if (field.type === "checkbox") {
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.name = field.key;
                checkbox.checked = item ? item[field.key] !== false : (field.default !== false);
                checkbox.addEventListener("change", () => { values[field.key] = checkbox.checked; });
                values[field.key] = checkbox.checked;
                wrap.appendChild(checkbox);
            } else if (field.type === "image" || field.type === "file") {
                const current = item ? (item[field.key] || "") : "";

                const preview = document.createElement("div");
                preview.className = "admin-upload-preview";
                if (field.type === "image" && current) {
                    const img = document.createElement("img");
                    img.src = current;
                    img.alt = "";
                    preview.appendChild(img);
                } else if (current) {
                    preview.textContent = current;
                }

                const urlInput = document.createElement("input");
                urlInput.type = "text";
                urlInput.name = field.key + "_url";
                urlInput.value = current;
                urlInput.placeholder = field.type === "image" ? "图片 URL / 路径" : "文件 URL / 路径";
                urlInput.addEventListener("input", () => { values[field.key] = urlInput.value; });
                values[field.key] = current;

                const fileInput = document.createElement("input");
                fileInput.type = "file";
                fileInput.name = field.key + "_file";
                fileInput.accept = field.type === "image" ? "image/png,image/jpeg,image/webp,image/gif" : "";
                fileInput.addEventListener("change", () => {
                    const file = fileInput.files && fileInput.files[0];
                    if (!file) return;
                    values["__file_" + field.key] = file;
                    if (field.type === "image" && preview) {
                        const img = preview.querySelector("img") || document.createElement("img");
                        img.src = URL.createObjectURL(file);
                        img.alt = "";
                        if (!preview.contains(img)) preview.appendChild(img);
                    } else if (preview) {
                        preview.textContent = file.name;
                    }
                    urlInput.value = "";
                });

                const hint = document.createElement("span");
                hint.className = "admin-field-hint";
                hint.textContent = "可直接填 URL/路径，或选择文件上传（上传后自动填入）";

                wrap.appendChild(preview);
                wrap.appendChild(urlInput);
                wrap.appendChild(fileInput);
                wrap.appendChild(hint);
            } else {
                const input = document.createElement("input");
                input.type = "text";
                input.name = field.key;
                input.value = item ? (item[field.key] || "") : (field.default || "");
                if (field.immutable && isEdit) {
                    input.disabled = true;
                }
                input.addEventListener("input", () => { values[field.key] = input.value; });
                values[field.key] = input.value;
                wrap.appendChild(input);
            }

            form.appendChild(wrap);
        });

        const actions = document.createElement("div");
        actions.className = "admin-form-actions";
        const cancel = document.createElement("button");
        cancel.className = "ghost-btn";
        cancel.type = "button";
        cancel.textContent = "取消";
        cancel.addEventListener("click", closeModal);
        const submit = document.createElement("button");
        submit.className = "join-btn";
        submit.type = "submit";
        submit.textContent = isEdit ? "保存" : "新增";
        actions.appendChild(cancel);
        actions.appendChild(submit);

        form.appendChild(actions);
        box.appendChild(header);
        box.appendChild(form);

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            submit.disabled = true;
            submit.textContent = "保存中...";
            try {
                await saveForm(conf, item, values);
                closeModal();
                showToast(isEdit ? "已保存" : "已新增");
            } catch (err) {
                showToast("保存失败：" + err.message);
                submit.disabled = false;
                submit.textContent = isEdit ? "保存" : "新增";
            }
        });

        modalEl.appendChild(backdrop);
        modalEl.appendChild(box);
        modalEl.hidden = false;
        backdrop.addEventListener("click", closeModal);
        document.body.classList.add("lightbox-open");
        document.addEventListener("keydown", onModalKey);
    }

    function onModalKey(e) {
        if (e.key === "Escape") closeModal();
    }

    function closeModal() {
        modalEl.hidden = true;
        modalEl.innerHTML = "";
        document.body.classList.remove("lightbox-open");
        document.removeEventListener("keydown", onModalKey);
    }

    async function saveForm(conf, item, values) {
        const payload = {};
        const table = conf.table;
        const isEdit = Boolean(item && item[conf.pkColumn]);

        for (const field of conf.fields) {
            if (isEdit && field.immutable) {
                continue;
            }

            if (field.type === "checkbox") {
                payload[field.key] = Boolean(values[field.key]);
                continue;
            }

            const isMedia = field.type === "image" || field.type === "file";
            const file = isMedia ? values["__file_" + field.key] : null;
            const text = String(values[field.key] || "").trim();

            if (field.required && !text && !file) {
                throw new Error(field.label + "不能为空");
            }

            if (file) {
                payload[field.key] = await uploadFile(file, conf.folder);
            } else if (text) {
                payload[field.key] = text;
            } else if (field.default && !isEdit) {
                payload[field.key] = field.default;
            } else {
                payload[field.key] = null;
            }
        }

        if (isEdit) {
            const { error } = await supabase.from(table).update(payload).eq(conf.pkColumn, item[conf.pkColumn]);
            if (error) throw error;
        } else {
            if (conf.hasSortOrder !== false) {
                const maxOrder = currentItems.reduce((m, it) => Math.max(m, Number(it.sort_order) || 0), 0);
                payload.sort_order = maxOrder + 1;
            }
            const { error } = await supabase.from(table).insert(payload);
            if (error) throw error;
        }

        await loadCurrent();
    }

    function switchTab(key) {
        currentEntity = key;
        document.querySelectorAll(".admin-tab").forEach((tab) => {
            const active = tab.dataset.entity === key;
            tab.classList.toggle("is-active", active);
            tab.setAttribute("aria-selected", String(active));
        });
        loadCurrent();
    }

    async function login(password) {
        if (!password) return;
        loginButton.disabled = true;
        setStatus("正在登录...", "");
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: ADMIN_EMAIL,
                password: password,
            });
            if (error) {
                setStatus("登录失败：" + (error.message || "密码错误"), "error");
                return;
            }
            const { data: isAdmin } = await supabase.rpc("is_site_admin");
            if (!isAdmin) {
                await supabase.auth.signOut();
                setStatus("当前账号不是管理员喵", "error");
                return;
            }
            setStatus("", "");
            showPanel();
            await loadCurrent();
        } catch (err) {
            setStatus("登录失败：" + err.message, "error");
        } finally {
            loginButton.disabled = false;
        }
    }

    async function logout() {
        await supabase.auth.signOut();
        showLogin();
    }

    async function init() {
        if (!configured) {
            showLogin("Supabase 还没配置，请先填写 js/supabase-config.js");
            if (loginButton) loginButton.disabled = true;
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            showLogin();
            return;
        }

        const { data: isAdmin } = await supabase.rpc("is_site_admin");
        if (!isAdmin) {
            await supabase.auth.signOut();
            showLogin("当前账号不是管理员喵");
            return;
        }

        showPanel();
        await loadCurrent();
    }

    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            login(loginPassword.value);
        });
    }

    if (logoutButton) {
        logoutButton.addEventListener("click", logout);
    }

    if (addButton) {
        addButton.addEventListener("click", () => openForm(null));
    }

    document.querySelectorAll(".admin-tab").forEach((tab) => {
        tab.addEventListener("click", () => switchTab(tab.dataset.entity));
    });

    init();
})();
