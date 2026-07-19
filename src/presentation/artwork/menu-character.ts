import { svg, type TemplateResult } from "lit-html";

type MenuCharacterVariant = "splash" | "construction";

const bodyPath = "M -20 35 Q -27 8 -17 -10 Q 0 -30 17 -10 Q 27 8 20 35 Z";
const animationClass =
	"[animation-duration:var(--menu-character-duration)] [animation-timing-function:cubic-bezier(0.36,0.02,0.22,1)] [animation-delay:80ms] [animation-iteration-count:var(--menu-character-count)] [animation-fill-mode:both] motion-reduce:[animation:none]";

export const menuCharacterTemplate = ({
	variant,
}: {
	readonly variant: MenuCharacterVariant;
}): TemplateResult => {
	const clipId = `menu-character-body-clip-${variant}`;
	const variantClass =
		variant === "splash"
			? "menu-character menu-character--splash [--menu-character-duration:2.65s] [--menu-character-count:1]"
			: "menu-character menu-character--construction [--menu-character-duration:4.2s] [--menu-character-count:1]";
	return svg`
		<g class=${variantClass} data-menu-character=${variant}>
			<ellipse class=${`menu-character__shadow origin-center [transform-box:fill-box] [animation-name:menu-character-shadow] ${animationClass}`} cx="130" cy="207" rx="45" ry="11" fill="#0a1319" opacity="0.42" />
			<g class=${`menu-character__impact opacity-0 [transform-box:view-box] [transform-origin:130px_190px] [animation-name:menu-character-impact] ${animationClass}`} transform="translate(130 190)" aria-hidden="true">
				<path d="M -67 4 Q -76 -8 -91 -7" fill="none" stroke="#e8b875" stroke-width="5" stroke-linecap="round" />
				<path d="M 66 3 Q 78 -8 92 -5" fill="none" stroke="#e8b875" stroke-width="5" stroke-linecap="round" />
				<path d="M -54 17 Q -69 25 -80 19" fill="none" stroke="#9eb5aa" stroke-width="4" stroke-linecap="round" />
				<path d="M 56 17 Q 70 25 82 18" fill="none" stroke="#9eb5aa" stroke-width="4" stroke-linecap="round" />
				<circle cx="-92" cy="10" r="5" fill="#f3ad50" />
				<circle cx="94" cy="8" r="4" fill="#f3ad50" />
			</g>
			<g transform="translate(130 134) scale(1.45)">
				<g class=${`menu-character__flight [transform-box:fill-box] [transform-origin:center_64%] [animation-name:menu-character-flight] motion-reduce:[transform:translateY(20px)_rotate(-90deg)] ${animationClass}`}>
					<g class="menu-character__leg" data-leg-anchor="left" transform="translate(-11 33)">
						<g class=${`menu-character__leg-motion menu-character__leg-motion--left [transform-box:fill-box] [transform-origin:50%_0] [animation-name:menu-character-left-leg] motion-reduce:[transform:rotate(84deg)_scale(1.18,0.72)] ${animationClass}`}>
							<path data-leg-segment="left" d="M 0 0 Q -1 8 0 13" fill="none" stroke="#d17d3c" stroke-width="8" stroke-linecap="round" />
							<g class=${`menu-character__foot origin-center [transform-box:fill-box] [animation-name:menu-character-foot-perspective] motion-reduce:[transform:scale(1.32,1.18)] ${animationClass}`}>
								<ellipse cx="0" cy="15" rx="9" ry="7.5" fill="#874727" stroke="#503b37" stroke-width="3.5" />
								<ellipse class=${`menu-character__sole menu-character__sole--left [animation-name:menu-character-soles] motion-reduce:opacity-100 ${animationClass}`} cx="0" cy="15" rx="5.6" ry="4.3" fill="#f0c787" stroke="#503b37" stroke-width="2.2" />
								<path class=${`menu-character__sole menu-character__sole--left [animation-name:menu-character-soles] motion-reduce:opacity-100 ${animationClass}`} d="M -3 13 L -1 17 M 2 12 L 4 16" fill="none" stroke="#874727" stroke-width="1.5" stroke-linecap="round" />
							</g>
						</g>
					</g>
					<g class="menu-character__leg" data-leg-anchor="right" transform="translate(11 33)">
						<g class=${`menu-character__leg-motion menu-character__leg-motion--right [transform-box:fill-box] [transform-origin:50%_0] [animation-name:menu-character-right-leg] motion-reduce:[transform:rotate(-84deg)_scale(1.18,0.72)] ${animationClass}`}>
							<path data-leg-segment="right" d="M 0 0 Q 1 8 0 13" fill="none" stroke="#d17d3c" stroke-width="8" stroke-linecap="round" />
							<g class=${`menu-character__foot origin-center [transform-box:fill-box] [animation-name:menu-character-foot-perspective] motion-reduce:[transform:scale(1.32,1.18)] ${animationClass}`}>
								<ellipse cx="0" cy="15" rx="9" ry="7.5" fill="#874727" stroke="#503b37" stroke-width="3.5" />
								<ellipse class=${`menu-character__sole menu-character__sole--right [animation-name:menu-character-soles] motion-reduce:opacity-100 ${animationClass}`} cx="0" cy="15" rx="5.6" ry="4.3" fill="#f0c787" stroke="#503b37" stroke-width="2.2" />
								<path class=${`menu-character__sole menu-character__sole--right [animation-name:menu-character-soles] motion-reduce:opacity-100 ${animationClass}`} d="M -3 12 L -1 16 M 2 13 L 4 17" fill="none" stroke="#874727" stroke-width="1.5" stroke-linecap="round" />
							</g>
						</g>
					</g>
					<g class="menu-character__body">
						<defs>
							<clipPath id=${clipId}>
								<path d=${bodyPath} />
							</clipPath>
						</defs>
						<path d=${bodyPath} fill="#f3ad50" />
						<g clip-path=${`url(#${clipId})`} shape-rendering="crispEdges">
							<path d="M -25 -18 H -3 V -12 H -6 V -5 H -9 V 4 H -12 V 13 H -15 V 23 H -18 V 38 H -25 Z" fill="#f9c267" />
							<rect x="-7" y="-9" width="3" height="3" fill="#f9c267" />
							<rect x="-10" y="1" width="3" height="3" fill="#f9c267" />
							<rect x="-13" y="11" width="3" height="3" fill="#f9c267" />
							<path d="M 14 -15 H 25 V 38 H -25 V 32 H 5 V 28 H 8 V 22 H 11 V 14 H 13 V 5 H 15 V -5 H 14 Z" fill="#df8d3f" />
							<rect x="7" y="25" width="3" height="3" fill="#df8d3f" />
							<rect x="10" y="17" width="3" height="3" fill="#df8d3f" />
							<rect x="12" y="8" width="3" height="3" fill="#df8d3f" />
						</g>
						<path d=${bodyPath} fill="none" stroke="#503b37" stroke-width="7" stroke-linejoin="round" />
						<g class=${`menu-character__face menu-character__face--happy opacity-100 [animation-name:menu-character-happy-face] motion-reduce:opacity-0 ${animationClass}`}>
							<ellipse cx="-8" cy="-3" rx="4.8" ry="2.1" fill="#382c31" transform="rotate(-13 -8 -3)" />
							<ellipse cx="8" cy="-3" rx="4.8" ry="2.1" fill="#382c31" transform="rotate(13 8 -3)" />
							<path d="M -10.5 14 Q 0 5.3 10.5 14 Q 0 16.7 -10.5 14 Z" fill="#fffaf0" stroke="#382c31" stroke-width="3.8" stroke-linejoin="round" />
						</g>
						<g class=${`menu-character__face menu-character__face--surprised opacity-0 [animation-name:menu-character-surprised-face] motion-reduce:opacity-0 ${animationClass}`} data-character-expression="surprised-circle-mouth">
							<ellipse cx="-8" cy="-3" rx="3.4" ry="5.3" fill="#382c31" />
							<ellipse cx="8" cy="-3" rx="3.4" ry="5.3" fill="#382c31" />
							<ellipse cx="0" cy="13" rx="7" ry="8" fill="#fffaf0" stroke="#382c31" stroke-width="3.8" />
						</g>
						<g class=${`menu-character__face menu-character__face--angry opacity-0 [animation-name:menu-character-angry-face] motion-reduce:opacity-100 ${animationClass}`} data-character-expression="angry-clenched-mouth">
							<path d="M -14 -8 L -4 -4" fill="none" stroke="#382c31" stroke-width="3.4" stroke-linecap="round" />
							<path d="M 14 -8 L 4 -4" fill="none" stroke="#382c31" stroke-width="3.4" stroke-linecap="round" />
							<ellipse cx="-8" cy="-1" rx="4.5" ry="2" fill="#382c31" transform="rotate(10 -8 -1)" />
							<ellipse cx="8" cy="-1" rx="4.5" ry="2" fill="#382c31" transform="rotate(-10 8 -1)" />
							<path d="M -11 9 Q 0 5 11 9 L 10 17 Q 0 19 -10 17 Z" fill="#fffaf0" stroke="#382c31" stroke-width="3.8" stroke-linejoin="round" />
						</g>
					</g>
				</g>
			</g>
			<g class=${`menu-character__stars opacity-0 [transform-box:view-box] [transform-origin:193px_93px] [animation-name:menu-character-stars] ${animationClass}`} transform="translate(193 93)" aria-hidden="true">
				<path d="M 0 -12 L 4 -4 L 12 0 L 4 4 L 0 12 L -4 4 L -12 0 L -4 -4 Z" fill="#fff0a8" stroke="#503b37" stroke-width="2" stroke-linejoin="round" />
				<path d="M 31 10 L 34 16 L 40 19 L 34 22 L 31 28 L 28 22 L 22 19 L 28 16 Z" fill="#e8b875" stroke="#503b37" stroke-width="2" stroke-linejoin="round" />
			</g>
			<g data-character-feature="visible-soles" aria-label="The bottoms of the character's feet are visible"></g>
		</g>
	`;
};
