// 注册
function register() {
    const user = document.getElementById("regUser")?.value;
    const pass = document.getElementById("regPass")?.value;

    if (!user || !pass) {
        alert("请输入完整信息");
        return;
    }

    if (localStorage.getItem("user_" + user)) {
        alert("用户名已存在");
        return;
    }

    localStorage.setItem("user_" + user, pass);
    alert("注册成功！");
    window.location.href = "login.html";
}

// 登录
function login() {
    const user = document.getElementById("loginUser")?.value;
    const pass = document.getElementById("loginPass")?.value;

    const savedPass = localStorage.getItem("user_" + user);

    if (savedPass === pass) {
        localStorage.setItem("loggedInUser", user);
        alert("登录成功！");
        window.location.href = "index.html";
    } else {
        alert("用户名或密码错误");
    }
}

// 首页调用：检查是否登录
function checkLogin() {
    const user = localStorage.getItem("loggedInUser");
    if (!user) {
        // 未登录 → 跳转到登录页
        window.location.href = "login.html";
    }
}

// 更新首页导航栏 UI
function updateNav() {
    const nav = document.getElementById("navLinks"); // 主页/加入服务器/玩家社区/关于
    const auth = document.getElementById("navAuth"); // 登录/注册
    const user = localStorage.getItem("loggedInUser");

    if (user) {
        // 登录后显示导航栏
        if (nav) nav.classList.add("show");

        // 登录后隐藏登录/注册按钮
        if (auth) auth.style.display = "none";
    } else {
        // 未登录隐藏导航栏
        if (nav) nav.classList.remove("show");

        // 显示登录/注册按钮
        if (auth) auth.style.display = "flex";
    }
}

