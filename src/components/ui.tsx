import type { ComponentProps } from 'react';

export const Surface = ({
  inset = false,
  className = '',
  ...props
}: ComponentProps<'div'> & { inset?: boolean }) => (
  <div
    className={`min-w-0 [:where(&)]:rounded-card [:where(&)]:border [:where(&)]:border-border [:where(&)]:text-foreground ${
      inset
        ? '[:where(&)]:bg-background'
        : '[:where(&)]:bg-surface [:where(&)]:shadow-surface'
    } ${className}`}
    {...props}
  />
);

const tones = {
  primary:
    '[:where(&)]:bg-primary [:where(&)]:text-primary-foreground [:where(&)]:border [:where(&)]:border-primary',
  quiet:
    '[:where(&)]:border [:where(&)]:border-border [:where(&)]:bg-surface-elevated [:where(&)]:text-foreground',
  ghost:
    '[:where(&)]:border [:where(&)]:border-transparent [:where(&)]:bg-transparent [:where(&)]:text-foreground hover:[:where(&)]:bg-surface-elevated',
};

export const Button = ({
  tone = 'primary',
  type = 'button',
  className = '',
  ...props
}: ComponentProps<'button'> & { tone?: keyof typeof tones }) => (
  <button
    type={type}
    className={`[:where(&)]:inline-flex [:where(&)]:min-h-11 [:where(&)]:items-center [:where(&)]:justify-center [:where(&)]:gap-2 whitespace-nowrap [:where(&)]:rounded-control [:where(&)]:px-4 [:where(&)]:font-medium transition-colors duration-150 ease-out hover:brightness-110 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45 ${tones[tone]} ${className}`}
    {...props}
  />
);
