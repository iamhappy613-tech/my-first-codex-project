// 完全本地的四级词库；无需网络、账号或构建步骤。
const words = /* WORDSPACE_CATALOG */ null;

const $ = id => document.getElementById(id);
document.querySelectorAll('[data-word-total]').forEach(el => { el.textContent = words.length; });
const DAILY_LIMIT = 43;
const STORAGE_KEY = 'wordspace-adaptive-v2';
const LEGACY_KEY = 'wordspace-seven-day-v1';
const dictionaryId = words.slice(0,300).map(entry => entry.word).join('|');
const wordById = new Map(words.map(entry => [entry.word, entry]));
let storageAvailable = true;
let notice = '';

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function newDay(ids) {
  return { date: today(), ids, first: [], review: [], closed: false };
}

function emptyPlan(mastered = [], priority = []) {
  return WordspaceCore.createPlan(words.slice(0, 300), today(), mastered, priority);
}

function validRecords(day) {
  return day && Array.isArray(day.first) && Array.isArray(day.review) &&
    day.first.length <= day.ids.length &&
    day.review.length <= day.first.filter(answer => answer === false).length &&
    (day.review.length === 0 || day.first.length === day.ids.length) &&
    [...day.first, ...day.review].every(answer => typeof answer === 'boolean');
}

function validIds(ids) {
  return Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id => wordById.has(id));
}

function validPlan(saved) { return WordspaceCore.validatePlan(saved, words); }

function migrateLegacy(raw) {
  const old = JSON.parse(raw);
  if (!old || old.version !== 1 || old.dictionaryId !== dictionaryId || !Array.isArray(old.days) || old.days.length !== 7) return null;
  const known = new Set();
  const priority = [];
  for (let day = 0; day < 7; day++) {
    const ids = words.slice(day * 43, Math.min(day * 43 + 43, words.length)).map(entry => entry.word);
    const records = { ...old.days[day], ids };
    if (!validRecords(records)) return null;
    const missed = ids.filter((_, i) => records.first[i] === false);
    ids.forEach((id, i) => { if (records.first[i] === true) known.add(id); });
    missed.forEach((id, i) => { if (records.review[i] === true) known.add(id); else priority.push(id); });
  }
  notice = `已保留旧版 ${known.size} 个已掌握词，其余单词已排入弹性计划。`;
  return emptyPlan([...known], priority);
}

function loadPlan() {
  try {
    for (const key of ['wordspace:local:v3', STORAGE_KEY]) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try { const saved = JSON.parse(raw); if (validPlan(saved)) return WordspaceCore.migratePlan(saved, words); } catch { /* 保留旧副本，尝试下一份 */ }
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      try { const migrated = migrateLegacy(legacy); if (migrated) return migrated; } catch { /* 损坏的旧记录不会阻止学习 */ }
    }
  } catch { storageAvailable = false; }
  return emptyPlan();
}

let plan = null;
let account = null;

function savePlan() {
  if (account && plan) account.persist(plan);
  renderSaveStatus();
}
function renderSaveStatus() {
  $('save-status').textContent = account ? account.status() : '正在加载学习记录…';
}

function currentDay() { return plan.days.length - 1; }

function getSession(day = plan.activeDay) {
  const records = plan.days[day];
  const group = records.ids.map(id => wordById.get(id));
  const missed = group.filter((_, i) => records.first[i] === false);
  const round = records.first.length < group.length ? 1 : 2;
  const queue = round === 1 ? group : missed;
  const index = round === 1 ? records.first.length : records.review.length;
  const knownHere = new Set(group.filter((_, i) => records.first[i] === true).map(entry => entry.word));
  missed.forEach((entry, i) => { if (records.review[i] === true) knownHere.add(entry.word); });
  return {
    group, records, missed, round, queue, index,
    finished: records.first.length === group.length && records.review.length === missed.length,
    firstKnown: records.first.filter(Boolean).length,
    reviewKnown: records.review.filter(Boolean).length,
    remaining: group.filter(entry => !knownHere.has(entry.word)),
    unattempted: group.length - records.first.length
  };
}

