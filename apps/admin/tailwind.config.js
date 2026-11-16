/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas-rgb) / <alpha-value>)',
        panel: 'rgb(var(--panel-rgb) / <alpha-value>)',
        card: 'rgb(var(--card-rgb) / <alpha-value>)',
        raised: 'rgb(var(--raised-rgb) / <alpha-value>)',
        hover: 'rgb(var(--hover-rgb) / <alpha-value>)',
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-2)',
          muted: 'var(--ink-3)',
          faint: 'var(--ink-4)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          hover: 'var(--accent-hover)',
          ink: 'var(--accent-ink)',
          soft: 'var(--accent-soft)',
          'soft-strong': 'var(--accent-soft-strong)',
          on: 'var(--on-accent)',
        },
        success: {
          DEFAULT: 'var(--success)',
          solid: 'var(--success-solid)',
          soft: 'var(--success-soft)',
          line: 'var(--success-line)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          solid: 'var(--warning-solid)',
          soft: 'var(--warning-soft)',
          line: 'var(--warning-line)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          solid: 'var(--danger-solid)',
          soft: 'var(--danger-soft)',
          line: 'var(--danger-line)',
        },
        info: {
          DEFAULT: 'var(--info)',
          solid: 'var(--info-solid)',
          soft: 'var(--info-soft)',
          line: 'var(--info-line)',
        },
        /* 兼容旧类名，避免过渡期样式丢失 */
        surface: {
          950: 'rgb(var(--canvas-rgb) / <alpha-value>)',
          900: 'rgb(var(--panel-rgb) / <alpha-value>)',
          850: 'rgb(var(--card-rgb) / <alpha-value>)',
          800: 'rgb(var(--raised-rgb) / <alpha-value>)',
          700: 'rgb(var(--hover-rgb) / <alpha-value>)',
        },
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '18px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '22px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['18px', { lineHeight: '26px' }],
        '2xl': ['20px', { lineHeight: '28px' }],
        '3xl': ['24px', { lineHeight: '32px' }],
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
        xs: 'var(--shadow-xs)',
      },
      borderRadius: {
        card: '10px',
      },
      maxWidth: {
        page: '1600px',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
