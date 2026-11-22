"use client";

import React from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { GameNavigator } from './GameNavigator';
import { GameRenderer } from '@/gamerenderer/competitions/cs6601_fa2026'; 


export const GameWindow = () => {

	const [currZoomScale, setCurrZoomScale] = React.useState(1);

	return (
		<div className='GameWindow-container'>
			<TransformWrapper
			centerOnInit
			initialScale={2}
			minScale={0.1} 
			maxScale={50}
			doubleClick={{ disabled: true }}
			onZoom={ref => setCurrZoomScale(ref.state.scale)}>
				<TransformComponent
				wrapperStyle={{width: '100%', height: '100%'}}
				contentStyle={{padding: 200}}>
					<GameRenderer />
				</TransformComponent>
			</TransformWrapper>
			<GameNavigator />
		</div>
	);
};
