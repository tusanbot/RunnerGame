import type { Session } from '@supabase/supabase-js';
import {
  getInitialAuthState,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  subscribeAuth,
  updatePassword,
  type AuthState,
} from '../services/auth';
import { isSupabaseConfigured } from '../lib/supabase';

export class AuthUi {
  private root: HTMLDivElement;
  private modal: HTMLDivElement;
  private title: HTMLHeadingElement;
  private message: HTMLDivElement;
  private email!: HTMLInputElement;
  private password!: HTMLInputElement;
  private name!: HTMLInputElement;
  private action!: HTMLButtonElement;
  private secondary!: HTMLButtonElement;
  private reset!: HTMLButtonElement;
  private close!: HTMLButtonElement;
  private account!: HTMLButtonElement;
  private mode: 'login' | 'signup' = 'login';
  private session: Session | null = null;
  private stateCallback: (state: AuthState) => void;
  private unsubscribe = () => undefined;

  constructor(onState: (state: AuthState) => void) {
    this.stateCallback = onState;
    this.root = document.createElement('div');
    this.root.className = 'runner-auth-root';
    document.body.appendChild(this.root);

    this.account = document.createElement('button');
    this.account.className = 'runner-account-button';
    this.account.type = 'button';
    this.account.addEventListener('click', () => {
      if (this.session) this.openAccount();
      else this.openAuth('login');
    });
    this.root.appendChild(this.account);

    this.modal = document.createElement('div');
    this.modal.className = 'runner-auth-backdrop hidden';
    this.modal.innerHTML = `
      <div class="runner-auth-modal" role="dialog" aria-modal="true">
        <button class="runner-auth-close" type="button" aria-label="بستن">×</button>
        <div class="runner-auth-brand">🏃‍♂️</div>
        <h2></h2>
        <div class="runner-auth-message"></div>
        <form>
          <label class="runner-auth-name-wrap">نام نمایشی<input name="name" autocomplete="nickname" maxlength="24" placeholder="مثلاً محمد"></label>
          <label>ایمیل<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
          <label>رمز عبور<input name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="حداقل ۶ کاراکتر"></label>
          <button class="runner-auth-action" type="submit"></button>
        </form>
        <button class="runner-auth-secondary" type="button"></button>
        <button class="runner-auth-reset" type="button">فراموشی رمز عبور</button>
      </div>`;
    this.root.appendChild(this.modal);

    this.title = this.modal.querySelector('h2')!;
    this.message = this.modal.querySelector('.runner-auth-message')!;
    this.email = this.modal.querySelector('input[name="email"]')!;
    this.password = this.modal.querySelector('input[name="password"]')!;
    this.name = this.modal.querySelector('input[name="name"]')!;
    this.action = this.modal.querySelector('.runner-auth-action')!;
    this.secondary = this.modal.querySelector('.runner-auth-secondary')!;
    this.reset = this.modal.querySelector('.runner-auth-reset')!;
    this.close = this.modal.querySelector('.runner-auth-close')!;

    this.modal.querySelector('form')!.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
    this.secondary.addEventListener('click', () => this.toggleMode());
    this.reset.addEventListener('click', () => void this.resetPassword());
    this.close.addEventListener('click', () => this.closeModal());
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) this.closeModal();
    });

    this.applyMode();
    this.renderAccount();
    void this.initialize();
  }

  private async initialize() {
    if (!isSupabaseConfigured) {
      this.account.textContent = '👤 ورود / ثبت‌نام';
      this.message.textContent = 'برای فعال شدن حساب آنلاین، متغیرهای Supabase را در محیط Build تنظیم کن.';
      return;
    }

    const initial = await getInitialAuthState();
    this.session = initial.session;
    this.stateCallback(initial);
    this.renderAccount();

    this.unsubscribe = subscribeAuth((event, session) => {
      this.session = session;
      void this.handleAuthChange(event);
    });

    if (window.location.hash.includes('type=recovery')) {
      this.openRecovery();
    }
  }

  private async handleAuthChange(event: string) {
    if (!this.session) {
      const initial = await getInitialAuthState();
      this.stateCallback(initial);
      this.renderAccount();
      return;
    }

    const initial = await getInitialAuthState();
    this.stateCallback(initial);
    this.renderAccount();

    if (event === 'SIGNED_IN') this.closeModal();
  }

  private renderAccount() {
    if (this.session?.user) {
      const name = this.session.user.user_metadata?.display_name
        || this.session.user.email?.split('@')[0]
        || 'بازیکن';
      this.account.textContent = `👤 ${name}`;
      this.account.classList.add('signed-in');
    } else {
      this.account.textContent = '👤 ورود / ثبت‌نام';
      this.account.classList.remove('signed-in');
    }
  }

  private openAuth(mode: 'login' | 'signup') {
    this.mode = mode;
    this.applyMode();
    this.modal.classList.remove('hidden');
    setTimeout(() => this.email.focus(), 0);
  }

  private openAccount() {
    this.mode = 'login';
    this.title.textContent = 'حساب بازیکن';
    this.message.textContent = this.session?.user.email ?? '';
    this.modal.querySelector('form')!.classList.add('hidden');
    this.secondary.classList.add('hidden');
    this.reset.classList.add('hidden');
    this.action.classList.add('hidden');

    let logout = this.modal.querySelector('.runner-auth-logout') as HTMLButtonElement | null;
    if (!logout) {
      logout = document.createElement('button');
      logout.className = 'runner-auth-logout';
      logout.type = 'button';
      logout.textContent = 'خروج از حساب';
      logout.addEventListener('click', async () => {
        const result = await signOut();
        if (result.error) this.setMessage(result.error.message, true);
        else this.closeModal();
      });
      this.modal.querySelector('.runner-auth-modal')!.appendChild(logout);
    }
    logout.classList.remove('hidden');
    this.modal.classList.remove('hidden');
  }

  private openRecovery() {
    this.title.textContent = 'تغییر رمز عبور';
    this.message.textContent = 'رمز عبور جدیدت را وارد کن.';
    this.modal.querySelector('form')!.classList.remove('hidden');
    this.name.classList.add('hidden');
    this.email.parentElement!.classList.add('hidden');
    this.password.value = '';
    this.action.textContent = 'ذخیره رمز جدید';
    this.secondary.classList.add('hidden');
    this.reset.classList.add('hidden');
    this.modal.classList.remove('hidden');
    this.modal.querySelector('form')!.onsubmit = (event) => {
      event.preventDefault();
      void this.changePassword();
    };
  }

  private async changePassword() {
    const password = this.password.value.trim();
    if (password.length < 6) {
      this.setMessage('رمز عبور باید حداقل ۶ کاراکتر باشد.', true);
      return;
    }
    const { error } = await updatePassword(password);
    if (error) {
      this.setMessage(error.message, true);
      return;
    }
    this.setMessage('رمز عبور با موفقیت تغییر کرد.');
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    setTimeout(() => this.closeModal(), 900);
  }

  private async submit() {
    this.setBusy(true);
    const email = this.email.value.trim();
    const password = this.password.value;
    try {
      if (this.mode === 'signup') {
        const result = await signUp(email, password, this.name.value);
        if (result.error) {
          this.setMessage(result.error.message, true);
        } else if (!result.data.session) {
          this.setMessage('حساب ساخته شد. ایمیل تأیید را بررسی کن، سپس وارد شو.');
        } else {
          this.setMessage('حساب با موفقیت ساخته شد.');
        }
      } else {
        const result = await signIn(email, password);
        if (result.error) this.setMessage(result.error.message, true);
      }
    } finally {
      this.setBusy(false);
    }
  }

  private async resetPassword() {
    const email = this.email.value.trim();
    if (!email) {
      this.setMessage('ابتدا ایمیل را وارد کن.', true);
      this.email.focus();
      return;
    }
    this.setBusy(true);
    const { error } = await sendPasswordReset(email);
    this.setBusy(false);
    this.setMessage(error
      ? error.message
      : 'اگر این ایمیل حسابی داشته باشد، لینک تغییر رمز برایت ارسال می‌شود.');
  }

  private toggleMode() {
    this.mode = this.mode === 'login' ? 'signup' : 'login';
    this.applyMode();
  }

  private applyMode() {
    this.modal.querySelector('form')!.classList.remove('hidden');
    this.name.parentElement!.classList.toggle('hidden', this.mode !== 'signup');
    this.email.parentElement!.classList.remove('hidden');
    this.password.parentElement!.classList.remove('hidden');
    this.title.textContent = this.mode === 'login' ? 'ورود به Runner Legends' : 'ساخت حساب بازیکن';
    this.action.textContent = this.mode === 'login' ? 'ورود' : 'ساخت حساب';
    this.secondary.textContent = this.mode === 'login' ? 'حساب ندارم؛ ثبت‌نام' : 'قبلاً حساب ساخته‌ام؛ ورود';
    this.secondary.classList.remove('hidden');
    this.reset.classList.toggle('hidden', this.mode !== 'login');
    this.action.classList.remove('hidden');
    this.message.textContent = '';
    const logout = this.modal.querySelector('.runner-auth-logout');
    logout?.classList.add('hidden');
    this.modal.querySelector('form')!.onsubmit = null;
  }

  private setBusy(busy: boolean) {
    this.action.disabled = busy;
    this.secondary.disabled = busy;
    this.reset.disabled = busy;
    this.action.textContent = busy ? 'در حال پردازش…' : (this.mode === 'login' ? 'ورود' : 'ساخت حساب');
  }

  private setMessage(message: string, error = false) {
    this.message.textContent = message;
    this.message.classList.toggle('error', error);
  }

  private closeModal() {
    this.modal.classList.add('hidden');
  }

  destroy() {
    this.unsubscribe();
    this.root.remove();
  }
}