function advanceDay(automatic = false) {
  const session = getSession(currentDay());
  const known = new Set(plan.mastered);
  const carry = session.records.ids.filter(id => !known.has(id));
  const pending = [...new Set([...carry, ...plan.pending])];
  if (!pending.length) return false;
  plan = WordspaceCore.advancePlan(plan, words, today());
  notice = `${automatic ? '新的一天开始了。' : ''}${carry.length} 个未掌握词（含 ${session.unattempted} 个未学词）已优先顺延到第 ${currentDay() + 1} 天，新词依次补足，每天最多 ${DAILY_LIMIT} 词。`;
  stopSpeech();
  savePlan();
  return true;
}

function checkRollover() {
  const session = getSession(currentDay());
  if (session.records.date >= today() || plan.mastered.length === plan.deck_ids.length) return false;
  // 未开始作答的空白日不额外消耗一天；离开多天也只在下次学习时接续一日。
  if (session.records.first.length === 0) {
    session.records.date = today();
    savePlan();
    return false;
  }
  return advanceDay(true);
}

function prepareAction() {
  if (!plan || !account?.canStudy()) return false;
  if (!checkRollover()) return true;
  renderAll();
  return false; // 跨天首次点击只切换日程，不把旧卡片的作答记到新卡片上。
}

function renderPlan() {
  const fragment = document.createDocumentFragment();
  const active = getSession(currentDay());
  const confirmedCarry = active.finished ? active.remaining.length : active.records.review.filter(value => value === false).length;
  const futureCount = Math.ceil((plan.pending.length + confirmedCarry) / DAILY_LIMIT);
  const totalDays = plan.days.length + futureCount;
  for (let day = 0; day < totalDays; day++) {
    const existing = day < plan.days.length;
    const session = existing ? getSession(day) : null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `day-button${session && (session.records.closed || session.finished) ? ' completed' : ''}`;
    button.dataset.day = day;
    button.disabled = !existing;
    button.setAttribute('aria-pressed', String(day === plan.activeDay));
    const status = !existing ? '待开始' : session.records.closed ? `顺延 ${session.remaining.length} 词`
      : session.finished ? (session.remaining.length ? `待顺延 ${session.remaining.length}` : '本日学完 ✓')
      : session.round === 2 ? '复习中' : `${session.records.first.length} / ${session.group.length} 词`;
    button.setAttribute('aria-label', `第 ${day + 1} 天，${status}`);
    for (const [className, text] of [['day-label', `第 ${day + 1} 天`], ['day-status', status]]) {
      const label = document.createElement('span'); label.className = className; label.textContent = text; button.append(label);
    }
    fragment.append(button);
  }
  const focusedDay = document.activeElement.closest('.day-button')?.dataset.day;
  $('day-buttons').replaceChildren(fragment);
  if (focusedDay !== undefined) $('day-buttons').querySelector(`[data-day="${focusedDay}"]`)?.focus({ preventScroll: true });
  $('plan-progress').textContent = `已掌握 ${plan.mastered.length} / ${plan.deck_ids.length} 词`;
  const session = getSession();
  $('day-description').textContent = `第 ${plan.activeDay + 1} 天 · ${session.group.length} 个词 · 预计共 ${totalDays} 个学习日，按掌握情况延长`;
  $('plan-notice').hidden = !notice;
  $('plan-notice').textContent = notice;
  renderSaveStatus();
}

function renderCard(session) {
  const { queue, index, round, firstKnown, reviewKnown, missed } = session;
  const entry = queue[index];
  stopSpeech();
  const inner = document.querySelector('.card-inner');
  inner.style.transition = 'none';
  $('flashcard').classList.remove('flipped');
  $('flashcard').setAttribute('aria-pressed', 'false');
  $('flashcard').setAttribute('aria-label', `${entry.word}，点击查看中文释义和例句`);
  document.querySelector('.card-front').setAttribute('aria-hidden', 'false');
  document.querySelector('.card-back').setAttribute('aria-hidden', 'true');
  for (const key of ['word', 'phonetic', 'meaning', 'example', 'translation']) $(key).textContent = entry[key];
  $('back-word').textContent = entry.word;
  $('current').textContent = String(index + 1).padStart(2, '0');
  $('total').textContent = String(queue.length).padStart(2, '0');
  $('card-number').textContent = `NO. ${String(words.indexOf(entry) + 1).padStart(3, '0')}`;
  $('round-label').innerHTML = `第 ${plan.activeDay + 1} 天 <span>· ${round === 1 ? '第一轮' : '巩固复习'}</span>`;
  $('progress').setAttribute('aria-valuemax', queue.length);
  $('progress').setAttribute('aria-valuenow', index);
  $('progress-fill').style.width = `${index / queue.length * 100}%`;
  $('known-count').textContent = firstKnown + reviewKnown;
  $('unknown-count').textContent = missed.length - reviewKnown;
  void inner.offsetWidth;
  inner.style.removeProperty('transition');
}

