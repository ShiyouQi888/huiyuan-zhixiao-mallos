import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertCircle, Eye, EyeOff, LoaderCircle, Lock, Phone, ShieldCheck, Sun, TrendingUp } from 'lucide-react';
import { Button, Field, TextInput } from '../components/ui';
import { api, ApiError, clearAdminAccessSnapshot, getAdminRole } from '../api';
import { ThemeToggle } from '../components/ThemeToggle';

export function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const phoneValid = /^1[3-9]\d{9}$/.test(phone);
  const canSubmit = phoneValid && password.length > 0 && !loading;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!phoneValid || !password || loading) {
      setError('请输入有效的管理员手机号和登录密码');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });
      clearAdminAccessSnapshot();
      localStorage.setItem('solar_admin_token', data.token);
      if (!getAdminRole()) {
        localStorage.removeItem('solar_admin_token');
        setError('此账号暂未开通管理后台权限，请联系系统管理员');
        return;
      }
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-10 sm:px-8 sm:py-12">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="login-glow login-glow-top" />
        <div className="login-glow login-glow-bottom" />
      </div>
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6"><ThemeToggle /></div>

      <div className="login-frame relative z-10 grid w-full max-w-[1020px] overflow-hidden rounded-2xl border border-line bg-panel shadow-pop lg:min-h-[600px] lg:grid-cols-[1fr_1fr]">
        <aside className="login-brand-panel relative hidden flex-col justify-between overflow-hidden p-9 text-white lg:flex xl:p-11">
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <span className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                <Sun size={21} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="flex flex-col gap-0.5">
                <strong className="text-sm font-semibold tracking-wide">太阳线会员系统</strong>
                <span className="text-[10px] font-medium tracking-[0.14em] text-white/70">OPERATIONS CONSOLE</span>
              </span>
            </div>

            <div className="mt-16 max-w-[370px]">
              <p className="login-overline">MEMBER COMMERCE PLATFORM</p>
              <h1 className="mt-3 text-[32px] font-semibold leading-[1.35] tracking-tight">
                让会员运营
                <br />
                更清晰、更高效
              </h1>
              <p className="mt-4 max-w-[350px] text-[13px] leading-6 text-white/78">
                统一管理会员、订单、商品与结算流程，依托清晰权限和审计记录，支撑日常运营工作。
              </p>
            </div>
          </div>

          <div className="relative z-10 space-y-3">
            {[
              { icon: <TrendingUp size={16} strokeWidth={1.8} />, title: '经营数据一屏掌握', description: '会员、订单与业绩清晰呈现' },
              { icon: <ShieldCheck size={16} strokeWidth={1.8} />, title: '权限分级与操作留痕', description: '审批流程与敏感操作可追溯' },
              { icon: <Activity size={16} strokeWidth={1.8} />, title: '核心业务稳定运行', description: '围绕运营流程组织管理能力' },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.07] px-3.5 py-3 backdrop-blur-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white">{item.icon}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <strong className="text-xs font-semibold text-white">{item.title}</strong>
                  <span className="text-[10.5px] text-white/65">{item.description}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="login-grid-texture pointer-events-none absolute inset-0" aria-hidden="true" />
        </aside>

        <section className="login-content flex items-center justify-center px-5 py-9 sm:px-10 sm:py-12 lg:px-12 xl:px-16">
          <div className="w-full max-w-[390px]">
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <span className="brand-mark flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-on">
                <Sun size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="flex flex-col gap-0.5">
                <strong className="text-sm font-semibold text-ink">太阳线会员系统</strong>
                <span className="text-[9px] font-medium tracking-[0.12em] text-ink-faint">OPERATIONS CONSOLE</span>
              </span>
            </div>

            <div className="mb-7">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="text-[10px] font-semibold tracking-[0.16em] text-accent-ink">ADMINISTRATOR ACCESS</span>
              </div>
              <h2 className="text-[25px] font-semibold leading-8 tracking-tight text-ink">欢迎登录管理后台</h2>
              <p className="mt-2 text-[13px] leading-5 text-ink-muted">请使用已授权的管理员账号继续</p>
            </div>

            <form onSubmit={submit} className="login-form space-y-4">
              <Field label="管理员手机号" required hint="使用 11 位大陆手机号登录">
                <div className="login-control relative">
                  <Phone size={16} strokeWidth={1.8} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                  <TextInput
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 11)); setError(''); }}
                    placeholder="请输入管理员手机号"
                    autoComplete="username"
                    ariaLabel="管理员手机号"
                  />
                </div>
                {phone.length === 11 && !phoneValid && <p className="login-field-error">手机号格式不正确</p>}
              </Field>

              <Field label="登录密码" required>
                <div className="login-control login-control--password relative">
                  <Lock size={16} strokeWidth={1.8} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
                  <TextInput
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="请输入登录密码"
                    autoComplete="current-password"
                    ariaLabel="登录密码"
                  />
                  <button
                    type="button"
                    className="login-password-toggle absolute right-2 top-1/2 -translate-y-1/2"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </Field>

              {error && <div className="notice notice-danger login-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</div>}

              <Button type="submit" variant="primary" block disabled={!canSubmit} className="login-submit">
                {loading ? <><LoaderCircle size={16} className="animate-spin" aria-hidden="true" />正在验证账号</> : <>登录管理后台<TrendingUp size={16} aria-hidden="true" /></>}
              </Button>
            </form>

            <div className="login-security-note mt-6 flex items-start gap-2.5 border-t border-line pt-4">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <p className="text-[11px] leading-[1.65] text-ink-faint">
                仅限获授权的后台人员访问。资金相关与敏感操作将依照平台规范记录审计日志。
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
