"use client";

import { cn } from '@/lib/utils';
import React from 'react';

type FilledBarProps = {
  filledProportion: number; // between 0 and 1
  background: React.CSSProperties['background'];
} & React.HTMLAttributes<HTMLDivElement>;

function clampFilledProportion(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** "Progress-bar" like thing */
export const FilledBar = (
  {className, filledProportion, background, ...rest}: FilledBarProps
) => {
  return (
    <div className={cn('w-full h-2 bg-muted overflow-hidden', className)} {...rest}>
      <div
        className='h-full transition-all duration-25'
        style={{
          width: `${clampFilledProportion(filledProportion) * 100}%`,
          background,
        }}
      />
    </div>
  );
};


type FilledBarDoubleSideProps = {
  leftFilledProportion: number;
  rightFilledProportion: number;
  leftBackground: React.CSSProperties['background'];
  rightBackground: React.CSSProperties['background'];
  background: React.CSSProperties['background'];
} & React.HTMLAttributes<HTMLDivElement>;

/** "Progress-bar" like thing that fills from both sides */
export const FilledBarDoubleSide = (
  {
    className,
    leftFilledProportion,
    rightFilledProportion,
    leftBackground,
    rightBackground,
    background,
    ...rest
  }: FilledBarDoubleSideProps
) => {
  const total = leftFilledProportion + rightFilledProportion;
  const leftWidth = total > 0? leftFilledProportion / total : 0;
  const rightWidth = total > 0? rightFilledProportion / total : 0;

  return (
    <div
      className={cn('relative w-full h-2 overflow-hidden bg-muted', className)}
      style={{ background }}
      {...rest}
    >
      <div
        className='absolute left-0 top-0 h-full transition-all duration-25'
        style={{
          width: `${leftWidth * 100}%`,
          background: leftBackground,
        }}
      />

      <div
        className='absolute right-0 top-0 h-full transition-all duration-25'
        style={{
          width: `${rightWidth * 100}%`,
          background: rightBackground,
        }}
      />
    </div>
  );
};