function renderResults(session) {
  const { group, records, firstKnown, reviewKnown, remaining } = session;
  $('result-title').textContent = `第 ${plan.activeDay + 1} 天，${records.closed ? '学习记录' : '学到这里啦'}。`;
  $('result-description').textContent = `本日 ${group.length} 词，第一轮认识 ${firstKnown} 词；${remaining.length} 个未掌握词${records.closed ? '已' : '将'}顺延（含 ${session.unattempted} 个未学词）。`;
  $('score').textContent = firstKnown;
  $('score-total').textContent = group.length;
  $('accuracy').textContent = `${Math.round(firstKnown / group.length * 100)}%`;
  $('review-score').textContent = `${reviewKnown} 个`;
  $('remaining').textContent = `${remaining.length} 个`;
  $('remaining-words').textContent = remaining.length ? `${records.closed ? '当时顺延' : '继续巩固'}：${remaining.map(entry => entry.word).join(' · ')}` : '本日词汇都已掌握，继续保持！';
  const allMastered = plan.mastered.length === plan.deck_ids.length;
  $('next-day').hidden = plan.activeDay === currentDay() && allMastered;
  $('next-day').textContent = plan.activeDay < currentDay() ? '回到当前学习 →' : `继续第 ${currentDay() + 2} 天 →`;
  $('again').hidden = plan.activeDay !== currentDay();
  if (allMastered) $('result-description').textContent = `${plan.deck_ids.length} 个词都已掌握，弹性学习计划已完成！`;
}

function renderStudy() {
  const session = getSession();
  const showResults = session.records.closed || session.finished;
  document.querySelector('.app').classList.toggle('is-studying', !showResults);
  $('study').hidden = showResults;
  $('results').hidden = !showResults;
  if (showResults) { stopSpeech(); renderResults(session); }
  else renderCard(session);
}

function renderAll() { renderPlan(); renderStudy(); renderVocabulary(); }

function selectDay(day) {
  if (!prepareAction()) return;
  if (day === plan.days.length) { if (advanceDay()) renderAll(); return; }
  if (!Number.isInteger(day) || day < 0 || day >= plan.days.length) return;
  plan.activeDay = day;
  stopSpeech(); savePlan(); renderAll();
}

function restartDay() {
  if (!prepareAction() || plan.activeDay !== currentDay()) return;
  const ids = new Set(plan.days.at(-1).ids);
  plan.mastered = plan.mastered.filter(id => !ids.has(id));
  const records = plan.days.at(-1);
  records.first = []; records.review = []; records.date = today();
  savePlan(); renderAll(); $('flashcard').focus({ preventScroll: true });
}

function flip() {
  if (!prepareAction()) return;
  const session = getSession();
  if (session.finished || session.records.closed) return;
  const entry = session.queue[session.index];
  const flipped = $('flashcard').classList.toggle('flipped');
  $('flashcard').setAttribute('aria-pressed', String(flipped));
  $('flashcard').setAttribute('aria-label', flipped ? `${entry.word}，${entry.meaning}。例句：${entry.example} ${entry.translation}。点击返回单词正面` : `${entry.word}，点击查看中文释义和例句`);
  document.querySelector('.card-front').setAttribute('aria-hidden', String(flipped));
  document.querySelector('.card-back').setAttribute('aria-hidden', String(!flipped));
}

function answer(known) {
  if (!prepareAction()) return;
  const session = getSession();
  if (session.finished || session.records.closed || plan.activeDay !== currentDay()) return;
  const entry = session.queue[session.index];
  (session.round === 1 ? session.records.first : session.records.review).push(known);
  if (known && !plan.mastered.includes(entry.word)) plan.mastered.push(entry.word);
  if (known && plan.next_day_ids) plan.next_day_ids = plan.next_day_ids.filter(id => id !== entry.word);
  savePlan(); renderPlan(); renderStudy();
  const updated = getSession();
  if (updated.finished) $('result-title').focus({ preventScroll: true });
  else if (session.round === 1 && updated.round === 2) $('announcement').textContent = `现在复习 ${updated.queue.length} 个不熟的词，仍未记住的会顺延。`;
}

