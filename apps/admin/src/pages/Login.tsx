import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Lock, Phone, ShieldCheck, TrendingUp } from 'lucide-react';
import { Button, Field, TextInput } from '../components/ui';
import { api, ApiError } from '../api';
import { ThemeToggle } from '../components/ThemeToggle';

export function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });
      localStorage.setItem('solar_admin_token', data.token);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <div className="absolute right-5 top-5 z-10"><ThemeToggle /></div>

      <div className="grid w-full max-w-[900px] overflow-hidden rounded-2xl border border-line bg-panel shadow-pop lg:grid-cols-[1.05fr_1fr]">
        <aside className="login-brand-panel relative hidden flex-col justify-between p-8 text-white lg:flex">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="brand-mark flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                <Gift size={19} />
              </span>
              <span className="text-sm font-semibold tracking-wide">太阳线会员系统</span>
            </div>
            <h1 className="mt-10 text-2xl font-semibold leading-9 tracking-tight">
              会员电商
              <br />
              运营管理后台
            </h1>
            <p className="mt-3 max-w-[280px] text-[13px] leading-6 text-white/90">
              统一管理会员、订单、奖金与结算，数据留痕、权限分级，支撑日常运营决策。
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: <TrendingUp size={15} />, text: '实时业绩与奖金总览' },
              { icon: <ShieldCheck size={15} />, text: '敏感操作审批与审计留痕' },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-2.5 text-xs text-white/90">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10">{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
        </aside>

        <div className="p-7 sm:p-10">
          <div className="mb-7 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="brand-mark flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-on">
                <Gift size={19} />
              </span>
              <span className="text-sm font-semibold text-ink">太阳线会员系统</span>
            </div>
          </div>

          <h2 className="text-lg font-semibold tracking-tight text-ink">登录管理后台</h2>
          <p className="mt-1 text-xs leading-5 text-ink-muted">请使用已授权的管理员账号登录</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="手机号" required>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-faint" />
                <TextInput
                  className="pl-9"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入管理员手机号"
                  autoComplete="username"
                />
              </div>
            </Field>

            <Field label="密码" required>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-faint" />
                <TextInput
                  type="password"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="current-password"
                />
              </div>
            </Field>

            {error && <div className="notice notice-danger">{error}</div>}

            <Button type="submit" variant="primary" block disabled={loading}>
              {loading ? '登录中…' : '登录管理后台'}
            </Button>
          </form>

          <p className="mt-6 border-t border-line pt-4 text-2xs leading-5 text-ink-faint">
            登录即代表你同意遵守平台运营规范。所有资金与敏感操作均会记录审计日志。
          </p>
        </div>
      </div>
    </div>
  );
}
