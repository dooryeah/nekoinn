function login() {
    const user = document.getElementById("loginUser")?.value;
    const pass = document.getElementById("loginPass")?.value;

    const savedPass = localStorage.getItem("user_" + user);

    if (savedPass === pass) {
        localStorage.setItem("loggedInUser", user);
        alert("登录成功！");
        window.location.href = "/meowcoffee.github.io/index.html"; // ← 修复
    } else {
        alert("用户名或密码错误");
    }
}


