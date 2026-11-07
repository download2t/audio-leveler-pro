import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  children?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', icon, children, className, ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, `btn-${size}`, children ? '' : 'btn-icon', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}
