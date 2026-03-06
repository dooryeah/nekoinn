// 统一密码登录模式
const MASTER_PASSWORD = "miaosu2026";  // ← 修改成你自己的密码

// 登录
function login() {
    const pass = document.getElementById("loginPass")?.value;

    if (!pass) {
        alert("请输入密码");
        return;
    }

    if (pass === MASTER_PASSWORD) {
        localStorage.setItem("loggedInUser", "admin"); // 固定为 admin
        alert("登录成功！");
        window.location.href = "/meowcoffee.github.io/index.html";
    } else {
        alert("密码错误");
    }
}

// 更新首页导航栏 UI
function updateNav() {
    const nav = document.getElementById("navLinks");
    const auth = document.getElementById("navAuth");
    const user = localStorage.getItem("loggedInUser");

    if (user) {
        if (nav) nav.classList.add("show");
        if (auth) auth.style.display = "none";
    } else {
        if (nav) nav.classList.remove("show");
        if (auth) auth.style.display = "flex";
    }
}




