import { html, type TemplateResult } from "lit-html";
import { type AppScreen, AppScreens } from "../../app/screen";
import { menuCharacterTemplate } from "../../presentation/artwork/menu-character";
import { outdoorFloorTiles } from "../../presentation/artwork/outdoor-floor";
import { terrainFloorTemplate } from "../../presentation/artwork/terrain";
import { Body } from "../../world/components";
import { initialFloorTiles } from "../../world/floor";

type Navigate = (screen: AppScreen) => void;

const terrainPlatformPath = "M -80 650 L 600 344 L 1280 650 L 600 956 Z";
const terrainPlatformFloorPlan = Body.make({ width: 1_120, depth: 640 });
const terrainPlatformSourceHeight =
	terrainPlatformFloorPlan.depth * Math.SQRT1_2;
const terrainPlatformTiles = outdoorFloorTiles(
	initialFloorTiles(terrainPlatformFloorPlan),
	{ x: 0, y: 0 },
	{
		left: 0,
		top: 0,
		width: terrainPlatformFloorPlan.width,
		height: terrainPlatformSourceHeight,
	},
);
const terrainPlatformFamilies = [
	...new Set(terrainPlatformTiles.map(({ terrain }) => terrain)),
]
	.sort()
	.join(" ");
const terrainPlatformTransform = [
	680 / terrainPlatformFloorPlan.width,
	306 / terrainPlatformFloorPlan.width,
	-680 / terrainPlatformSourceHeight,
	306 / terrainPlatformSourceHeight,
	600,
	344,
].join(" ");

const frontScreenClass =
	"relative isolate grid min-h-dvh w-screen overflow-hidden bg-[#14212a] bg-[radial-gradient(circle_at_50%_38%,#274149_0,#14212a_58%)] text-[#fff1d6]";
const frontContentClass =
	"relative z-10 m-auto flex w-[calc(100vw_-_48px)] max-w-275 items-center justify-center max-md:w-[calc(100%_-_30px)] max-md:max-w-155";
const titleEyebrowClass =
	"mb-2 text-[clamp(10px,1vw,13px)] font-bold tracking-[0.28em] text-[#e8b875]";
const titleWordmarkClass =
	"m-0 animate-[front-title-arrive_0.75s_cubic-bezier(0.2,0.8,0.2,1)_both] indent-[0.1em] font-heading text-[clamp(50px,8.5vw,108px)] leading-[0.88] font-bold tracking-widest text-[#fff1d6] [text-shadow:0_8px_0_#503b37,0_16px_34px_rgba(0,0,0,0.3)] motion-reduce:animate-none";
const focusRingClass =
	"focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#fff0a8]";
const menuButtonClass =
	"flex min-h-23.5 w-full cursor-pointer items-center justify-between rounded-[18px] border-2 border-[#557178] bg-[#0d181f]/90 px-6 pt-4.75 pb-4.5 pl-6.75 text-left text-[#fff1d6] shadow-[0_13px_0_rgba(7,14,19,0.36),0_26px_38px_rgba(0,0,0,0.18)] transition-[transform,border-color,background] duration-150 ease-out hover:border-[#fff0a8] hover:bg-[#1b333a] md:hover:translate-x-1.75 md:active:translate-x-1.75 md:active:translate-y-1 max-md:min-h-21 max-md:pt-4 max-md:pr-4.5 max-md:pb-3.75 max-md:pl-5 motion-reduce:transition-none";

const backdropTemplate = (): TemplateResult => html`
	<svg class="absolute inset-0 -z-10 block h-full w-full" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
		<defs>
			<pattern id="front-screen-dots" width="34" height="34" patternUnits="userSpaceOnUse">
				<circle cx="2" cy="2" r="1.7" fill="#4c6265" />
			</pattern>
			<linearGradient id="front-screen-floor" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#253d43" />
				<stop offset="1" stop-color="#17282f" />
			</linearGradient>
			<radialGradient id="front-screen-glow" cx="50%" cy="48%" r="58%">
				<stop offset="0" stop-color="#3a5d5d" stop-opacity="0.42" />
				<stop offset="1" stop-color="#14212a" stop-opacity="0" />
			</radialGradient>
			<linearGradient id="front-screen-terrain-shade" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#14212a" stop-opacity="0.08" />
				<stop offset="0.58" stop-color="#14212a" stop-opacity="0.24" />
				<stop offset="1" stop-color="#0d181f" stop-opacity="0.54" />
			</linearGradient>
			<clipPath id="front-screen-terrain-clip">
				<path d=${terrainPlatformPath} />
			</clipPath>
		</defs>
		<rect width="1200" height="800" fill="url(#front-screen-dots)" opacity="0.36" />
		<ellipse cx="600" cy="380" rx="510" ry="420" fill="url(#front-screen-glow)" />
		<path d=${terrainPlatformPath} fill="url(#front-screen-floor)" />
		<g data-front-terrain-platform data-terrain-families=${terrainPlatformFamilies} clip-path="url(#front-screen-terrain-clip)" opacity="0.72">
			<g transform=${`matrix(${terrainPlatformTransform})`}>
				${terrainFloorTemplate(terrainPlatformTiles)}
			</g>
		</g>
		<path d=${terrainPlatformPath} fill="url(#front-screen-terrain-shade)" />
		<path d=${terrainPlatformPath} fill="none" stroke="#668086" stroke-width="3" opacity="0.72" />
		<g fill="#e8b875" opacity="0.58">
			<path d="M 116 167 L 122 179 L 134 185 L 122 191 L 116 203 L 110 191 L 98 185 L 110 179 Z" />
			<path d="M 1080 118 L 1084 126 L 1092 130 L 1084 134 L 1080 142 L 1076 134 L 1068 130 L 1076 126 Z" />
			<circle cx="1023" cy="241" r="4" />
			<circle cx="174" cy="291" r="3" />
		</g>
	</svg>
`;

