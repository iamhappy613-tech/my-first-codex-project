// 完全本地的四级词库；无需网络、账号或构建步骤。
const words = [
  { word: 'achieve', phonetic: '/əˈtʃiːv/', meaning: 'v. 实现；达到', example: 'Small steps help us achieve our goals.', translation: '小小的行动帮助我们实现目标。' },
  { word: 'benefit', phonetic: '/ˈbenɪfɪt/', meaning: 'n. 益处；v. 使受益', example: 'Regular exercise benefits both body and mind.', translation: '规律运动有益身心。' },
  { word: 'challenge', phonetic: '/ˈtʃælɪndʒ/', meaning: 'n. 挑战；v. 向……挑战', example: 'Learning a new language is a challenge.', translation: '学习一门新语言是一项挑战。' },
  { word: 'consider', phonetic: '/kənˈsɪdə(r)/', meaning: 'v. 考虑；认为', example: 'Please consider all the options before you decide.', translation: '请在决定之前考虑所有选项。' },
  { word: 'develop', phonetic: '/dɪˈveləp/', meaning: 'v. 发展；培养', example: 'Reading helps children develop their imagination.', translation: '阅读帮助孩子培养想象力。' },
  { word: 'efficient', phonetic: '/ɪˈfɪʃnt/', meaning: 'adj. 高效的；有效率的', example: 'We need a more efficient way to work.', translation: '我们需要一种更高效的工作方式。' },
  { word: 'environment', phonetic: '/ɪnˈvaɪrənmənt/', meaning: 'n. 环境', example: 'Everyone can help protect the environment.', translation: '每个人都能为保护环境出一份力。' },
  { word: 'essential', phonetic: '/ɪˈsenʃl/', meaning: 'adj. 必不可少的；本质的', example: 'Sleep is essential for good health.', translation: '睡眠对身体健康必不可少。' },
  { word: 'experience', phonetic: '/ɪkˈspɪəriəns/', meaning: 'n. 经验；经历；v. 经历', example: 'Travel gives us valuable experience.', translation: '旅行给予我们宝贵的经历。' },
  { word: 'focus', phonetic: '/ˈfəʊkəs/', meaning: 'v. 集中；n. 焦点', example: 'Try to focus on one task at a time.', translation: '试着一次专注于一项任务。' },
  { word: 'improve', phonetic: '/ɪmˈpruːv/', meaning: 'v. 改善；提高', example: 'Daily practice will improve your English.', translation: '每天练习会提高你的英语水平。' },
  { word: 'independent', phonetic: '/ˌɪndɪˈpendənt/', meaning: 'adj. 独立的；自主的', example: 'She became more independent at university.', translation: '她上大学后变得更加独立。' },
  { word: 'knowledge', phonetic: '/ˈnɒlɪdʒ/', meaning: 'n. 知识；学问', example: 'Books are a rich source of knowledge.', translation: '书籍是丰富的知识来源。' },
  { word: 'maintain', phonetic: '/meɪnˈteɪn/', meaning: 'v. 维持；保养', example: 'It is important to maintain a healthy balance.', translation: '保持健康的平衡很重要。' },
  { word: 'opportunity', phonetic: '/ˌɒpəˈtjuːnəti/', meaning: 'n. 机会；时机', example: 'Every day is an opportunity to learn.', translation: '每一天都是学习的机会。' },
  { word: 'participate', phonetic: '/pɑːˈtɪsɪpeɪt/', meaning: 'v. 参加；参与', example: 'All students can participate in the discussion.', translation: '所有学生都可以参与讨论。' },
  { word: 'patient', phonetic: '/ˈpeɪʃnt/', meaning: 'adj. 耐心的；n. 病人', example: 'Be patient with yourself when learning.', translation: '学习时请对自己多一点耐心。' },
  { word: 'persuade', phonetic: '/pəˈsweɪd/', meaning: 'v. 说服；劝说', example: 'I persuaded my friend to join the club.', translation: '我说服朋友加入了俱乐部。' },
  { word: 'potential', phonetic: '/pəˈtenʃl/', meaning: 'adj. 潜在的；n. 潜力', example: 'Everyone has the potential to grow.', translation: '每个人都有成长的潜力。' },
  { word: 'prefer', phonetic: '/prɪˈfɜː(r)/', meaning: 'v. 更喜欢；宁愿', example: 'I prefer walking to taking the bus.', translation: '比起坐公交车，我更喜欢步行。' },
  { word: 'prevent', phonetic: '/prɪˈvent/', meaning: 'v. 防止；阻止', example: 'Washing your hands helps prevent illness.', translation: '洗手有助于预防疾病。' },
  { word: 'provide', phonetic: '/prəˈvaɪd/', meaning: 'v. 提供；供应', example: 'The library provides a quiet place to study.', translation: '图书馆提供了一个安静的学习场所。' },
  { word: 'reduce', phonetic: '/rɪˈdjuːs/', meaning: 'v. 减少；降低', example: 'We can reduce waste by reusing bags.', translation: '我们可以通过重复使用袋子来减少浪费。' },
  { word: 'require', phonetic: '/rɪˈkwaɪə(r)/', meaning: 'v. 需要；要求', example: 'Good results require time and effort.', translation: '好的结果需要时间和努力。' },
  { word: 'resource', phonetic: '/rɪˈsɔːs/', meaning: 'n. 资源', example: 'Water is a precious natural resource.', translation: '水是一种宝贵的自然资源。' },
  { word: 'responsible', phonetic: '/rɪˈspɒnsəbl/', meaning: 'adj. 负责的；有责任心的', example: 'We are responsible for our own choices.', translation: '我们要对自己的选择负责。' },
  { word: 'significant', phonetic: '/sɪɡˈnɪfɪkənt/', meaning: 'adj. 显著的；重要的', example: 'She made significant progress this month.', translation: '她这个月取得了显著进步。' },
  { word: 'solution', phonetic: '/səˈluːʃn/', meaning: 'n. 解决办法；溶液', example: 'We found a simple solution to the problem.', translation: '我们找到了这个问题的简单解决办法。' },
  { word: 'support', phonetic: '/səˈpɔːt/', meaning: 'v. 支持；n. 支持', example: 'My friends always support my decisions.', translation: '朋友们总是支持我的决定。' },
  { word: 'valuable', phonetic: '/ˈvæljuəbl/', meaning: 'adj. 有价值的；宝贵的', example: 'Your advice was very valuable to me.', translation: '你的建议对我很有价值。' }
];

