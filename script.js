(function() {
  const receiveBtn = document.getElementById('receiveBtn');
  const againBtn = document.getElementById('againBtn');
  const cardSection = document.getElementById('cardSection');
  const cardElement = document.getElementById('signalCard');
  const cardMain = document.getElementById('cardMain');
  const cardSub = document.getElementById('cardSub');
  const cardFrom = document.getElementById('cardFrom');
  const toast = document.getElementById('toast');

  // Quota keys
  const RECEIVE_KEY = 'cosmic_receive_used_date';
  const AGAIN_KEY = 'cosmic_again_used_date';
  const LAST_SEEN_DATE_KEY = 'cosmic_last_seen_date';
  const DEV_RESET_ENABLED = true; // flip to false for production if needed

  function getTodayKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function usedToday(storageKey) {
    return localStorage.getItem(storageKey) === getTodayKey();
  }

  function markUsed(storageKey) {
    localStorage.setItem(storageKey, getTodayKey());
  }

  function updateButtonStates() {
    const today = getTodayKey();
    const lastSeen = localStorage.getItem(LAST_SEEN_DATE_KEY);
    if (lastSeen !== today) {
      localStorage.setItem(LAST_SEEN_DATE_KEY, today);
      // Natural reset happens by date comparison; no need to clear keys
    }

    const receiveUsed = usedToday(RECEIVE_KEY);
    const againUsed = usedToday(AGAIN_KEY);

    receiveBtn.disabled = receiveUsed;
    // keep again label and enabled state; we gate via handler to show tip
    againBtn.disabled = false;

    receiveBtn.textContent = receiveUsed ? '今日已接收' : '接收宇宙信号';
    const label = againBtn.querySelector('.btn__label');
    if (label) label.textContent = '再来一条';
  }

  /**
   * Default signal pool; runtime CSV can override
   */
  const defaultSignals = [
    {
      main: '走出你家门，左转三次。',
      sec: '看看第三个左转后出现的第一样让你注意的东西是什么。',
      from: 'universe'
    },
    {
      main: '今天中午用非惯用手刷牙。',
      sec: '训练大脑，也让生活有点新奇。',
      from: 'universe'
    },
    {
      main: '给自己买一瓶没喝过的饮料。',
      sec: '第一次看到名字就选它，不许犹豫。',
      from: 'universe'
    },
    {
      main: '在备忘录写下3件你今天已经做得不错的事。',
      sec: '完成时间：今晚睡前。',
      from: 'universe'
    },
    {
      main: '用10分钟清理一个你长期忽略的角落。',
      sec: '哪怕只是一个抽屉，一张桌角。',
      from: 'universe'
    },
    {
      main: '今晚随机播放一首你没听过的歌，然后不跳过。',
      sec: '无论喜欢与否，完整听完。',
      from: 'universe'
    },
    {
      main: '随意走进一家你从未进过的小店。',
      sec: '不买也行，但要认真看一样东西30秒。',
      from: 'universe'
    },
    {
      main: '写下你现在脑海中第一个出现的句子。',
      sec: '别删改，不要解释，直接写下来。',
      from: 'universe'
    },
    {
      main: '在外面走路时，数一数经过你的10个人的鞋子颜色。',
      sec: '观察训练，激活感官。',
      from: 'universe'
    },
    {
      main: '在今天的某个时刻，刻意做一次深呼吸5次。',
      sec: '每次吸气4秒，停2秒，呼气4秒。',
      from: 'universe'
    }
  ];

  let signals = defaultSignals.slice();

  async function loadSignalsFromCsv() {
    try {
      const res = await fetch('./signals.csv', { cache: 'no-store' });
      if (!res.ok) return;
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      const parsed = [];
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        if (idx === 0 && /^\s*main\s*,\s*sec\s*,\s*from\s*$/i.test(line)) continue; // skip header
        const parts = line.split(',');
        if (parts.length < 3) continue;
        const main = parts[0].trim();
        const sec = parts[1].trim();
        const from = parts[2].trim();
        if (main) parsed.push({ main, sec, from });
      }
      if (parsed.length > 0) {
        signals = parsed;
      }
    } catch (e) {
      // ignore and keep defaults
      console.warn('Failed to load signals.csv; using defaults');
    }
  }

  function loadUserSignals() {
    try {
      const userSignals = JSON.parse(localStorage.getItem('approvedSignals') || '[]');
      if (userSignals.length > 0) {
        signals = signals.concat(userSignals);
        console.log(`Loaded ${userSignals.length} user-contributed signals`);
      }
    } catch (e) {
      console.warn('Failed to load user signals');
    }
  }

  function getRandomSignal() {
    const index = Math.floor(Math.random() * signals.length);
    return signals[index];
  }

  function showCard() {
    const s = getRandomSignal();
    cardMain.textContent = s.main.startsWith('你可以试着') ? s.main : `你可以试着：${s.main}`;
    cardSub.textContent = s.sec || '或许，这就是今天的信号';
    cardFrom.textContent = s.from === 'universe' ? '来自宇宙' : `来自 ${s.from}`;

    // retrigger animation
    const content = cardElement.querySelector('.card__content');
    content.style.animation = 'none';
    // force reflow
    // eslint-disable-next-line no-unused-expressions
    content.offsetHeight;
    content.style.animation = '';

    cardSection.classList.remove('hidden');
  }

  function handleReceive() {
    if (usedToday(RECEIVE_KEY)) {
      alert('你今天已经接收过一次啦，明天0点后再试试✨');
      updateButtonStates();
      return;
    }
    receiveBtn.disabled = true;
    showCard();
    markUsed(RECEIVE_KEY);
    setTimeout(() => { updateButtonStates(); }, 400);
  }

  function handleAgain() {
    if (usedToday(AGAIN_KEY)) {
      showToast('明天再来～今天就试试这个吧，可能会有神奇的事情发生（也可能没有）hh');
      return;
    }
    againBtn.disabled = true;
    showCard();
    markUsed(AGAIN_KEY);
    setTimeout(() => { updateButtonStates(); }, 300);
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2600);
  }

  function devResetDailyQuota() {
    localStorage.removeItem(RECEIVE_KEY);
    localStorage.removeItem(AGAIN_KEY);
    updateButtonStates();
    showToast('已重置今日次数');
  }


  receiveBtn.addEventListener('click', handleReceive);
  againBtn.addEventListener('click', handleAgain);
  
  // Theme toggle event listener
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  updateButtonStates();

  // Auto refresh states around midnight (check every 60s)
  setInterval(updateButtonStates, 60 * 1000);

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'universe';
    setTheme(savedTheme);
  }

  function setTheme(theme) {
    const body = document.body;
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');
    const appTitle = document.querySelector('.app__title');
    
    if (theme === 'cat') {
      body.classList.add('cat-theme');
      themeIcon.textContent = '🐱';
      themeText.textContent = '猫猫';
      appTitle.textContent = '猫猫信号接收站';
    } else {
      body.classList.remove('cat-theme');
      themeIcon.textContent = '🌌';
      themeText.textContent = '宇宙';
      appTitle.textContent = '宇宙信号接收站';
    }
    
    localStorage.setItem('theme', theme);
  }

  function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'universe';
    const newTheme = currentTheme === 'universe' ? 'cat' : 'universe';
    setTheme(newTheme);
  }

  // Load CSV signals and user signals after init
  loadSignalsFromCsv().then(() => {
    loadUserSignals();
  });

  // Initialize theme
  initTheme();

  // Dev-only reset hooks
  if (DEV_RESET_ENABLED) {
    const footer = document.querySelector('.app__footer');
    if (footer) {
      footer.addEventListener('dblclick', () => {
        if (confirm('重置今日次数？')) devResetDailyQuota();
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        devResetDailyQuota();
      }
    });
  }
})();