const titleRuleTemplate = ({
	menu = false,
}: {
	readonly menu?: boolean;
} = {}): TemplateResult => {
	const placementClass = menu
		? "mr-0 ml-0 justify-start max-md:mx-auto max-md:justify-center"
		: "mx-auto justify-center";
	return html`
		<div class=${`mt-4 flex h-4.5 w-[min(340px,62vw)] items-center ${placementClass}`} aria-hidden="true">
			<span class="h-0.5 w-[42%] bg-[#8fa9a2] opacity-48"></span>
			<span class="mx-3.25 size-2.75 rotate-45 border-2 border-[#e8b875]"></span>
			<span class="h-0.5 w-[42%] bg-[#8fa9a2] opacity-48"></span>
		</div>
	`;
};

const compactTitleTemplate = (): TemplateResult => html`
	<div class="absolute top-0 left-1/2 -translate-x-1/2 text-center max-md:-top-17">
		<h1 class="m-0 animate-[front-title-arrive_0.75s_cubic-bezier(0.2,0.8,0.2,1)_both] indent-[0.1em] font-heading text-[clamp(24px,3vw,38px)] leading-[0.88] font-bold tracking-widest text-[#fff1d6] [text-shadow:0_4px_0_#503b37] motion-reduce:animate-none">SAISHUMIN</h1>
	</div>
`;

const splashTemplate = (): TemplateResult => html`
	<main class=${`${frontScreenClass} animate-[front-splash-fade_3.2s_ease-in-out_both] motion-reduce:animate-none`}>
		${backdropTemplate()}
		<section class=${`${frontContentClass} flex-col gap-[clamp(2px,0.8vh,10px)] pt-7 pb-8.5 md:[@media(max-height:680px)]:scale-82`} aria-labelledby="splash-title">
			<div class="relative text-center">
				<div class=${titleEyebrowClass}>A LITTLE WORLD AWAITS</div>
				<h1 id="splash-title" class=${titleWordmarkClass}>SAISHUMIN</h1>
				${titleRuleTemplate()}
			</div>
			<svg class="-mt-1.25 -mb-2.5 block w-[min(39vw,330px)] min-w-57.5 overflow-visible drop-shadow-[0_16px_26px_rgba(0,0,0,0.24)]" viewBox="0 0 260 230" role="img" aria-label="The little egg-shaped hero jumps, slips, and lands on his back">
				${menuCharacterTemplate({ variant: "splash" })}
			</svg>
		</section>
	</main>
`;

