import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { Checkbox as TCheckbox, Input as TInput, Tag } from 'tdesign-react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, Search, X,
} from 'lucide-react';

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------
   表单基础件
   ------------------------------------------------------------------ */
export function TextInput({ className = '', type = 'text', value, defaultValue, placeholder, autoComplete, onChange, disabled, onKeyDown, ariaLabel }: {
  className?: string;
  type?: 'text' | 'password' | 'search' | 'tel';
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  const classes = className.split(/\s+/).filter(Boolean).filter((name) => name !== 'input');
  const inputClass = classes.filter((name) => name.startsWith('pl-')).join(' ');
  const rootClassName = classes.filter((name) => !name.startsWith('pl-')).join(' ');
  return (
    <TInput
      className={cx('td-input', rootClassName)}
      inputClass={inputClass}
      type={type}
      value={value}
      defaultValue={defaultValue}
      placeholder={placeholder}
      autocomplete={autoComplete}
      disabled={disabled}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onChange={(nextValue) => onChange?.({ target: { value: String(nextValue) } } as ChangeEvent<HTMLInputElement>)}
    />
  );
}

export function Checkbox({ children, checked, onChange, indeterminate }: {
  children?: ReactNode;
  checked: boolean;
  indeterminate?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <TCheckbox checked={checked} indeterminate={indeterminate} onChange={(value) => onChange({ target: { checked: value } } as ChangeEvent<HTMLInputElement>)}>
      {children}
    </TCheckbox>
  );
}

export function Field({ label, hint, required, children, className = '' }: {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------
   按钮
   ------------------------------------------------------------------ */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft' | 'success-soft' | 'outline';
type LegacyVariant = 'base' | 'outline' | 'text' | 'dashed';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  theme?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  variant?: ButtonVariant | LegacyVariant;
  size?: 'md' | 'sm' | 'xs';
  block?: boolean;
  iconOnly?: boolean;
}

export function Button({
  className = '', theme, variant, size = 'md', block = false, iconOnly = false, children, type = 'button', ...props
}: ButtonProps) {
  const primaryInClass = /\bbtn-primary\b/.test(className);
  const ghostInClass = /\bbtn-ghost\b/.test(className);
  const dangerInClass = /\bbtn-danger\b/.test(className);
  const cleaned = className.replace(/\bbtn-(primary|ghost|secondary|danger)\b/g, '').trim();

  let resolved: ButtonVariant;
  if (variant === 'base') resolved = 'primary';
  else if (variant === 'outline') resolved = 'outline';
  else if (variant === 'text' || variant === 'dashed') resolved = 'ghost';
  else if (variant) resolved = variant;
  else if (primaryInClass) resolved = 'primary';
  else if (dangerInClass) resolved = 'danger';
  else if (ghostInClass) resolved = 'secondary';
  else if (theme === 'primary') resolved = 'primary';
  else if (theme === 'danger') resolved = 'danger';
  else resolved = 'secondary';

  return (
    <button
      {...props}
      type={type}
      className={cx('btn', `btn-${resolved}`, size !== 'md' && `btn-${size}`, block && 'btn-block', iconOnly && 'btn-icon', cleaned)}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------
   页面结构
   ------------------------------------------------------------------ */
export function PageHeader({ title, description, action, meta }: {
  title: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {meta && <div className="mb-1.5">{meta}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={cx('card', className)}>{children}</section>;
}

export function CardHeader({ title, description, action, icon }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-raised text-ink-3">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="section-title truncate">{title}</div>
          {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="card-footer">{children}</div>;
}

/* ------------------------------------------------------------------
   指标卡
   ------------------------------------------------------------------ */
const STAT_TONES = {
  brand: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-raised text-ink-3',
} as const;

type StatAccent = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';

const STAT_ACCENT_MAP: Record<StatAccent, keyof typeof STAT_TONES> = {
  brand: 'brand', success: 'success', warning: 'warning', danger: 'danger', info: 'info', neutral: 'neutral',
  indigo: 'brand', emerald: 'success', amber: 'warning', rose: 'danger', slate: 'neutral',
};

export function StatCard({ label, value, icon, trend, accent = 'brand', delta }: {
  label: string;
  value: string;
  icon: ReactNode;
  trend?: string;
  accent?: StatAccent;
  delta?: { value: string; tone: 'up' | 'down' | 'flat' };
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-ink-muted">{label}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num text-[24px] font-semibold leading-8 tracking-tight text-ink">{value}</span>
            {delta && (
              <span className={cx(
                'badge',
                delta.tone === 'up' ? 'badge-success' : delta.tone === 'down' ? 'badge-danger' : 'badge-neutral',
              )}>
                {delta.value}
              </span>
            )}
          </div>
        </div>
        <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', STAT_TONES[STAT_ACCENT_MAP[accent]])}>
          {icon}
        </div>
      </div>
      {trend && <div className="mt-2 border-t border-line pt-2 text-2xs text-ink-faint">{trend}</div>}
    </Card>
  );
}

/* ------------------------------------------------------------------
   状态标签
   ------------------------------------------------------------------ */
export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
  | 'slate' | 'indigo' | 'green' | 'amber' | 'red';

const BADGE_TONE_MAP: Record<BadgeTone, string> = {
  neutral: 'badge-neutral',
  brand: 'badge-brand',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  slate: 'badge-neutral',
  indigo: 'badge-brand',
  green: 'badge-success',
  amber: 'badge-warning',
  red: 'badge-danger',
};

export function Badge({ children, tone = 'neutral', dot = false, className = '' }: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Tag
      className={cx('badge', BADGE_TONE_MAP[tone], dot && 'badge-dot', className)}
      shape="square"
      size="small"
    >
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------
   空状态 / 加载态
   ------------------------------------------------------------------ */
export function Empty({ text = '暂无数据', description, icon, action }: {
  text?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <Inbox size={19} strokeWidth={1.7} />}</div>
      <div className="empty-title">{text}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4">
      <div className="mb-3 flex gap-3">
        {Array.from({ length: cols }).map((_, index) => (
          <div key={index} className="skeleton h-3 flex-1" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-3 py-2">
            {Array.from({ length: cols }).map((__, col) => (
              <div key={col} className={cx('skeleton h-4', col === 0 ? 'w-[22%]' : 'flex-1')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingBlock({ text = '正在加载…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm text-ink-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
      {text}
    </div>
  );
}

export function ErrorBlock({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5">
      <div className="flex items-center gap-2 text-sm text-danger">
        <AlertCircle size={15} />
        {text}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------
   筛选 / 分页
   ------------------------------------------------------------------ */
export function SearchField({ value, onChange, placeholder, className = '', ariaLabel = '搜索' }: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cx('search-field', className)}>
      <Search size={14} />
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={onChange}
      />
    </div>
  );
}

export function SelectField({ value, onChange, options, ariaLabel, className = '' }: {
  value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  options: Array<{ value: string; label: string }>;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select className={cx('admin-select', className)} value={value} aria-label={ariaLabel} onChange={onChange}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

export function FilterBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('filter-bar', className)}>{children}</div>;
}

export function Pagination({ page, total, pageSize, onChange, disabled = false, unit = '条', hasNext }: {
  page: number;
  total?: number;
  pageSize: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  unit?: string;
  hasNext?: boolean;
}) {
  const pages = total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize));
  const current = pages === undefined ? page : Math.min(page, pages);
  const items: Array<number | '…'> = [];
  if (pages === undefined) {
    items.length = 0;
  } else if (pages <= 7) {
    for (let index = 1; index <= pages; index += 1) items.push(index);
  } else if (current <= 4) {
    items.push(1, 2, 3, 4, 5, '…', pages);
  } else if (current >= pages - 3) {
    items.push(1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages);
  } else {
    items.push(1, '…', current - 1, current, current + 1, '…', pages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
      <div className="text-xs text-ink-faint">
        {total === undefined
          ? <>第 <span className="num text-ink-soft">{current}</span> 页</>
          : <>共 <span className="num text-ink-soft">{total.toLocaleString('zh-CN')}</span> {unit} · 第 {current} / {pages} 页</>}
      </div>
      <div className="flex items-center gap-1">
        <Button size="xs" variant="ghost" disabled={disabled || current <= 1} onClick={() => onChange(current - 1)} aria-label="上一页">
          <ChevronLeft size={14} />
        </Button>
        {items.map((item, index) => item === '…' ? (
          <span key={`gap-${index}`} className="px-1 text-xs text-ink-faint">…</span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === current ? 'page' : undefined}
            disabled={disabled}
            onClick={() => onChange(item)}
            className={cx(
              'h-6 min-w-6 rounded-md px-1.5 text-xs tabular-nums transition',
              item === current
                ? 'bg-accent text-accent-on'
                : 'text-ink-3 hover:bg-hover hover:text-ink',
            )}
          >
            {item}
          </button>
        ))}
        <Button
          size="xs"
          variant="ghost"
          disabled={disabled || (pages !== undefined ? current >= pages : !hasNext)}
          onClick={() => onChange(current + 1)}
          aria-label="下一页"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Tabs
   ------------------------------------------------------------------ */
export function Tabs({ items, value, onChange, className = '' }: {
  items: Array<{ value: string; label: string; count?: number }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cx('tabs', className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className="tab"
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {typeof item.count === 'number' && <span className="tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ items, value, onChange, className = '' }: {
  items: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cx('segmented', className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className="segmented-item"
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   弹窗 / 抽屉 / 确认框
   ------------------------------------------------------------------ */
const MODAL_WIDTHS = { sm: 400, md: 520, lg: 680, xl: 880 } as const;

export function Modal({ open = true, onClose, title, description, children, footer, size = 'md', closeOnBackdrop = true }: {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof MODAL_WIDTHS;
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        className="modal-panel"
        style={{ maxWidth: MODAL_WIDTHS[size] }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-6 text-ink">{title}</div>
            {description && <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open = true, onClose, title, description, children, footer, width = 720 }: {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <section
        className="drawer-panel"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-6 text-ink">{title}</div>
            {description && <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">
            <X size={17} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </section>
    </div>,
    document.body,
  );
}

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'primary' | 'danger';
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setOptions(next);
  }), []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  const confirmNode = (
    <Modal
      open={!!options}
      onClose={() => settle(false)}
      title={options?.title ?? ''}
      description={options?.description}
      size="sm"
      footer={(
        <>
          <Button onClick={() => settle(false)}>{options?.cancelText ?? '取消'}</Button>
          <Button variant={options?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)}>
            {options?.confirmText ?? '确认'}
          </Button>
        </>
      )}
    />
  );

  return { confirm, confirmNode };
}

/* ------------------------------------------------------------------
   提示
   ------------------------------------------------------------------ */
const TOAST_ICONS = {
  success: <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />,
  error: <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />,
  info: <Info size={16} className="mt-0.5 shrink-0 text-info" />,
};

export function Toast({ message, onClose, tone = 'info' }: {
  message: string;
  onClose: () => void;
  tone?: 'success' | 'error' | 'info';
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  return createPortal(
    <div className="toast-wrap">
      <div className="toast" role="status" aria-live="polite">
        {TOAST_ICONS[tone]}
        <span className="min-w-0 flex-1 break-words">{message}</span>
        <button type="button" onClick={onClose} className="-mr-1 mt-0.5 shrink-0 rounded p-0.5 text-ink-faint hover:text-ink" aria-label="关闭提示">
          <X size={14} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------
   数据展示小件
   ------------------------------------------------------------------ */
export function Meter({ value, max = 100, tone = 'brand', className = '' }: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const colors = {
    brand: 'bg-accent',
    success: 'bg-success-solid',
    warning: 'bg-warning-solid',
    danger: 'bg-danger-solid',
  };
  return (
    <div className={cx('progress-track', className)}>
      <div className={cx('progress-bar', colors[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function KeyValue({ label, value, mono = false }: { label: ReactNode; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-2xs text-ink-faint">{label}</div>
      <div className={cx('mt-1 break-words text-sm text-ink', mono && 'mono text-xs')}>{value}</div>
    </div>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="section-title">{children}</h2>
      {action}
    </div>
  );
}
