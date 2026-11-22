"use client";

import React from 'react';
import { fmtTime, word } from '../../../../../common/utils';
import Image from 'next/image';
import { SidebarItem } from '@/components/SidebarItem';
import { useRunner } from '@/hooks/useRunner';

/** 
 * displays MatchMetadata objects that are currently running!
 * For use in CurrentMatchTab
 */
export const CurrentMatchCard = () => {

  const {currentlyVisualizingMatch} = useRunner();

  // stored in state so we can update every min
  const [timeElapsedDisplay, setTimeElapsedDisplay] = React.useState<string>(
    currentlyVisualizingMatch?.startTimestamp?
      fmtTime(Date.now() - currentlyVisualizingMatch.startTimestamp) 
    : 
      "-"
  );

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsedDisplay(
        currentlyVisualizingMatch?.startTimestamp?
          fmtTime(Date.now() - currentlyVisualizingMatch.startTimestamp) 
        : 
          "-"
      );
    }, 60000);

    return () => clearInterval(interval);
  }, [currentlyVisualizingMatch?.startTimestamp]);
  
  if (!currentlyVisualizingMatch) {
    return (
      <SidebarItem disableDefaultHeader>
        <span className="text-center text-sm text-muted-foreground">
          No match is currently running.
        </span>
      </SidebarItem>
    );
  }


  return (
    <div className="match-card border-border">
      <div>
        <h3 className='match-card-b-header ellipsis' title={currentlyVisualizingMatch.teamA}>
          <Image className='inline' src="/sprites/team_a_icon.svg" alt="*" width={12} height={12} />&nbsp;
          {currentlyVisualizingMatch.teamA}
          <span className='float-right font-bold'>{Object.keys(currentlyVisualizingMatch.aWins).length}</span>
        </h3>
        <h3 className='match-card-a-header ellipsis' title={currentlyVisualizingMatch.teamB}>
          <Image className='inline' src="/sprites/team_b_icon.svg" alt="*" width={12} height={12} />&nbsp;
          {currentlyVisualizingMatch.teamB}
          <span className='float-right font-bold'>{Object.keys(currentlyVisualizingMatch.bWins).length}</span>
        </h3>
      </div>

      <div>
        <h4 className='text-sm text-muted-foreground'>
          {word(currentlyVisualizingMatch.gameIdents.length, "game", "games")}
        </h4>
      </div>

      <hr />

      <div>
        {currentlyVisualizingMatch.startTimestamp !== null &&
          <p className='text-sm text-muted-foreground' title={new Date(currentlyVisualizingMatch.startTimestamp).toLocaleString()}>
            Started&nbsp;
            <span className='text-secondary-foreground'>{timeElapsedDisplay} ago</span>
          </p>
        }
        <p className='text-sm text-muted-foreground'>
          Match ID&nbsp;
          <span className='text-secondary-foreground'>{currentlyVisualizingMatch.matchId}</span>
        </p>
      </div>
    </div>
  );
};