// 浏览器原生英语语音，无需 API 密钥。只在用户点击后播放，不自动朗读。
const speechEngine = window.speechSynthesis;
const canSpeak = !!speechEngine && typeof window.SpeechSynthesisUtterance === 'function';
let currentSpeech = null;
let speechToken = 0;

function setSpeechStatus(message) {
  $('speech-status').textContent = message;
  $('vocabulary-speech-status').textContent = message;
  $('audio-announcement').textContent = message;
}

function stopSpeech() {
  speechToken++;
  if (currentSpeech && canSpeak) speechEngine.cancel();
  currentSpeech = null;
  $('stop-speech').disabled = true;
  setSpeechStatus(canSpeak ? '点击听单词或例句，使用设备的英语语音。' : '当前浏览器不支持语音朗读，请换用支持语音的浏览器。');
}

function speakText(text, label) {
  if (!prepareAction()) return;
  if (!canSpeak) { stopSpeech(); return; }
  stopSpeech();
  const token = speechToken;
  const utterance = new SpeechSynthesisUtterance(text);
  const english = speechEngine.getVoices().filter(voice => /^en(?:[-_]|$)/i.test(voice.lang));
  const voice = english.find(voice => /^en-US$/i.test(voice.lang)) || english.find(voice => /^en-GB$/i.test(voice.lang)) || english[0];
  utterance.lang = voice ? voice.lang : 'en-US';
  if (voice) utterance.voice = voice;
  utterance.rate = 0.85;
  utterance.pitch = 1;
  utterance.volume = 1;
  currentSpeech = utterance;
  $('stop-speech').disabled = false;
  setSpeechStatus(`正在准备朗读${label}…`);
  utterance.onstart = () => { if (token === speechToken) setSpeechStatus(`正在朗读${label}…`); };
  utterance.onend = () => { if (token === speechToken) { currentSpeech = null; $('stop-speech').disabled = true; setSpeechStatus('朗读结束，可以再次点击播放。'); } };
  utterance.onerror = event => {
    if (token !== speechToken) return;
    currentSpeech = null; $('stop-speech').disabled = true;
    setSpeechStatus(event.error === 'not-allowed'
      ? '浏览器未允许朗读，请再次点击播放按钮。'
      : '英语朗读暂不可用，请检查设备音量、网络或系统英语语音包，再试一次。');
  };
  try {
    if (speechEngine.paused) speechEngine.resume();
    speechEngine.speak(utterance);
  } catch {
    stopSpeech(); setSpeechStatus('朗读未能启动，请检查系统英语语音设置后再试。');
  }
}

function speakCurrent(example) {
  if (!prepareAction()) return;
  const session = getSession();
  if (session.records.closed || session.finished) return;
  const entry = session.queue[session.index];
  speakText(example ? entry.example : entry.word, example ? '英文例句' : '单词');
}

function renderVocabulary() {
  const showAll = $('vocabulary-scope').value === 'all';
  const source = showAll ? [...words].sort((a,b)=>a.word.localeCompare(b.word)) : getSession().group;
  const query = $('word-search').value.trim().toLowerCase();
  const filtered = source.filter(entry => entry.word.includes(query) || entry.meaning.includes(query));
  $('vocabulary-count').textContent = `${showAll ? '全部' : '所选日'} ${source.length} 词 · 可听读`;
  const fragment = document.createDocumentFragment();
  for (const entry of filtered) {
    const row = document.createElement('li');
    const index = document.createElement('span'); index.className = 'word-index'; index.textContent = String(words.indexOf(entry) + 1).padStart(3, '0');
    const word = document.createElement('button'); word.type = 'button'; word.className = 'list-speak-word'; word.dataset.speakWord = entry.word;
    word.textContent = `${entry.word} ▷`; word.disabled = !canSpeak; word.setAttribute('aria-label', `用英语朗读单词 ${entry.word}`);
    const meaning = document.createElement('span'); meaning.className = 'list-meaning'; meaning.textContent = entry.meaning;
    const example = document.createElement('div'); example.className = 'list-example';
    const sentence = document.createElement('span'); sentence.textContent = entry.example;
    const play = document.createElement('button'); play.type = 'button'; play.className = 'list-speak-example'; play.dataset.speakExample = entry.word;
    play.textContent = '▷ 听例句'; play.disabled = !canSpeak; play.setAttribute('aria-label', `用英语朗读例句：${entry.example}`);
    example.append(sentence, play); row.append(index, word, meaning, example); fragment.append(row);
  }
  $('word-list').replaceChildren(fragment);
  $('search-status').textContent = filtered.length ? `显示 ${filtered.length} / ${source.length} 个单词` : '没有匹配项，请换个关键词或切换查看范围。';
}