const mainMenuTemplate = (navigate: Navigate): TemplateResult => html`
	<main class=${frontScreenClass}>
		${backdropTemplate()}
		<section class=${`${frontContentClass} items-stretch justify-between gap-[clamp(30px,8vw,110px)] pt-17.5 pb-19.5 max-md:justify-center max-md:pt-13 max-md:pb-18`} aria-labelledby="main-menu-title">
			<div class="w-full max-w-150 self-center animate-[front-menu-arrive_0.56s_ease-out_both] motion-reduce:animate-none">
				<div class="relative mb-13 text-left max-md:mb-9.5 max-md:text-center">
					<div class=${titleEyebrowClass}>A LITTLE WORLD AWAITS</div>
					<h1 id="main-menu-title" class=${`${titleWordmarkClass} indent-0 text-[clamp(48px,7vw,86px)]`}>SAISHUMIN</h1>
					${titleRuleTemplate({ menu: true })}
				</div>
				<nav class="grid gap-4" aria-label="Main menu">
					<button type="button" class=${`${menuButtonClass} border-[#e8b875] bg-[linear-gradient(110deg,rgba(99,68,45,0.94),rgba(36,47,48,0.94))] ${focusRingClass}`} @click=${() => navigate(AppScreens.StoryMode)}>
						<span class="grid gap-1.25">
							<span class="font-heading text-[clamp(19px,2vw,25px)] font-bold tracking-widest">STORY MODE</span>
							<span class="text-[10px] font-bold tracking-[0.16em] text-[#e8c999]">BEGIN THE CAMPAIGN</span>
						</span>
						<span class="grid size-11 place-items-center rounded-full border border-[#607c7c] text-[23px]" aria-hidden="true">→</span>
					</button>
					<button type="button" class=${`${menuButtonClass} ${focusRingClass}`} @click=${() => navigate(AppScreens.WorldBuilder)}>
						<span class="grid gap-1.25">
							<span class="font-heading text-[clamp(19px,2vw,25px)] font-bold tracking-widest">WORLD BUILDER</span>
							<span class="text-[10px] font-bold tracking-[0.16em] text-[#aebfba]">FORGE YOUR OWN WAY</span>
						</span>
						<span class="grid size-11 place-items-center rounded-full border border-[#607c7c] text-[23px]" aria-hidden="true">→</span>
					</button>
				</nav>
			</div>
			<div class="w-[min(27vw,260px)] min-w-45 self-center opacity-96 drop-shadow-[0_24px_36px_rgba(0,0,0,0.26)] animate-[front-menu-arrive_0.7s_ease-out_0.08s_both] max-md:hidden motion-reduce:animate-none" aria-hidden="true">
				<svg class="block w-full" viewBox="0 0 120 144">
					<path d="M 26 121 Q 11 67 31 29 Q 60 -13 89 29 Q 109 67 94 121 Z" fill="#f3ad50" stroke="#503b37" stroke-width="9" stroke-linejoin="round" />
					<path d="M 28 34 Q 12 70 26 118 L 48 118 Q 47 83 57 49 Q 62 31 72 17 Q 50 3 28 34 Z" fill="#f9c267" opacity="0.88" />
					<ellipse cx="48" cy="72" rx="7" ry="4" fill="#382c31" />
					<ellipse cx="72" cy="72" rx="7" ry="4" fill="#382c31" />
					<path d="M 45 93 Q 60 80 76 93 Q 60 98 45 93 Z" fill="#fffaf0" stroke="#382c31" stroke-width="5" />
				</svg>
			</div>
		</section>
	</main>
`;

const storyModeTemplate = (navigate: Navigate): TemplateResult => html`
	<main class=${frontScreenClass}>
		${backdropTemplate()}
		<button type="button" class=${`absolute top-[max(24px,env(safe-area-inset-top))] left-[max(24px,env(safe-area-inset-left))] z-4 inline-flex min-h-11 cursor-pointer items-center gap-2.75 rounded-xl border border-[#58747a] bg-[#0d181f]/86 px-3.75 py-2.5 text-[10px] font-bold tracking-[0.12em] text-[#dbe7dc] transition-[border-color,transform] duration-150 hover:-translate-x-0.75 hover:border-[#fff0a8] max-md:top-[max(14px,env(safe-area-inset-top))] max-md:left-[max(14px,env(safe-area-inset-left))] ${focusRingClass}`} @click=${() => navigate(AppScreens.MainMenu)}>
			<span class="text-[19px] leading-none text-[#e8b875]" aria-hidden="true">←</span>
			<span>BACK TO MAIN MENU</span>
		</button>
		<section class=${`${frontContentClass} grid grid-cols-[minmax(300px,0.9fr)_minmax(390px,1.1fr)] gap-[clamp(25px,5vw,78px)] pt-28.75 pb-11.25 md:[@media(max-height:680px)]:pt-19 max-md:flex max-md:flex-col max-md:gap-0.75 max-md:pt-25.5 max-md:pb-5 max-md:text-center`} aria-labelledby="construction-title">
			${compactTitleTemplate()}
			<div class="self-center animate-[front-menu-arrive_0.55s_ease-out_both] motion-reduce:animate-none">
				<div class="mb-3.25 text-xs font-bold tracking-[0.22em] text-[#e8b875]">STORY MODE</div>
				<h2 id="construction-title" class="m-0 font-heading text-[clamp(46px,6vw,82px)] leading-[0.86] font-bold tracking-[0.03em] text-[#fff1d6] [text-shadow:0_7px_0_#503b37] max-md:text-[clamp(34px,10vw,44px)] max-md:leading-[0.9] max-md:tracking-normal">UNDER<br />CONSTRUCTION</h2>
				<p class="mt-7.25 max-w-107.5 text-[clamp(14px,1.4vw,18px)] leading-[1.55] text-[#b8c9c2] max-md:mx-auto max-md:mt-5.25">Our hero is still finding his footing. Check back after the dust settles.</p>
			</div>
			<svg class="block w-[min(46vw,490px)] self-center overflow-visible drop-shadow-[0_24px_40px_rgba(0,0,0,0.3)] md:[@media(max-height:680px)]:w-[min(40vw,390px)] max-md:-mt-2 max-md:w-[min(86vw,410px)]" viewBox="0 0 260 230" role="img" aria-label="The little egg-shaped hero repeatedly jumps, loses his footing, and lands on his back">
				${menuCharacterTemplate({ variant: "construction" })}
			</svg>
		</section>
	</main>
`;

export const frontEndTemplate = ({
	screen,
	navigate,
}: {
	readonly screen: Exclude<AppScreen, typeof AppScreens.WorldBuilder>;
	readonly navigate: Navigate;
}): TemplateResult => {
	switch (screen) {
		case AppScreens.Splash:
			return splashTemplate();
		case AppScreens.MainMenu:
			return mainMenuTemplate(navigate);
		case AppScreens.StoryMode:
			return storyModeTemplate(navigate);
	}
};
