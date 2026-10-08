import { getRunnerLoadout, getShopItems, purchaseItem, toggleRunnerLoadout, type RunnerLoadout, type ShopItem } from '../services/shop';
import type { PlayerProgress } from '../services/playerProgress';

const loadoutKey: Record<string, keyof RunnerLoadout> = {
  shield: 'shield',
  magnet: 'magnet',
  turbo: 'turbo',
  coin_boost: 'coinBoost',
};

export class ShopUi {
  private root = document.createElement('div');
  private getProgress: () => PlayerProgress;
  private setProgress: (p: PlayerProgress) => void;
  private progress: PlayerProgress;
  private loadout: RunnerLoadout = getRunnerLoadout();

  constructor(getProgress: () => PlayerProgress, setProgress: (p: PlayerProgress) => void) {
    this.getProgress = getProgress;
    this.setProgress = setProgress;
    this.progress = getProgress();
    this.root.className = 'runner-shop-root';
    this.root.innerHTML = '<button class="runner-shop-open">🛒 فروشگاه</button><div class="runner-shop-backdrop hidden"><section class="runner-shop-modal"><button class="runner-shop-close">×</button><div class="runner-shop-title">🛒 فروشگاه</div><div class="runner-shop-balance"></div><div class="runner-shop-loadout"></div><div class="runner-shop-grid"></div></section></div>';
    document.body.appendChild(this.root);

    const backdrop = this.root.querySelector('.runner-shop-backdrop') as HTMLElement;
    (this.root.querySelector('.runner-shop-close') as HTMLButtonElement).onclick = () => backdrop.classList.add('hidden');
    (this.root.querySelector('.runner-shop-open') as HTMLButtonElement).onclick = async () => {
      this.progress = this.getProgress();
      if (this.progress.userId === 'guest') { this.showMessage('برای خرید آنلاین ابتدا وارد حساب شوید.'); return; }
      this.loadout = getRunnerLoadout();
      backdrop.classList.remove('hidden');
      await this.render();
    };
  }

  private showMessage(message: string) {
    const backdrop = this.root.querySelector('.runner-shop-backdrop') as HTMLElement;
    const grid = this.root.querySelector('.runner-shop-grid') as HTMLElement;
    backdrop.classList.remove('hidden');
    grid.innerHTML = '<div class="runner-shop-empty"></div>';
    (grid.firstElementChild as HTMLElement).textContent = message;
  }

  async render() {
    const items = await getShopItems();
    this.loadout = getRunnerLoadout();
    (this.root.querySelector('.runner-shop-balance') as HTMLElement).textContent = '🪙 موجودی: ' + this.progress.coins;
    (this.root.querySelector('.runner-shop-loadout') as HTMLElement).innerHTML =
      '<div class="runner-shop-loadout-title">🎒 تجهیزات بازی بعدی</div><div class="runner-shop-loadout-help">آیتم را انتخاب کن؛ هنگام شروع بازی فقط همان یک عدد مصرف می‌شود.</div><div class="runner-shop-loadout-chips">' +
      items.filter((i) => this.loadout[loadoutKey[i.id]]).map((i) => '<span>' + i.emoji + ' ' + i.title + '</span>').join('') +
      '</div>';

    const grid = this.root.querySelector('.runner-shop-grid') as HTMLElement;
    if (!items.length) { grid.innerHTML = '<div class="runner-shop-empty">فروشگاه فعلاً در دسترس نیست.</div>'; return; }

    grid.innerHTML = items.map((i) => this.card(i)).join('');

    grid.querySelectorAll<HTMLElement>('[data-buy]').forEach((button) => button.onclick = async () => {
      const id = button.dataset.buy!;
      const result = await purchaseItem(id);
      if (result) {
        this.progress = {
          ...this.progress,
          coins: Number(result.coins),
          inventory: { ...this.progress.inventory, [id]: Number(result.quantity) },
          updatedAt: new Date().toISOString(),
        };
        this.setProgress(this.progress);
      }
      await this.render();
    });

    grid.querySelectorAll<HTMLElement>('[data-equip]').forEach((button) => button.onclick = async () => {
      const id = button.dataset.equip!;
      const key = loadoutKey[id];
      if (!key) return;
      const item = items.find((x) => x.id === id);
      if (!item || item.quantity < 1) return;
      this.loadout = toggleRunnerLoadout(id, !this.loadout[key]);
      await this.render();
    });
  }

  private card(i: ShopItem) {
    const key = loadoutKey[i.id];
    const equipped = Boolean(key && this.loadout[key]);
    const canBuy = this.progress.coins >= i.priceCoins && i.quantity < i.maxInventory;
    const canEquip = i.quantity > 0;

    return '<article class="runner-shop-card">' +
      '<div class="runner-shop-icon">' + i.emoji + '</div>' +
      '<div class="runner-shop-name">' + i.title + '</div>' +
      '<div class="runner-shop-desc">' + i.description + '</div>' +
      '<div class="runner-shop-meta"><span>🪙 ' + i.priceCoins + '</span><span>دارایی: ' + i.quantity + '</span></div>' +
      '<button data-buy="' + i.id + '" ' + (canBuy ? '' : 'disabled') + '>خرید</button>' +
      '<button class="secondary ' + (equipped ? 'equipped' : '') + '" data-equip="' + i.id + '" ' + (canEquip ? '' : 'disabled') + '>' +
      (equipped ? '✅ آماده بازی' : '⚙️ آماده‌سازی') + '</button>' +
      '</article>';
  }

  setProgress(progress: PlayerProgress) { this.progress = progress; }
  destroy() { this.root.remove(); }
}
