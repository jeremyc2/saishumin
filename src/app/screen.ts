export const AppScreens = {
	Splash: "splash",
	MainMenu: "main-menu",
	StoryMode: "story-mode",
	WorldBuilder: "world-builder",
} as const;

export type AppScreen = (typeof AppScreens)[keyof typeof AppScreens];

export const splashDurationMilliseconds = 3_200;
export const reducedMotionSplashDurationMilliseconds = 450;

export const splashDuration = (reducedMotion: boolean): number =>
	reducedMotion
		? reducedMotionSplashDurationMilliseconds
		: splashDurationMilliseconds;
