/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './.storybook/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary-color, #1890ff)',
          foreground: 'var(--primary-foreground, #ffffff)',
        },
        secondary: {
          DEFAULT: 'var(--secondary-color, #52c41a)',
          foreground: 'var(--secondary-foreground, #ffffff)',
        },
        background: {
          primary: 'var(--bg-primary, #ffffff)',
          secondary: 'var(--bg-secondary, #f5f5f5)',
        },
        text: {
          primary: 'var(--text-primary, #262626)',
          secondary: 'var(--text-secondary, #8c8c8c)',
        },
        border: 'var(--border-color, #d9d9d9)',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        xxl: '48px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      fontSize: {
        h1: ['28px', { lineHeight: '1.4', fontWeight: '600' }],
        h2: ['24px', { lineHeight: '1.4', fontWeight: '600' }],
        h3: ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        small: ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        code: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      boxShadow: {
        sm: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
    },
  },
  plugins: [],
};
