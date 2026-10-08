import { getLeaderboard, type LeaderboardEntry, type LeaderboardMode } from '../services/leaderboard';

const characterEmoji: Record<string, string> = {
  amirreza: '🧑🏻',
  reza: '🧑🏼',
  taha: '🧑🏻‍🦱',
  mohna: '🐰',
  abolfazl: '⚽',
  mohammad: '🤹',
};

export class LeaderboardUi {
  private root = document.createElement('div');
  private mode: LeaderboardMode = 'distance';

  constructor() {
    this.root.className = 'runner-leaderboard-root';
    this.root.innerHTML = `
      <button class="runner-leaderboard-open">🏆 رتبه‌بندی</button>
      <div class="runner-leaderboard-backdrop hidden">
        <section class="runner-leaderboard-modal">
          <button class="runner-leaderboard-close">×</button>
          <div class="runner-leaderboard-title">🏆 رتبه‌بندی آنلاین</div>
          <div class="runner-leaderboard-subtitle">بهترین دونده‌های Runner Legends</div>
          <div class="runner-leaderboard-tabs">
            <button data-mode="distance" class="active">🏃 مسافت</button>
            <button data-mode="level">⭐ سطح</button>
          </div>
          <div class="runner-leaderboard-me"></div>
          <div class="runner-leaderboard-list"></div>
        </section>
      </div>`;
    document.body.appendChild(this.root);

    const backdrop = this.root.querySelector('.runner-leaderboard-backdrop') as HTMLElement;
    (this.root.querySelector('.runner-leaderboard-close') as HTMLButtonElement).onclick = () => backdrop.classList.add('hidden');
    (this.root.querySelector('.runner-leaderboard-open') as HTMLButtonElement).onclick = async () => {
      backdrop.classList.remove('hidden');
      await this.render();
    };

    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.onclick = async () => {
        this.mode = button.dataset.mode === 'level' ? 'level' : 'distance';
        this.root.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('active', item === button));
        await this.render();
      };
    });
  }

  private formatScore(entry: LeaderboardEntry) {
    return this.mode === 'distance'
      ? `🏃 ${entry.bestDistance.toLocaleString('fa-IR')} متر`
      : `⭐ سطح ${entry.level} • ${entry.xp.toLocaleString('fa-IR')} XP`;
  }

  async render() {
    const list = this.root.querySelector('.runner-leaderboard-list') as HTMLElement;
    const me = this.root.querySelector('.runner-leaderboard-me') as HTMLElement;
    list.innerHTML = '<div class="runner-leaderboard-loading">در حال دریافت رتبه‌ها...</div>';
    me.innerHTML = '';

    const snapshot = await getLeaderboard(this.mode);
    if (!snapshot) {
      list.innerHTML = '<div class="runner-leaderboard-empty">رتبه‌بندی فعلاً در دسترس نیست.</div>';
      return;
    }

    if (snapshot.myEntry) {
      me.innerHTML = `
        <div class="runner-leaderboard-my-card">
          <div><strong>رتبه من: #${snapshot.myRank}</strong></div>
          <div>${characterEmoji[snapshot.myEntry.activeCharacterId] ?? '🏃'} ${this.escape(snapshot.myEntry.displayName)}</div>
          <div>${this.formatScore(snapshot.myEntry)}</div>
        </div>`;
    } else {
      me.innerHTML = '<div class="runner-leaderboard-guest">برای نمایش رتبه شخصی، وارد حساب شوید و یک رکورد ثبت کنید.</div>';
    }

    if (!snapshot.entries.length) {
      list.innerHTML = '<div class="runner-leaderboard-empty">هنوز رکوردی ثبت نشده است.</div>';
      return;
    }

    list.innerHTML = snapshot.entries.map((entry) => `
      <div class="runner-leaderboard-row ${entry.rank <= 3 ? 'top' : ''}">
        <div class="runner-leaderboard-rank">${this.medal(entry.rank)}</div>
        <div class="runner-leaderboard-player">
          <span class="runner-leaderboard-avatar">${characterEmoji[entry.activeCharacterId] ?? '🏃'}</span>
          <span>
            <strong>${this.escape(entry.displayName)}</strong>
            <small>سطح ${entry.level}</small>
          </span>
        </div>
        <div class="runner-leaderboard-score">${this.formatScore(entry)}</div>
      </div>`).join('');
  }

  private medal(rank: number) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char] ?? char));
  }

  destroy() {
    this.root.remove();
  }
}
