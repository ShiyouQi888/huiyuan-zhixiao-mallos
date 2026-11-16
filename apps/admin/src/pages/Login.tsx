import { Button, TextInput } from '../components/ui';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Lock, Phone } from 'lucide-react';
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-950 px-5 py-10">
      <div className="absolute right-6 top-6 z-10"><ThemeToggle /></div>
      <div className="relative w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center">
          <div className="brand-mark flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
            <Gift size={26} className="text-white" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">太阳线会员系统</h1>
          <p className="mt-1.5 text-sm text-slate-500">管理后台 · 请登录以继续</p>
        </div>

        <form onSubmit={submit} className="card p-6 sm:p-7">
          <div className="mb-5">
            <label className="mb-2 block text-[13px] font-medium text-slate-700 dark:text-slate-300">手机号</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <TextInput
                className="input pl-10"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入管理员手机号"
                autoComplete="username"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-[13px] font-medium text-slate-700 dark:text-slate-300">密码</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <TextInput
                type="password"
                className="input pl-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="btn-primary h-11 w-full">
            {loading ? '登录中…' : '登录管理后台'}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500">请使用已授权的管理员账号登录</p>
      </div>
    </div>
  );
}
