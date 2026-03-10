// ===== 滚动淡入观察器 =====
const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('visible');
            fadeObserver.unobserve(e.target);
        }
    });
}, { threshold: 0.15 });

document.querySelectorAll('.fade-up').forEach(el => fadeObserver.observe(el));

// ===== 页面跳转淡出 =====
document.querySelectorAll('a[href]').forEach(a => {
    a.addEventListener('click', (e) => {
        const url = a.getAttribute('href');
        if (!url || url.startsWith('#') || url.startsWith('javascript:') || a.target === '_blank') return;
        e.preventDefault();
        document.body.classList.add('page-fade-out');
        setTimeout(() => window.location.href = url, 320);
    });
});