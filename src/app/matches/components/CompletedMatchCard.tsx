"use client";

import React from 'react';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { useCollapse } from 'react-collapsed';
import { EyeOffIcon, FileTextIcon, InfoIcon } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components';
import { useToast } from '@/hooks/useToast';
import { useRunner } from '@/hooks/useRunner';
import { useLoadings } from '@/hooks/useLoadings';
import { LoadingSpinner } from '@/components';
import { fmtTime, word, getErrorMessage } from '../../../../common/utils';
import { type MatchMetadata } from '../../../../common/types';
import { type GamePGN } from '@/gamerenderer/competitions/cs6601_fa2026';


type CompletedMatchCardProps = {
  matchData: MatchMetadata<GamePGN>;
};

/** 
 * displays MatchMetadata objects specifically for the completed matches page
 * Please make sure `matchData` is actually from the completed matches list!!!
 */
export const CompletedMatchCard = (props: CompletedMatchCardProps) => {

  const {toastError} = useToast();
  const {loadings} = useLoadings();
  const {loadGameIntoPlayer} = useRunner();

  const [timeElapsedDisplay, setTimeElapsedDisplay] = React.useState<string>(fmtTime(Date.now() - (props.matchData.finishTimestamp ?? 0)));

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsedDisplay(fmtTime(Date.now() - (props.matchData.finishTimestamp ?? 0)));
    }, 60000);

    return () => clearInterval(interval);
  }, [props.matchData.finishTimestamp]);

  const { getCollapseProps, getToggleProps } = useCollapse({defaultExpanded: true, duration: 100});


  const handleOpenGameReplay = React.useCallback(async () => {
    if (!props.matchData.outputDir) {
      toastError(
        "No replay found",
        "Couldn't find replay directory: this match appears to not have a replay directory attached to it."
      );
      return;
    }

    // TEMP - only have 1 map per match rn so just use [0]
    const success = await loadGameIntoPlayer(props.matchData, props.matchData.gameIdents[0]);
    if (success) {
      redirect("/player?tab=currentMatch");
    } // else: loadGameIntoPlayer will handle error display

  }, [loadGameIntoPlayer]);

  const handleOpenMatchLog = React.useCallback(async () => {
    const gameIdent = props.matchData.gameIdents[0]; // only one game technically supported :sob:
    if (!gameIdent) return;

    try {
      const result = await window.electron.logsOpen(props.matchData.matchId, gameIdent);
      if (!result.success) {
        toastError("Failed to open match log", result.error);
      }
    } catch (error) {
      toastError("Failed to open match log", getErrorMessage(error));
    }
  }, [props.matchData.gameIdents, props.matchData.matchId, toastError]);


  if (props.matchData.finishTimestamp === null || props.matchData.startTimestamp === null) {
    console.warn(`Tried to render CompletedMatchCard w/ match id ${props.matchData.matchId} that has no finishTimestamp or startTimestamp! It wont be shown cuz these are required!`);
    return null;
  }

  const winnerClass = 
    Object.entries(props.matchData.bWins).length > Object.entries(props.matchData.aWins).length? 
      "White"
    : Object.entries(props.matchData.aWins).length > Object.entries(props.matchData.bWins).length?
      "Black"
    : // else:
      "Undecided";

  const bScore = Object.keys(props.matchData.bWins).length + Object.keys(props.matchData.draws ?? {}).length/2;
  const aScore = Object.keys(props.matchData.aWins).length + Object.keys(props.matchData.draws ?? {}).length/2;
  const errorMessage = props.matchData.error ?? "No diagnostic message was recorded for this match.";

  return (
    <div className={`completed-match-card ${winnerClass}`}>

      <div className="completed-match-card-header" {...getToggleProps()}>
        <h3 className='match-card-b-header flex gap-4 items-center' title={props.matchData.teamB}>
          <b className='text-4xl align-middle flex-shrink-0'>{bScore.toFixed(1)}</b>
          <Image src="/sprites/team_b_icon.svg" alt="*" width={12} height={12} />
          <span className='ellipsis'>{props.matchData.teamB}</span>
        </h3>
        <h3 className='match-card-a-header flex justify-end gap-4 items-center' title={props.matchData.teamA}>
          <span className='ellipsis'>{props.matchData.teamA}</span>
          <Image src="/sprites/team_a_icon.svg" alt="*" width={12} height={12} />
          <b className='text-4xl align-middle flex-shrink-0'>{aScore.toFixed(1)}</b>
        </h3>
      </div>

      <div {...getCollapseProps()}>
        {props.matchData.gameIdents.map(gameIdent => {

          let winObj;
          let resultDisplay;
          let winnerClassName;
          if (props.matchData.aWins[gameIdent]) {
            winObj = props.matchData.aWins[gameIdent];
            winnerClassName = "Black";
            resultDisplay = "Black won";
          } else if (props.matchData.bWins[gameIdent]) {
            winObj = props.matchData.bWins[gameIdent];
            winnerClassName = "White";
            resultDisplay = "White won";
          } else if (props.matchData.draws?.[gameIdent]) {
            winObj = props.matchData.draws?.[gameIdent];
            winnerClassName = "undecided";
            resultDisplay = "Draw";
          } else {
            return (
              <div
              key={gameIdent} 
              className="completed-match-card-map undecided">
                <span className='font-bold text-foreground'>{gameIdent}</span>
                &middot;
                Undecided
              </div>
            );
          }

          return (
            <button
            key={gameIdent} 
            disabled={loadings.loadGameIntoPlayer}
            onClick={handleOpenGameReplay}
            className={`completed-match-card-map ${winnerClassName}`}>
              { loadings.loadGameIntoPlayer && <LoadingSpinner /> }
              <span className='font-bold text-foreground'>{gameIdent}</span>
              &middot;
              <span>{resultDisplay}</span>
              &middot;
              <span>{word(Math.ceil(winObj.plyCount/2), "round", "rounds")}</span>
              &middot;
              <span>by {winObj.reason}</span>
            </button>
          );
        })}

        <div className='flex flex-wrap items-center gap-x-2 mt-4 text-sm text-muted-foreground'>
          <p title={new Date(props.matchData.queuedTimestamp).toLocaleString()}>
            Played&nbsp;
            <span className='text-secondary-foreground'>{timeElapsedDisplay} ago</span>
          </p>
          &middot;
          <p>
            Ran for&nbsp;
            <span className='text-secondary-foreground'>{fmtTime(props.matchData.finishTimestamp - props.matchData.startTimestamp)}</span>
          </p>
          &middot;
          <p className="flex items-center">
            Status:&nbsp;
            <span className={`completed-match-card-status-${props.matchData.status}`}>{props.matchData.status}</span>
            {props.matchData.status === 'errored' && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" title="Show error details" aria-label="Show error details">
                    <InfoIcon />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Match error</DialogTitle>
                    <DialogDescription>
                      The match ended unexpectedly. Check the match log for more information.
                    </DialogDescription>
                  </DialogHeader>
                  <p className="whitespace-pre-wrap break-words text-destructive">{errorMessage}</p>
                  <DialogFooter>
                    <Button variant="outline" onClick={handleOpenMatchLog}>
                      <FileTextIcon />
                      Open match log
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </p>
          &middot;
          <p>
            Match ID&nbsp;
            <span className='text-secondary-foreground'>{props.matchData.matchId}</span>
          </p>

          <div className='ml-auto'>
            <Button
              variant="ghost"
              size="icon"
              tooltip="Open match log"
              aria-label="Open match log"
              onClick={handleOpenMatchLog}>
              <FileTextIcon />
            </Button>
            <Button tooltip='Collapse' className='ml-auto' variant="ghost" size="icon" {...getToggleProps()}>
              <EyeOffIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
