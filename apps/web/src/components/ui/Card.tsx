import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-all ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return <div className={`p-6 border-b border-slate-100 dark:border-slate-800/80 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: CardProps) {
  return <h3 className={`text-lg font-bold text-slate-900 dark:text-slate-100 ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }: CardProps) {
  return <p className={`text-xs text-slate-500 dark:text-slate-400 mt-1 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }: CardProps) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }: CardProps) {
  return <div className={`p-6 pt-0 border-t border-slate-100 dark:border-slate-800 ${className}`}>{children}</div>;
}