$('day-buttons').addEventListener('click', event => {
  const button = event.target.closest('[data-day]'); if (button) selectDay(Number(button.dataset.day));
});
$('flashcard').addEventListener('click', flip);
$('known').addEventListener('click', () => answer(true));
$('unknown').addEventListener('click', () => answer(false));
$('restart').addEventListener('click', () => { if (window.confirm('重学当天？只清空本日记录，其他日期和已掌握词保留。')) restartDay(); });
$('again').addEventListener('click', restartDay);
function goForward() {
  if (!prepareAction()) return;
  if (plan.activeDay < currentDay()) selectDay(currentDay());
  else if (advanceDay()) renderAll();
}
$('next-day').addEventListener('click', goForward);
$('end-day').addEventListener('click', goForward);
$('speak-word').disabled = !canSpeak; $('speak-example').disabled = !canSpeak;
$('speak-word').addEventListener('click', () => speakCurrent(false));
$('speak-example').addEventListener('click', () => speakCurrent(true));
$('stop-speech').addEventListener('click', stopSpeech);
$('word-list').addEventListener('click', event => {
  const button = event.target.closest('[data-speak-word], [data-speak-example]');
  if (!button || button.disabled) return;
  const entry = wordById.get(button.dataset.speakWord || button.dataset.speakExample);
  speakText(button.dataset.speakExample ? entry.example : entry.word, button.dataset.speakExample ? '英文例句' : '单词');
});
$('word-search').addEventListener('input', renderVocabulary);
$('vocabulary-scope').addEventListener('change', () => { stopSpeech(); renderVocabulary(); });
document.addEventListener('keydown', event => {
  if (!plan || !account?.canStudy()) return;
  const session = getSession();
  if (session.finished || session.records.closed || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest('input, textarea, select, [contenteditable], .day-plan, .vocabulary, .audio-controls, .assessment, .proposal, .account-bar, header, footer')) return;
  if (event.code === 'Space') {
    if (document.activeElement.matches('button, a')) return;
    event.preventDefault(); flip();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); answer(event.key === 'ArrowRight');
  }
});
function onReturn() { if (account) void account.resume(); }
window.addEventListener('focus', onReturn);
window.addEventListener('pagehide', stopSpeech);
document.addEventListener('visibilitychange', () => { if (!document.hidden) onReturn(); else stopSpeech(); });
setInterval(() => { if (!document.hidden) onReturn(); }, 60000);
const configuration = JSON.parse(document.getElementById('wordspace-config').textContent);
account = WordspaceAccount.create({config: configuration, catalog: words, hooks: {
  getPlan: () => plan,
  setPlan: state => { plan = state; },
  emptyPlan,
  loadLegacy: loadPlan,
  legacyExists: () => { try { return !!(localStorage.getItem('wordspace:local:v3') || localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY)); } catch { return false; } },
  mergeCatalog: entries => {
    for (const entry of entries) {
      if (!entry.reviewed || entry.id !== entry.word || !['word','phonetic','meaning','example','translation'].every(k => typeof entry[k] === 'string')) continue;
      if (wordById.has(entry.id)) Object.assign(wordById.get(entry.id), entry);
      else { words.push(entry); wordById.set(entry.id, entry); }
    }
  },
  stop: () => { stopSpeech(); plan = null; document.querySelector('.app').classList.remove('is-studying'); },
  render: () => { if (plan) renderAll(); },
  status: renderSaveStatus,
  rollover: () => { if (plan && checkRollover()) renderAll(); }
}});
account.boot().catch(() => { $('auth-message').textContent = '账号服务未能初始化，未上传或覆盖旧记录。请刷新或检查配置。'; });
