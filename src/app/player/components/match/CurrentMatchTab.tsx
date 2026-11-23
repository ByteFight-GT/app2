"use client";

import React from 'react';
import { GameInfo } from '../match/GameInfo';
import { Console } from '../match/Console';
import { CurrentMatchCard } from '../match/CurrentMatchCard';
import { useVisualizer } from '@/gamerenderer/competitions/cs6601_fa2026';
import { type ShowMinesSetting } from '@/gamerenderer/competitions/cs6601_fa2026/CanvasManager';
import { Button } from '@/components';
import { ButtonGroup } from '@/components/ui/button-group';

const showMinesOptions: Array<{ label: string; value: ShowMinesSetting }> = [
  { label: 'Hide', value: 'none' },
  { label: 'All', value: 'all' },
];

export const CurrentMatchTab = () => {

  const { showMines, setShowMines } = useVisualizer();

  return (
    <>
      <div className='flex flex-col gap-4 p-4'>
        <h2>Current Match</h2>
        <CurrentMatchCard />
        <GameInfo />

        <div className="bg-secondary border-border border-1 flex flex-col gap-2 items-center justify-center py-2">
          <h4 className="text-sm font-medium">Show Mines</h4>
          <ButtonGroup aria-label="Mine visibility">
            {showMinesOptions.map(({ label, value }) => (
              <Button
                key={value}
                type="button"
                aria-pressed={showMines === value}
                variant={showMines === value ? 'default' : 'secondary'}
                onClick={() => setShowMines(value)}
              >
                {label}
              </Button>
            ))}
          </ButtonGroup>
        </div>

      </div>
      <Console />
    </>
  );
};