const $ = (id) => document.getElementById(id);
let queue;
let index;
let round;
let firstKnown;
let missed;
let reviewKnown;
let remaining;
let finished;

function renderCard() {
  const entry = queue[index];
  // 切换单词时直接回到正面，避免回转动画短暂泄露下一个词的释义。
  const inner = document.querySelector('.card-inner');
  inner.style.transition = 'none';
  $('flashcard').classList.remove('flipped');
  $('flashcard').setAttribute('aria-pressed', 'false');
  $('flashcard').setAttribute('aria-label', `${entry.word}，点击查看中文释义和例句`);
  document.querySelector('.card-front').setAttribute('aria-hidden', 'false');
  document.querySelector('.card-back').setAttribute('aria-hidden', 'true');
  for (const key of ['word', 'phonetic', 'meaning', 'example', 'translation']) {
    $(key).textContent = entry[key];
  }
  $('back-word').textContent = entry.word;
  $('current').textContent = String(index + 1).padStart(2, '0');
  $('total').textContent = String(queue.length).padStart(2, '0');
  $('card-number').textContent = `NO. ${String(words.indexOf(entry) + 1).padStart(2, '0')}`;
  $('round-label').innerHTML = round === 1 ? '今日学习 <span>· 第一轮</span>' : '巩固复习 <span>· 最后一轮</span>';
  $('progress').setAttribute('aria-valuemax', queue.length);
  $('progress').setAttribute('aria-valuenow', index);
  $('progress-fill').style.width = `${index / queue.length * 100}%`;
  $('known-count').textContent = firstKnown + reviewKnown;
  $('unknown-count').textContent = missed.length - reviewKnown;
  void inner.offsetWidth;
  inner.style.removeProperty('transition');
}

function start() {
  queue = [...words];
  index = 0;
  round = 1;
  firstKnown = 0;
  missed = [];
  reviewKnown = 0;
  remaining = [];
  finished = false;
  $('study').hidden = false;
  $('results').hidden = true;
  $('announcement').textContent = '';
  renderCard();
}

function flip() {
  if (finished) return;
  const flipped = $('flashcard').classList.toggle('flipped');
  $('flashcard').setAttribute('aria-pressed', String(flipped));
  const entry = queue[index];
  $('flashcard').setAttribute('aria-label', flipped ? `${entry.word}，${entry.meaning}。例句：${entry.example} ${entry.translation}。点击返回单词正面` : `${entry.word}，点击查看中文释义和例句`);
  document.querySelector('.card-front').setAttribute('aria-hidden', String(flipped));
  document.querySelector('.card-back').setAttribute('aria-hidden', String(!flipped));
}

function answer(known) {
  if (finished) return;
  if (round === 1) {
    if (known) firstKnown++;
    else missed.push(queue[index]);
  } else {
    if (known) reviewKnown++;
    else remaining.push(queue[index]);
  }
  index++;
  if (index === queue.length) {
    if (round === 1 && missed.length) {
      round = 2;
      queue = [...missed];
      index = 0;
      $('announcement').textContent = `第一轮结束，现在复习 ${queue.length} 个不认识的单词。`;
    } else {
      finish();
      return;
    }
  }
  renderCard();
}

function finish() {
  finished = true;
  $('study').hidden = true;
  $('results').hidden = false;
  $('score').textContent = firstKnown;
  $('accuracy').textContent = `${Math.round(firstKnown / words.length * 100)}%`;
  $('review-score').textContent = `${reviewKnown} 个`;
  $('remaining').textContent = `${remaining.length} 个`;
  $('remaining-words').textContent = remaining.length ? `下次再加油：${remaining.map(entry => entry.word).join(' · ')}` : '这一轮的词汇都记住了，继续保持！';
  // 把键盘焦点带到结果区，让键盘及读屏用户知道本轮已结束。
  $('result-title').setAttribute('tabindex', '-1');
  $('result-title').focus({ preventScroll: true });
}

$('flashcard').addEventListener('click', flip);
$('known').addEventListener('click', () => answer(true));
$('unknown').addEventListener('click', () => answer(false));
$('restart').addEventListener('click', () => {
  if (window.confirm('重新开始会清空本轮进度，确定重新开始吗？')) {
    start();
    $('flashcard').focus({ preventScroll: true });
  }
});
$('again').addEventListener('click', () => {
  start();
  $('flashcard').focus({ preventScroll: true });
});
document.addEventListener('keydown', (event) => {
  if (finished || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'Space') {
    // 按钮自身已支持空格触发，保留其原生键盘行为。
    if (document.activeElement.tagName === 'BUTTON' || document.activeElement.tagName === 'A') return;
    event.preventDefault();
    flip();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    answer(event.key === 'ArrowRight');
  }
});
start();
