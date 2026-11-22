"use client";

import React from 'react';
import Image from 'next/image';
import { GameFrame, useVisualizer, type GamePGN } from '@/gamerenderer/competitions/cs6601_fa2026';
import { GameInfoRow } from './GameInfoRow';


const SIGNAL_TO_IMAGE = {
	"none": "/sprites/signal_none.png",
	"low": "/sprites/signal_low.png",
	"medium": "/sprites/signal_med.png",
	"high": "/sprites/signal_hi.png",
}

export const GameInfo = () => {

	const {subscribeToGameOrFrameChanges} = useVisualizer();
	
	// state to show, received from visualizer subscription
	const [currFrame, setCurrFrame] = React.useState<GameFrame | null>(null);
	const [maxTimePerBot, setMaxTimePerBot] = React.useState<number | null>(null); // set once on update 0
	
	React.useEffect(() => {
		return subscribeToGameOrFrameChanges(
			(entirePGN: GamePGN, frame: GameFrame) => {
				if (maxTimePerBot === null) {
					setMaxTimePerBot(frame.blackTimeLeft ?? 360);
				}
				setCurrFrame(frame);
			}
		);
	}, []);

	return (
		<div className='game-info-container'>
			<GameInfoRow
			label='TIME'
			icon={<Image src="/sprites/time.png" alt="*" width={48} height={48} />}
			bVal={currFrame?.blackTimeLeft?.toFixed(2) ?? '-'}
			aVal={currFrame?.whiteTimeLeft?.toFixed(2) ?? '-'}
			bFillProportion={
				(currFrame?.blackTimeLeft != null && maxTimePerBot)?
					currFrame.blackTimeLeft / maxTimePerBot : 0
			}
			aFillProportion={
				(currFrame?.whiteTimeLeft != null && maxTimePerBot)?
					currFrame.whiteTimeLeft / maxTimePerBot : 0
			} />

			<GameInfoRow
			label='STONES'
			icon={<Image src="/sprites/stone.png" alt="*" width={48} height={48} />}
			bVal={currFrame?.blackStoneCount ?? '-'}
			aVal={currFrame?.whiteStoneCount ?? '-'} />

			<div className="bg-secondary border-border border-1 flex flex-col gap-2 items-center justify-center py-2">
				{currFrame?.detectorSignals.length ? (
					currFrame.detectorSignals.map(sig => (
						<div key={sig.loc.toString()} className="flex items-center justify-evenly gap-2">
							<span className="font-bold text-lg">{sig.loc[0]}, {sig.loc[1]}</span>
							<span className="text-secondary-foreground text-base">: {sig.signal} </span>
							<Image className="pixelated" src={SIGNAL_TO_IMAGE[sig.signal]} alt={sig.signal} width={96} height={48} />
						</div>
					))
				) : (
					<span className="text-secondary-foreground text-base">No signals</span>
				)}
				<span className='text-xs text-muted-foreground'>PREVIOUS MOVES' SIGNALS</span>
			</div>
		</div>
	);
};
