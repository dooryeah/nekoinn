(() => {
    const key = 'nekoinn-theme';
    const root = document.documentElement;

    try {
        const saved = localStorage.getItem(key);
        const prefersNight = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = saved === 'night' || saved === 'day' ? saved : (prefersNight ? 'night' : 'day');
        root.dataset.theme = theme;
        root.style.colorScheme = theme === 'night' ? 'dark' : 'light';
    } catch (error) {
        root.dataset.theme = 'day';
        root.style.colorScheme = 'light';
    }
})();
