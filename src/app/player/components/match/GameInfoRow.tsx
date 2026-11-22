"use client";

import { FilledBar } from '@/components';
import React from 'react';

type GameInfoRowProps = {
  icon: React.ReactNode;
  label: string;
  aVal: React.ReactNode;
  bVal: React.ReactNode;
  aFillProportion?: number;
  bFillProportion?: number;
};

export const GameInfoRow = (props: GameInfoRowProps) => {
  return (
    <div className='flex flex-col items-center'>
      <div className='game-info-row'>
        <div>
          {props.bVal}
          {props.bFillProportion !== undefined && (
            <FilledBar
            // hack to make it right-to-left
            className='h-1 bg-[hsl(var(--team-b-color))]'
            background='hsl(var(--muted))'
            filledProportion={1 - props.bFillProportion} />
          )}
        </div>

        {props.icon}

        <div>
          {props.aVal}
          {props.aFillProportion !== undefined && (
            <FilledBar
            className='h-1'
            background='hsl(var(--team-a-color))'
            filledProportion={props.aFillProportion} />
          )}
        </div>
      </div>
      <span className='text-xs text-muted-foreground'>{props.label}</span>
    </div>
  );
};
