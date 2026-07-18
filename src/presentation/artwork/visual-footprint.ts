import { Body, type Body as BodyType } from "../../world/components";

const minimumDecorationArtworkScale = 0.55;
const maximumDecorationArtworkScale = 2.6;
const decorationArtworkBodyDivisor = 140;
const plantFootprintWidth = 52;
const plantFootprintProjectedDepth = 18;

export const decorationArtworkScale = (body: BodyType): number =>
	Math.max(
		minimumDecorationArtworkScale,
		Math.min(
			maximumDecorationArtworkScale,
			(body.width + body.depth) / decorationArtworkBodyDivisor,
		),
	);

export const plantVisualFootprintBody = (body: BodyType): BodyType => {
	const scale = decorationArtworkScale(body);
	return Body.make({
		width: plantFootprintWidth * scale,
		depth: (plantFootprintProjectedDepth * scale) / Math.SQRT1_2,
	});
};
