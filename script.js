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
  const DRAWN_SIGNALS_KEY = 'cosmic_drawn_signals'; // 存储用户已抽取的信号ID列表
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

  /**
   * ============================================================
   * 去重功能实现逻辑说明
   * ============================================================
   * 
   * 【核心目标】
   * 确保同一个用户不会抽到重复的内容，直到所有内容都被抽取过一遍后重新开始
   * 
   * 【实现机制】
   * 
   * 1. 唯一标识生成
   *    - 每个信号通过 main + sec + from 三个字段组合生成唯一ID
   *    - 格式: "main内容|sec内容|from来源"
   *    - 只要这三个字段相同，就视为同一个信号
   * 
   * 2. 已抽取记录存储
   *    - 使用 localStorage 存储已抽取信号的ID列表
   *    - 存储键: 'cosmic_drawn_signals'
   *    - 存储格式: JSON数组，例如: ["信号1ID", "信号2ID", ...]
   *    - 持久化保存，页面刷新后依然有效
   * 
   * 3. 过滤逻辑
   *    - 每次抽取时，先从所有信号中过滤出未在已抽取列表中的信号
   *    - 从可用信号中随机选择一个
   *    - 立即标记为已抽取（防止竞态条件）
   * 
   * 4. 自动重置机制
   *    - 当所有信号都被抽取过（availableSignals.length === 0）时
   *    - 自动清除已抽取记录，重新开始新一轮
   *    - 用户可以重新抽取所有信号
   * 
   * 【技术细节】
   * 
   * - 存储位置: localStorage（浏览器本地存储）
   * - 存储容量: 理论上可存储数千个信号ID（每个ID约50-200字符）
   * - 性能考虑: 
   *   * 每次抽卡需要读取一次 localStorage
   *   * 每次标记需要写入一次 localStorage
   *   * 过滤操作使用 Array.filter()，O(n) 时间复杂度
   * 
   * - 竞态条件防护:
   *   * 在 getRandomSignal() 中立即标记，而不是在 showCard() 中
   *   * 确保信号在被选中时就被锁定，避免重复
   * 
   * 【使用场景】
   * - 用户第一次抽卡: 从所有信号中随机选择
   * - 用户后续抽卡: 从未抽取的信号中选择
   * - 全部抽完后: 自动重置，可以重新抽取所有信号
   * 
   * 【注意事项】
   * - 已抽取记录不会自动清除（除非全部抽完或手动重置）
   * - 清除浏览器数据会导致记录丢失
   * - 开发调试可使用 Alt+R 或双击页脚重置
   * 
   * ============================================================
   */

  /**
   * 去重功能核心实现 - 生成信号的唯一标识符
   * 
   * 实现原理：
   * 通过组合信号的三个关键字段（main、sec、from）生成唯一ID
   * 使用 "|" 作为分隔符，确保不同信号有不同的ID
   * 
   * 重要：确保信号对象字段存在且为字符串，避免undefined导致的ID不一致
   * 
   * @param {Object} signal - 信号对象，包含 main、sec、from 字段
   * @returns {string} 信号的唯一标识符，格式: "main内容|sec内容|from来源"
   * 
   * @example
   * getSignalId({main: "左转", sec: "看看", from: "universe"})
   * // 返回: "左转|看看|universe"
   */
  function getSignalId(signal) {
    // 确保所有字段都存在且为字符串，避免undefined导致ID不一致
    const main = String(signal.main || '').trim();
    const sec = String(signal.sec || '').trim();
    const from = String(signal.from || '').trim();
    return `${main}|${sec}|${from}`;
  }

  /**
   * 去重功能 - 获取用户已抽取的信号ID列表
   * 
   * 实现原理：
   * 从 localStorage 中读取已抽取信号的ID列表
   * 如果不存在或解析失败，返回空数组
   * 
   * @returns {Array<string>} 已抽取信号的ID数组
   */
  function getDrawnSignals() {
    try {
      return JSON.parse(localStorage.getItem(DRAWN_SIGNALS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  /**
   * 去重功能 - 标记信号为已抽取
   * 
   * 实现原理：
   * 1. 获取当前已抽取信号列表
   * 2. 生成当前信号的唯一ID
   * 3. 如果ID不在列表中，则添加到列表并保存到 localStorage
   * 4. 如果ID已在列表中，输出警告（理论上不应该发生）
   * 
   * 存储机制：
   * - 使用 localStorage 持久化存储，刷新页面后依然有效
   * - 只有在用户清除浏览器数据或调用重置函数时才会清除
   * 
   * @param {Object} signal - 要标记的信号对象
   */
  function markSignalAsDrawn(signal) {
    const drawnSignals = getDrawnSignals();
    const signalId = getSignalId(signal);
    
    // 调试：检查信号ID是否已存在
    if (drawnSignals.includes(signalId)) {
      console.warn('⚠️ 警告: 尝试标记已存在的信号:', signalId);
      console.warn('信号内容:', signal);
      console.warn('当前已抽取列表:', drawnSignals);
      return; // 如果已存在，直接返回，不重复添加
    }
    
    // 添加到列表并保存
    drawnSignals.push(signalId);
    localStorage.setItem(DRAWN_SIGNALS_KEY, JSON.stringify(drawnSignals));
    console.log('✅ 已标记信号:', signalId, '当前已抽取数:', drawnSignals.length);
  }

  /**
   * 去重功能 - 重置已抽取信号列表
   * 
   * 实现原理：
   * 当所有信号都已被抽取过时，清除 localStorage 中的记录
   * 这样下一轮抽卡就可以从所有信号中重新开始抽取
   * 
   * 触发时机：
   * - 在 getRandomSignal() 中检测到 availableSignals.length === 0 时自动调用
   * - 在开发重置功能中手动调用（Alt+R 或双击页脚）
   */
  function resetDrawnSignals() {
    localStorage.removeItem(DRAWN_SIGNALS_KEY);
  }

  /**
   * 去重功能核心逻辑 - 获取未抽取过的随机信号
   * 
   * 实现原理（完整流程）：
   * 
   * 1. 【获取已抽取列表】
   *    从 localStorage 读取用户已抽取的信号ID列表
   * 
   * 2. 【过滤可用信号】
   *    遍历所有信号，过滤出未在已抽取列表中的信号
   *    通过比较信号的唯一ID来判断是否已抽取
   * 
   * 3. 【检查是否全部抽完】
   *    如果可用信号数为0，说明所有信号都已抽取过
   *    此时重置已抽取列表，重新开始新一轮
   * 
   * 4. 【随机选择】
   *    从可用信号列表中随机选择一个信号
   * 
   * 5. 【立即标记】（关键！防止竞态条件）
   *    在返回信号之前就立即标记为已抽取
   *    这样可以避免快速连续点击导致重复抽取的问题
   * 
   * 竞态条件防护：
   * - 如果标记操作放在 showCard() 中，快速点击可能在同一时刻多次调用 getRandomSignal()
   * - 此时可能获取到同一个信号，导致重复
   * - 解决方案：在获取信号后立即标记，确保信号在被选中时就已被记录
   * 
   * @returns {Object} 一个未被用户抽取过的随机信号对象
   */
  function getRandomSignal() {
    // 步骤1: 获取已抽取的信号ID列表
    const drawnSignals = getDrawnSignals();
    console.log('📊 当前已抽取信号数:', drawnSignals.length, '总信号数:', signals.length);
    
    // 步骤2: 过滤出所有未抽取的信号
    // 遍历所有信号，通过比较唯一ID来判断是否在已抽取列表中
    const availableSignals = signals.filter(signal => {
      const signalId = getSignalId(signal);
      const isDrawn = drawnSignals.includes(signalId);
      
      // 调试：如果发现重复，输出详细信息
      if (isDrawn) {
        console.warn('🔍 发现已抽取的信号:', signalId);
        console.warn('  信号内容:', signal);
      }
      
      return !isDrawn;
    });

    console.log('✅ 可用信号数:', availableSignals.length);

    // 步骤3: 检查是否所有信号都已抽取过
    if (availableSignals.length === 0) {
      // 重置已抽取列表，开始新一轮
      resetDrawnSignals();
      console.log('🔄 所有信号都已抽取过，重置列表');
      // 递归调用自身，重新从所有信号中选择
      return getRandomSignal();
    }

    // 步骤4: 从可用信号中随机选择一个
    const index = Math.floor(Math.random() * availableSignals.length);
    const selectedSignal = availableSignals[index];
    const selectedSignalId = getSignalId(selectedSignal);
    
    console.log('🎲 选中信号ID:', selectedSignalId);
    console.log('🎲 选中信号内容:', selectedSignal);
    
    // 步骤5: 立即标记为已抽取（关键步骤！）
    // 在返回信号之前就标记，防止竞态条件
    markSignalAsDrawn(selectedSignal);
    
    // 双重检查：确认标记成功
    const afterMark = getDrawnSignals();
    if (!afterMark.includes(selectedSignalId)) {
      console.error('❌ 错误: 标记失败！信号ID:', selectedSignalId);
    }
    
    return selectedSignal;
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
    resetDrawnSignals();
    updateButtonStates();
    showToast('已重置今日次数和已抽取记录');
  }

  /**
   * 调试辅助函数 - 查看已抽取的信号列表
   * 在浏览器控制台可以直接输入: debugDrawnSignals() 或 window.debugDrawnSignals()
   */
  function debugDrawnSignals() {
    const drawnSignals = getDrawnSignals();
    console.log('📋 已抽取的信号ID列表 (共', drawnSignals.length, '条):');
    drawnSignals.forEach((id, index) => {
      console.log(`${index + 1}. ${id}`);
    });
    
    // 尝试匹配对应的信号内容
    console.log('\n📋 已抽取的信号内容:');
    drawnSignals.forEach((id, index) => {
      const matchedSignal = signals.find(s => getSignalId(s) === id);
      if (matchedSignal) {
        console.log(`${index + 1}. ${matchedSignal.main} | ${matchedSignal.sec}`);
      } else {
        console.log(`${index + 1}. [未找到匹配的信号] ${id}`);
      }
    });
    
    return drawnSignals;
  }
  
  // 同时添加到window对象，方便在控制台调用
  window.debugDrawnSignals = debugDrawnSignals;
  
  // 页面加载后自动输出已抽取信息（方便调试）
  console.log('🔧 调试工具已加载！');
  console.log('📝 在控制台输入以下命令查看信息:');
  console.log('   debugDrawnSignals() - 查看已抽取的信号');
  console.log('   或者直接: localStorage.getItem("cosmic_drawn_signals") - 查看原始数据');

  /**
   * 调试辅助函数 - 验证当前信号的ID
   * 在浏览器控制台输入: window.debugSignalId(signal) 可以验证
   */
  window.debugSignalId = function(signal) {
    const signalId = getSignalId(signal);
    console.log('🔍 信号ID:', signalId);
    console.log('🔍 信号内容:', signal);
    console.log('🔍 是否已抽取:', getDrawnSignals().includes(signalId));
    return signalId;
  };


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


